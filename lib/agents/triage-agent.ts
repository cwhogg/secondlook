import { BaseAgent } from './base-agent';
import { AgentInput, TriageOutput, SYSTEM_TO_SPECIALIST, SpecialistType } from './types';
import { PatientCase } from '../types';
import { findMatchingDiseases } from '../knowledge/retrieval';

const TRIAGE_SYSTEM_PROMPT = `You are a clinical triage specialist responsible for the initial assessment of complex patient presentations. Your role is to:

1. Identify which body systems are involved based on the patient's symptoms
2. Assess clinical acuity (emergent, urgent, or non-urgent)
3. Determine which medical specialties should evaluate this patient
4. Provide brief clinical reasoning for your triage decisions

You are triaging for a rare disease diagnostic service. Consider uncommon and complex presentations, not just obvious diagnoses.

IMPORTANT: Be thorough in identifying ALL potentially relevant body systems. A symptom like "fatigue" could involve constitutional, endocrine, hematological, or neurological systems. When in doubt, include the system.

Return your analysis as structured JSON.`;

export class TriageAgent extends BaseAgent {
  constructor() {
    super({
      name: 'triage-agent',
      model: 'gpt-4.1-nano',
      temperature: 0.2,
      maxTokens: 1500,
      systemPrompt: TRIAGE_SYSTEM_PROMPT,
    });
  }

  async execute(input: AgentInput): Promise<TriageOutput> {
    const { patientCase } = input;

    const userPrompt = this.buildPrompt(patientCase);

    const result = await this.callWithTools(userPrompt, [
      {
        type: 'function',
        function: {
          name: 'triage_patient',
          description: 'Triage patient presentation and identify relevant body systems and specialties',
          parameters: {
            type: 'object',
            properties: {
              bodySystems: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [
                    'neurological', 'musculoskeletal', 'cardiovascular', 'respiratory',
                    'gastrointestinal', 'dermatological', 'ophthalmological', 'endocrine',
                    'hematological', 'immunological', 'renal', 'reproductive',
                    'psychiatric', 'constitutional', 'otolaryngological',
                  ],
                },
                description: 'Body systems involved in this presentation',
              },
              acuityLevel: {
                type: 'string',
                enum: ['emergent', 'urgent', 'non-urgent'],
                description: 'Clinical acuity assessment',
              },
              triageReasoning: {
                type: 'string',
                description: 'Brief clinical reasoning for triage decisions',
              },
            },
            required: ['bodySystems', 'acuityLevel', 'triageReasoning'],
          },
        },
      },
    ], { type: 'function', function: { name: 'triage_patient' } });

    const { bodySystems, acuityLevel, triageReasoning } = result.content;

    // Determine relevant specialties from body systems
    const specialtySet = new Set<SpecialistType>();
    for (const system of bodySystems) {
      const specialists = SYSTEM_TO_SPECIALIST[system] || [];
      specialists.forEach((s) => specialtySet.add(s));
    }

    // Always include general-internist as the un-anchored counterweight agent.
    // It receives NO KB profiles and reasons purely from training data, providing
    // a check against the other specialists' KB anchoring bias.
    specialtySet.add('general-internist');

    // Take up to 4 domain specialists + always include general-internist
    const domainSpecialists = Array.from(specialtySet)
      .filter((s) => s !== 'general-internist')
      .slice(0, 3); // max 3 domain specialists
    const relevantSpecialties = [...domainSpecialists, 'general-internist' as SpecialistType];

    // Retrieve candidate diseases from knowledge base (async — uses semantic search if embeddings available)
    const candidateDiseases = await findMatchingDiseases(
      patientCase.symptoms,
      patientCase.demographics,
      {
        maxResults: 30,
        minScore: 0.03,
        filterSystems: bodySystems,
      }
    );

    return {
      bodySystems,
      acuityLevel,
      relevantSpecialties,
      candidateDiseases,
      triageReasoning,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
    };
  }

  private buildPrompt(patientCase: PatientCase): string {
    const symptomList = patientCase.symptoms
      .map((s) => {
        const term = s.selectedConcept?.name || s.medicalTerm || s.originalPhrase;
        const parts = [`"${s.originalPhrase}" → ${term}`];
        if (s.category) parts.push(`category: ${s.category}`);
        if (s.severity) parts.push(`severity: ${s.severity}`);
        if (s.bodyPart) parts.push(`body part: ${s.bodyPart}`);
        return `- ${parts.join(' | ')}`;
      })
      .join('\n');

    return `PATIENT PRESENTATION:

Demographics: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}

Chief Complaint: "${patientCase.chiefComplaint.description}"
Duration: ${patientCase.chiefComplaint.duration || 'unknown'}
Severity: ${patientCase.chiefComplaint.severity || 'unknown'}/10

Symptoms:
${symptomList}

${patientCase.medicalHistory?.familyHistory?.length ? `Family History: ${patientCase.medicalHistory.familyHistory.join(', ')}` : ''}

${patientCase.patientHypothesis ? `Patient suspects: "${patientCase.patientHypothesis}"` : ''}

Please triage this patient presentation.`;
  }
}
