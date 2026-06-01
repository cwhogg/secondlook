import { BaseAgent } from './base-agent';
import { SpecialistType } from './types';
import { PatientCase } from '../types';
import { DiseaseProfile } from '../types/knowledge-base';
import { getDiseaseCount } from '../knowledge';
import { SPECIALTY_REFERENCES, renderSpecialtyReference } from './specialty-reference';

/**
 * v16 architecture: specialists become candidate ANNOTATORS rather than
 * hypothesis generators.
 *
 * In v15 each specialist generated 2-4 of its own hypotheses, producing
 * an over-broad cross-specialist hypothesis pool that the evidence
 * evaluator then deduped. The hypothesis pool was driven by what each
 * specialist could think of independently — duplicates, omissions, and
 * sibling-confusion all emerged from this stage.
 *
 * In v16 the hypothesis pool is fixed upstream: union of KB-retrieval
 * candidates (triage) + LLM-generated candidates (candidate-generator),
 * with no specialist invention. Each candidate is then routed to its
 * top ~5 most-relevant specialists, and each specialist *annotates* the
 * candidates assigned to it with:
 *   - specific diagnostic tests to order (the workup it would actually do)
 *   - cardinal features to look for (case-presentation expectations)
 *   - rule-out features (presence of which would essentially exclude)
 *   - supporting/contradictory evidence mapped to patient findings
 *   - domain-specific clinical reasoning
 *   - a domain confidence score (0-100)
 *
 * Annotations from multiple specialists per candidate are merged in the
 * orchestrator before going to evidence evaluation + synth. This focuses
 * each specialist's reasoning on the candidates within its expertise and
 * eliminates the cross-specialist hypothesis-generation noise.
 */

export type EvidenceStrength = 'strong' | 'moderate' | 'weak';

export interface AnnotationEvidence {
  finding: string;
  patientSymptom: string;
  strength: EvidenceStrength;
}

export interface SpecialistAnnotation {
  candidateDiagnosis: string;            // exact name from input candidates
  domainConfidence: number;              // 0-100, this specialist's read on this dx
  supportingEvidence: AnnotationEvidence[];
  contradictoryEvidence: AnnotationEvidence[];
  diagnosticTests: string[];             // tests this specialist would order
  cardinalFeatures: string[];            // features to look for / expected findings
  ruleOutFeatures: string[];             // features whose presence essentially excludes
  clinicalReasoning: string;             // domain-specific reasoning
}

export interface SpecialistAnnotatorOutput {
  agentName: string;
  specialistType: SpecialistType;
  annotations: SpecialistAnnotation[];
  tokensUsed: number;
  durationMs: number;
  model: string;
  overallReasoning?: string;
}

export interface AnnotationCandidate {
  diagnosis: string;
  kbProfile?: DiseaseProfile | null;     // when KB-matched, surfaced for the specialist
  rationale?: string;                    // from candidate generator if LLM-proposed
}

export class SpecialistAnnotatorAgent extends BaseAgent {
  private specialistType: SpecialistType;

