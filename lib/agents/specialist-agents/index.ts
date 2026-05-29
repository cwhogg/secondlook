import { BaseAgent, LLMCallResult } from '../base-agent';
import { AgentInput, AgentOutput, SpecialistType } from '../types';
import { PatientCase, DiagnosisHypothesis } from '../../types';
import { DiseaseMatch } from '../../types/knowledge-base';
import { getDiseaseCount } from '../../knowledge';
import { SPECIALTY_REFERENCES, renderSpecialtyReference } from '../specialty-reference';

// ===== SPECIALIST AGENT =====

class SpecialistAgent extends BaseAgent {
  private specialistType: SpecialistType;

  constructor(specialistType: SpecialistType) {
    const { title, expertise } = SPECIALTY_REFERENCES[specialistType];
    const isGeneralInternist = specialistType === 'general-internist';
    const referenceBody = renderSpecialtyReference(specialistType);

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
- Generate 2-4 diagnostic hypotheses ranked by likelihood
- Each hypothesis MUST include specific evidence mapping
- Do NOT suggest common diagnoses that any GP would consider
- Focus on rare/complex conditions that require specialist evaluation
- Be precise — vague reasoning undermines clinical credibility
- For diagnoses NOT in the provided knowledge base profiles, provide your own assessment of which diagnostic criteria or clinical features support the diagnosis
- DIAGNOSIS NAMING: Always use the most specific disease name the evidence supports. Use "Retinitis Pigmentosa" not "Inherited Retinal Dystrophy". Use "Leber Congenital Amaurosis" not "Hereditary Retinal Dystrophy". Use "Charcot-Marie-Tooth Disease Type 2A" not "Hereditary Motor Sensory Neuropathy". The diagnosis name should identify a specific disease entity, not a broad disease category.`;

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
- Generate 2-4 diagnostic hypotheses ranked by likelihood
- Each hypothesis MUST include specific evidence mapping
- Prioritize diagnoses that domain specialists are likely to MISS
- Consider rare diseases, overlap syndromes, and atypical presentations
- Be precise — vague reasoning undermines clinical credibility
- Provide your own assessment of which diagnostic criteria or clinical features support each diagnosis
- DIAGNOSIS NAMING: Always use the most specific disease name the evidence supports. Use "Retinitis Pigmentosa" not "Inherited Retinal Dystrophy". Use "Leber Congenital Amaurosis" not "Hereditary Retinal Dystrophy". The diagnosis name should identify a specific disease entity, not a broad disease category.`;

    // Experiment v5: specialists upgraded gpt-4.1 -> o3 reasoning:high to
    // match the single-shot o3 baseline. If the pipeline still loses head-to-
    // head against eval-baseline OpenAI o3, the architecture itself is the
    // problem (not specialist model power). temperature is ignored for
    // reasoning models — base-agent skips it — but the type still requires
    // a value.
    super({
      name: `specialist-${specialistType}`,
      model: 'o3',
      reasoningEffort: 'high',
      temperature: 0,
      maxTokens: 8000,
      systemPrompt: isGeneralInternist ? generalInternistPrompt : domainSpecialistPrompt,
    });

    this.specialistType = specialistType;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { patientCase, candidateDiseases } = input;
    const userPrompt = this.buildPrompt(patientCase, candidateDiseases || []);

    const result = await this.callWithTools(userPrompt, [
      {
        type: 'function',
        function: {
          name: 'generate_specialist_hypotheses',
          description: 'Generate specialist diagnostic hypotheses with evidence mapping',
          parameters: {
            type: 'object',
            properties: {
              hypotheses: {
                type: 'array',
                minItems: 2,
                maxItems: 4,
                items: {
                  type: 'object',
                  properties: {
                    diagnosis: { type: 'string', description: 'Specific disease name, not a broad category. E.g. "Retinitis Pigmentosa" not "Inherited Retinal Dystrophy"' },
                    icd10Code: { type: 'string' },
                    confidenceScore: { type: 'number', minimum: 0, maximum: 100 },
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

    // Transform raw hypotheses into DiagnosisHypothesis format
    const hypotheses: DiagnosisHypothesis[] = result.content.hypotheses.map((h: any) => ({
      diagnosis: h.diagnosis,
      icd10Code: h.icd10Code,
      confidenceScore: h.confidenceScore,
      evidenceScore: 0, // Will be computed by evidence evaluator
      rareDisease: h.rareDisease ?? true,
      prevalence: h.prevalence,
      supportingEvidence: (h.supportingEvidence || []).map((e: any) => ({
        ...e,
        type: 'supporting' as const,
      })),
      contradictoryEvidence: (h.contradictoryEvidence || []).map((e: any) => ({
        ...e,
        type: 'contradictory' as const,
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
      evaluationType: 'reasoning-evaluated' as const, // will be upgraded to 'criteria-grounded' by evidence evaluator if KB match found
      knowledgeBaseMatch: false, // will be set by evidence evaluator
    }));

    return {
      agentName: this.name,
      hypotheses,
      reasoning: result.content.overallReasoning,
      confidence: hypotheses.length > 0 ? hypotheses[0].confidenceScore : 0,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      model: result.model,
    };
  }

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

    // Include relevant disease profiles from KB (but NOT for general-internist)
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
  // Lazy require so this module doesn't grow a circular dep with the pipeline layer.
  const { formatLabsForPrompt } = require('../../pipeline/lab-utils');
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

// ===== FACTORY =====

export function getSpecialistAgent(specialistType: string): SpecialistAgent {
  if (!SPECIALTY_REFERENCES[specialistType as SpecialistType]) {
    throw new Error(`Unknown specialist type: ${specialistType}`);
  }
  return new SpecialistAgent(specialistType as SpecialistType);
}
