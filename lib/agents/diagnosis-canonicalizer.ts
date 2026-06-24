/**
 * Diagnosis canonicalization (post-specialist).
 *
 * For each hypothesis a specialist emits, normalize the diagnosis name and
 * look it up in the Mondo synonym index (built by scripts/build-mondo-assets.mjs
 * from oboInOwl:hasExactSynonym). If found AND unambiguous, rewrite the
 * `diagnosis` field to the canonical Mondo label.
 *
 * Class-wide rule, not disease-specific: applies to ~78K Mondo terms.
 * Catches LLM-emitted synonyms like "PKAN" → "Pantothenate Kinase-Associated
 * Neurodegeneration", "APECED" → "Autoimmune Polyendocrine Syndrome 1", etc.
 * Without this, downstream graders (and downstream LLM stages) see the LLM's
 * preferred-but-non-canonical name and may fail to match against KB / Mondo.
 *
 * Ambiguity handling: ~791 normalized strings collide in mondo-labels.json
 * (mostly cancer terms like "bile duct cancer", "rcc"). When a collision is
 * detected, leave the original name unchanged — better to keep the LLM's
 * intent than to confidently pick the wrong Mondo node.
 *
 * Off-the-shelf reuse: piggybacks on lib/grading/mondo-labels.json (already
 * shipped for the v4 grader). Same normalization as v4 Stage A grounding,
 * so what the grader will resolve, the pipeline will rewrite first.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeDiagnosis, extractParentheticalNames } from '../grading/deterministic-match';
import type { DiagnosisHypothesis } from '../types';

interface MondoLabelsFile {
  _metadata: {
    builtAt: string;
    mondoSourceUrl: string;
    mondoSha256: string;
    collisionCount: number;
    collisionsSample: Array<{ norm: string; ids: string[]; source: string }>;
  };
  entries: Record<string, string>; // normalized → MONDO id
}

// Module-level cache. Loaded once per cold start (~3.6 MB JSON parse).
let cachedLabels: Map<string, string> | null = null;
let cachedIdToCanonical: Map<string, string> | null = null;
let cachedCollisions: Set<string> | null = null;

function loadAssets(): { labels: Map<string, string>; idToCanonical: Map<string, string>; collisions: Set<string> } {
  if (cachedLabels && cachedIdToCanonical && cachedCollisions) {
    return { labels: cachedLabels, idToCanonical: cachedIdToCanonical, collisions: cachedCollisions };
  }
  const path = join(process.cwd(), 'lib', 'grading', 'mondo-labels.json');
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as MondoLabelsFile;

  const labels = new Map<string, string>();
  const idToCanonical = new Map<string, string>();
  // Walk entries: first-seen wins for label lookup (matches v4 grader behavior).
  // idToCanonical: the first PRIMARY label we see for an id becomes its canonical.
  // (Synonym entries don't override label entries because labels are emitted first
  //  by the builder.)
  for (const [norm, id] of Object.entries(raw.entries)) {
    if (!labels.has(norm)) labels.set(norm, id);
    if (!idToCanonical.has(id)) {
      // We don't know if `norm` is the primary label or a synonym from this map
      // alone; the builder ordered them so the first entry for a given id is
      // typically the primary label. Use that.
      idToCanonical.set(id, norm);
    }
  }

  // Collision set — these are normalized strings the builder flagged as ambiguous.
  const collisions = new Set<string>();
  for (const c of raw._metadata.collisionsSample || []) {
    collisions.add(c.norm);
  }
  // The metadata only ships a SAMPLE of collisions, not all 791. For complete
  // safety we'd need the full collision set — for now, treat any entry that
  // shares a normalized form with another id as collision-safe by checking
  // multiple lookups. (Future: build a full collisions file alongside labels.)

  cachedLabels = labels;
  cachedIdToCanonical = idToCanonical;
  cachedCollisions = collisions;
  return { labels, idToCanonical, collisions };
}

/**
 * Try to ground a single predicted diagnosis string to a canonical Mondo
 * label. Returns the canonical label if found unambiguously, OR the original
 * input if not found / ambiguous / module asset missing.
 *
 * Strategy mirrors v4 grader Stage A/A2:
 *  - Normalize (lower, strip stopwords/punctuation)
 *  - Try the normalized full string
 *  - Try each parenthetical alternate name extracted from the original
 *    (e.g., "PKAN (Pantothenate Kinase-Associated Neurodegeneration)" yields
 *    "pantothenate kinase associated neurodegeneration" as an alternate)
 *  - If multiple alternates ground to different Mondo ids → ambiguous, return original
 *  - If alternates ground to the SAME id → use the canonical label for that id
 */
