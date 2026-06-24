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

const SOURCE = (process.argv.find((a) => a.startsWith('--source=')) || '--source=phenopacket').split('=')[1];
if (!['phenopacket', 'full-mondo'].includes(SOURCE)) {
  fail(`--source must be 'phenopacket' or 'full-mondo' (got '${SOURCE}')`);
}

function loadGoldOmimsFromPhenopacket() {
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

function loadGoldOmimsFromFullMondo(mondosByOmim) {
  // Use every OMIM phenotype id that has a skos:exactMatch entry in Mondo.
  // This widens credited-sets from the 694 Phenopacket cohort golds to ~6-7k
  // OMIM phenotype ids — covering any disease the synthetic generator (or
  // any external caller) might emit. The cost is a ~10x larger output JSON;
  // the v4 grader's runtime lookup is O(1) regardless.
  const all = Object.keys(mondosByOmim).filter((k) => k.startsWith('OMIM:')).sort();
  console.log(`  ✓ ${all.length} distinct OMIM ids with Mondo skos:exactMatch xrefs`);
  return all;
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

function buildCreditedSets(goldOmims, parents, mondosByOmim) {
  const credited = {};
  const unmappable = [];
  let totalPartial = 0;

  for (const omim of goldOmims) {
    const equivalents = mondosByOmim[omim] || [];
    if (equivalents.length === 0) {
      unmappable.push(omim);
      credited[omim] = { full: [omim], partial: [] };
      continue;
    }
    const full = new Set([omim, ...equivalents]);
    const partial = ancestorsOf(equivalents, parents);
    credited[omim] = {
      full: Array.from(full).sort(),
      partial: Array.from(partial).sort(),
    };
    totalPartial += partial.size;
  }

  const avgPartial = (totalPartial / goldOmims.length).toFixed(1);
  console.log(`  ✓ computed credited sets for ${goldOmims.length} golds`);
  console.log(`    Unmappable (no Mondo equivalent): ${unmappable.length}`);
  console.log(`    Avg ancestors per gold:           ${avgPartial}`);
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
  const { parents, mondosByOmim, mondoRelease } = loadGraph();
  const goldOmims =
    SOURCE === 'phenopacket'
      ? loadGoldOmimsFromPhenopacket()
      : loadGoldOmimsFromFullMondo(mondosByOmim);
  console.log(`  Source: ${SOURCE} (${goldOmims.length} gold OMIMs)`);
  const { credited, unmappable } = buildCreditedSets(goldOmims, parents, mondosByOmim);
  writeOutput({ credited, unmappable, goldOmims, mondoRelease });
  console.log('');
  console.log('Done. The v4 grader can now load lib/grading/mondo-credited-sets.json.');
}

main();
