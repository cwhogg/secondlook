/**
 * v4 grader core — paper-faithful Phenopacket2Prompt / Mondo grading.
 *
 * Two-step:
 *
 *   1. GROUNDING. Resolve a free-text disease name to a Mondo id. The grounder
 *      is GOLD-BLIND — its function signature does not accept the gold, and it
 *      treats every model's output (SL / OpenAI / Claude) through the
 *      identical pipeline. Stages 0 → A → A2 → B, mirroring the published
 *      OAK exact-match + CurateGPT fuzzy fallback used by the malco scoring
 *      harness.
 *
 *   2. SCORING. Once grounded to a Mondo id, score against the gold OMIM via
 *      a precomputed lookup table (see scripts/build-credited-sets.mjs):
 *          score === 1.0  if prediction is the gold or its Mondo equivalent
 *          score === 0.5  if gold is reachable via descendant route (any depth)
 *          score === 0    otherwise
 *      Top-N correctness is `score > 0`, matching malco's scoring.py:`is_correct`.
 *
 * The module loads two slim JSON assets on first use. Both are committed to
 * the repo (built offline). Runtime never touches the full Mondo graph.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { normalizeDiagnosis, extractParentheticalNames } from './deterministic-match';
import type { V4Grading, V4GroundedItem, V4GroundingStage } from '../types/admin';

// ===== Lazy-loaded assets =====

interface MondoLabelsAsset {
  _metadata?: { builtAt?: string; mondoSourceUrl?: string; mondoSha256?: string };
  entries: Record<string, string>; // normalizedLabelOrSynonym → MONDO id
}

interface MondoCreditedSetsAsset {
  _metadata: {
    builtAt: string;
    mondoSource?: { builtAt?: string; mondoSourceUrl?: string; mondoSha256?: string };
    unmappableGolds?: string[];
  };
  sets: Record<string, { full: string[]; partial: string[] }>;
}

interface LoadedAssets {
  labelToMondo: Map<string, string>;
  mondoToLabel: Map<string, string>;
  credited: MondoCreditedSetsAsset['sets'];
  mondoRelease: string;
}

let cachedAssets: LoadedAssets | null = null;

function resolveAssetPath(filename: string): string {
  // __dirname is not available in ESM. Reconstruct from import.meta.url. This
  // module compiles to CommonJS via Next.js so __dirname *is* available, but
  // the fallback keeps it portable for direct node --import use.
  try {
    return resolve(__dirname, filename);
  } catch {
    const here = dirname(fileURLToPath(import.meta.url));
    return resolve(here, filename);
  }
}

function loadAssets(): LoadedAssets {
  if (cachedAssets) return cachedAssets;
  const labelsPath = resolveAssetPath('mondo-labels.json');
  const creditedPath = resolveAssetPath('mondo-credited-sets.json');

  let labelsAsset: MondoLabelsAsset;
  let creditedAsset: MondoCreditedSetsAsset;
  try {
    labelsAsset = JSON.parse(readFileSync(labelsPath, 'utf8'));
  } catch (err) {
    throw new Error(
      `v4 grader: cannot read ${labelsPath}. Run \`node scripts/build-mondo-assets.mjs\` to generate it. (${(err as Error).message})`,
    );
  }
  try {
    creditedAsset = JSON.parse(readFileSync(creditedPath, 'utf8'));
  } catch (err) {
    throw new Error(
      `v4 grader: cannot read ${creditedPath}. Run \`node scripts/build-credited-sets.mjs\` to generate it. (${(err as Error).message})`,
    );
  }

  const labelToMondo = new Map<string, string>();
  const mondoToLabel = new Map<string, string>();
  for (const [norm, mondoId] of Object.entries(labelsAsset.entries)) {
    labelToMondo.set(norm, mondoId);
    // The first normalized form pointing at each Mondo id is treated as the
    // display label (build-mondo-assets writes labels first, then synonyms,
    // so this generally picks the primary label).
    if (!mondoToLabel.has(mondoId)) mondoToLabel.set(mondoId, norm);
  }

  cachedAssets = {
    labelToMondo,
    mondoToLabel,
    credited: creditedAsset.sets,
    mondoRelease: creditedAsset._metadata.mondoSource?.mondoSha256?.slice(0, 12)
      || creditedAsset._metadata.mondoSource?.builtAt
      || creditedAsset._metadata.builtAt,
  };
  return cachedAssets;
}

// Exposed so tests can drop in a synthetic asset bundle instead of building
// the full Mondo. Production callers MUST NOT use this.
export function _injectAssetsForTesting(assets: LoadedAssets): void {
  cachedAssets = assets;
}

export function _resetAssetsForTesting(): void {
  cachedAssets = null;
}

// ===== Stage 0: normalization & alternates =====

/**
 * Generate the candidate strings to look up in the labels index for one
 * predicted item. Reuses `normalizeDiagnosis()` and `extractParentheticalNames()`
 * from the existing deterministic grader so v4's normalization matches what
 * mondo-labels.json was built against.
 */