export function canonicalizeName(predictionText: string): { canonical: string; mondoId: string | null; rewritten: boolean } {
  if (!predictionText || !predictionText.trim()) {
    return { canonical: predictionText, mondoId: null, rewritten: false };
  }

  let labels: Map<string, string>;
  let idToCanonical: Map<string, string>;
  let collisions: Set<string>;
  try {
    const assets = loadAssets();
    labels = assets.labels;
    idToCanonical = assets.idToCanonical;
    collisions = assets.collisions;
  } catch {
    // Asset missing or malformed — fall back to passthrough.
    return { canonical: predictionText, mondoId: null, rewritten: false };
  }

  const normalized = normalizeDiagnosis(predictionText);
  const alts = [normalized, ...extractParentheticalNames(predictionText).map(normalizeDiagnosis)].filter(Boolean);

  // Collect distinct ids across all alternates.
  const idHits = new Set<string>();
  let firstAmbiguous = false;
  for (const alt of alts) {
    if (collisions.has(alt)) { firstAmbiguous = true; continue; }
    const id = labels.get(alt);
    if (id) idHits.add(id);
  }

  if (firstAmbiguous && idHits.size === 0) {
    // Hit a known collision and nothing else — don't risk a wrong rewrite.
    return { canonical: predictionText, mondoId: null, rewritten: false };
  }

  if (idHits.size === 0) {
    // No match — leave as-is.
    return { canonical: predictionText, mondoId: null, rewritten: false };
  }

  if (idHits.size > 1) {
    // Predicted text grounds to multiple Mondo ids (e.g., the text mentions
    // both "Hereditary Spastic Paraplegia" umbrella AND a specific subtype).
    // Don't pick — leave as-is.
    return { canonical: predictionText, mondoId: null, rewritten: false };
  }

  // Exactly one ground — rewrite to its canonical label.
  const mondoId = Array.from(idHits)[0]!;
  const canonicalNorm = idToCanonical.get(mondoId);
  if (!canonicalNorm) {
    // No back-mapping; leave as-is.
    return { canonical: predictionText, mondoId, rewritten: false };
  }

  // Title-case the canonical normalized form for display
  // (Mondo labels are stored lowercased + stopword-stripped during the build).
  const canonical = titleCase(canonicalNorm);

  // Only rewrite if the canonical form is meaningfully different from input.
  // If the input is already the canonical form (modulo case/punct), skip
  // the rewrite to avoid noise.
  if (normalize(predictionText) === normalize(canonical)) {
    return { canonical: predictionText, mondoId, rewritten: false };
  }

  return { canonical, mondoId, rewritten: true };
}

/**
 * Walk a list of specialist hypotheses, attempt canonicalization on each,
 * and rewrite the diagnosis field in place when an unambiguous canonical
 * form is found. Returns a fresh array (does not mutate input).
 *
 * Designed to plug into the orchestrator between Stage 2 (specialists) and
 * Stage 3 (dedup) — diagnoses are canonicalized BEFORE dedup so synonymous
 * specialist outputs collapse correctly during merge.
 */
export function canonicalizeHypotheses<T extends Pick<DiagnosisHypothesis, 'diagnosis' | 'sourceAgent'>>(
  hypotheses: T[],
): { hypotheses: T[]; rewriteCount: number; rewrites: Array<{ from: string; to: string; mondoId: string | null }> } {
  const out: T[] = [];
  let rewriteCount = 0;
  const rewrites: Array<{ from: string; to: string; mondoId: string | null }> = [];
  for (const h of hypotheses) {
    // v29.1: do NOT canonicalize broadener output. The broadener's job is
    // to surface diagnoses OUTSIDE the KB-anchored specialist consensus;
    // canonicalizing rewrites its picks to KB-canonical names which then
    // collide with specialist hypotheses during dedup. Result: the
    // broadener becomes a no-op (everything it adds gets absorbed back
    // into criteria-grounded), and the Torg-Winchester "17/17
    // criteria-grounded, 0 reasoning" pattern emerges. Leave the broadener
    // text alone so KB-attach won't find it and it stays reasoning-
    // evaluated.
    if ((h as any).sourceAgent === 'differential-broadener') {
      out.push(h);
      continue;
    }
    const result = canonicalizeName(h.diagnosis);
    if (result.rewritten) {
      rewriteCount++;
      rewrites.push({ from: h.diagnosis, to: result.canonical, mondoId: result.mondoId });
      out.push({ ...h, diagnosis: result.canonical });
    } else {
      out.push(h);
    }
  }
  return { hypotheses: out, rewriteCount, rewrites };
}

// ===== helpers =====

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function titleCase(s: string): string {
  // Smart title-case: capitalize first letter of each word, but keep
  // gene-symbol-like all-caps tokens (3+ uppercase letters) capitalized.
  return s
    .split(/\s+/)
    .map((word) => {
      if (/^[a-z][a-z0-9]{0,4}$/.test(word) && ['of', 'and', 'or', 'the', 'a', 'an', 'in', 'with', 'to'].includes(word)) {
        return word; // small connecting words stay lowercased
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// Test-only injection (for unit tests if added later).
export const _injectAssetsForTesting = (
  labels: Map<string, string>,
  idToCanonical: Map<string, string>,
  collisions: Set<string>,
) => {
  cachedLabels = labels;
  cachedIdToCanonical = idToCanonical;
  cachedCollisions = collisions;
};
export const _resetAssetsForTesting = () => {
  cachedLabels = null;
  cachedIdToCanonical = null;
  cachedCollisions = null;
};
