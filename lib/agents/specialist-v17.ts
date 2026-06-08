/**
 * v17 specialist agent — v5 SpecialistAgent + v16 annotation fields.
 *
 * REUSE POSTURE: this file is an additive adaptation of the v5 specialist
 * (lib/agents/specialist-agents/index.ts), NOT a rewrite. The v5 class
 * structure, both system prompts (domainSpecialistPrompt and
 * generalInternistPrompt), the callWithTools mechanism, and the v5 hypothesis
 * shape are preserved verbatim. Only additions:
 *   1. Four new fields in the tool-call JSON schema: diagnosticTests,
 *      cardinalFeatures, ruleOutFeatures, domainConfidence.
 *   2. A short addendum to each system prompt instructing the specialist to
 *      populate those fields per hypothesis.
 *   3. maxTokens raised 8000 -> 60000 to fit the larger output.
 *   4. Output mapped to SpecialistV17Hypothesis (= DiagnosisHypothesis +
 *      emittedBySpecialty) so the dedup stage can preserve attribution.
 *
 * Per the user's "send more to the LLM" principle, no caps on hypothesis count
 * are enforced here. The tool schema allows 2-7 hypotheses.
 */
import { BaseAgent } from './base-agent';
import { AgentInput, SpecialistType } from './types';
import { PatientCase, DiagnosisHypothesis } from '../types';
import { DiseaseMatch } from '../types/knowledge-base';
import { getDiseaseCount } from '../knowledge';
import { SPECIALTY_REFERENCES, renderSpecialtyReference } from './specialty-reference';
import type { SpecialistV17Hypothesis } from './dedup-normalizer';

export interface SpecialistV17Output {
  agentName: string;
  specialty: SpecialistType;
  hypotheses: SpecialistV17Hypothesis[];
  reasoning: string;
  confidence: number;
  tokensUsed: number;
  durationMs: number;
  model: string;
  failureReason?: string;
}

// v17 ADDENDUM appended to BOTH v5 system prompts. Adds the v16 annotation
// fields the specialist must populate per hypothesis.
const V17_ANNOTATION_ADDENDUM = `

===== v17 ADDITIONAL OUTPUT FIELDS =====
For EACH hypothesis you propose, also populate these annotation fields:
- diagnosticTests: 2-5 specific tests (lab / imaging / genetic) that would confirm or refute this diagnosis. Use specific test names (e.g., "SPINK5 gene sequencing", "muscle biopsy with EM"), not categories.
- cardinalFeatures: 2-5 features the patient should have IF this diagnosis is correct. State each as a clinical finding (e.g., "trichorrhexis invaginata on hair microscopy").
- ruleOutFeatures: 1-3 features whose ABSENCE would rule out this diagnosis (e.g., "normal SPINK5 sequencing").
- domainConfidence: an integer 0-100 representing YOUR OWN confidence in this hypothesis from YOUR specialty's perspective. This is your domain confidence, not the overall probability — it captures how strongly your expertise points to this diagnosis. May differ from confidenceScore (which is overall probability).

===== v18 CLARIFYING QUESTIONS =====
For EACH of your top THREE hypotheses, propose 1-3 \`clarifyingQuestions\` the patient could answer to confirm or refute that hypothesis. The Clarifier stage will pick the best 1-5 across all specialists to present to the patient after the initial result is delivered.

Rules for clarifying questions:
- Patient-answerable. The patient is NOT a clinician. They typically cannot answer questions about lab values, imaging findings, or specific gene names. Acceptable formats:
  * "Has a doctor ever told you you have [specific named diagnosis]?"
  * "Do you experience [specific patient-recognizable symptom]?"
  * "Has anyone in your immediate family (parent, sibling, child) been diagnosed with [condition]?"
- Yes/no answerable. Each question must have a clean yes / no / "don't know" answer.
- HIGH discriminating power. Ask only about features whose presence or absence would substantially move the probability of THIS hypothesis. Avoid questions whose answer wouldn't change your ranking.
- Lab values ONLY when critical AND likely-known. E.g. "Has a doctor told you your iron levels were very low?" is acceptable. "What is your ferritin level?" is not.
- Specific, not vague. "Do you experience tingling in your fingertips that came on suddenly?" beats "Do you ever feel anything unusual?"
- One feature per question. Don't bundle.

For each question populate:
- question: the text shown to the patient, written in plain second-person ("Do you…?", "Has a doctor ever told you…?")
- ifYesImpact: 'rules-in' | 'supports' | 'weakens' | 'rules-out' — what a YES answer means FOR THIS HYPOTHESIS
- rationale: one sentence explaining why this question discriminates this diagnosis (clinician-facing reasoning)
- questionType: 'symptom' | 'prior_dx' | 'family_history' | 'lab_result'`;

