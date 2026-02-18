import { BaseAgent } from './base-agent';
import { AgentInput, AgentOutput, EvidenceEvaluation } from './types';
import { DiagnosisHypothesis, CriteriaFulfillment, PatientCase } from '../types';
import { DiseaseMatch, DiseaseProfile } from '../types/knowledge-base';

const EVIDENCE_EVALUATOR_PROMPT = `You are a senior clinical evidence evaluator. Your role is to systematically assess each diagnostic hypothesis against available evidence and diagnostic criteria, producing a structured analysis that a senior diagnostician will use to make final probability assessments.

You are NOT the final decision-maker on probability. Your job is to produce a rigorous, structured evidence review. A senior diagnostician will review your analysis and assign final probability scores.

YOUR APPROACH FOR EACH HYPOTHESIS:

1. CRITERIA CHECK (for KB-matched hypotheses):
   - Which formal diagnostic criteria are met, not met, or cannot be assessed?
   - What percentage of criteria are fulfilled?
   - Missing information is NOT evidence for or against — mark criteria you cannot assess as "unknown"

2. CRITERIA CHECK (for non-KB hypotheses):
   - Use your own medical knowledge of the disease's diagnostic criteria or clinical features
   - List the key clinical features/criteria you are evaluating against
   - Mark each as met, not met, or unknown

3. EVIDENCE QUALITY ASSESSMENT (for all hypotheses):
   - How specific are the supporting findings? (pathognomonic vs. nonspecific)
   - How strong are the contradictions?
   - Does the demographic profile fit?
   - How coherent is the overall clinical pattern?

4. INFORMATION GAPS:
   - What tests or information would most change the assessment?
   - Which gaps are critical vs. nice-to-have?

5. CONTRADICTIONS:
   - What in the patient's presentation argues against this diagnosis?

IMPORTANT: Our knowledge base covers ~150 of ~7,000-10,000 known rare diseases. The absence of a disease from our database is NOT evidence against it. Evaluate all hypotheses with equal rigor regardless of KB status.

Be RIGOROUS and HONEST. Clearly distinguish between what the evidence supports and what remains unknown.`;

