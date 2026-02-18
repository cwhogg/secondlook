import { BaseAgent } from './base-agent';
import { AgentInput, AgentOutput, EvidenceEvaluation } from './types';
import { DiagnosisHypothesis, CriteriaFulfillment, PatientCase } from '../types';
import { DiseaseMatch, DiseaseProfile } from '../types/knowledge-base';

const EVIDENCE_EVALUATOR_PROMPT = `You are a senior clinical evidence evaluator. Your role is to objectively assess diagnostic hypotheses against formal diagnostic criteria and available patient evidence.

YOUR APPROACH:
1. For each hypothesis, check it against the diagnostic criteria from the knowledge base
2. Systematically evaluate which criteria are met, not met, or cannot be assessed (information gap)
3. Assess the quality and strength of supporting evidence
4. Identify contradictions between hypotheses and patient presentation
5. Compute an evidence-grounded score based on criteria fulfillment, NOT on your subjective confidence

SCORING RULES:
- Evidence score (0-100) MUST be computed as: (criteria met / total assessable criteria) * weight factors
- Weight pathognomonic symptom matches heavily (x3)
- Penalize for contradictory evidence (-15 per strong contradiction, -5 per weak)
- Bonus for demographic fit (+5 if age and sex match typical presentation)
- Do NOT inflate scores — if only 2 of 8 criteria are met, the score should be low (~25)
- Missing information is NOT evidence for or against — do not score criteria you cannot assess

You must be RIGOROUS and HONEST. A low evidence score with identified information gaps is more clinically useful than an inflated score.`;

