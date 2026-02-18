import { BaseAgent, LLMCallResult } from '../base-agent';
import { AgentInput, AgentOutput, SpecialistType } from '../types';
import { PatientCase, DiagnosisHypothesis } from '../../types';
import { DiseaseMatch } from '../../types/knowledge-base';

// ===== SPECIALIST PROMPTS =====

const SPECIALIST_PROMPTS: Record<SpecialistType, { title: string; expertise: string }> = {
  neurologist: {
    title: 'Board-Certified Neurologist',
    expertise: `- Demyelinating diseases (MS, NMO, MOG antibody disease)
- Neuromuscular disorders (myasthenia gravis, CIDP, motor neuron diseases, myopathies)
- Small fiber neuropathy and autonomic disorders
- Movement disorders, ataxias, and hereditary spastic paraplegias
- Autoimmune and paraneoplastic encephalitis
- Headache disorders and cranial neuropathies
- Neurodegenerative conditions with atypical presentations`,
  },
  rheumatologist: {
    title: 'Board-Certified Rheumatologist',
    expertise: `- Systemic autoimmune diseases (SLE, Sjogren's, scleroderma, myositis)
- Vasculitis syndromes (ANCA-associated, large vessel, small vessel)
- Connective tissue disorders (EDS, Marfan, mixed CTD)
- Inflammatory arthritis (RA, PsA, reactive, ankylosing spondylitis)
- Autoinflammatory syndromes (FMF, TRAPS, Still's disease)
- IgG4-related disease, sarcoidosis, Behcet's
- Overlap syndromes and undifferentiated CTD`,
  },
  cardiologist: {
    title: 'Board-Certified Cardiologist',
    expertise: `- Dysautonomia (POTS, neurocardiogenic syncope, orthostatic hypotension)
- Cardiomyopathies (hypertrophic, dilated, restrictive, arrhythmogenic)
- Inherited arrhythmia syndromes (Long QT, Brugada, CPVT)
- Cardiac manifestations of systemic diseases
- Pulmonary hypertension
- Cardiac amyloidosis and infiltrative diseases
- Vascular anomalies (fibromuscular dysplasia, vasculitis)`,
  },
  immunologist: {
    title: 'Board-Certified Clinical Immunologist',
    expertise: `- Primary immunodeficiencies (CVID, selective IgA deficiency, 22q11.2 deletion)
- Mast cell disorders (MCAS, mastocytosis, hereditary alpha-tryptasemia)
- Autoinflammatory syndromes
- Allergic and eosinophilic disorders
- Immune dysregulation syndromes
- Complement deficiencies
- Recurrent infections with underlying immune defects`,
  },
  endocrinologist: {
    title: 'Board-Certified Endocrinologist',
    expertise: `- Adrenal disorders (Addison's, Cushing's, pheochromocytoma, CAH)
- Thyroid disorders (Hashimoto's, Graves', thyroid nodules, MEN syndromes)
- Pituitary disorders (acromegaly, prolactinoma, hypopituitarism)
- Calcium/parathyroid disorders
- Metabolic bone diseases
- Rare metabolic conditions (porphyrias, storage diseases)
- Polyglandular autoimmune syndromes`,
  },
  gastroenterologist: {
    title: 'Board-Certified Gastroenterologist',
    expertise: `- Inflammatory bowel disease (Crohn's, UC, microscopic colitis)
- Eosinophilic GI disorders (EoE, eosinophilic gastroenteritis)
- Motility disorders (gastroparesis, achalasia, intestinal pseudo-obstruction)
- Autoimmune liver diseases (AIH, PBC, PSC)
- Celiac disease and malabsorption syndromes
- Rare GI conditions (Whipple's, intestinal lymphangiectasia)
- GI manifestations of systemic diseases`,
  },
  geneticist: {
    title: 'Board-Certified Medical Geneticist',
    expertise: `- Hereditary connective tissue disorders (EDS subtypes, Marfan, Loeys-Dietz)
- Chromosomal abnormalities (Turner, Klinefelter, 22q11.2 deletion)
- Neurocutaneous syndromes (NF1, NF2, tuberous sclerosis, VHL)
- Inborn errors of metabolism (storage diseases, aminoacidopathies)
- Hereditary cancer syndromes
- Skeletal dysplasias
- Mitochondrial disorders`,
  },
  hematologist: {
    title: 'Board-Certified Hematologist',
    expertise: `- Myeloproliferative neoplasms (PV, ET, myelofibrosis)
- Inherited anemias and hemoglobin disorders
- Coagulation disorders and thrombophilias
- Bone marrow failure syndromes
- Monoclonal gammopathies and amyloidosis
- Hemolytic anemias (PNH, TTP, hereditary spherocytosis)
- Hemophagocytic syndromes (HLH)`,
  },
  'general-internist': {
    title: 'Board-Certified Internal Medicine Specialist (Diagnostician)',
    expertise: `- Multi-system diseases that cross specialty boundaries
- Undifferentiated presentations requiring broad differential thinking
- Chronic fatigue, pain syndromes, and functional disorders
- Systemic manifestations of rare diseases
- Complex cases with overlapping conditions
- Periodic fever syndromes and autoinflammatory conditions
- Drug-related and environmental causes of complex presentations`,
  },
};

