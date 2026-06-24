/**
 * Per-stage pipeline summary logging.
 *
 * Purpose: answer questions like "how many hypotheses are criteria-grounded
 * vs reasoning-evaluated at each stage", "which of the top-10 came from the
 * broadener vs the specialists", and "did the canonicalizer absorb the
 * broadener's output into existing KB profiles". These shapes aren't
 * captured by the existing `orch.start/done/fail` log lines, which mostly
 * track counts + durations.
 *
 * Output format: a single `console.log` line per call, structured as
 * `[orch] event=<name> kv pairs...` (matching the orchestrator's existing
 * `log()` helper convention). Each hypothesis appears as a compact slug
 * with type, source, and score so Vercel logs can be grepped for ranking
 * progressions across stages without parsing JSON.
 *
 * Design constraint: no performance hit. Building these summaries is O(N)
 * across at most ~25 hypotheses — negligible vs the LLM call durations of
 * the stages they live between. We don't gate on an env var; this is
 * permanent observability infrastructure.
 */
import type { DiagnosisHypothesis } from '../types';

/**
 * Compact one-line representation of a hypothesis for log greppability.
 * Format: "name|type|src|score"
 *   - name truncated to 60 chars, spaces preserved (helps eyeball)
 *   - type = 'KB' (criteria-grounded) or 'RR' (reasoning-evaluated)
 *   - src = source agent (truncated to 12 chars)
 *   - score = evidenceScore if present else confidenceScore, integer
 */
export function summarizeHypothesis(h: DiagnosisHypothesis): string {
  const name = (h.diagnosis || '').slice(0, 60);
  const type = h.evaluationType === 'criteria-grounded' ? 'KB' : 'RR';
  const src = (h.sourceAgent || 'unknown').slice(0, 12);
  const score = Math.round(
    typeof h.evidenceScore === 'number' && h.evidenceScore > 0
      ? h.evidenceScore
      : h.confidenceScore || 0,
  );
  return `${name}|${type}|${src}|${score}`;
}

/**
 * Breakdown counts that answer "how is this stage's output distributed
 * across our two evaluation tracks and source origins". Returned as a
 * flat object so the existing log() helper can serialize it directly
 * (each key/value becomes a kv pair on the log line).
 */
export interface HypothesisBreakdown {
  total: number;
  criteriaGrounded: number;
  reasoningEvaluated: number;
  fromBroadener: number;
  fromSpecialists: number;
  fromOther: number;
}

const BROADENER_SRC = 'differential-broadener';

export function breakdownHypotheses(hypotheses: DiagnosisHypothesis[]): HypothesisBreakdown {
  let criteriaGrounded = 0;
  let reasoningEvaluated = 0;
  let fromBroadener = 0;
  let fromSpecialists = 0;
  let fromOther = 0;
  const knownSpecialists = new Set([
    'neurologist',
    'rheumatologist',
    'cardiologist',
    'immunologist',
    'endocrinologist',
    'gastroenterologist',
    'hematologist',
    'psychiatrist',
    'oncologist',
    'geneticist',
    'general-internist',
  ]);
  for (const h of hypotheses) {
    if (h.evaluationType === 'criteria-grounded') criteriaGrounded++;
    else reasoningEvaluated++;
    // sourceAgents (array, set by dedup-normalizer when merging) is more
    // reliable than sourceAgent (singular) for hypotheses that were
    // merged across multiple specialists. We treat a hypothesis as
    // "from broadener" only if NO specialist also proposed it — i.e.,
    // the broadener is the sole origin.
    const sources: string[] = Array.isArray((h as any).sourceAgents)
      ? (h as any).sourceAgents
      : [h.sourceAgent || ''];
    const hasSpecialist = sources.some((s) => knownSpecialists.has(s));
    const hasBroadener = sources.includes(BROADENER_SRC);
    if (hasBroadener && !hasSpecialist) fromBroadener++;
    else if (hasSpecialist) fromSpecialists++;
    else fromOther++;
  }
  return {
    total: hypotheses.length,
    criteriaGrounded,
    reasoningEvaluated,
    fromBroadener,
    fromSpecialists,
    fromOther,
  };
}

/**
 * The headline log: emits the top-N ranking as a single line so a Vercel
 * log search for `orch.summary.ranking` returns one row per analysis,
 * each containing the full top-10 with type + source + score. Use after
 * the finalizer.
 */
export function rankingLine(hypotheses: DiagnosisHypothesis[], topN: number = 10): string {
  return hypotheses
    .slice(0, topN)
    .map((h, i) => `#${i + 1} ${summarizeHypothesis(h)}`)
    .join(' || ');
}