class SpecialistV17Agent extends BaseAgent {
  private specialistType: SpecialistType;

  constructor(specialistType: SpecialistType) {
    const { title, expertise } = SPECIALTY_REFERENCES[specialistType];
    const isGeneralInternist = specialistType === 'general-internist';
    const referenceBody = renderSpecialtyReference(specialistType);

    // === v5 prompts (reused verbatim) ===
    const domainSpecialistPrompt = `You are Dr. ${specialistType.charAt(0).toUpperCase() + specialistType.slice(1)}, a ${title} with 25+ years of experience specializing in complex and rare diseases.

${expertise}

${referenceBody}

You are reviewing a patient case as part of a multi-specialist diagnostic consultation. You have been provided with disease profiles from a curated knowledge base that match this patient's presentation, reranked for relevance to your specialty.

YOUR DIAGNOSTIC APPROACH:
1. Apply the diagnostic frameworks above to the patient's presentation — name the criterion you are applying
2. Use the pattern-recognition heuristics to anchor hypotheses; explicitly consider the listed common mimics before settling
3. For each hypothesis, map EVERY piece of supporting evidence to a SPECIFIC patient symptom
4. Where disease profiles are provided from the knowledge base, reference their diagnostic criteria
5. Honestly note contradictory evidence and information gaps
6. Think about what is COMMONLY MISSED by generalists in your specialty area

CRITICAL: You are NOT limited to the diseases shown in the knowledge base profiles below. Our knowledge base covers ${getDiseaseCount()} profiled rare diseases. If the patient's presentation suggests a condition NOT in the provided profiles, you MUST still propose it. A disease being absent from our database says nothing about its likelihood — it only means we lack structured criteria for it. Use your clinical training and the frameworks above for any condition you consider relevant.

OUTPUT RULES:
- Generate 3-7 diagnostic hypotheses ranked by likelihood
- Each hypothesis MUST include specific evidence mapping
- Do NOT suggest common diagnoses that any GP would consider
- Focus on rare/complex conditions that require specialist evaluation
- Be precise — vague reasoning undermines clinical credibility
- For diagnoses NOT in the provided knowledge base profiles, provide your own assessment of which diagnostic criteria or clinical features support the diagnosis
- DIAGNOSIS NAMING: Always use the most specific disease name the evidence supports. Use "Retinitis Pigmentosa" not "Inherited Retinal Dystrophy". Use "Leber Congenital Amaurosis" not "Hereditary Retinal Dystrophy". Use "Charcot-Marie-Tooth Disease Type 2A" not "Hereditary Motor Sensory Neuropathy". The diagnosis name should identify a specific disease entity, not a broad disease category.
- SUBTYPE RESTRAINT (critical): when the disease has multiple numbered or gene-keyed subtypes (Loeys-Dietz syndrome 1-5, DEE 1-100+, SPG 1-90+, ADTKD-MUC1/UMOD/REN/HNF1B, Osteogenesis imperfecta I-XXII, Cone-rod dystrophy 1-21, Immunodeficiency-N series, etc.) AND the clinical features in this vignette CANNOT reliably distinguish which numbered/gene-keyed subtype is present, name the UMBRELLA disease — NOT a specific subtype with a confident gene attribution. Naming "Loeys-Dietz syndrome type 2 (TGFBR2)" when the vignette has no TGFBR2-specific evidence is a confident wrong-gene error that sends physicians on a tangent. Use \`clinicalReasoning\` to list the candidate subtypes the umbrella would need genetic panel testing to differentiate. Specifying a subtype is only appropriate when the case carries subtype-distinguishing evidence (e.g., a distinctive EEG pattern, a pathognomonic radiographic finding, or explicit family-history pattern keyed to that subtype).${V17_ANNOTATION_ADDENDUM}`;

    const generalInternistPrompt = `You are Dr. Internist, a ${title} with 25+ years of experience. You are the senior diagnostician on this case — the one who asks "what is everyone else missing?"

${expertise}

${referenceBody}

You are reviewing a patient case as part of a multi-specialist diagnostic consultation. Other domain specialists (neurologist, rheumatologist, cardiologist, etc.) are also reviewing this case. They have access to a curated knowledge base of ${getDiseaseCount()} rare disease profiles. YOUR role is different:

YOU ARE THE UN-ANCHORED DIAGNOSTICIAN. You are intentionally NOT given structured disease profiles from the knowledge base. This is by design. The other specialists may anchor too heavily on the ${getDiseaseCount()} diseases in our database. There are an estimated 10,000+ known rare diseases. Your job is to think broadly and consider diagnoses the other specialists might miss because they were focused on their domain or anchored to the knowledge base.

YOUR DIAGNOSTIC APPROACH:
1. Think across ALL specialties and body systems — you are not confined to one domain
2. Apply the cross-specialty patterns and treatable-masquerade list above before settling
3. Consider diseases that fall between specialties or are easily misattributed
4. Think about atypical presentations of both common and rare diseases
5. Consider diagnoses that require connecting symptoms across multiple organ systems
6. Ask "what if the obvious specialty framing is wrong?" — e.g., what if neurological symptoms are actually metabolic?
7. For each hypothesis, map EVERY piece of supporting evidence to a SPECIFIC patient symptom

OUTPUT RULES:
- Generate 3-7 diagnostic hypotheses ranked by likelihood
- Each hypothesis MUST include specific evidence mapping
- Prioritize diagnoses that domain specialists are likely to MISS
- Consider rare diseases, overlap syndromes, and atypical presentations
- Be precise — vague reasoning undermines clinical credibility
- Provide your own assessment of which diagnostic criteria or clinical features support each diagnosis
- DIAGNOSIS NAMING: Always use the most specific disease name the evidence supports. Use "Retinitis Pigmentosa" not "Inherited Retinal Dystrophy". Use "Leber Congenital Amaurosis" not "Hereditary Retinal Dystrophy". The diagnosis name should identify a specific disease entity, not a broad disease category.
- SUBTYPE RESTRAINT (critical): when the disease has multiple numbered or gene-keyed subtypes (Loeys-Dietz syndrome 1-5, DEE 1-100+, SPG 1-90+, ADTKD-MUC1/UMOD/REN/HNF1B, Osteogenesis imperfecta I-XXII, Cone-rod dystrophy 1-21, Immunodeficiency-N series, etc.) AND the clinical features in this vignette CANNOT reliably distinguish which numbered/gene-keyed subtype is present, name the UMBRELLA disease — NOT a specific subtype with a confident gene attribution. Naming "Loeys-Dietz syndrome type 2 (TGFBR2)" when the vignette has no TGFBR2-specific evidence is a confident wrong-gene error that sends physicians on a tangent. Use \`clinicalReasoning\` to list the candidate subtypes the umbrella would need genetic panel testing to differentiate. Specifying a subtype is only appropriate when the case carries subtype-distinguishing evidence (e.g., a distinctive EEG pattern, a pathognomonic radiographic finding, or explicit family-history pattern keyed to that subtype).${V17_ANNOTATION_ADDENDUM}`;

    super({
      name: `specialist-v17-${specialistType}`,
      model: 'o3',
      reasoningEffort: 'high',
      temperature: 0,
      // v17: 8000 -> 60000. Specialists now also emit per-hypothesis
      // diagnosticTests/cardinalFeatures/ruleOutFeatures + domainConfidence
      // on top of v5 fields. Output budget needs to fit reasoning trace +
      // 3-7 hypotheses x larger schema.
      maxTokens: 60000,
      systemPrompt: isGeneralInternist ? generalInternistPrompt : domainSpecialistPrompt,
    });

    this.specialistType = specialistType;
  }

