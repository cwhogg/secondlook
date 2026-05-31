/**
 * v15 step 5: parallel cross-provider synthesizer (Claude side).
 *
 * Runs in parallel with the existing OpenAI o3 SynthesisAgent on the same
 * input. Produces the same output shape (AgentOutput with ranked top-10
 * diagnoses + per-diagnosis probabilityScore + synthesisData). The
 * reconciliation stage (v15 step 6) takes both rankings and decides the
 * final ordering — either trivially (when top-1 agrees) or via structured
 * iterative information exchange (when they disagree).
 *
 * Architectural rationale: the v13 finding showed that o3 alone has
 * systematic sibling-confusion biases on rare-disease ranking. A second
 * model from an independent provider family with different training
 * distribution brings independent signal at the decision stage. The
 * baselines comparison data (where Claude opus-4-7 single-shot matched or
 * beat o3 single-shot on rare-disease cohorts) suggests Claude is a
 * comparable-quality synthesizer with different failure modes.
 *
 * Provider boundary note: this is the first analysis-flow agent that uses
 * Anthropic. Pre-v15 the boundary was strict ("analysis = OpenAI"); v15
 * relaxes it deliberately for the architectural experiment. See
 * docs/v15-experiment-plan.md decision 3.
 */
import { AgentInput, AgentOutput } from './types';
import { DiagnosisHypothesis, PatientCase } from '../types';
import { SynthesisAgent } from './synthesizer';
import { callAnthropic } from '../anthropic';
import { getDiseaseCount } from '../knowledge';

const CLAUDE_SYNTH_MODEL = 'claude-opus-4-7';

function buildClaudeSystemPrompt(): string {
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

3. ASSESS CONSENSUS among the specialists
4. IDENTIFY the most critical information gaps
5. IDENTIFY common conditions to explicitly exclude
6. DETECT DIFFERENTIAL CLUSTERS: groups of 2+ diagnoses that are phenotypic variants requiring genetic / molecular testing to distinguish.

Our knowledge base covers ${getDiseaseCount()} of an estimated 10,000+ known rare diseases. A disease NOT in our KB can absolutely be the correct diagnosis.

OUTPUT FORMAT — return a single JSON object exactly matching this shape, with no other prose, no markdown fences:

{
  "rankedDiagnoses": [
    { "diagnosis": "...", "probabilityScore": 0-100, "reasoning": "..." },
    ... (up to 10)
  ],
  "consensusLevel": "strong" | "moderate" | "weak" | "divergent",
  "criticalGaps": [ "..." ],
  "overallAssessment": "...",
  "excludedCommonDiagnoses": [ { "diagnosis": "...", "reasonExcluded": "..." } ],
  "confidenceCalibration": { "topDiagnosisReliability": "high" | "moderate" | "low", "reasoning": "..." },
  "differentialClusters": [
    { "clusterName": "...", "diagnoses": [ "..." ], "combinedProbabilityRange": "...", "sharedFeatures": [ "..." ], "distinguishingTests": [ "..." ], "reasoning": "..." }
  ]
}`;
}

export class ClaudeSynthAgent {
  public readonly name = 'synthesizer-claude';

  /**
   * Same input contract as SynthesisAgent.execute (uses the same input shape
   * via the shared prompt builder on SynthesisAgent). Returns an AgentOutput
   * shaped identically to the OpenAI synth so the reconciliation stage can
   * compare the two.
   *
   * Implementation: borrow buildPrompt + findHypothesisByName from an
   * instance of SynthesisAgent so the two synths consume identical context.
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    const { patientCase, previousStageOutput } = input;
    const { specialistResults, evaluationResult } = previousStageOutput;
    const evaluatedHypotheses: DiagnosisHypothesis[] = evaluationResult.hypotheses;

    const promptHelper = new SynthesisAgent();
    const userPrompt = promptHelper.buildPrompt(patientCase, evaluatedHypotheses, specialistResults);

    const callStart = Date.now();
    const result = await callAnthropic({
      systemPrompt: buildClaudeSystemPrompt(),
      userPrompt,
      maxTokens: 12000,
      model: CLAUDE_SYNTH_MODEL,
    });

    const synthesis = typeof result.content === 'object' && result.content !== null
      ? result.content
      : null;

    if (!synthesis || !Array.isArray(synthesis.rankedDiagnoses)) {
      throw new Error(`Claude synthesizer returned non-conforming output (got ${typeof result.content})`);
    }

    // Map Claude's ranked diagnoses back to the canonical hypothesis pool,
    // mirroring the OpenAI synthesizer's behavior: only include diagnoses
    // that match an evaluated hypothesis; assign LLM probability scores
    // as both confidence and evidence scores; keep them in Claude's order.
    const rankedHypotheses: DiagnosisHypothesis[] = [];
    for (const ranked of synthesis.rankedDiagnoses) {
      const match = promptHelper.findHypothesisByName(evaluatedHypotheses, ranked.diagnosis);
      if (match && !rankedHypotheses.includes(match)) {
        const copy = { ...match };
        copy.confidenceScore = typeof ranked.probabilityScore === 'number' ? ranked.probabilityScore : 0;
        copy.evidenceScore = copy.confidenceScore;
        rankedHypotheses.push(copy);
      }
    }

    // Add any remaining evaluated hypotheses Claude didn't rank — so the
    // downstream still sees the full set.
    for (const h of evaluatedHypotheses) {
      if (!rankedHypotheses.some((r) => r.diagnosis === h.diagnosis)) {
        rankedHypotheses.push(h);
      }
    }

    const finalTopN = rankedHypotheses.slice(0, 10);

    const agentOutput: AgentOutput = {
      agentName: this.name,
      hypotheses: finalTopN,
      reasoning: synthesis.overallAssessment || '',
      confidence: finalTopN[0]?.confidenceScore || 0,
      tokensUsed: result.tokensUsed,
      durationMs: Date.now() - callStart,
      model: result.model || CLAUDE_SYNTH_MODEL,
    };

    (agentOutput as any).synthesisData = {
      consensusLevel: synthesis.consensusLevel || 'moderate',
      criticalGaps: synthesis.criticalGaps || [],
      excludedCommonDiagnoses: synthesis.excludedCommonDiagnoses || [],
      confidenceCalibration: synthesis.confidenceCalibration || { topDiagnosisReliability: 'moderate', reasoning: '' },
      differentialClusters: synthesis.differentialClusters || [],
    };

    return agentOutput;
  }
}