export class EvidenceEvaluator extends BaseAgent {
  constructor() {
    super({
      name: 'evidence-evaluator',
      model: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 4000,
      systemPrompt: EVIDENCE_EVALUATOR_PROMPT,
    });
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { patientCase, previousStageOutput, candidateDiseases } = input;

    // Collect all hypotheses from all specialists
    const specialistOutputs: AgentOutput[] = previousStageOutput || [];
    const allHypotheses: DiagnosisHypothesis[] = specialistOutputs.flatMap((o) => o.hypotheses);

    // Deduplicate by diagnosis name (keep highest confidence version)
    const deduped = this.deduplicateHypotheses(allHypotheses);

    const userPrompt = this.buildPrompt(patientCase, deduped, candidateDiseases || []);

    const result = await this.callWithTools(userPrompt, [
      {
        type: 'function',
        function: {
          name: 'evaluate_evidence',
          description: 'Evaluate diagnostic hypotheses against criteria and compute evidence scores',
          parameters: {
            type: 'object',
            properties: {
              evaluations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    diagnosis: { type: 'string' },
                    evidenceScore: { type: 'number', minimum: 0, maximum: 100 },
                    criteriaFulfillment: {
                      type: 'object',
                      properties: {
                        criteriaName: { type: 'string' },
                        totalCriteria: { type: 'number' },
                        metCriteria: { type: 'number' },
                        criteriaDetails: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              criterion: { type: 'string' },
                              met: { type: 'boolean' },
                              evidence: { type: 'string' },
                            },
                            required: ['criterion', 'met', 'evidence'],
                          },
                        },
                      },
                      required: ['criteriaName', 'totalCriteria', 'metCriteria', 'criteriaDetails'],
                    },
                    informationGaps: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Tests/info needed to further evaluate this hypothesis',
                    },
                    contradictions: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Findings that argue against this diagnosis',
                    },
                    strengthAssessment: { type: 'string' },
                  },
                  required: ['diagnosis', 'evidenceScore', 'criteriaFulfillment', 'informationGaps', 'contradictions'],
                },
              },
            },
            required: ['evaluations'],
          },
        },
      },
    ], { type: 'function', function: { name: 'evaluate_evidence' } });

    // Merge evidence scores back into hypotheses
    const evaluatedHypotheses: DiagnosisHypothesis[] = deduped.map((h) => {
      const evaluation = result.content.evaluations?.find(
        (e: any) => e.diagnosis.toLowerCase() === h.diagnosis.toLowerCase()
      );

      if (!evaluation) return h;

      const fulfillment: CriteriaFulfillment = {
        criteriaName: evaluation.criteriaFulfillment?.criteriaName || 'Clinical assessment',
        totalCriteria: evaluation.criteriaFulfillment?.totalCriteria || 0,
        metCriteria: evaluation.criteriaFulfillment?.metCriteria || 0,
        criteriaDetails: evaluation.criteriaFulfillment?.criteriaDetails || [],
        fulfillmentPercentage: evaluation.criteriaFulfillment?.totalCriteria > 0
          ? Math.round((evaluation.criteriaFulfillment.metCriteria / evaluation.criteriaFulfillment.totalCriteria) * 100)
          : 0,
      };

      return {
        ...h,
        evidenceScore: evaluation.evidenceScore,
        diagnosticCriteria: fulfillment,
      };
    });

    return {
      agentName: this.name,
      hypotheses: evaluatedHypotheses,
      reasoning: `Evaluated ${evaluatedHypotheses.length} hypotheses against diagnostic criteria`,
      confidence: 0,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      model: result.model,
    };
  }

  private deduplicateHypotheses(hypotheses: DiagnosisHypothesis[]): DiagnosisHypothesis[] {
    const seen = new Map<string, DiagnosisHypothesis>();

    for (const h of hypotheses) {
      const key = h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
      const existing = seen.get(key);

      if (!existing || h.confidenceScore > existing.confidenceScore) {
        // Merge evidence from both if duplicate
        if (existing) {
          h.supportingEvidence = [
            ...h.supportingEvidence,
            ...existing.supportingEvidence.filter(
              (e) => !h.supportingEvidence.some((he) => he.finding === e.finding)
            ),
          ];
          h.contradictoryEvidence = [
            ...h.contradictoryEvidence,
            ...existing.contradictoryEvidence.filter(
              (e) => !h.contradictoryEvidence.some((he) => he.finding === e.finding)
            ),
          ];
          // Note both source agents
          h.sourceAgent = `${h.sourceAgent}, ${existing.sourceAgent}`;
        }
        seen.set(key, h);
      }
    }

    return Array.from(seen.values());
  }

  private buildPrompt(
    patientCase: PatientCase,
    hypotheses: DiagnosisHypothesis[],
    candidateDiseases: DiseaseMatch[]
  ): string {
    const symptomSummary = patientCase.symptoms
      .map((s) => `- "${s.originalPhrase}" → ${s.selectedConcept?.name || s.medicalTerm || s.originalPhrase}`)
      .join('\n');

    const hypothesesStr = hypotheses
      .map((h, i) => {
        const supporting = h.supportingEvidence
          .map((e) => `    + [${e.strength}] ${e.finding} ← patient: "${e.patientSymptom}"`)
          .join('\n');
        const contradictory = h.contradictoryEvidence
          .map((e) => `    - [${e.strength}] ${e.finding} ← patient: "${e.patientSymptom}"`)
          .join('\n');
        return `
${i + 1}. ${h.diagnosis} (proposed by: ${h.sourceAgent}, confidence: ${h.confidenceScore})
   Reasoning: ${h.clinicalReasoning}
   Supporting evidence:
${supporting || '    (none provided)'}
   Contradictory evidence:
${contradictory || '    (none identified)'}`;
      })
      .join('\n');

    // Include disease profiles for reference
    const diseaseRefStr = candidateDiseases.slice(0, 15).map((dm) => {
      const d = dm.disease;
      const criteria = d.diagnosticCriteria.criteria
        .map((c) => `  [${c.category}] ${c.description}`)
        .join('\n');
      return `
${d.name} (${d.id}):
Criteria${d.diagnosticCriteria.formalCriteriaName ? ` — ${d.diagnosticCriteria.formalCriteriaName}` : ''}:
${criteria}
${d.diagnosticCriteria.minimumForDiagnosis ? `Minimum: ${d.diagnosticCriteria.minimumForDiagnosis}` : ''}`;
    }).join('\n---');

    return `PATIENT SYMPTOMS:
${symptomSummary}

Demographics: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}

===== HYPOTHESES TO EVALUATE =====
${hypothesesStr}

===== REFERENCE: DISEASE DIAGNOSTIC CRITERIA =====
${diseaseRefStr}

===== YOUR TASK =====
For each hypothesis above, evaluate it against the diagnostic criteria from the knowledge base.
Compute an evidence-grounded score. Be rigorous — do not inflate scores.
Identify information gaps (what tests/info would help confirm or rule out each diagnosis).`;
  }
}