export class EvidenceEvaluator extends BaseAgent {
  constructor() {
    super({
      name: 'evidence-evaluator',
      model: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 6000, // increased to handle two-track evaluation
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

    // Classify each hypothesis as KB-matched or non-KB
    const kbDiseases = candidateDiseases || [];
    const classified = this.classifyHypotheses(deduped, kbDiseases);

    const userPrompt = this.buildPrompt(patientCase, classified, kbDiseases);

    const result = await this.callWithTools(userPrompt, [
      {
        type: 'function',
        function: {
          name: 'evaluate_evidence',
          description: 'Produce structured evidence review for each diagnostic hypothesis',
          parameters: {
            type: 'object',
            properties: {
              evaluations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    diagnosis: { type: 'string' },
                    evaluationType: {
                      type: 'string',
                      enum: ['criteria-grounded', 'reasoning-evaluated'],
                      description: 'Whether evaluated against KB criteria or via clinical reasoning',
                    },
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
                    evidenceQuality: {
                      type: 'string',
                      enum: ['strong', 'moderate', 'weak', 'insufficient'],
                      description: 'Overall quality of supporting evidence for this hypothesis',
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
                    strengthAssessment: {
                      type: 'string',
                      description: 'Narrative assessment of evidence strength, reasoning quality, and clinical fit',
                    },
                  },
                  required: ['diagnosis', 'evaluationType', 'criteriaFulfillment', 'evidenceQuality', 'informationGaps', 'contradictions', 'strengthAssessment'],
                },
              },
            },
            required: ['evaluations'],
          },
        },
      },
    ], { type: 'function', function: { name: 'evaluate_evidence' } });

    // Merge criteria fulfillment and evidence metadata back into hypotheses
    // NOTE: We intentionally do NOT set evidenceScore here. The synthesizer (senior diagnostician)
    // will review all this information and assign probability scores based on clinical judgment.
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

      const isKbMatch = evaluation.evaluationType === 'criteria-grounded';

      return {
        ...h,
        // evidenceScore stays at 0 — will be set by synthesizer as the LLM-assessed probability
        diagnosticCriteria: fulfillment,
        evaluationType: isKbMatch ? 'criteria-grounded' as const : 'reasoning-evaluated' as const,
        knowledgeBaseMatch: isKbMatch,
        // Store evidence quality and assessment for the synthesizer to review
        _evidenceQuality: evaluation.evidenceQuality,
        _strengthAssessment: evaluation.strengthAssessment,
        _informationGaps: evaluation.informationGaps,
        _contradictions: evaluation.contradictions,
      } as DiagnosisHypothesis;
    });

    return {
      agentName: this.name,
      hypotheses: evaluatedHypotheses,
      reasoning: `Evaluated ${evaluatedHypotheses.length} hypotheses: ${evaluatedHypotheses.filter((h) => h.knowledgeBaseMatch).length} against KB criteria, ${evaluatedHypotheses.filter((h) => !h.knowledgeBaseMatch).length} via clinical reasoning`,
      confidence: 0,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      model: result.model,
    };
  }

  /**
   * Classify hypotheses as KB-matched or non-KB based on whether they match
   * a disease in the candidate list.
   */
  private classifyHypotheses(
    hypotheses: DiagnosisHypothesis[],
    kbDiseases: DiseaseMatch[]
  ): Array<{ hypothesis: DiagnosisHypothesis; kbMatch: DiseaseProfile | null }> {
    return hypotheses.map((h) => {
      const diagLower = h.diagnosis.toLowerCase();
      const diagNormalized = diagLower.replace(/[^a-z0-9]/g, '');

      // Try to find a matching KB disease
      const match = kbDiseases.find((dm) => {
        const d = dm.disease;
        const nameLower = d.name.toLowerCase();
        const nameNormalized = nameLower.replace(/[^a-z0-9]/g, '');

        // Direct name match
        if (diagNormalized === nameNormalized) return true;
        // Substring match
        if (diagNormalized.includes(nameNormalized) || nameNormalized.includes(diagNormalized)) return true;
        // Check aliases
        if (d.aliases.some((a) => {
          const aliasNorm = a.toLowerCase().replace(/[^a-z0-9]/g, '');
          return aliasNorm === diagNormalized || aliasNorm.includes(diagNormalized) || diagNormalized.includes(aliasNorm);
        })) return true;
        // Check disease ID
        if (d.id.replace(/-/g, '') === diagNormalized) return true;

        return false;
      });

      return {
        hypothesis: h,
        kbMatch: match ? match.disease : null,
      };
    });
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
    classified: Array<{ hypothesis: DiagnosisHypothesis; kbMatch: DiseaseProfile | null }>,
    candidateDiseases: DiseaseMatch[]
  ): string {
    const symptomSummary = patientCase.symptoms
      .map((s) => `- "${s.originalPhrase}" → ${s.selectedConcept?.name || s.medicalTerm || s.originalPhrase}`)
      .join('\n');

    // Separate KB-matched and non-KB hypotheses in the prompt
    const kbHypotheses = classified.filter((c) => c.kbMatch !== null);
    const nonKbHypotheses = classified.filter((c) => c.kbMatch === null);

    let hypothesesStr = '';

    if (kbHypotheses.length > 0) {
      hypothesesStr += '\n--- KB-MATCHED HYPOTHESES (evaluate against structured criteria) ---\n';
      hypothesesStr += kbHypotheses.map((c, i) => {
        const h = c.hypothesis;
        const supporting = h.supportingEvidence
          .map((e) => `    + [${e.strength}] ${e.finding} ← patient: "${e.patientSymptom}"`)
          .join('\n');
        const contradictory = h.contradictoryEvidence
          .map((e) => `    - [${e.strength}] ${e.finding} ← patient: "${e.patientSymptom}"`)
          .join('\n');
        return `
${i + 1}. ${h.diagnosis} [KB MATCH: ${c.kbMatch!.name}] (proposed by: ${h.sourceAgent}, confidence: ${h.confidenceScore})
   Reasoning: ${h.clinicalReasoning}
   Supporting evidence:
${supporting || '    (none provided)'}
   Contradictory evidence:
${contradictory || '    (none identified)'}`;
      }).join('\n');
    }

    if (nonKbHypotheses.length > 0) {
      hypothesesStr += '\n\n--- NON-KB HYPOTHESES (evaluate based on clinical reasoning quality) ---\n';
      hypothesesStr += `These diseases are NOT in our knowledge base. Evaluate them fairly based on the specialist's clinical reasoning and your own medical knowledge. Do NOT penalize them for lacking structured KB criteria.\n`;
      hypothesesStr += nonKbHypotheses.map((c, i) => {
        const h = c.hypothesis;
        const supporting = h.supportingEvidence
          .map((e) => `    + [${e.strength}] ${e.finding} ← patient: "${e.patientSymptom}"`)
          .join('\n');
        const contradictory = h.contradictoryEvidence
          .map((e) => `    - [${e.strength}] ${e.finding} ← patient: "${e.patientSymptom}"`)
          .join('\n');
        return `
${i + 1}. ${h.diagnosis} [NOT IN KB] (proposed by: ${h.sourceAgent}, confidence: ${h.confidenceScore})
   Reasoning: ${h.clinicalReasoning}
   Supporting evidence:
${supporting || '    (none provided)'}
   Contradictory evidence:
${contradictory || '    (none identified)'}`;
      }).join('\n');
    }

    // Include disease profiles for KB-matched hypotheses only
    const relevantKbDiseases = kbHypotheses
      .map((c) => c.kbMatch!)
      .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i); // deduplicate

    let diseaseRefStr = '';
    if (relevantKbDiseases.length > 0) {
      diseaseRefStr = relevantKbDiseases.map((d) => {
        const criteria = d.diagnosticCriteria.criteria
          .map((c) => `  [${c.category}] ${c.description}`)
          .join('\n');
        return `
${d.name} (${d.id}):
Criteria${d.diagnosticCriteria.formalCriteriaName ? ` — ${d.diagnosticCriteria.formalCriteriaName}` : ''}:
${criteria}
${d.diagnosticCriteria.minimumForDiagnosis ? `Minimum: ${d.diagnosticCriteria.minimumForDiagnosis}` : ''}`;
      }).join('\n---');
    }

    return `PATIENT SYMPTOMS:
${symptomSummary}

Demographics: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}

===== HYPOTHESES TO EVALUATE =====
${hypothesesStr}
${diseaseRefStr ? `
===== REFERENCE: KB DISEASE DIAGNOSTIC CRITERIA =====
(Only for KB-matched hypotheses above)
${diseaseRefStr}` : ''}

===== YOUR TASK =====
Produce a structured evidence review for ALL hypotheses above — both KB-matched and non-KB.

For KB-matched hypotheses: check each diagnostic criterion against the patient's presentation.
For non-KB hypotheses: use your own medical knowledge to identify the relevant diagnostic criteria/clinical features and check those.

For each hypothesis:
1. Fill in criteriaFulfillment with specific criteria and whether each is met
2. Assess overall evidenceQuality (strong/moderate/weak/insufficient)
3. List specific information gaps
4. List specific contradictions
5. Write a strengthAssessment narrative summarizing the evidence picture

You are NOT assigning probability scores — a senior diagnostician will do that based on your review.
Set evaluationType to "criteria-grounded" for KB-matched and "reasoning-evaluated" for non-KB.`;
  }
}
