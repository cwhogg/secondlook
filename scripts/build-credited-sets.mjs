#!/usr/bin/env node
/**
 * Build the precomputed "credited set" table that the v4 grader uses at
 * runtime to score predictions against each gold OMIM id.
 *
 * Why precompute: malco's per-prediction scoring walks the Mondo IS_A graph
 * via `mondo.descendants(..., predicates=[IS_A], reflexive=True)` with
 * unlimited depth. Walking the full graph at runtime would require shipping
 * the entire Mondo ontology to the grader — multi-MB, slow, and (per the
 * v23.1 deploy break) a Vercel bundle-size risk if this ever moves into a
 * route. Instead, the credited Mondo ids for a gold OMIM are FIXED and
 * FINITE: only the 694 distinct golds in en.jsonl ever appear, so we
 * precompute the table once.
 *
 * For each gold OMIM `G`:
 *   creditedSetFull(G)    = `{G}` ∪ (set of MONDO ids whose skos:exactMatch
 *                                     xref includes G — the Mondo classes
 *                                     equivalent to the OMIM disease).
 *   creditedSetPartial(G) = transitive ancestors of every MONDO in
 *                            creditedSetFull(G) via IS_A. No hop cap.
 *
 * At grading time:
 *   - If a prediction's grounded MONDO is in creditedSetFull(G):    score 1.0
 *   - Else if it is in creditedSetPartial(G):                       score 0.5
 *   - Else:                                                         score 0
 *
 * The binary "is correct for Top-N" is `score > 0`, matching malco's
 * scoring.py:`is_correct = grounded_score > 0`.
 *
 * Inputs:
 *   scripts/benchmark-data/en.jsonl       (the 9587-row eval dataset)
 *   scripts/mondo-data/mondo-graph.json   (from build-mondo-assets.mjs)
 *
 * Output:
 *   lib/grading/mondo-credited-sets.json  (committed; loaded at runtime)
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const EN_JSONL = resolve(ROOT, 'scripts/benchmark-data/en.jsonl');
const GRAPH_PATH = resolve(ROOT, 'scripts/mondo-data/mondo-graph.json');
const OUT_PATH = resolve(ROOT, 'lib/grading/mondo-credited-sets.json');

function fail(msg) {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

// ===== Load inputs =====

function loadGoldOmims() {
  if (!existsSync(EN_JSONL)) fail(`${EN_JSONL} not found.`);
  console.log(`Reading ${EN_JSONL} ...`);
  const lines = readFileSync(EN_JSONL, 'utf8').split('\n');
  const distinct = new Set();
  let parsed = 0;
  let skipped = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (!Array.isArray(row.diagnosis)) { skipped++; continue; }
      for (const dx of row.diagnosis) {
        if (typeof dx.id === 'string' && dx.id.startsWith('OMIM:')) {
          distinct.add(dx.id);
        }
      }
      parsed++;
    } catch {
      skipped++;
    }
  }
  console.log(`  ✓ ${parsed} rows parsed (${skipped} skipped); ${distinct.size} distinct OMIM golds`);
  return Array.from(distinct).sort();
}

function loadGraph() {
  if (!existsSync(GRAPH_PATH)) {
    fail(
      `${GRAPH_PATH} not found. Run \`node scripts/build-mondo-assets.mjs\` first to generate it.`,
    );
  }
  console.log(`Reading ${GRAPH_PATH} ...`);
  const payload = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
  const { parents, omimXrefs } = payload;
  // Build the reverse index: OMIM:N → list of MONDO ids that exact-match it.
  const mondosByOmim = {};
  let xrefCount = 0;
  for (const [mondoId, omims] of Object.entries(omimXrefs || {})) {
    for (const omim of omims) {
      if (!mondosByOmim[omim]) mondosByOmim[omim] = [];
      mondosByOmim[omim].push(mondoId);
      xrefCount++;
    }
  }
  console.log(
    `  ✓ ${Object.keys(parents).length} MONDO classes with IS_A edges; ${xrefCount} OMIM→MONDO xrefs covering ${Object.keys(mondosByOmim).length} OMIM ids`,
  );
  return { parents, mondosByOmim, mondoRelease: payload._metadata };
}

// ===== Compute credited sets =====

function ancestorsOf(startMondos, parents) {
  const out = new Set();
  const queue = [...startMondos];
  while (queue.length > 0) {
    const node = queue.shift();
    if (out.has(node)) continue;
    out.add(node);
    const ps = parents[node];
    if (!ps) continue;
    for (const p of ps) {
      if (!out.has(p)) queue.push(p);
    }
  }
  // The result includes the starting nodes themselves; remove them so the
  // PARTIAL set is strictly proper ancestors (the FULL set already covers
  // exact equivalents).
  for (const s of startMondos) out.delete(s);
  return out;
}

/**
 * Build a MONDO id → label primary index by inverting mondo-labels.json.
 * Keeps the shortest label per id (best heuristic for the primary rdfs:label
 * vs a synonym entry; the builder emits labels before synonyms).
 */
