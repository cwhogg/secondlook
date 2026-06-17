#!/usr/bin/env node
/**
 * Audit KB profile OrphaCodes against Orphanet's authoritative gene→disorder
 * map. Many KB profiles were AI-generated with guessed/incorrect orphanetIds,
 * causing the enrichment script (enrich-from-orphanet.js) to skip them or
 * pull data for the wrong condition. This audit:
 *
 *   1. Builds gene-symbol → OrphaCode map from en_product6.xml
 *   2. For each KB profile, extracts candidate gene symbols from the name
 *   3. Compares profile.orphanetId to what the gene symbol suggests
 *   4. Reports mismatches: AUTO_FIXABLE (single Orphanet entry per gene with
 *      strong name match), AMBIGUOUS (multiple candidates), or UNVERIFIABLE
 *      (no gene symbol in name).
 *
 * Class-wide. Never makes disease-specific judgments — operates only on the
 * extracted-gene-from-name signal that applies to thousands of KB profiles.
 *
 * Usage:
 *   node scripts/audit-orphanet-codes.mjs              # report only
 *   node scripts/audit-orphanet-codes.mjs --apply      # auto-fix unambiguous
 *   node scripts/audit-orphanet-codes.mjs --json out.json   # machine-readable
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = new URL('.', import.meta.url).pathname;
const ROOT = join(__dirname, '..');
const DISEASES_DIR = join(ROOT, 'lib/knowledge/diseases');
const ORPHA_GENES = join(ROOT, 'scripts/orphanet-data/en_product6.xml');

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const JSON_OUT = (() => {
  const i = ARGS.indexOf('--json');
  return i >= 0 ? ARGS[i + 1] : null;
})();

// ===== Build gene → [{orphacode, name}] map from en_product6.xml =====

function buildGeneMap() {
  console.log('Building gene → OrphaCode map from en_product6.xml ...');
  const xml = readFileSync(ORPHA_GENES, 'utf8');
  const map = new Map(); // geneSymbol → [{orphacode, name}]
  // Each <Disorder> block contains an OrphaCode, Name, and a DisorderGeneAssociationList
  // with one or more <Symbol> entries. Iterate disorders, then genes within.
  const disorderRe = /<Disorder id="\d+">([\s\S]*?)<\/Disorder>/g;
  let m;
  let disorderCount = 0;
  let assocCount = 0;
  while ((m = disorderRe.exec(xml)) !== null) {
    const block = m[1];
    const codeM = block.match(/<OrphaCode>(\d+)<\/OrphaCode>/);
    const nameM = block.match(/<Name lang="en">([^<]+)<\/Name>/);
    if (!codeM || !nameM) continue;
    const orphacode = codeM[1];
    const name = nameM[1].trim();
    disorderCount++;
    // Find all <Symbol>X</Symbol> entries inside DisorderGeneAssociationList
    const symRe = /<Symbol>([^<]+)<\/Symbol>/g;
    let s;
    while ((s = symRe.exec(block)) !== null) {
      const sym = s[1].trim();
      if (!map.has(sym)) map.set(sym, []);
      map.get(sym).push({ orphacode, name });
      assocCount++;
    }
  }
  console.log(`  ${disorderCount} disorders, ${map.size} unique gene symbols, ${assocCount} gene-disorder associations`);
  return map;
}

// ===== Extract candidate gene symbols from a profile name =====

const GENE_TOKEN_RE = /\b[A-Z][A-Z0-9]{1,6}(?:\d+[A-Z]*)?\b/g;
const COMMON_NON_GENE = new Set([
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
  'IA', 'IB', 'IC', 'ID', 'IE', 'IF', 'IIA', 'IIB', 'IIIA',
  'AD', 'AR', 'XL', 'OMIM', 'ORPHA', 'MIM', 'ICD', 'WHO', 'HPO', 'KB',
  'DNA', 'RNA', 'ATP', 'GTP', 'CSF', 'EEG', 'MRI', 'CT', 'PET', 'EKG',
  'USA', 'UK', 'EU', 'CDC', 'NIH', 'FDA',
]);

function extractGeneSymbols(name) {
  // Gene symbols by convention: 2-7 uppercase letters/digits.
  // Filter out roman numerals and other non-gene caps tokens.
  // Allow GENE-NUMBER patterns (e.g., FGFR3) too.
  const tokens = name.match(GENE_TOKEN_RE) || [];
  return tokens.filter((t) => {
    if (COMMON_NON_GENE.has(t)) return false;
    if (t.length < 2 || t.length > 8) return false;
    // Must have at least one letter
    if (!/[A-Z]/.test(t)) return false;
    // Must NOT be a roman numeral lookalike
    if (/^[IVX]+$/.test(t)) return false;
    return true;
  });
}

function disorderMatchesProfile(disorderName, profileName) {
  const a = disorderName.toLowerCase();
  const b = profileName.toLowerCase();
  // Crude: count overlapping >3-char tokens
  const t = (s) => new Set((s.match(/[a-z0-9]{4,}/g) || []));
  const ta = t(a);
  const tb = t(b);
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap;
}

// ===== Audit =====

function audit(geneMap) {
  const files = readdirSync(DISEASES_DIR).filter((f) => f.endsWith('.json'));
  const results = { autoFix: [], ambiguous: [], noGeneInName: [], orphanetIdAlreadyCorrect: [], noOrphanetId: [], unverifiable: [] };
  for (const f of files) {
    const path = join(DISEASES_DIR, f);
    let profile;
    try { profile = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
    const profileName = profile.name || '';
    const currentOrpha = profile.orphanetId ? String(profile.orphanetId).replace(/^ORPHA:?/, '') : null;
    const genes = extractGeneSymbols(profileName);
    if (genes.length === 0) {
      results.noGeneInName.push({ file: f, name: profileName, currentOrpha });
      continue;
    }
    // Find Orphanet candidates across all extracted gene symbols
    const candidates = [];
    for (const g of genes) {
      const hits = geneMap.get(g) || [];
      for (const h of hits) candidates.push({ ...h, geneSymbol: g });
    }
    if (candidates.length === 0) {
      results.unverifiable.push({ file: f, name: profileName, currentOrpha, genes });
      continue;
    }
    // Score each candidate by name overlap with profile
    candidates.forEach((c) => { c.overlap = disorderMatchesProfile(c.name, profileName); });
    candidates.sort((a, b) => b.overlap - a.overlap);
    const top = candidates[0];
    const tied = candidates.filter((c) => c.overlap === top.overlap);
    const correctOrpha = top.orphacode;
    if (currentOrpha === correctOrpha) {
      results.orphanetIdAlreadyCorrect.push({ file: f, name: profileName, currentOrpha });
      continue;
    }
    if (!currentOrpha) {
      // No stored orphanetId; we can populate it
      if (tied.length === 1 && top.overlap >= 2) {
        results.autoFix.push({ file: f, name: profileName, currentOrpha: '(none)', suggested: correctOrpha, suggestedName: top.name, gene: top.geneSymbol, overlap: top.overlap });
      } else {
        results.ambiguous.push({ file: f, name: profileName, currentOrpha: '(none)', candidates: candidates.slice(0, 5) });
      }
      continue;
    }
    // Has orphanetId, but it differs from gene-symbol-derived candidate
    if (tied.length === 1 && top.overlap >= 2) {
      results.autoFix.push({ file: f, name: profileName, currentOrpha, suggested: correctOrpha, suggestedName: top.name, gene: top.geneSymbol, overlap: top.overlap });
    } else {
      results.ambiguous.push({ file: f, name: profileName, currentOrpha, candidates: candidates.slice(0, 5) });
    }
  }
  return results;
}

// ===== Apply auto-fixes =====

function applyFixes(autoFix) {
  let applied = 0;
  for (const fix of autoFix) {
    const path = join(DISEASES_DIR, fix.file);
    const profile = JSON.parse(readFileSync(path, 'utf8'));
    profile.orphanetId = fix.suggested;
    profile.lastUpdated = new Date().toISOString().slice(0, 10);
    writeFileSync(path, JSON.stringify(profile, null, 2) + '\n');
    applied++;
  }
  return applied;
}

// ===== Main =====

function main() {
  const geneMap = buildGeneMap();
  const r = audit(geneMap);
  console.log('\n========= AUDIT REPORT =========');
  console.log(`  No gene symbol in profile name: ${r.noGeneInName.length}`);
  console.log(`  Gene symbol present but no Orphanet match: ${r.unverifiable.length}`);
  console.log(`  Already correct: ${r.orphanetIdAlreadyCorrect.length}`);
  console.log(`  AUTO-FIXABLE (gene matches single Orphanet entry, overlap ≥2): ${r.autoFix.length}`);
  console.log(`  AMBIGUOUS (multiple Orphanet candidates or weak match): ${r.ambiguous.length}`);
  console.log('================================\n');
  if (r.autoFix.length > 0) {
    console.log('Sample auto-fixable (first 15):');
    r.autoFix.slice(0, 15).forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.gene}: ${f.currentOrpha} → ${f.suggested}`);
      console.log(`     Profile: ${f.name}`);
      console.log(`     Orphanet: ${f.suggestedName}`);
    });
  }
  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify(r, null, 2));
    console.log(`\nFull report written to ${JSON_OUT}`);
  }
  if (APPLY) {
    console.log(`\n--apply: applying ${r.autoFix.length} fixes...`);
    const n = applyFixes(r.autoFix);
    console.log(`Applied ${n} fixes.`);
  } else {
    console.log('\n(Run with --apply to write corrections; --json <file> for full report.)');
  }
}

main();