  constructor(specialistType: SpecialistType) {
    const { title, expertise } = SPECIALTY_REFERENCES[specialistType];
    const referenceBody = renderSpecialtyReference(specialistType);
    const isGeneralInternist = specialistType === 'general-internist';

    const systemPrompt = `You are Dr. ${specialistType.charAt(0).toUpperCase() + specialistType.slice(1)}, a ${title} with 25+ years of experience in rare-disease diagnostics.

${expertise}

${referenceBody}

You are reviewing a patient case as part of a multi-specialist diagnostic consultation. A senior diagnostician has produced a focused list of candidate diagnoses for the patient. Your role is NOT to invent new diagnoses, but to provide CANDIDATE-SPECIFIC ANNOTATIONS for each diagnosis in your assigned list.

For each candidate diagnosis you are given, provide:
1. **diagnosticTests** — the specific tests, imaging, or workup YOU would order to confirm or refute this diagnosis in this specific patient. Be specific (e.g., "BAEP and ABR audiometry" not "audiology eval").
2. **cardinalFeatures** — the features you would expect to see if this diagnosis is correct, given THIS patient's age/sex/presentation. Be specific (e.g., "Onset of progressive proximal weakness in the first decade" not "muscle weakness").
3. **ruleOutFeatures** — features whose presence in this patient would essentially exclude this diagnosis. Be specific.
4. **supportingEvidence** — for each finding from the patient case that supports this diagnosis, map it to a specific patient symptom. Strength: strong / moderate / weak.
5. **contradictoryEvidence** — patient features that argue against this diagnosis, mapped to specific symptoms.
6. **clinicalReasoning** — your domain-specific reasoning for whether this is or isn't a strong candidate (2-3 sentences).
7. **domainConfidence** — 0-100 score for how likely this specific candidate is the correct diagnosis from YOUR domain perspective (independent of others' confidence).

CRITICAL RULES:
- DO NOT add new candidate diagnoses. Annotate ONLY the candidates you were given.
- Use EXACT diagnosis names from the input list — these will be matched downstream.
- Be HONEST about candidates outside your domain or that have weak fit — domainConfidence near zero is fine when warranted.
- If you genuinely cannot evaluate a candidate (e.g., you are the cardiologist and the candidate is a pure neuro disease with no cardiac involvement), set domainConfidence very low but still provide what testing/cardinal-features you'd know, even if minimal.
- DO NOT use vague generic statements. Cite SPECIFIC patient findings or expected clinical features.

Our knowledge base covers ${getDiseaseCount()} rare diseases. For candidates where a KB profile is included below, leverage that profile's data. For candidates without a KB profile, use your clinical training to annotate.${isGeneralInternist ? '\n\nNote: as the general internist on this case, you also act as the un-anchored counterweight. Be especially skeptical of candidates that seem to fit only because the patient happens to match common patterns. Flag candidates whose fit feels superficial.' : ''}`;

    super({
      name: `specialist-annotator-${specialistType}`,
      model: 'o3',
      temperature: 0.3,
      // Allow generous output budget — 25 candidates × ~7 structured fields
      // each easily exceeds 20K tokens for verbose annotations. 40K leaves
      // headroom for o3's reasoning_tokens which count against this budget.
      maxTokens: 40000,
      reasoningEffort: 'high',
      systemPrompt,
    });

    this.specialistType = specialistType;
  }