function generateCandidates(predictionText: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const n = normalizeDiagnosis(s);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  push(predictionText);
  for (const alt of extractParentheticalNames(predictionText)) push(alt);
  // Strip a trailing "type N" / numeric suffix as an additional alternate
  // (e.g., "Spastic Paraplegia 91" → "Spastic Paraplegia"). The gold-blind
  // tradeoff: this can lift an umbrella to match a numbered subtype's gold,
  // which the descendant route already credits at 0.5. Keep it as a tier-A
  // recall booster, not a leniency hack.
  const stripped = predictionText.replace(/\s+(type\s+)?\d+\s*$/i, '');
  if (stripped !== predictionText) push(stripped);
  return out;
}

// ===== Stage B: constrained fuzzy fallback (Claude) =====
//
// The shortlist generator is deterministic and gold-blind: it surfaces Mondo
// labels that share substantial tokens with the predicted text. Claude then
// picks one from the shortlist or returns 'none'. The shortlist NEVER includes
// the gold or the gold's known equivalents.

interface ShortlistCandidate {
  mondoId: string;
  label: string;
  tokenOverlap: number;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .split(/\s+/)
      .filter((t) => t.length >= 4),
  );
}

function generateShortlist(normalizedQuery: string, limit = 20): ShortlistCandidate[] {
  const { labelToMondo, mondoToLabel } = loadAssets();
  const queryTokens = tokenize(normalizedQuery);
  if (queryTokens.size === 0) return [];

  // Walk the labels index once. Cheap — ~250K entries, plain JS Map iteration.
  // For each label that shares ≥1 substantial token with the query, compute
  // the overlap count and keep a top-K by overlap.
  const heap: ShortlistCandidate[] = [];
  for (const [labelNorm, mondoId] of labelToMondo.entries()) {
    const labelTokens = tokenize(labelNorm);
    if (labelTokens.size === 0) continue;
    let overlap = 0;
    for (const t of queryTokens) if (labelTokens.has(t)) overlap++;
    if (overlap === 0) continue;
    heap.push({ mondoId, label: mondoToLabel.get(mondoId) || labelNorm, tokenOverlap: overlap });
  }
  heap.sort((a, b) => b.tokenOverlap - a.tokenOverlap);
  // Dedupe by mondoId (multiple labels can point to the same MONDO).
  const seen = new Set<string>();
  const out: ShortlistCandidate[] = [];
  for (const c of heap) {
    if (seen.has(c.mondoId)) continue;
    seen.add(c.mondoId);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The fuzzy resolver contract. Production calls the Anthropic API; tests
 * can drop in a deterministic stub via `_injectFuzzyResolverForTesting`.
 * The resolver MUST be gold-blind — it sees only the predicted name and the
 * shortlist (which itself is generated without the gold).
 */
export type FuzzyResolver = (
  predictionText: string,
  shortlist: Array<{ mondoId: string; label: string }>,
) => Promise<{ mondoId: string; confidence: number } | null>;

let cachedFuzzyResolver: FuzzyResolver | null = null;

export function _injectFuzzyResolverForTesting(resolver: FuzzyResolver | null): void {
  cachedFuzzyResolver = resolver;
}

// ===== Public API =====

export interface GroundingResult {
  mondoId: string | null;
  label: string | null;
  stage: V4GroundingStage;
  fuzzyConfidence?: number;
}

export interface GroundingOptions {
  /** Default true. Set false in unit tests that don't want a fuzzy fallback. */
  useFuzzy?: boolean;
  /** Override the fuzzy resolver (mainly for tests). */
  fuzzyResolver?: FuzzyResolver;
}

/**
 * Gold-blind grounding: resolve `predictionText` to a Mondo id without ever
 * being told which case this is for. The signature deliberately does not take
 * a gold parameter; this is the structural enforcement of Invariant 1 from
 * the v4 grader plan.
 */
export async function groundToMondo(
  predictionText: string,
  opts: GroundingOptions = {},
): Promise<GroundingResult> {
  const { labelToMondo, mondoToLabel } = loadAssets();
  const candidates = generateCandidates(predictionText);

  // Stage A + A2: deterministic exact match against the prebuilt labels index.
  // Distinguish 'exact' (primary label match) from 'synonym' by re-checking
  // whether the matched normalized form equals the Mondo's recorded primary
  // form. (build-mondo-assets writes the primary label first, so the
  // mondoToLabel map carries it.)
  for (const cand of candidates) {
    const mondoId = labelToMondo.get(cand);
    if (!mondoId) continue;
    const primary = mondoToLabel.get(mondoId);
    const stage: V4GroundingStage = primary === cand ? 'exact' : 'synonym';
    return {
      mondoId,
      label: primary || cand,
      stage,
    };
  }

  // Stage B: constrained fuzzy fallback via Claude.
  const useFuzzy = opts.useFuzzy !== false;
  if (!useFuzzy) {
    return { mondoId: null, label: null, stage: 'none' };
  }
  const resolver = opts.fuzzyResolver || cachedFuzzyResolver;
  if (!resolver) {
    // No fuzzy resolver configured. Return ungrounded — caller (the regrade
    // script) is responsible for wiring up an Anthropic-backed resolver in
    // production; tests use _injectFuzzyResolverForTesting.
    return { mondoId: null, label: null, stage: 'none' };
  }
  const normalized = candidates[0] || normalizeDiagnosis(predictionText);
  const shortlist = generateShortlist(normalized);
  if (shortlist.length === 0) {
    return { mondoId: null, label: null, stage: 'none' };
  }
  const pick = await resolver(
    predictionText,
    shortlist.map((c) => ({ mondoId: c.mondoId, label: c.label })),
  );
  if (!pick) return { mondoId: null, label: null, stage: 'none' };
  return {
    mondoId: pick.mondoId,
    label: mondoToLabel.get(pick.mondoId) || null,
    stage: 'fuzzy',
    fuzzyConfidence: pick.confidence,
  };
}

// ===== Scoring =====

/**
 * Score a single grounded prediction against a gold OMIM id. Pure lookup —
 * no graph traversal at runtime, because the credited sets are precomputed
 * offline (see scripts/build-credited-sets.mjs).
 *
 *   1.0   if mondoId is the gold or its skos:exactMatch equivalent (FULL credit)
 *   0.5   if mondoId is an ancestor of an equivalent (PARTIAL credit)
 *   0     otherwise
 *
 * Mirrors malco's mondo_score_utils.py:`score_grounded_result`.
 */
export function scorePrediction(mondoId: string | null, goldOmimId: string): 0 | 0.5 | 1 {
  if (!mondoId) return 0;
  const { credited } = loadAssets();
  const set = credited[goldOmimId];
  if (!set) return 0;
  if (set.full.includes(mondoId)) return 1;
  if (set.partial.includes(mondoId)) return 0.5;
  return 0;
}

// ===== Differential grading =====

/**
 * A model-agnostic differential entry. Callers (grade-eval-v4.mjs) translate
 * each pipeline's output shape into this form. SL hypotheses pass an
 * intendedOmimId from the KB-attached hypothesis; baselines leave it absent.
 *
 * Per Invariant 2, the grading path treats both shapes identically — the
 * intended id is captured ONLY for the audit aggregate, never used to alter
 * the score.
 */
export interface DifferentialInput {
  predictionText: string;
  intendedOmimId?: string;
}

export interface GradeDifferentialOptions {
  fuzzyResolver?: FuzzyResolver;
  groundingModel?: string;       // recorded on the V4Grading for provenance
}

export async function gradeDifferentialV4(
  differential: DifferentialInput[],
  goldOmimId: string,
  opts: GradeDifferentialOptions = {},
): Promise<V4Grading> {
  const { credited, mondoRelease } = loadAssets();
  const goldMondoIds = (credited[goldOmimId]?.full || [goldOmimId]).filter((id) =>
    id.startsWith('MONDO:'),
  );

  const t0 = Date.now();

  // Ground each prediction (gold-blind — note we never pass goldOmimId here).
  // Use the top-10 only per the paper's metric.
  const top10 = differential.slice(0, 10);
  const groundings = await Promise.all(
    top10.map((d) =>
      groundToMondo(d.predictionText, { fuzzyResolver: opts.fuzzyResolver }),
    ),
  );

  // Score and assemble per-item rows.
  const items: V4GroundedItem[] = top10.map((d, i) => {
    const g = groundings[i];
    const score = scorePrediction(g.mondoId, goldOmimId);
    const isCorrect = score > 0;
    const item: V4GroundedItem = {
      rank: i + 1,
      predictionText: d.predictionText,
      groundedMondoId: g.mondoId,
      groundedLabel: g.label,
      groundingStage: g.stage,
      score,
      isCorrect,
    };
    if (g.fuzzyConfidence !== undefined) item.fuzzyConfidence = g.fuzzyConfidence;
    if (d.intendedOmimId) {
      item.intendedOmimId = d.intendedOmimId;
      // Audit path: was the gold-blind text grounder's resolution consistent
      // with the SL pipeline's intended id, ignoring umbrella-vs-subtype
      // specificity?
      //
      // "Aligned" here means: the resolved MONDO sits in the same disease
      // family as the intended id — either it IS the intended id's MONDO
      // equivalent (FULL match) or it's an ancestor reachable via descendant
      // route (PARTIAL match, e.g., grounder resolved the umbrella while SL
      // had the numbered subtype). Both indicate the grounder didn't pick a
      // different entity entirely — it just lost some specificity.
      //
      // "Diverged" means: the resolved MONDO is in a different disease
      // family. That's a real artifact worth surfacing.
      const intendedSet = credited[d.intendedOmimId];
      if (intendedSet && g.mondoId) {
        const intendedFamily = new Set([
          d.intendedOmimId,
          ...intendedSet.full,
          ...intendedSet.partial,
        ]);
        item.intendedVsResolvedMatch = intendedFamily.has(g.mondoId);
      } else {
        item.intendedVsResolvedMatch = false;
      }
    }
    return item;
  });

  // Top-N rollups (paper-faithful: score > 0)
  const firstCorrectRank = items.findIndex((it) => it.isCorrect);
  const firstCorrectRank1 = firstCorrectRank === -1 ? null : firstCorrectRank + 1;
  // FULL-credit-only Top-N (diagnostic: distinguishes umbrella matches from
  // exact-name matches)
  const firstFullCreditRank = items.findIndex((it) => it.score === 1);
  const firstFullCreditRank1 = firstFullCreditRank === -1 ? null : firstFullCreditRank + 1;

  const groundedCount = items.filter((it) => it.groundingStage !== 'none').length;

  // SL audit aggregate (only present if any item carried an intended id)
  const slItems = items.filter((it) => it.intendedOmimId);
  const slAudit = slItems.length > 0
    ? {
        intendedIdAvailable: true,
        intendedVsResolvedAlignedCount: slItems.filter((it) => it.intendedVsResolvedMatch).length,
        intendedVsResolvedDivergedCount: slItems.filter((it) => !it.intendedVsResolvedMatch).length,
      }
    : undefined;

  return {
    gradingVersion: 'v4',
    goldOmimId,
    goldMondoIds,
    items,
    firstCorrectRank: firstCorrectRank1,
    top1: firstCorrectRank1 !== null && firstCorrectRank1 <= 1,
    top3: firstCorrectRank1 !== null && firstCorrectRank1 <= 3,
    top10: firstCorrectRank1 !== null && firstCorrectRank1 <= 10,
    firstFullCreditRank: firstFullCreditRank1,
    top1Full: firstFullCreditRank1 !== null && firstFullCreditRank1 <= 1,
    top3Full: firstFullCreditRank1 !== null && firstFullCreditRank1 <= 3,
    top10Full: firstFullCreditRank1 !== null && firstFullCreditRank1 <= 10,
    groundedCount,
    totalCount: items.length,
    slAudit,
    mondoRelease: mondoRelease || 'unknown',
    gradedAt: new Date().toISOString(),
    gradingDurationMs: Date.now() - t0,
    groundingModel: opts.groundingModel || 'none',
  };
}
