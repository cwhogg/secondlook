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

YOUR JOB: Make the first-pass clinical ranking. A senior critic (o3) will then review your full ranking, and a finalizer will produce the final top-10 from your output plus the critic's suggestions. Your job here is to rank ALL evaluated hypotheses, not to narrow.

1. RANK ALL EVALUATED HYPOTHESES (most likely first). Include every distinct hypothesis you were given, in your best-guess probability order. Do not truncate; the finalizer needs to see your full ranking so it can pick the final 10 with the critic's input. Do not invent diagnoses that were not evaluated. Each entry must be a distinct disease — no duplicates. Rank by how likely each is to be correct, based on EVERYTHING:
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
    ... (one entry per distinct evaluated hypothesis — rank all of them)
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
      // Bumped from 12000 to 18000 for v17 full-ranking; bumped again to 32000
      // for Opus 4.8, which reasons more verbosely per hypothesis and hit
      // max_tokens truncation on the 18k ceiling in real prod cases.
      maxTokens: 32000,
      model: CLAUDE_SYNTH_MODEL,
    });

    // Salvage path: callAnthropic already tries JSON + markdown-fence
    // extraction and falls back to the raw string if both fail. Try one
    // more recovery — regex-extract a top-level { ... } block from anywhere
    // in the string. Claude occasionally prefaces JSON with prose
    // ("Here's the synthesis: { ... }") despite the prompt asking for
    // JSON only; this catches that case before we fail the run.
    let synthesis: any =
      typeof result.content === 'object' && result.content !== null ? result.content : null;
    if (!synthesis && typeof result.content === 'string') {
      const objMatch = result.content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          synthesis = JSON.parse(objMatch[0]);
        } catch {
          /* fall through to the error below */
        }
      }
    }

    if (!synthesis || !Array.isArray(synthesis.rankedDiagnoses)) {
      // Log full diagnostic context to Vercel logs so we can inspect what
      // Claude actually returned. The error string thrown back to the user
      // stays generic; the detail lives in console.
      const raw =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content || null);
      console.error('[claude-synthesizer] non-conforming output:', {
        contentType: typeof result.content,
        contentLength: raw?.length || 0,
        rawHead: raw?.slice(0, 1000),
        rawTail: raw && raw.length > 1000 ? raw.slice(-300) : undefined,
        model: result.model,
        tokensUsed: result.tokensUsed,
      });
      throw new Error(
        `synthesizer.bad_output: type=${typeof result.content} len=${raw?.length || 0}`,
      );
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
    // downstream critic still sees the full set. Safety net only; Claude is
    // now asked to rank ALL of them upstream.
    for (const h of evaluatedHypotheses) {
      if (!rankedHypotheses.some((r) => r.diagnosis === h.diagnosis)) {
        rankedHypotheses.push(h);
      }
    }

    // v17+ widened-funnel: pass the FULL ranking downstream (was top-10).
    // The 10-cap now lives at the finalizer (Stage 10) — synth provides
    // the full ranked pool so o3 and Claude finalize can see / promote
    // entries that would otherwise be silently dropped here.
    const agentOutput: AgentOutput = {
      agentName: this.name,
      hypotheses: rankedHypotheses,
      reasoning: synthesis.overallAssessment || '',
      confidence: rankedHypotheses[0]?.confidenceScore || 0,
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