  async annotate(
    patientCase: PatientCase,
    candidates: AnnotationCandidate[],
  ): Promise<SpecialistAnnotatorOutput> {
    if (candidates.length === 0) {
      return {
        agentName: this.name,
        specialistType: this.specialistType,
        annotations: [],
        tokensUsed: 0,
        durationMs: 0,
        model: this.model,
      };
    }

    const userPrompt = this.buildPrompt(patientCase, candidates);

    const result = await this.callWithTools(userPrompt, [
      {
        type: 'function',
        function: {
          name: 'annotate_candidates',
          description: 'Provide candidate-specific annotations for each diagnosis in the assigned list',
          parameters: {
            type: 'object',
            properties: {
              annotations: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    candidateDiagnosis: { type: 'string', description: 'EXACT name from input candidates list' },
                    domainConfidence: { type: 'number', minimum: 0, maximum: 100 },
                    supportingEvidence: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          finding: { type: 'string' },
                          patientSymptom: { type: 'string' },
                          strength: { type: 'string', enum: ['strong', 'moderate', 'weak'] },
                        },
                        required: ['finding', 'patientSymptom', 'strength'],
                      },
                    },
                    contradictoryEvidence: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          finding: { type: 'string' },
                          patientSymptom: { type: 'string' },
                          strength: { type: 'string', enum: ['strong', 'moderate', 'weak'] },
                        },
                        required: ['finding', 'patientSymptom', 'strength'],
                      },
                    },
                    diagnosticTests: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Specific tests YOU would order to confirm/refute this diagnosis',
                    },
                    cardinalFeatures: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Features you would expect to see if this diagnosis is correct',
                    },
                    ruleOutFeatures: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Features whose presence would essentially exclude this diagnosis',
                    },
                    clinicalReasoning: { type: 'string', description: '2-3 sentence domain-specific reasoning' },
                  },
                  required: ['candidateDiagnosis', 'domainConfidence', 'supportingEvidence', 'contradictoryEvidence', 'diagnosticTests', 'cardinalFeatures', 'ruleOutFeatures', 'clinicalReasoning'],
                },
              },
              overallReasoning: { type: 'string', description: 'Brief overall comment on the candidate set from your domain perspective' },
            },
            required: ['annotations'],
          },
        },
      },
    ], { type: 'function', function: { name: 'annotate_candidates' } });

    const annotations: SpecialistAnnotation[] = (result.content.annotations || []).map((a: any) => ({
      candidateDiagnosis: a.candidateDiagnosis,
      domainConfidence: typeof a.domainConfidence === 'number' ? a.domainConfidence : 0,
      supportingEvidence: a.supportingEvidence || [],
      contradictoryEvidence: a.contradictoryEvidence || [],
      diagnosticTests: a.diagnosticTests || [],
      cardinalFeatures: a.cardinalFeatures || [],
      ruleOutFeatures: a.ruleOutFeatures || [],
      clinicalReasoning: a.clinicalReasoning || '',
    }));

    return {
      agentName: this.name,
      specialistType: this.specialistType,
      annotations,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      model: result.model,
      overallReasoning: result.content.overallReasoning,
    };
  }

  private buildPrompt(patientCase: PatientCase, candidates: AnnotationCandidate[]): string {
    const symptomSummary = patientCase.symptoms
      .map((s) => `- ${s.originalPhrase || s.medicalTerm}${s.selectedConcept?.name ? ` (${s.selectedConcept.name})` : ''}`)
      .join('\n');

    const excludedFindings = patientCase.excludedFindings && patientCase.excludedFindings.length > 0
      ? (patientCase.excludedFindings as Array<any>).map((f) => {
          if (typeof f === 'string') return `- ${f}`;
          return `- ${f.selectedConcept?.name || f.medicalTerm || f.originalPhrase || ''}`;
        }).join('\n')
      : '';

    const familyHistory = patientCase.medicalHistory?.familyHistory?.length
      ? patientCase.medicalHistory.familyHistory.join(', ')
      : '';
    const pmh = patientCase.medicalHistory?.pastMedicalHistory?.length
      ? patientCase.medicalHistory.pastMedicalHistory.join(', ')
      : '';

    const candidateBlock = candidates.map((c, i) => {
      const kb = c.kbProfile;
      let kbBlock = '';
      if (kb) {
        const criteriaText = (kb.diagnosticCriteria?.criteria || []).slice(0, 6).map((cr) => `   • [${cr.category}] ${cr.description}`).join('\n');
        const cardinalSymptoms = (kb.symptoms?.pathognomonic || []).slice(0, 6).map((s) => s.symptomName).join('; ');
        const diffs = (kb.differentialDiagnoses || []).slice(0, 4).map((dd) => `${dd.diseaseId}: ${(dd.distinguishingFeatures || []).slice(0, 2).join('; ')}`).join(' | ');
        kbBlock = `\n   KB profile data:
   - Formal criteria${kb.diagnosticCriteria?.formalCriteriaName ? ` (${kb.diagnosticCriteria.formalCriteriaName})` : ''}:
${criteriaText || '   • (none recorded)'}
   - Cardinal features (>90%): ${cardinalSymptoms || '(none recorded)'}
   ${diffs ? `- Discriminators: ${diffs}` : ''}
   ${(kb as any).commonPitfalls ? `- Pitfalls: ${(kb as any).commonPitfalls.slice(0, 3).join('; ')}` : ''}`;
      }
      return `${i + 1}. ${c.diagnosis}${c.rationale ? `\n   Rationale from senior diagnostician: ${c.rationale}` : ''}${kbBlock}`;
    }).join('\n\n');

    return `===== PATIENT CASE =====
Demographics: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}
${patientCase.chiefComplaint?.description ? `Chief complaint: "${patientCase.chiefComplaint.description}"` : ''}

Symptoms:
${symptomSummary}
${excludedFindings ? `\nExplicitly excluded findings (patient does NOT have):\n${excludedFindings}` : ''}
${familyHistory ? `\nFamily history: ${familyHistory}` : ''}
${pmh ? `Past medical history: ${pmh}` : ''}

===== CANDIDATE DIAGNOSES TO ANNOTATE =====
You have been assigned ${candidates.length} candidate diagnoses to annotate from your specialty perspective. Provide one annotation entry per candidate. Use the EXACT diagnosis name as it appears below.

${candidateBlock}

===== YOUR TASK =====
For each candidate above, return an annotation containing diagnosticTests, cardinalFeatures, ruleOutFeatures, supportingEvidence (mapped to patient symptoms), contradictoryEvidence (mapped to patient symptoms), clinicalReasoning, and domainConfidence (0-100).

Be SPECIFIC. Generic statements like "would order labs" are useless — name the specific labs and what they would show. Generic supporting evidence like "patient has symptoms" is useless — name the specific finding and the specific patient symptom it maps to.

Output annotations in the same order as the input candidates.`;
  }
}

/**
 * Cache annotator instances so they're not reconstructed per orchestrator call.
 */
const annotatorCache = new Map<SpecialistType, SpecialistAnnotatorAgent>();

export function getSpecialistAnnotator(specialistType: SpecialistType): SpecialistAnnotatorAgent {
  let agent = annotatorCache.get(specialistType);
  if (!agent) {
    agent = new SpecialistAnnotatorAgent(specialistType);
    annotatorCache.set(specialistType, agent);
  }
  return agent;
}