  async execute(input: AgentInput): Promise<SpecialistV17Output> {
    const { patientCase, candidateDiseases } = input;
    const userPrompt = this.buildPrompt(patientCase, candidateDiseases || []);

    const result = await this.callWithTools(userPrompt, [
      {
        type: 'function',
        function: {
          name: 'generate_specialist_hypotheses',
          description: 'Generate specialist diagnostic hypotheses with evidence mapping plus v17 annotation fields',
          parameters: {
            type: 'object',
            properties: {
              hypotheses: {
                type: 'array',
                minItems: 2,
                maxItems: 7,
                items: {
                  type: 'object',
                  properties: {
                    diagnosis: { type: 'string', description: 'Specific disease name, not a broad category.' },
                    icd10Code: { type: 'string' },
                    confidenceScore: { type: 'number', minimum: 0, maximum: 100, description: 'Overall probability this diagnosis is correct, 0-100.' },
                    rareDisease: { type: 'boolean' },
                    prevalence: { type: 'string' },
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
                    clinicalReasoning: { type: 'string' },
                    typicalPresentation: { type: 'string' },
                    specialistRequired: { type: 'string' },
                    diagnosticCriteriaAssessment: {
                      type: 'object',
                      properties: {
                        criteriaName: { type: 'string' },
                        criteriaMet: { type: 'array', items: { type: 'string' } },
                        criteriaNotMet: { type: 'array', items: { type: 'string' } },
                        criteriaUnknown: { type: 'array', items: { type: 'string' } },
                      },
                    },
                    // v17 annotation fields
                    diagnosticTests: {
                      type: 'array',
                      items: { type: 'string' },
                      description: '2-5 specific tests that would confirm or refute this diagnosis.',
                    },
                    cardinalFeatures: {
                      type: 'array',
                      items: { type: 'string' },
                      description: '2-5 features the patient should have if this diagnosis is correct.',
                    },
                    ruleOutFeatures: {
                      type: 'array',
                      items: { type: 'string' },
                      description: '1-3 features whose absence would rule out this diagnosis.',
                    },
                    domainConfidence: {
                      type: 'number',
                      minimum: 0,
                      maximum: 100,
                      description: "This specialist's own confidence in the hypothesis from their domain perspective, 0-100.",
                    },
                    // v18 clarifying questions (top-3 hypotheses only — Clarifier
                    // stage will pick the best 1-5 across all specialists).
                    clarifyingQuestions: {
                      type: 'array',
                      description: '1-3 patient-answerable yes/no questions that would discriminate this hypothesis. Populate for your top-3 hypotheses.',
                      items: {
                        type: 'object',
                        properties: {
                          question: { type: 'string', description: 'Patient-facing yes/no question, second person.' },
                          ifYesImpact: { type: 'string', enum: ['rules-in', 'supports', 'weakens', 'rules-out'] },
                          rationale: { type: 'string', description: 'One-sentence clinician-facing reason this question discriminates the diagnosis.' },
                          questionType: { type: 'string', enum: ['symptom', 'prior_dx', 'family_history', 'lab_result'] },
                        },
                        required: ['question', 'ifYesImpact', 'rationale', 'questionType'],
                      },
                    },
                  },
                  required: ['diagnosis', 'confidenceScore', 'clinicalReasoning', 'supportingEvidence'],
                },
              },
              overallReasoning: { type: 'string' },
            },
            required: ['hypotheses', 'overallReasoning'],
          },
        },
      },
    ], { type: 'function', function: { name: 'generate_specialist_hypotheses' } });

    // Map LLM output to SpecialistV17Hypothesis (DiagnosisHypothesis + specialty attribution).
    const hypotheses: SpecialistV17Hypothesis[] = (result.content.hypotheses || []).map((h: any): SpecialistV17Hypothesis => ({
      diagnosis: h.diagnosis,
      icd10Code: h.icd10Code,
      confidenceScore: h.confidenceScore,
      evidenceScore: 0,
      rareDisease: h.rareDisease ?? true,
      prevalence: h.prevalence,
      supportingEvidence: (h.supportingEvidence || []).map((e: any) => ({
        ...e,
        type: 'supporting' as const,
        attributedTo: this.specialistType,
      })),
      contradictoryEvidence: (h.contradictoryEvidence || []).map((e: any) => ({
        ...e,
        type: 'contradictory' as const,
        attributedTo: this.specialistType,
      })),
      clinicalReasoning: h.clinicalReasoning,
      typicalPresentation: h.typicalPresentation || '',
      specialistRequired: h.specialistRequired || this.specialistType,
      diagnosticCriteria: {
        criteriaName: h.diagnosticCriteriaAssessment?.criteriaName || 'Clinical assessment',
        totalCriteria: 0,
        metCriteria: 0,
        criteriaDetails: [],
        fulfillmentPercentage: 0,
      },
      sourceAgent: this.name,
      sourceAgents: [this.specialistType],
      evaluationType: 'reasoning-evaluated' as const,
      knowledgeBaseMatch: false, // will be set by Stage 5 (Claude evaluator)
      // v17 annotation fields
      diagnosticTests: Array.isArray(h.diagnosticTests) && h.diagnosticTests.length ? h.diagnosticTests : undefined,
      cardinalFeatures: Array.isArray(h.cardinalFeatures) && h.cardinalFeatures.length ? h.cardinalFeatures : undefined,
      ruleOutFeatures: Array.isArray(h.ruleOutFeatures) && h.ruleOutFeatures.length ? h.ruleOutFeatures : undefined,
      domainConfidenceMap: typeof h.domainConfidence === 'number'
        ? { [this.specialistType]: h.domainConfidence }
        : undefined,
      clarifyingQuestionCandidates: Array.isArray(h.clarifyingQuestions) && h.clarifyingQuestions.length
        ? h.clarifyingQuestions
            .filter((q: any) =>
              q
              && typeof q.question === 'string'
              && q.question.trim().length > 0
              && ['rules-in', 'supports', 'weakens', 'rules-out'].includes(q.ifYesImpact)
              && ['symptom', 'prior_dx', 'family_history', 'lab_result'].includes(q.questionType),
            )
            .map((q: any) => ({
              question: q.question.trim(),
              ifYesImpact: q.ifYesImpact,
              rationale: typeof q.rationale === 'string' ? q.rationale : '',
              questionType: q.questionType,
            }))
        : undefined,
      emittedBySpecialty: this.specialistType,
    }));

    return {
      agentName: this.name,
      specialty: this.specialistType,
      hypotheses,
      reasoning: result.content.overallReasoning || '',
      confidence: hypotheses.length > 0 ? hypotheses[0].confidenceScore : 0,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      model: result.model,
    };
  }