function buildIdToLabel(labelsPath) {
  if (!existsSync(labelsPath)) return new Map();
  const raw = JSON.parse(readFileSync(labelsPath, 'utf-8'));
  const entries = raw.entries || {};
  const idToLabel = new Map();
  for (const [label, id] of Object.entries(entries)) {
    const existing = idToLabel.get(id);
    if (!existing || label.length < existing.length) idToLabel.set(id, label);
  }
  return idToLabel;
}

/**
 * Build a children adjacency from the parents map.
 *   parents[child] = [parent_a, parent_b, ...]   →   children[parent] = [child_a, child_b, ...]
 */
function buildChildrenIndex(parents) {
  const children = {};
  for (const [child, ps] of Object.entries(parents)) {
    for (const p of ps) {
      if (!children[p]) children[p] = [];
      children[p].push(child);
    }
  }
  return children;
}

/**
 * For each MONDO node M in the FULL credit set, find IS_A descendants whose
 * label looks like a CLINICAL VARIANT of M (e.g., "mosaic neurofibromatosis 1"
 * descendant of "neurofibromatosis 1"). Class-wide rule — variants are
 * clinically the same disease as the parent (somatic vs germline mutation,
 * etc.) and should receive FULL credit, not partial.
 *
 * Pattern: descendant label starts with a variant-marker token from the list
 * below AND the remainder is a substring of the parent label. Conservative —
 * other forms of "type N" subtypes are NOT credited this way (they're often
 * genuinely distinct diseases).
 */
const VARIANT_MARKERS = ['mosaic', 'somatic', 'autosomal recessive', 'autosomal dominant', 'x linked'];

function variantDescendantsOf(equivalents, children, idToLabel) {
  const variants = new Set();
  for (const equiv of equivalents) {
    const parentLabel = idToLabel.get(equiv);
    if (!parentLabel) continue;
    const queue = [...(children[equiv] || [])];
    const seen = new Set();
    while (queue.length > 0) {
      const node = queue.shift();
      if (seen.has(node)) continue;
      seen.add(node);
      const childLabel = idToLabel.get(node);
      if (!childLabel) {
        // No label — can't classify; still walk its children (rare).
        for (const c of children[node] || []) queue.push(c);
        continue;
      }
      const lower = childLabel.toLowerCase();
      const pLower = parentLabel.toLowerCase();
      // Variant marker check: descendant label starts with a known marker AND
      // contains the parent label as a substring.
      let isVariant = false;
      for (const marker of VARIANT_MARKERS) {
        if (lower.startsWith(marker + ' ') && lower.includes(pLower)) {
          isVariant = true;
          break;
        }
      }
      if (isVariant) {
        variants.add(node);
        // Also descend into the variant's children — sub-variants of a variant
        // are still variants of the parent.
        for (const c of children[node] || []) queue.push(c);
      }
      // Non-variant descendants are NOT walked further. Their own descendants
      // could be variants of the variant (rare), but we stay conservative.
    }
  }
  return variants;
}

