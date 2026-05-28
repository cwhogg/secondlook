import { BaseAgent } from './base-agent';
import { AgentInput, AgentOutput, SynthesisOutput } from './types';
import { DiagnosisHypothesis, PatientCase } from '../types';
import { getDiseaseCount } from '../knowledge';

function buildSynthesisPrompt(): string {
  return `You are the senior diagnostician and department chief — the final decision-maker on this case. You have 30+ years of experience in complex diagnostic medicine, specializing in rare and multi-system diseases.

You are reviewing a patient case where multiple specialist consultations have been completed and an evidence evaluator has systematically checked each hypothesis against diagnostic criteria. ALL of this information is now in front of you.

YOUR JOB: Make the final clinical judgment and produce a deep differential.

1. Produce 10 RANKED DIAGNOSES (most likely first). Pull from the evaluated hypotheses provided to you; rank exactly 10 if at least 10 distinct evaluated hypotheses exist, otherwise rank all of them. Do not invent diagnoses that were not evaluated. Each must be a distinct disease — no duplicates. RANK by how likely each is to be correct, based on EVERYTHING:
   - The specialist reasoning and clinical arguments
   - The criteria fulfillment data (how many diagnostic criteria are met)
   - The quality and specificity of supporting evidence
   - Contradictory evidence and what it means
   - Information gaps and how they affect certainty
   - Your own clinical experience and pattern recognition
   - Demographic fit, disease epidemiology, and Bayesian reasoning

2. ASSIGN A PROBABILITY SCORE (0-100) to each diagnosis:
   - This is YOUR assessment of how likely this diagnosis is, given ALL available information
   - Use your clinical judgment — this is not a formula, it's a medical opinion
   - Be calibrated: a score of 70 means you'd bet on it; a score of 20 means it's worth investigating but unlikely
   - It's fine for the top diagnosis to be 30-40 if the case is genuinely ambiguous
   - Scores should reflect reality, not inflate confidence
   - Consider: How specific are the findings? How many alternative explanations exist? How much critical information is missing?

3. ASSESS CONSENSUS among the specialists

4. IDENTIFY the most critical information gaps

5. IDENTIFY common conditions to explicitly exclude

6. DETECT DIFFERENTIAL CLUSTERS: If two or more of your ranked diagnoses are:
   - Phenotypic variants of the same disease family (e.g., different genetic subtypes causing similar clinical presentations)
   - Clinically indistinguishable based on the available symptom and history data alone
   - Differentiable only through specific molecular, genetic, or advanced testing
   Then group them as a "differential cluster." For each cluster, identify the shared features that make them indistinguishable, a combined probability range treating the cluster as one entity, and the specific tests needed to tell them apart.
   Only create clusters when genuinely warranted — most differentials do NOT contain phenotypic siblings. Return an empty array if no clustering applies.

IMPORTANT NOTES:
- Some hypotheses have structured KB criteria data, others were evaluated via clinical reasoning. BOTH are valid. Do not favor one type over the other.
- Our knowledge base covers ${getDiseaseCount()} of an estimated 10,000+ known rare diseases. A disease NOT in our KB can absolutely be the correct diagnosis.
- The evidence evaluator's criteria fulfillment data is INPUT to your judgment, not the answer itself. A disease can meet 5/8 criteria and still be unlikely if the missing criteria are the important ones.
- Be honest about uncertainty. If the evidence genuinely doesn't distinguish between diagnoses, say so.`;
}

