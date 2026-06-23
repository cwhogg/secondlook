/**
 * Narrative merger (v28.1).
 *
 * The dedup-normalizer concatenates each contributing specialist's
 * clinicalReasoning with a "${specialty}:" prefix, and the Claude finalizer
 * then appends "[finalizer]: ${rationale}" on top. The result is a wall of
 * role-tagged paragraphs that's hard for patients (and their clinicians) to
 * read: "geneticist: ... general-internist: ... neurologist: ... cardiologist:
 * ... [finalizer]: ...".
 *
 * This stage runs AFTER the finalizer and BEFORE the result is returned. It
 * makes a single Claude Sonnet 4.6 call that takes the role-prefixed
 * reasoning across the top-N hypotheses and rewrites each into one coherent
 * clinical narrative — same information, no role labels, no information
 * loss. The unified narrative is written back to the hypothesis's
 * `clinicalReasoning` field; the original role-prefixed text is preserved
 * on `clinicalReasoningRaw` so debugging / per-specialist views can still
 * recover it.
 *
 * Fail-soft. If the call errors or returns malformed JSON, the original
 * concatenation stays in place — no degradation vs pre-v28.1 behavior.
 */
import { callAnthropic } from '../anthropic';
import type { DiagnosisHypothesis } from '../types';

const MERGER_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You rewrite multi-specialist diagnostic reasoning into a single coherent clinical narrative — no role labels, no information loss.

Each input hypothesis carries a clinicalReasoning string that is a concatenation of multiple specialists' opinions, each prefixed with the specialist's role (e.g. "geneticist: ...", "general-internist: ...", "neurologist: ...", "[finalizer]: ..."). The specialists are reasoning about the SAME diagnosis from their own domain perspectives, so their content overlaps and complements rather than contradicts.

Your job: for each hypothesis, produce ONE unified clinical narrative that:
- Reads as a single voice (a senior diagnostician's explanation), not a conversation
- Contains NO "geneticist:", "neurologist:", "[finalizer]:" or other role prefixes
- Preserves every distinct clinical fact, reasoning step, age/onset detail, supporting and contradicting evidence point, and recommendation that appears in the input — nothing is dropped, even if it's redundant across specialists, consolidate it into one statement instead of dropping it
- Resolves redundancy by consolidation, not deletion (if three specialists all say "cardiomyopathy can be late or absent in FA", say it once)
- Maintains the clinical density and specificity of the original — do NOT generalize, simplify, or strip technical detail
- Length should track the input length; a 1500-character input should produce roughly 1200-1500 characters of output (compression from redundancy, not from omission)

OUTPUT FORMAT (JSON only, no markdown fences):
{
  "rewrites": [
    {
      "diagnosis": "<exact diagnosis name from the input>",
      "narrative": "<unified clinical narrative with no role labels>"
    },
    ...
  ]
}

CRITICAL: every "diagnosis" name in your output must EXACTLY match an input diagnosis name (verbatim string). The "narrative" replaces the role-prefixed input verbatim — do not annotate, do not add commentary.`;

interface MergerOutput {
  rewrites?: Array<{
    diagnosis?: string;
    narrative?: string;
  }>;
}

export interface NarrativeMergerResult {
  /** Map of normalized diagnosis name -> unified narrative. */
  narratives: Map<string, string>;
  durationMs: number;
  tokensUsed: number;
  model: string;
  rewriteCount: number;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Make a single Sonnet call to rewrite role-prefixed clinical reasoning
 * into unified narratives. Returns a map keyed by normalized diagnosis
 * name so callers can apply the rewrites back to the right hypothesis
 * regardless of minor whitespace / case differences.
 */
export async function mergeNarratives(
  hypotheses: DiagnosisHypothesis[],
): Promise<NarrativeMergerResult> {
  const start = Date.now();

  // Build a compact input listing each top-N hypothesis and its
  // role-prefixed clinicalReasoning. Cap individual reasoning at 4000
  // chars to keep total input bounded even on outlier cases.
  const userPrompt = `Rewrite the clinicalReasoning of each of the following hypotheses into a single unified clinical narrative per the rules above.

${hypotheses
  .map(
    (h, i) => `${i + 1}. ${h.diagnosis}
clinicalReasoning:
${(h.clinicalReasoning || '').slice(0, 4000)}`,
  )
  .join('\n\n')}`;

  const result = await callAnthropic({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 16000,
    model: MERGER_MODEL,
  });

  const parsed = typeof result.content === 'object' && result.content !== null
    ? (result.content as MergerOutput)
    : null;

  const rewrites = Array.isArray(parsed?.rewrites) ? parsed!.rewrites! : [];
  const inputByName = new Map(
    hypotheses.map((h) => [normalizeName(h.diagnosis), h]),
  );

  const narratives = new Map<string, string>();
  for (const rw of rewrites) {
    if (!rw.diagnosis || typeof rw.diagnosis !== 'string') continue;
    if (!rw.narrative || typeof rw.narrative !== 'string') continue;
    const trimmed = rw.narrative.trim();
    if (!trimmed) continue;
    const key = normalizeName(rw.diagnosis);
    // Only accept rewrites that target an input hypothesis; drop drift.
    if (!inputByName.has(key)) continue;
    narratives.set(key, trimmed);
  }

  return {
    narratives,
    durationMs: Date.now() - start,
    tokensUsed: result.tokensUsed || 0,
    model: MERGER_MODEL,
    rewriteCount: narratives.size,
  };
}

/** Helper: apply rewrites in place, preserving original on `clinicalReasoningRaw`. */
export function applyNarrativesInPlace(
  hypotheses: DiagnosisHypothesis[],
  narratives: Map<string, string>,
): number {
  let applied = 0;
  for (const h of hypotheses) {
    const key = normalizeName(h.diagnosis);
    const narrative = narratives.get(key);
    if (!narrative) continue;
    // Preserve the original role-prefixed reasoning so it's recoverable
    // for debugging or per-specialist views.
    (h as DiagnosisHypothesis & { clinicalReasoningRaw?: string }).clinicalReasoningRaw =
      h.clinicalReasoning;
    h.clinicalReasoning = narrative;
    applied++;
  }
  return applied;
}
