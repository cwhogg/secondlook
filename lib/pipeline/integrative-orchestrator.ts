/**
 * Integrative-panel orchestrator.
 *
 * Two-stage pipeline: (1) five specialists run in parallel, (2) synth
 * consolidates. No evidence evaluator, no critic, no clinical finalizer —
 * this path produces a complementary integrative perspective, not a
 * differential diagnosis. See docs/session-reports or the plan commit
 * for the "not co-mingled" architectural decision.
 */
import type { PatientCase } from '../types';
import type {
  IntegrativeAnalysisResult,
  IntegrativeSpecialistOutput,
  IntegrativeSpecialty,
} from '../types/integrative';
import { INTEGRATIVE_SPECIALISTS, runIntegrativeSpecialist } from '../agents/integrative-specialists';
import { runIntegrativeSynth } from '../agents/integrative-synth';

export interface IntegrativeProgressCallback {
  (event:
    | { stage: 'specialists' }
    | { stage: 'specialist-done'; specialty: IntegrativeSpecialty; displayName: string }
    | { stage: 'synthesis' }
    | { stage: 'complete' }
  ): void;
}

const OPENAI_COST_PER_1K_INPUT = 0.003;   // gpt-4.1 input
const OPENAI_COST_PER_1K_OUTPUT = 0.012;  // gpt-4.1 output
const CLAUDE_OPUS_PER_1K_INPUT = 0.015;
const CLAUDE_OPUS_PER_1K_OUTPUT = 0.075;

function estimateSpecialistCost(tokens: number): number {
  // Approximate: assume roughly 50/50 in/out split for specialists.
  return (tokens / 1000) * ((OPENAI_COST_PER_1K_INPUT + OPENAI_COST_PER_1K_OUTPUT) / 2);
}
function estimateSynthCost(tokens: number): number {
  return (tokens / 1000) * ((CLAUDE_OPUS_PER_1K_INPUT + CLAUDE_OPUS_PER_1K_OUTPUT) / 2);
}

export async function executeIntegrativePipeline(
  patientCase: PatientCase,
  requestId: string,
  clinicalRequestId: string,
  onProgress?: IntegrativeProgressCallback,
): Promise<IntegrativeAnalysisResult> {
  const t0 = Date.now();

  onProgress?.({ stage: 'specialists' });

  // Run five specialists in parallel. If one throws, drop it — the panel
  // is designed to be robust to a single practitioner missing. But at
  // least three must succeed for the synth to have signal.
  const settled = await Promise.allSettled(
    INTEGRATIVE_SPECIALISTS.map(async (spec) => {
      const out = await runIntegrativeSpecialist(spec, patientCase);
      onProgress?.({ stage: 'specialist-done', specialty: spec.specialty, displayName: spec.displayName });
      return out;
    }),
  );

  const successes: IntegrativeSpecialistOutput[] = [];
  const failures: Array<{ specialty: IntegrativeSpecialty; message: string }> = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') successes.push(s.value);
    else failures.push({ specialty: INTEGRATIVE_SPECIALISTS[i].specialty, message: (s.reason as any)?.message || 'unknown error' });
  });

  if (successes.length < 3) {
    throw new Error(
      `Integrative panel requires at least 3 successful specialists; got ${successes.length}. Failures: ${failures.map((f) => `${f.specialty}(${f.message})`).join('; ')}`,
    );
  }

  onProgress?.({ stage: 'synthesis' });
  const synth = await runIntegrativeSynth(patientCase, successes);

  onProgress?.({ stage: 'complete' });

  const totalTokens = successes.reduce((sum, s) => sum + s.tokensUsed, 0) + synth.tokensUsed;
  const totalCost =
    successes.reduce((sum, s) => sum + estimateSpecialistCost(s.tokensUsed), 0)
    + estimateSynthCost(synth.tokensUsed);

  return {
    requestId,
    clinicalRequestId,
    createdAt: new Date().toISOString(),
    consensusRootCause: synth.consensusRootCause,
    overallReasoning: synth.overallReasoning,
    perSpecialist: successes,
    mergedTests: synth.mergedTests,
    mergedInterventions: synth.mergedInterventions,
    totalTokensUsed: totalTokens,
    totalCostEstimate: totalCost,
    totalDurationMs: Date.now() - t0,
  };
}