function buildCreditedSets(goldOmims, parents, mondosByOmim, children, idToLabel) {
  const credited = {};
  const unmappable = [];
  let totalPartial = 0;
  let totalVariantBoost = 0;

  for (const omim of goldOmims) {
    const equivalents = mondosByOmim[omim] || [];
    if (equivalents.length === 0) {
      unmappable.push(omim);
      credited[omim] = { full: [omim], partial: [] };
      continue;
    }
    // Variant descendants (mosaic / somatic / etc.) are added to FULL.
    const variantDesc = variantDescendantsOf(equivalents, children, idToLabel);
    totalVariantBoost += variantDesc.size;
    const full = new Set([omim, ...equivalents, ...variantDesc]);
    // PARTIAL = ancestors of equivalents (existing behavior). We don't include
    // ancestors of variants — variants share ancestry with their parent so it's
    // already covered.
    const partial = ancestorsOf(equivalents, parents);
    credited[omim] = {
      full: Array.from(full).sort(),
      partial: Array.from(partial).sort(),
    };
    totalPartial += partial.size;
  }

  const avgPartial = (totalPartial / goldOmims.length).toFixed(1);
  const avgVariant = (totalVariantBoost / goldOmims.length).toFixed(2);
  console.log(`  ✓ computed credited sets for ${goldOmims.length} golds`);
  console.log(`    Unmappable (no Mondo equivalent): ${unmappable.length}`);
  console.log(`    Avg ancestors per gold (partial): ${avgPartial}`);
  console.log(`    Avg variant descendants added (full): ${avgVariant}`);
  if (unmappable.length > 0 && unmappable.length <= 10) {
    console.log(`    Unmappable: ${unmappable.join(', ')}`);
  } else if (unmappable.length > 10) {
    console.log(`    Unmappable (first 10): ${unmappable.slice(0, 10).join(', ')} …`);
  }
  return { credited, unmappable };
}

// ===== Write =====

function writeOutput({ credited, unmappable, goldOmims, mondoRelease }) {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const payload = {
    _metadata: {
      builtAt: new Date().toISOString(),
      description:
        'Precomputed credited Mondo-id sets per gold OMIM id. Runtime grader uses this for O(1) lookup. Built per the malco scoring rule: full = {gold, equivalents (skos:exactMatch)}; partial = transitive IS_A ancestors of equivalents (no hop cap). Top-N uses (full ∪ partial) — paper-faithful binary correctness.',
      totalGolds: goldOmims.length,
      unmappableGolds: unmappable,
      mondoSource: mondoRelease,
    },
    sets: credited,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload));
  const sizeKB = (statSync(OUT_PATH).size / 1024).toFixed(1);
  console.log(`  ✓ wrote ${OUT_PATH} (${sizeKB} KB)`);
}

// ===== Main =====

function main() {
  console.log('Building credited-sets table for the v4 grader.');
  console.log('===============================================');
  const goldOmims = loadGoldOmims();
  const { parents, mondosByOmim, mondoRelease } = loadGraph();
  const children = buildChildrenIndex(parents);
  const labelsPath = resolve(ROOT, 'lib/grading/mondo-labels.json');
  const idToLabel = buildIdToLabel(labelsPath);
  console.log(`  ✓ children index: ${Object.keys(children).length} parents with kids`);
  console.log(`  ✓ id→label index: ${idToLabel.size} MONDO nodes labelled`);
  const { credited, unmappable } = buildCreditedSets(goldOmims, parents, mondosByOmim, children, idToLabel);
  writeOutput({ credited, unmappable, goldOmims, mondoRelease });
  console.log('');
  console.log('Done. The v4 grader can now load lib/grading/mondo-credited-sets.json.');
}

main();