  // ===== v5 buildPrompt — reused verbatim =====
  private buildPrompt(patientCase: PatientCase, candidateDiseases: DiseaseMatch[]): string {
    const symptomList = patientCase.symptoms
      .map((s, i) => {
        const term = s.selectedConcept?.name || s.medicalTerm || s.originalPhrase;
        const parts = [`[${i}] "${s.originalPhrase}" → ${term}`];
        if (s.category) parts.push(`category: ${s.category}`);
        if (s.severity) parts.push(`severity: ${s.severity}`);
        if (s.duration) parts.push(`duration: ${s.duration}`);
        if (s.bodyPart) parts.push(`body part: ${s.bodyPart}`);
        return parts.join(' | ');
      })
      .join('\n');

    const isGeneralInternist = this.specialistType === 'general-internist';
    let kbSection = '';

    if (!isGeneralInternist && candidateDiseases.length > 0) {
      const diseaseProfiles = candidateDiseases.slice(0, 10).map((dm) => {
        const d = dm.disease;
        const criteriaStr = d.diagnosticCriteria.criteria
          .map((c) => `  - [${c.category}${c.requiredForDiagnosis ? ', REQUIRED' : ''}] ${c.description}`)
          .join('\n');

        const keySymptoms = [
          ...d.symptoms.pathognomonic.map((s) => `  - [pathognomonic, ${s.frequency}%] ${s.symptomName}`),
          ...d.symptoms.common.map((s) => `  - [common, ${s.frequency}%] ${s.symptomName}`),
        ].join('\n');

        return `
### ${d.name} (${d.id})
Prevalence: ${d.prevalence.estimate} (${d.prevalence.classification})
Onset: age ${d.demographics.typicalOnsetAge.min}-${d.demographics.typicalOnsetAge.max}, ${d.demographics.sexPredilection}
Match score: ${(dm.matchScore * 100).toFixed(0)}%
Matched symptoms: ${dm.matchedSymptoms.map((m) => m.patientSymptom).join(', ')}

Key symptoms:
${keySymptoms}

Diagnostic criteria${d.diagnosticCriteria.formalCriteriaName ? ` (${d.diagnosticCriteria.formalCriteriaName})` : ''}:
${criteriaStr}
${d.diagnosticCriteria.minimumForDiagnosis ? `Minimum for diagnosis: ${d.diagnosticCriteria.minimumForDiagnosis}` : ''}

Red flags: ${d.redFlags.join(', ')}`;
      }).join('\n---');

      kbSection = `
===== KNOWLEDGE BASE: CANDIDATE DISEASES =====
The following diseases from our curated knowledge base (${getDiseaseCount()} profiled rare diseases) match this patient's symptoms.
Reference these profiles where relevant, but also consider diseases NOT listed here.
${diseaseProfiles}`;
    } else if (isGeneralInternist) {
      kbSection = `
===== NOTE =====
You are intentionally not provided with knowledge base disease profiles. Other specialists on this case have been given profiles from our database of ${getDiseaseCount()} rare diseases. Your role is to think independently and consider what they might miss.`;
    }

    const taskSection = isGeneralInternist
      ? `===== YOUR TASK =====
As the senior diagnostician, generate your differential diagnosis hypotheses.
Think broadly. Consider what domain specialists anchored to a small disease database might overlook.
Map evidence to specific patient symptoms.`
      : `===== YOUR TASK =====
As a ${SPECIALTY_REFERENCES[this.specialistType].title}, generate your differential diagnosis hypotheses.
Reference the disease profiles above where relevant, but also consider conditions not in the database.
Map evidence to specific patient symptoms.`;

    return `PATIENT PRESENTATION:

Demographics: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}

${patientCase.chiefComplaint?.description ? `Chief Complaint: "${patientCase.chiefComplaint.description}"
Duration: ${patientCase.chiefComplaint.duration || 'unknown'}
Severity: ${patientCase.chiefComplaint.severity || 'unknown'}/10
` : ''}Symptoms (present):
${symptomList}

${patientCase.excludedFindings && patientCase.excludedFindings.length > 0 ? `Findings EXPLICITLY EXCLUDED (denied / absent / ruled out):
${patientCase.excludedFindings.map((f) => `- ${f}`).join('\n')}

These are NOT missing data — they are negative evidence. A diagnosis whose pathognomonic or expected common feature appears in this list should be downranked or ruled out; cite the absent feature as contradictory evidence in your reasoning.

` : ''}${(() => {
  const { formatLabsForPrompt } = require('../pipeline/lab-utils');
  return formatLabsForPrompt(patientCase.labResults);
})()}
${patientCase.medicalHistory?.familyHistory?.length ? `Family History: ${patientCase.medicalHistory.familyHistory.join(', ')}` : ''}
${patientCase.medicalHistory?.pastMedicalHistory?.length ? `Past Medical History: ${patientCase.medicalHistory.pastMedicalHistory.join(', ')}` : ''}
${patientCase.medicalHistory?.currentMedications?.length ? `Current Medications: ${JSON.stringify(patientCase.medicalHistory.currentMedications)}` : ''}
${patientCase.patientHypothesis ? `Patient suspects: "${patientCase.patientHypothesis}"` : ''}

${patientCase.symptomPatterns?.patterns?.length ? `
Clinical Pattern Analysis:
${patientCase.symptomPatterns.patterns.map((p) => `- "${p.patternName}" (${p.clinicalCategory}, confidence: ${Math.round(p.confidence * 100)}%) — ${p.reasoning}`).join('\n')}
Overall impression: ${patientCase.symptomPatterns.overallImpression}` : ''}
${kbSection}

${taskSection}`;
  }
}

// ===== FACTORY + selection helper =====

export function getSpecialistV17Agent(specialistType: string): SpecialistV17Agent {
  if (!SPECIALTY_REFERENCES[specialistType as SpecialistType]) {
    throw new Error(`Unknown specialist type: ${specialistType}`);
  }
  return new SpecialistV17Agent(specialistType as SpecialistType);
}

/**
 * Select the 5 specialists for v17 Stage 2:
 *   - geneticist (anchor)
 *   - general-internist (anchor)
 *   - top entries from the triage ranking that aren't already anchors
 *
 * Always returns exactly 5 distinct specialists.
 */
export function selectV17Specialists(triageRanking: SpecialistType[]): SpecialistType[] {
  const anchors: SpecialistType[] = ['geneticist', 'general-internist'];
  const selected: SpecialistType[] = [...anchors];
  const seen = new Set<SpecialistType>(anchors);

  for (const s of triageRanking) {
    if (selected.length >= 5) break;
    if (seen.has(s)) continue;
    selected.push(s);
    seen.add(s);
  }

  return selected;
}
