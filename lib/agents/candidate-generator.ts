import { BaseAgent } from './base-agent';
import { AgentInput } from './types';
import { PatientCase } from '../types';

/**
 * v15 Stage 1b: broad LLM-generated candidate differential.
 *
 * Runs after triage's KB-driven retrieval. The KB retrieval covers diseases
 * with profiles in lib/knowledge/diseases/ (~9,263 entries); known rare
 * diseases number 10,000+. This stage uses o3's training-data coverage to
 * surface candidate diagnoses the KB retrieval may have missed — either
 * because the disease isn't in the KB or because the symptom-overlap
 * algorithm scored it too low under our retrieval thresholds.
 *
 * Output is a list of diagnosis names. The orchestrator looks each name up
 * against the KB (findDiseaseByName) and unions any matches with the
 * triage's candidate pool, deduped on canonical KB-name match. Names that
 * don't match any KB profile are dropped at this stage — specialists may
 * still independently propose them downstream, but they don't enter the
 * KB-augmented candidate pool.
 *
 * See docs/v15-experiment-plan.md decision 1 (union candidate pool) and
 * step 2 build description.
 */
const CANDIDATE_GENERATOR_SYSTEM_PROMPT = `You are an expert clinical diagnostician with broad knowledge of both common and rare diseases. Your task is generating a wide differential diagnosis — a list of plausible diseases that could explain the patient's presentation.

OUTPUT RULES:
- Produce 30-50 candidate diagnoses ranked by likelihood (most likely first).
- Use precise, canonical disease names. Examples of good naming: "Neurofibromatosis Type 1", "Marfan Syndrome", "Autosomal Dominant Tubulointerstitial Kidney Disease, MUC1-related". Avoid eponyms-only or vague categorical names ("genetic disease," "syndrome").
- Be inclusive at the periphery: include diseases the case might fit even if not the most likely. We will winnow downstream.
- For rare-disease-specific variants and subtypes, use the specific subtype name (e.g., "Mitochondrial DNA Depletion Syndrome 13" rather than just "mitochondrial disease").
- Provide a brief one-line rationale per diagnosis explaining why it fits.
- Do NOT explain your reasoning or method outside the structured output.

This is a rare-disease diagnostic service. Skew toward specific rare disease candidates rather than common ones, but include common diseases where genuinely plausible.`;

interface CandidateGeneratorOutput {
  agentName: string;
  diagnosisNames: string[];
  rationales: Map<string, string>;
  tokensUsed: number;
  durationMs: number;
  model: string;
}

export class CandidateGeneratorAgent extends BaseAgent {
  constructor() {
    super({
      name: 'candidate-generator',
      model: 'o3',
      temperature: 0.3, // ignored for reasoning models
      maxTokens: 8000,
      reasoningEffort: 'high',
      systemPrompt: CANDIDATE_GENERATOR_SYSTEM_PROMPT,
    });
  }

  async generate(patientCase: PatientCase): Promise<CandidateGeneratorOutput> {
    const userPrompt = this.buildPrompt(patientCase);

    const result = await this.callWithTools(userPrompt, [
      {
        type: 'function',
        function: {
          name: 'generate_candidate_differential',
          description: 'Produce a wide differential diagnosis of 30-50 candidate diseases',
          parameters: {
            type: 'object',
            properties: {
              candidates: {
                type: 'array',
                minItems: 30,
                maxItems: 50,
                items: {
                  type: 'object',
                  properties: {
                    diagnosis: {
                      type: 'string',
                      description: 'Canonical disease name (specific, not categorical)',
                    },
                    rationale: {
                      type: 'string',
                      description: 'One-line explanation of why this disease fits the presentation',
                    },
                  },
                  required: ['diagnosis', 'rationale'],
                },
                description: 'Ranked list of 30-50 candidate diagnoses, most likely first',
              },
            },
            required: ['candidates'],
          },
        },
      },
    ], { type: 'function', function: { name: 'generate_candidate_differential' } });

    const candidates = (result.content.candidates || []) as Array<{ diagnosis: string; rationale: string }>;
    const diagnosisNames = candidates.map((c) => c.diagnosis);
    const rationales = new Map<string, string>();
    for (const c of candidates) {
      rationales.set(c.diagnosis, c.rationale);
    }

    return {
      agentName: this.name,
      diagnosisNames,
      rationales,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      model: result.model,
    };
  }

  // Required override per AgentInput/AgentOutput convention; delegates to generate()
  // by extracting the patientCase from input.
  async execute(input: AgentInput): Promise<any> {
    const out = await this.generate(input.patientCase);
    return {
      agentName: out.agentName,
      hypotheses: [],
      reasoning: `Generated ${out.diagnosisNames.length} candidate diagnoses for KB union`,
      confidence: 0,
      tokensUsed: out.tokensUsed,
      durationMs: out.durationMs,
      model: out.model,
      candidateNames: out.diagnosisNames,
      candidateRationales: out.rationales,
    };
  }

  private buildPrompt(patientCase: PatientCase): string {
    const symptomList = patientCase.symptoms
      .map((s) => `- ${s.selectedConcept?.name || s.medicalTerm || s.originalPhrase}`)
      .join('\n');

    const excludedList = (patientCase.excludedFindings && patientCase.excludedFindings.length > 0)
      ? (patientCase.excludedFindings as Array<string | { selectedConcept?: { name?: string }; medicalTerm?: string; originalPhrase?: string }>).map((f) => {
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

    return `PATIENT CASE

Demographics: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}
${patientCase.chiefComplaint?.description ? `Chief complaint: ${patientCase.chiefComplaint.description}` : ''}

SYMPTOMS (extracted findings):
${symptomList || '(none extracted)'}
${excludedList ? `\nEXPLICITLY EXCLUDED FINDINGS (patient does NOT have):\n${excludedList}` : ''}
${familyHistory ? `\nFamily history: ${familyHistory}` : ''}
${pmh ? `\nPast medical history: ${pmh}` : ''}

TASK: Generate a wide differential of 30-50 candidate diagnoses for this presentation. Cover both likely and lower-probability candidates. Use specific, canonical disease names. Brief one-line rationale per diagnosis.`;
  }
}
