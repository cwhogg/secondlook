#!/usr/bin/env node
/**
 * Build Mondo-derived assets for the v4 grader.
 *
 * One-shot offline build. Downloads the Mondo Disease Ontology, parses it,
 * and emits two derived artifacts:
 *
 *   lib/grading/mondo-labels.json   (committed; ships at runtime — few MB)
 *     Maps `normalizedLabelOrSynonym → mondoId`. Built from each Mondo class's
 *     primary `rdfs:label` plus its `oboInOwl:hasExactSynonym` values
 *     (NOT `hasRelatedSynonym`). Matches OAK's default for `matches_whole_text=
 *     True` in the published phenopacket2prompt/malco grading harness.
 *
 *   scripts/mondo-data/mondo-graph.json   (gitignored; offline-only)
 *     Adjacency lists for the credited-sets builder:
 *       - `parents`: { mondoId: [parentMondoId, ...] } from IS_A edges
 *       - `omimXrefs`: { mondoId: [omimId, ...] } from `skos:exactMatch`
 *         cross-references where the xref starts with "OMIM:".
 *
 * Heavy ontology processing lives in this file ONLY. Runtime code (the
 * grader module, the API routes) must never load the full Mondo graph.
 *
 * Usage:
 *   node scripts/build-mondo-assets.mjs
 *
 * Output:
 *   scripts/mondo-data/mondo.json    (raw OBO Graph JSON download, gitignored)
 *   scripts/mondo-data/mondo-graph.json
 *   lib/grading/mondo-labels.json
 *
 * Records the release version + SHA in each output's `_metadata` block so the
 * downstream credited-sets builder and the grader can report reproducibility.
 */

import { createHash } from 'crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const MONDO_DATA_DIR = resolve(ROOT, 'scripts/mondo-data');
const GRADING_DIR = resolve(ROOT, 'lib/grading');

const MONDO_JSON_URL = 'http://purl.obolibrary.org/obo/mondo.json';
const RAW_PATH = resolve(MONDO_DATA_DIR, 'mondo.json');
const GRAPH_PATH = resolve(MONDO_DATA_DIR, 'mondo-graph.json');
const LABELS_PATH = resolve(GRADING_DIR, 'mondo-labels.json');

// ===== Normalization (must match lib/grading/deterministic-match.ts:normalizeDiagnosis) =====
//
// The grounder normalizes predicted free-text via the existing
// `normalizeDiagnosis()` helper. The labels index needs to use the IDENTICAL
// rule, otherwise an obvious exact-label match could miss. We duplicate the
// small rule here (lowercase, strip parentheticals, dashes→spaces, remove
// non-alphanumerics, drop stopwords) to avoid pulling the TS source into a
// node script. Keep these in sync if the runtime helper changes.

// MUST stay in sync with STOP_WORDS in lib/grading/deterministic-match.ts.
// The runtime grounder uses `normalizeDiagnosis()` from that module to
// produce lookup keys; this index must be built with identical normalization
// or queries will silently miss.
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'with', 'without',
  'type', 'syndrome', 'disease', 'disorder', 'condition',
]);

function normalize(name) {
  let normalized = name.toLowerCase();
  normalized = normalized.replace(/\([^)]*\)/g, '');
  normalized = normalized.replace(/-/g, ' ');
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  const words = normalized.split(/\s+/).filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  return words.join(' ');
}

// ===== Download =====