// ===== SPECIALIST AGENT =====

class SpecialistAgent extends BaseAgent {
  private specialistType: SpecialistType;

  constructor(specialistType: SpecialistType) {
    const { title, expertise } = SPECIALIST_PROMPTS[specialistType];

    super({
      name: `specialist-${specialistType}`,
      model: 'gpt-4o',
      temperature: 0.3,
      maxTokens: 4000,
      systemPrompt: `You are Dr. ${specialistType.charAt(0).toUpperCase() + specialistType.slice(1)}, a ${title} with 25+ years of experience specializing in complex and rare diseases. Your areas of deep expertise include:

${expertise}

You are reviewing a patient case as part of a multi-specialist diagnostic consultation. You have been provided with disease profiles from a curated knowledge base that match this patient's presentation.

YOUR DIAGNOSTIC APPROACH:
1. Consider ONLY conditions within or adjacent to your area of expertise
2. For each hypothesis, map EVERY piece of supporting evidence to a SPECIFIC patient symptom
3. Reference diagnostic criteria from the provided disease profiles — state which criteria are met
4. Honestly note contradictory evidence and information gaps
5. Consider mimics, overlapping conditions, and atypical presentations
6. Think about what is COMMONLY MISSED by generalists in your specialty area

OUTPUT RULES:
- Generate 2-4 diagnostic hypotheses ranked by likelihood
- Each hypothesis MUST include specific evidence mapping
- Do NOT suggest common diagnoses that any GP would consider
- Focus on rare/complex conditions that require specialist evaluation
- Be precise — vague reasoning undermines clinical credibility`,
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
                    diagnosis: { type: 'string' },
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

    // Include relevant disease profiles from KB
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

    return `PATIENT PRESENTATION:

Demographics: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}

Chief Complaint: "${patientCase.chiefComplaint.description}"
Duration: ${patientCase.chiefComplaint.duration || 'unknown'}
Severity: ${patientCase.chiefComplaint.severity || 'unknown'}/10

Symptoms:
${symptomList}

${patientCase.medicalHistory?.familyHistory?.length ? `Family History: ${patientCase.medicalHistory.familyHistory.join(', ')}` : ''}
${patientCase.medicalHistory?.pastMedicalHistory?.length ? `Past Medical History: ${patientCase.medicalHistory.pastMedicalHistory.join(', ')}` : ''}
${patientCase.medicalHistory?.currentMedications?.length ? `Current Medications: ${JSON.stringify(patientCase.medicalHistory.currentMedications)}` : ''}
${patientCase.patientHypothesis ? `Patient suspects: "${patientCase.patientHypothesis}"` : ''}

${patientCase.symptomPatterns?.patterns?.length ? `
Clinical Pattern Analysis:
${patientCase.symptomPatterns.patterns.map((p) => `- "${p.patternName}" (${p.clinicalCategory}, confidence: ${Math.round(p.confidence * 100)}%) — ${p.reasoning}`).join('\n')}
Overall impression: ${patientCase.symptomPatterns.overallImpression}` : ''}

===== KNOWLEDGE BASE: CANDIDATE DISEASES =====
The following diseases from our curated knowledge base match this patient's symptoms.
Use these profiles to ground your analysis — reference specific diagnostic criteria.
${diseaseProfiles || '\n(No close matches found in knowledge base)'}

===== YOUR TASK =====
As a ${SPECIALIST_PROMPTS[this.specialistType].title}, generate your differential diagnosis hypotheses.
Reference the disease profiles above where relevant. Map evidence to specific patient symptoms.`;
  }
}

// ===== FACTORY =====

export function getSpecialistAgent(specialistType: string): SpecialistAgent {
  if (!SPECIALIST_PROMPTS[specialistType as SpecialistType]) {
    throw new Error(`Unknown specialist type: ${specialistType}`);
  }
  return new SpecialistAgent(specialistType as SpecialistType);
}
