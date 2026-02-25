import { BaseAgent } from './base-agent';
import { AgentInput, TriageOutput, SYSTEM_TO_SPECIALIST, SpecialistType } from './types';
import { PatientCase } from '../types';
import { findMatchingDiseases } from '../knowledge/retrieval';

const TRIAGE_SYSTEM_PROMPT = `You are a clinical triage specialist responsible for the initial assessment of complex patient presentations. Your role is to:

1. Identify which body systems are DIRECTLY involved based on the patient's symptoms
2. Assess clinical acuity (emergent, urgent, or non-urgent)
3. Determine which medical specialties should evaluate this patient
4. Provide brief clinical reasoning for your triage decisions

You are triaging for a rare disease diagnostic service. Consider uncommon and complex presentations, not just obvious diagnoses.

IMPORTANT: Only select body systems that the symptoms directly implicate. Typically 2-4 systems are involved, rarely more than 5. Do NOT tag every possible system — focus on the systems where there is concrete symptom evidence. A symptom should map to at most 1-2 body systems, not all systems it could theoretically affect.

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
                    'psychiatric', 'constitutional', 'otolaryngological', 'oncological',
                  ],
                },
                description: 'Body systems DIRECTLY involved in this presentation. Select only 2-5 systems with concrete symptom evidence.',
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

    // Ensure every body system gets at least its primary specialist
    const primaryBySystem: SpecialistType[] = [];
    const allSpecialists = new Set<SpecialistType>();

    for (const system of bodySystems) {
      const specialists = SYSTEM_TO_SPECIALIST[system] || [];
      if (specialists.length > 0 && !allSpecialists.has(specialists[0])) {
        primaryBySystem.push(specialists[0]);
      }
      specialists.forEach((s) => allSpecialists.add(s));
    }

    // Primary specialists first (guarantees every body system has representation),
    // then secondaries, capped at 4 domain specialists
    const secondaries = Array.from(allSpecialists)
      .filter((s) => s !== 'general-internist' && !primaryBySystem.includes(s));
    const domainSpecialists = [...primaryBySystem, ...secondaries].slice(0, 4);

    // Always include general-internist as the un-anchored counterweight agent.
    // It receives NO KB profiles and reasons purely from training data, providing
    // a check against the other specialists' KB anchoring bias.
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

${patientCase.chiefComplaint?.description ? `Chief Complaint: "${patientCase.chiefComplaint.description}"
Duration: ${patientCase.chiefComplaint.duration || 'unknown'}
Severity: ${patientCase.chiefComplaint.severity || 'unknown'}/10
` : ''}Symptoms:
${symptomList}

${patientCase.medicalHistory?.familyHistory?.length ? `Family History: ${patientCase.medicalHistory.familyHistory.join(', ')}` : ''}

${patientCase.patientHypothesis ? `Patient suspects: "${patientCase.patientHypothesis}"` : ''}

Please triage this patient presentation.`;
  }
}
