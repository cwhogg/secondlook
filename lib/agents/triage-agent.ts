import { BaseAgent } from './base-agent';
import { AgentInput, TriageOutput, SPECIALIST_TYPES, SpecialistType } from './types';
import { PatientCase } from '../types';
import { findMatchingDiseases } from '../knowledge/retrieval';

const TRIAGE_SYSTEM_PROMPT = `You are a clinical triage specialist responsible for the initial assessment of complex patient presentations. Your role is to:

1. Identify which body systems are DIRECTLY involved based on the patient's symptoms
2. Assess clinical acuity (emergent, urgent, or non-urgent)
3. Rank ALL 11 specialist types by relevance to this patient — most relevant first, least relevant last. Every specialist is consulted regardless, but the ranking controls the display order shown to the user
4. Provide brief clinical reasoning for your triage decisions

You are triaging for a rare disease diagnostic service. Consider uncommon and complex presentations, not just obvious diagnoses.

IMPORTANT: Only select body systems that the symptoms directly implicate. Typically 2-4 systems are involved, rarely more than 5. Do NOT tag every possible system — focus on the systems where there is concrete symptom evidence. A symptom should map to at most 1-2 body systems, not all systems it could theoretically affect.

When ranking specialists, the geneticist should usually rank highly (rare diseases are disproportionately genetic) and the general-internist serves as an un-anchored counterweight — rank it where it best fits the presentation. The full list of 11 must appear in your ranking exactly once each.

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
              specialistRelevanceRanking: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [...SPECIALIST_TYPES],
                },
                description: 'All 11 specialist types in order of relevance to this patient — most relevant first, least relevant last. Must include every specialist exactly once. Controls the display order of specialist differentials shown to the user.',
                minItems: 11,
                maxItems: 11,
              },
            },
            required: ['bodySystems', 'acuityLevel', 'triageReasoning', 'specialistRelevanceRanking'],
          },
        },
      },
    ], { type: 'function', function: { name: 'triage_patient' } });

    const { bodySystems, acuityLevel, triageReasoning } = result.content;

    // Run all 11 specialists for every case — eliminates triage routing failures
    // as a source of diagnostic misses. Cost increase is negligible (~$0.01)
    // since specialists run in parallel and use the same model.
    // Order them by the LLM's relevance ranking when valid; otherwise fall back
    // to the canonical constant order so consultation still proceeds.
    const ranking = (result.content.specialistRelevanceRanking ?? []) as SpecialistType[];
    const rankingIsValid =
      ranking.length === SPECIALIST_TYPES.length &&
      new Set(ranking).size === SPECIALIST_TYPES.length &&
      ranking.every((s) => (SPECIALIST_TYPES as readonly string[]).includes(s));
    const relevantSpecialties: SpecialistType[] = rankingIsValid ? ranking : [...SPECIALIST_TYPES];

    // Retrieve candidate diseases from knowledge base (async — uses semantic search if embeddings available)
    const candidateDiseases = await findMatchingDiseases(
      patientCase.symptoms,
      patientCase.demographics,
      {
        maxResults: 75,
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
