import { BaseAgent } from './base-agent';
import { AgentInput, AgentOutput, SynthesisOutput } from './types';
import { DiagnosisHypothesis, PatientCase } from '../types';

const SYNTHESIS_PROMPT = `You are a senior diagnostician and department chief with 30+ years of experience mediating between specialists. Your role is to:

1. Reconcile potentially conflicting opinions from multiple specialist consultations
2. Rank diagnoses by EVIDENCE STRENGTH (evidence scores), not popularity or specialist confidence
3. Identify when specialists agree (consensus) vs. disagree (divergent opinions)
4. Determine the most critical information gaps that would change the ranking
5. Identify common conditions that should be explicitly excluded
6. Provide an honest overall assessment of diagnostic certainty

RANKING RULES:
- Primary sort: evidenceScore (criteria fulfillment). This is the most objective measure.
- Secondary sort: number and strength of supporting evidence items
- Tertiary sort: specialist confidenceScore (subjective but still useful)
- If two hypotheses are within 5 points of evidence score, consider which has fewer contradictions

CONSENSUS ASSESSMENT:
- "strong": 3+ specialists agree on top diagnosis
- "moderate": 2 specialists agree, or top diagnosis has >70 evidence score
- "weak": No clear agreement, top evidence score <50
- "divergent": Specialists fundamentally disagree on likely disease category

Be honest about uncertainty. A clear statement of "we don't know but here's what to test" is more valuable than false confidence.`;

export class SynthesisAgent extends BaseAgent {
  constructor() {
    super({
      name: 'synthesizer',
      model: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 4000,
      systemPrompt: SYNTHESIS_PROMPT,
    });
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { patientCase, previousStageOutput } = input;
    const { specialistResults, evaluationResult } = previousStageOutput;

    // Use evidence-evaluated hypotheses
    const evaluatedHypotheses: DiagnosisHypothesis[] = evaluationResult.hypotheses;

    const userPrompt = this.buildPrompt(patientCase, evaluatedHypotheses, specialistResults);

    const result = await this.callWithTools(userPrompt, [
      {
        type: 'function',
        function: {
          name: 'synthesize_diagnosis',
          description: 'Synthesize specialist opinions into final ranked differential diagnosis',
          parameters: {
            type: 'object',
            properties: {
              rankedDiagnoses: {
                type: 'array',
                items: { type: 'string' },
                description: 'Diagnosis names in final rank order (most likely first)',
              },
              consensusLevel: {
                type: 'string',
                enum: ['strong', 'moderate', 'weak', 'divergent'],
              },
              criticalGaps: {
                type: 'array',
                items: { type: 'string' },
                description: 'Most important information gaps that would change the ranking',
              },
              overallAssessment: {
                type: 'string',
                description: 'Honest summary of the diagnostic picture and level of certainty',
              },
              excludedCommonDiagnoses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    diagnosis: { type: 'string' },
                    reasonExcluded: { type: 'string' },
                  },
                  required: ['diagnosis', 'reasonExcluded'],
                },
                description: 'Common conditions explicitly excluded and why',
              },
              confidenceCalibration: {
                type: 'object',
                properties: {
                  topDiagnosisReliability: { type: 'string', enum: ['high', 'moderate', 'low'] },
                  reasoning: { type: 'string' },
                },
              },
            },
            required: ['rankedDiagnoses', 'consensusLevel', 'criticalGaps', 'overallAssessment', 'excludedCommonDiagnoses'],
          },
        },
      },
    ], { type: 'function', function: { name: 'synthesize_diagnosis' } });

    const synthesis = result.content;

    // Reorder hypotheses according to synthesis ranking
    const rankedHypotheses: DiagnosisHypothesis[] = [];
    for (const diagName of synthesis.rankedDiagnoses) {
      const match = evaluatedHypotheses.find(
        (h) => h.diagnosis.toLowerCase() === diagName.toLowerCase()
      );
      if (match) rankedHypotheses.push(match);
    }

    // Add any that weren't in the ranking (shouldn't happen, but safety)
    for (const h of evaluatedHypotheses) {
      if (!rankedHypotheses.includes(h)) {
        rankedHypotheses.push(h);
      }
    }

    // Take top 5
    const finalTop5 = rankedHypotheses.slice(0, 5);

    // Calibrate confidence based on evidence completeness
    for (const h of finalTop5) {
      const gapPenalty = synthesis.criticalGaps?.length > 3 ? 0.7 : synthesis.criticalGaps?.length > 1 ? 0.85 : 1.0;
      h.confidenceScore = Math.round(h.evidenceScore * gapPenalty);
    }

    // Store synthesis metadata in the output
    const agentOutput: AgentOutput = {
      agentName: this.name,
      hypotheses: finalTop5,
      reasoning: synthesis.overallAssessment,
      confidence: finalTop5.length > 0 ? finalTop5[0].confidenceScore : 0,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      model: result.model,
    };

    // Attach extra synthesis data to be used by report generator
    (agentOutput as any).synthesisData = {
      consensusLevel: synthesis.consensusLevel,
      criticalGaps: synthesis.criticalGaps,
      excludedCommonDiagnoses: synthesis.excludedCommonDiagnoses || [],
      confidenceCalibration: synthesis.confidenceCalibration,
    };

    return agentOutput;
  }

  private buildPrompt(
    patientCase: PatientCase,
    hypotheses: DiagnosisHypothesis[],
    specialistResults: AgentOutput[]
  ): string {
    const specialistSummary = specialistResults
      .map((sr) => {
        const topDiags = sr.hypotheses
          .map((h) => `${h.diagnosis} (confidence: ${h.confidenceScore})`)
          .join(', ');
        return `- ${sr.agentName}: ${topDiags}`;
      })
      .join('\n');

    const hypothesesDetail = hypotheses
      .map((h, i) => {
        return `${i + 1}. ${h.diagnosis}
   Source: ${h.sourceAgent}
   LLM Confidence: ${h.confidenceScore} | Evidence Score: ${h.evidenceScore}
   Criteria: ${h.diagnosticCriteria.criteriaName} — ${h.diagnosticCriteria.metCriteria}/${h.diagnosticCriteria.totalCriteria} met (${h.diagnosticCriteria.fulfillmentPercentage}%)
   Supporting evidence: ${h.supportingEvidence.length} items (${h.supportingEvidence.filter((e) => e.strength === 'strong').length} strong)
   Contradictory evidence: ${h.contradictoryEvidence.length} items
   Reasoning: ${h.clinicalReasoning}`;
      })
      .join('\n\n');

    return `PATIENT: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}
Chief complaint: "${patientCase.chiefComplaint.description}"
Symptoms: ${patientCase.symptoms.map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase).join(', ')}

===== SPECIALIST OPINIONS =====
${specialistSummary}

===== EVIDENCE-EVALUATED HYPOTHESES =====
${hypothesesDetail}

===== YOUR TASK =====
Synthesize the specialist opinions. Rank the diagnoses by evidence strength.
Identify consensus level, critical gaps, and common conditions to exclude.
Provide an honest overall assessment.`;
  }
}