export class SynthesisAgent extends BaseAgent {
  constructor() {
    super({
      name: 'synthesizer',
      model: 'o3',
      temperature: 0.2, // ignored for reasoning models
      maxTokens: 25000,
      reasoningEffort: 'high',
      systemPrompt: buildSynthesisPrompt(),
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
          description: 'Make final diagnostic judgment with probability scores',
          parameters: {
            type: 'object',
            properties: {
              rankedDiagnoses: {
                type: 'array',
                minItems: 1,
                maxItems: 10,
                items: {
                  type: 'object',
                  properties: {
                    diagnosis: {
                      type: 'string',
                      description: 'Prefer the EXACT diagnosis name from the hypotheses list; if you add a diagnosis to round out the differential to 10, use a standard clinical name',
                    },
                    probabilityScore: {
                      type: 'number',
                      minimum: 0,
                      maximum: 100,
                      description: 'Your clinical assessment of how likely this diagnosis is (0-100)',
                    },
                    reasoning: {
                      type: 'string',
                      description: 'Brief explanation of why you assigned this probability',
                    },
                  },
                  required: ['diagnosis', 'probabilityScore', 'reasoning'],
                },
                description: '10 diagnoses ranked by probability (most likely first)',
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
              differentialClusters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    clusterName: { type: 'string', description: 'Name for this disease family/cluster' },
                    diagnoses: { type: 'array', items: { type: 'string' }, description: 'Exact diagnosis names from the ranked list that belong to this cluster' },
                    combinedProbabilityRange: { type: 'string', description: 'Combined probability treating the cluster as one entity, e.g. "35-50%"' },
                    sharedFeatures: { type: 'array', items: { type: 'string' }, description: 'Clinical features shared by all diagnoses in this cluster' },
                    distinguishingTests: { type: 'array', items: { type: 'string' }, description: 'Specific tests that can differentiate between diagnoses within this cluster' },
                    reasoning: { type: 'string', description: 'Why these diagnoses are clinically indistinguishable from available data' },
                  },
                  required: ['clusterName', 'diagnoses', 'combinedProbabilityRange', 'sharedFeatures', 'distinguishingTests', 'reasoning'],
                },
                description: 'Groups of phenotypic sibling diagnoses that cannot be distinguished by symptoms alone. Empty array if no clustering applies.',
              },
            },
            required: ['rankedDiagnoses', 'consensusLevel', 'criticalGaps', 'overallAssessment', 'excludedCommonDiagnoses'],
          },
        },
      },
    ], { type: 'function', function: { name: 'synthesize_diagnosis' } });

    const synthesis = result.content;

    // Reorder hypotheses according to synthesis ranking and apply LLM-assigned probability scores
    const rankedHypotheses: DiagnosisHypothesis[] = [];
    for (const ranked of synthesis.rankedDiagnoses) {
      const match = this.findHypothesisByName(evaluatedHypotheses, ranked.diagnosis);
      if (match && !rankedHypotheses.includes(match)) {
        // Apply the LLM's probability assessment as both confidenceScore and evidenceScore
        match.confidenceScore = ranked.probabilityScore;
        match.evidenceScore = ranked.probabilityScore;
        rankedHypotheses.push(match);
      }
    }

    // Add any that weren't in the ranking
    for (const h of evaluatedHypotheses) {
      if (!rankedHypotheses.includes(h)) {
        rankedHypotheses.push(h);
      }
    }

    // Take top 10
    const finalTopN = rankedHypotheses.slice(0, 10);

    // Store synthesis metadata in the output
    const agentOutput: AgentOutput = {
      agentName: this.name,
      hypotheses: finalTopN,
      reasoning: synthesis.overallAssessment,
      confidence: finalTopN.length > 0 ? finalTopN[0].confidenceScore : 0,
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
      differentialClusters: synthesis.differentialClusters || [],
    };

    return agentOutput;
  }

  /**
   * Flexible name matching that handles minor LLM rephrasing.
   */
  private findHypothesisByName(
    hypotheses: DiagnosisHypothesis[],
    name: string
  ): DiagnosisHypothesis | undefined {
    const nameLower = name.toLowerCase();
    const nameNormalized = nameLower.replace(/[^a-z0-9]/g, '');

    // Exact match
    let match = hypotheses.find((h) => h.diagnosis.toLowerCase() === nameLower);
    if (match) return match;

    // Normalized match
    match = hypotheses.find((h) => h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '') === nameNormalized);
    if (match) return match;

    // Substring match
    match = hypotheses.find((h) => {
      const hNorm = h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
      return hNorm.includes(nameNormalized) || nameNormalized.includes(hNorm);
    });
    return match;
  }

  private buildPrompt(
    patientCase: PatientCase,
    hypotheses: DiagnosisHypothesis[],
    specialistResults: AgentOutput[]
  ): string {
    const specialistSummary = specialistResults
      .map((sr) => {
        const topDiags = sr.hypotheses
          .map((h) => `${h.diagnosis} (specialist confidence: ${h.confidenceScore})`)
          .join(', ');
        return `- ${sr.agentName}: ${topDiags}`;
      })
      .join('\n');

    const hypothesesDetail = hypotheses
      .map((h, i) => {
        const evalLabel = h.knowledgeBaseMatch ? 'KB-MATCHED' : 'NON-KB';
        const evalMethod = h.evaluationType === 'criteria-grounded' ? 'criteria-grounded' : 'reasoning-evaluated';

        // Include evidence evaluator's analysis if available
        const evidenceQuality = (h as any)._evidenceQuality || 'not assessed';
        const strengthAssessment = (h as any)._strengthAssessment || '';
        const infoGaps = (h as any)._informationGaps || [];
        const contradictionsList = (h as any)._contradictions || [];

        return `${i + 1}. ${h.diagnosis} [${evalLabel}, ${evalMethod}]
   Source: ${h.sourceAgent}
   Specialist confidence: ${h.confidenceScore}/100
   Evidence quality: ${evidenceQuality}
   Criteria: ${h.diagnosticCriteria.criteriaName} — ${h.diagnosticCriteria.metCriteria}/${h.diagnosticCriteria.totalCriteria} met (${h.diagnosticCriteria.fulfillmentPercentage}%)
   Criteria details:
${h.diagnosticCriteria.criteriaDetails.map((c) => `     ${c.met ? '[MET]' : '[NOT MET]'} ${c.criterion}: ${c.evidence}`).join('\n') || '     (none assessed)'}
   Supporting evidence: ${h.supportingEvidence.length} items (${h.supportingEvidence.filter((e) => e.strength === 'strong').length} strong)
${h.supportingEvidence.map((e) => `     + [${e.strength}] ${e.finding} ← "${e.patientSymptom}"`).join('\n')}
   Contradictory evidence: ${h.contradictoryEvidence.length} items
${h.contradictoryEvidence.map((e) => `     - [${e.strength}] ${e.finding} ← "${e.patientSymptom}"`).join('\n')}
   Information gaps: ${infoGaps.length > 0 ? infoGaps.join('; ') : 'none identified'}
   Contradictions from evaluator: ${contradictionsList.length > 0 ? contradictionsList.join('; ') : 'none'}
   Clinical reasoning: ${h.clinicalReasoning}
   Evidence evaluator assessment: ${strengthAssessment || '(not available)'}`;
      })
      .join('\n\n');

    const kbCount = hypotheses.filter((h) => h.knowledgeBaseMatch).length;
    const nonKbCount = hypotheses.filter((h) => !h.knowledgeBaseMatch).length;

    return `PATIENT: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}
${patientCase.chiefComplaint?.description ? `Chief complaint: "${patientCase.chiefComplaint.description}"` : ''}Symptoms: ${patientCase.symptoms.map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase).join(', ')}
${patientCase.medicalHistory?.familyHistory?.length ? `Family history: ${patientCase.medicalHistory.familyHistory.join(', ')}` : ''}
${patientCase.medicalHistory?.pastMedicalHistory?.length ? `Past medical history: ${patientCase.medicalHistory.pastMedicalHistory.join(', ')}` : ''}

===== SPECIALIST OPINIONS =====
${specialistSummary}

===== HYPOTHESES WITH EVIDENCE REVIEW =====
${kbCount} hypotheses checked against KB criteria, ${nonKbCount} checked via clinical reasoning.

${hypothesesDetail}

===== YOUR TASK =====
You are the final decision-maker. Review ALL of the above — specialist reasoning, criteria fulfillment, evidence quality, contradictions, and information gaps — and make your clinical judgment.

1. Rank the diagnoses by probability (most likely first)
2. Assign a probability score (0-100) to each — this is YOUR clinical opinion
3. Use EXACT diagnosis names from the list above
4. Assess specialist consensus level
5. Identify critical information gaps
6. List common conditions to exclude
7. Write an honest overall assessment
8. If any ranked diagnoses are phenotypic siblings, group them into differential clusters`;
  }
}