async function downloadMondoIfNeeded() {
  mkdirSync(MONDO_DATA_DIR, { recursive: true });
  if (existsSync(RAW_PATH)) {
    const sizeMB = (statSync(RAW_PATH).size / (1024 * 1024)).toFixed(1);
    console.log(`Mondo already downloaded at ${RAW_PATH} (${sizeMB} MB) — using cached copy.`);
    console.log(`  (Delete the file to force a re-download.)`);
    return;
  }
  console.log(`Downloading Mondo from ${MONDO_JSON_URL} ...`);
  const t0 = Date.now();
  const resp = await fetch(MONDO_JSON_URL);
  if (!resp.ok) {
    throw new Error(`Download failed: HTTP ${resp.status} ${resp.statusText}`);
  }
  // Stream-write so we don't buffer the whole 100+ MB file in memory.
  const tmpPath = `${RAW_PATH}.partial`;
  const out = createWriteStream(tmpPath);
  const reader = resp.body.getReader();
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    out.write(value);
  }
  out.end();
  await new Promise((r) => out.on('finish', r));
  // Atomic rename — never leave a half-downloaded file at the canonical path.
  writeFileSync(RAW_PATH, readFileSync(tmpPath));
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ✓ ${(bytes / (1024 * 1024)).toFixed(1)} MB in ${elapsedSec}s`);
}

// ===== Parse =====

function sha256OfFile(path) {
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex');
}

function parseMondo() {
  console.log(`Parsing ${RAW_PATH} ...`);
  const t0 = Date.now();
  const raw = JSON.parse(readFileSync(RAW_PATH, 'utf8'));
  const graph = raw.graphs[0];
  console.log(`  ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

  const labels = {}; // { normalizedLabelOrSynonym: mondoId }
  const labelCollisions = []; // diagnostic — same normalized form maps to >1 MONDO
  const parents = {};   // { mondoId: [parentMondoId, ...] }
  const omimXrefs = {}; // { mondoId: [omimId, ...] }

  // OBO Graph JSON encodes ids as PURLs like "http://purl.obolibrary.org/obo/MONDO_0000001"
  // Convert to curie form "MONDO:0000001" for ergonomic use downstream.
  const purlToCurie = (purl) => {
    const m = purl.match(/[/_]([A-Z]+)[_:](\d+)$/);
    return m ? `${m[1]}:${m[2]}` : null;
  };

  let mondoNodeCount = 0;
  let synonymCount = 0;
  let xrefCount = 0;
  for (const node of graph.nodes) {
    const id = purlToCurie(node.id);
    if (!id || !id.startsWith('MONDO:')) continue;
    mondoNodeCount++;

    // Skip obsolete / deprecated terms — they shouldn't ground predictions.
    if (node.meta?.deprecated) continue;

    // Primary label
    if (node.lbl) {
      const norm = normalize(node.lbl);
      if (norm) {
        if (labels[norm] && labels[norm] !== id) {
          labelCollisions.push({ norm, ids: [labels[norm], id], source: 'label' });
        } else {
          labels[norm] = id;
        }
      }
    }

    // Exact synonyms only — NOT hasRelatedSynonym (per decision in plan).
    const synonyms = node.meta?.synonyms || [];
    for (const syn of synonyms) {
      const pred = syn.pred;
      // OBO Graph JSON uses snake_case predicates: hasExactSynonym → has_exact_synonym
      if (pred !== 'hasExactSynonym' && pred !== 'has_exact_synonym') continue;
      const norm = normalize(syn.val);
      if (!norm) continue;
      synonymCount++;
      // First-write-wins on collision; record the collision for transparency.
      // Primary labels (set above) already populated, so synonyms don't overwrite them.
      if (labels[norm] && labels[norm] !== id) {
        labelCollisions.push({ norm, ids: [labels[norm], id], source: 'synonym' });
      } else if (!labels[norm]) {
        labels[norm] = id;
      }
    }

    // skos:exactMatch xrefs — Mondo encodes external ontology equivalences here.
    // We care about OMIM xrefs for the credited-sets builder.
    const xrefs = node.meta?.xrefs || [];
    for (const xref of xrefs) {
      if (!xref.val) continue;
      if (xref.val.startsWith('OMIM:')) {
        if (!omimXrefs[id]) omimXrefs[id] = [];
        omimXrefs[id].push(xref.val);
        xrefCount++;
      }
    }
  }

  // IS_A edges → parents adjacency.
  let isAEdgeCount = 0;
  for (const edge of graph.edges) {
    // OBO Graph JSON encodes is_a as edge.pred === 'is_a' (or a PURL form).
    if (edge.pred !== 'is_a') continue;
    const sub = purlToCurie(edge.sub);
    const obj = purlToCurie(edge.obj);
    if (!sub || !obj) continue;
    if (!sub.startsWith('MONDO:') || !obj.startsWith('MONDO:')) continue;
    if (!parents[sub]) parents[sub] = [];
    parents[sub].push(obj);
    isAEdgeCount++;
  }

  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ✓ parsed in ${elapsedSec}s`);
  console.log(`    Mondo nodes:           ${mondoNodeCount}`);
  console.log(`    Label entries:         ${Object.keys(labels).length}`);
  console.log(`    Exact synonyms:        ${synonymCount}`);
  console.log(`    Label collisions:      ${labelCollisions.length}  (first-write-wins; diagnostic only)`);
  console.log(`    IS_A edges:            ${isAEdgeCount}`);
  console.log(`    OMIM xrefs:            ${xrefCount}`);
  console.log(`    MONDO nodes w/ OMIM:   ${Object.keys(omimXrefs).length}`);

  return { labels, labelCollisions, parents, omimXrefs };
}

// ===== Output =====

function buildMetadata(extra = {}) {
  return {
    builtAt: new Date().toISOString(),
    mondoSourceUrl: MONDO_JSON_URL,
    mondoSha256: sha256OfFile(RAW_PATH),
    ...extra,
  };
}

function writeLabels(labels, labelCollisions) {
  mkdirSync(GRADING_DIR, { recursive: true });
  const payload = {
    _metadata: buildMetadata({
      description:
        'Maps normalized label or hasExactSynonym → MONDO id. Built from primary rdfs:label and oboInOwl:hasExactSynonym only (NOT hasRelatedSynonym). Used by the v4 grader Stage A (deterministic grounding).',
      collisionCount: labelCollisions.length,
      collisionsSample: labelCollisions.slice(0, 20),
    }),
    entries: labels,
  };
  writeFileSync(LABELS_PATH, JSON.stringify(payload));
  const sizeMB = (statSync(LABELS_PATH).size / (1024 * 1024)).toFixed(2);
  console.log(`  ✓ wrote ${LABELS_PATH} (${sizeMB} MB)`);
}

function writeGraph(parents, omimXrefs) {
  const payload = {
    _metadata: buildMetadata({
      description:
        'Mondo IS_A adjacency (parents) + OMIM skos:exactMatch xrefs. Offline-only — used by build-credited-sets.mjs to compute creditedSetPartial via ancestor BFS. NEVER load this at runtime.',
    }),
    parents,
    omimXrefs,
  };
  writeFileSync(GRAPH_PATH, JSON.stringify(payload));
  const sizeMB = (statSync(GRAPH_PATH).size / (1024 * 1024)).toFixed(2);
  console.log(`  ✓ wrote ${GRAPH_PATH} (${sizeMB} MB)`);
}

// ===== Main =====

async function main() {
  console.log('Building Mondo assets for the v4 grader.');
  console.log('=========================================');
  await downloadMondoIfNeeded();
  const { labels, labelCollisions, parents, omimXrefs } = parseMondo();
  writeLabels(labels, labelCollisions);
  writeGraph(parents, omimXrefs);
  console.log('');
  console.log('Done. Next step: node scripts/build-credited-sets.mjs');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
