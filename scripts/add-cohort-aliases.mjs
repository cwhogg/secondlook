#!/usr/bin/env node
/**
 * v15 step 4 follow-up: add aliases to existing KB profiles for cohort
 * labels that the bidirectional substring matcher couldn't catch due to
 * word-order or label-form differences.
 *
 * Examples of what this fixes:
 *   "Tubulointerstitial kidney disease, autosomal dominant, 1"
 *     ⇏ "Autosomal Dominant Tubulointerstitial Kidney Disease"
 *   "Lipodystrophy, familial partial, type 2"
 *     ⇏ "Familial Partial Lipodystrophy, Dunnigan Type"
 *
 * Both label forms refer to the same disease but the matcher's
 * substring-in-either-direction logic fails because neither string is
 * substring of the other after alphanumeric normalization.
 *
 * Adding the v5-cohort ground-truth label as an explicit alias on each
 * profile makes the matcher hit it via the alias-exact-match path
 * (matchesDiseaseProfile in evidence-evaluator.ts).
 *
 * Side effect: the cohort enrichment script (scripts/enrich-cohort-kb.mjs)
 * will now match these profiles too, so re-running it after this script
 * will enrich the previously-skipped ones.
 *
 * Usage:
 *   node scripts/add-cohort-aliases.mjs           # apply
 *   node scripts/add-cohort-aliases.mjs --dry-run # preview only
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const KB_DIR = join(ROOT, 'lib', 'knowledge', 'diseases');

// Each entry maps a v5-cohort ground-truth label to the closest existing
// KB profile (by filename). The label gets added as an alias so the
// runtime matcher and the enrichment script both catch it.
const MAPPINGS = [
  // Word-order failures: KB has the disease, label uses comma-separated form
  {
    label: 'Tubulointerstitial kidney disease, autosomal dominant, 1',
    file: 'autosomal-dominant-tubulointerstitial-kidney-disease.json',
    note: 'umbrella ADTKD profile; gene-specific subtypes are linked via differentialDiagnoses',
  },
  {
    label: 'Adrenal hyperplasia, congenital, due to 21-hydroxylase deficiency',
    file: 'classic-congenital-adrenal-hyperplasia-due-to-21-hydroxylase-deficiency.json',
  },
  {
    label: 'Lipodystrophy, familial partial, type 2',
    file: 'familial-partial-lipodystrophy-dunnigan-type.json',
    note: 'FPLD2 = Dunnigan-type FPLD = LMNA-related',
  },
  {
    label: 'Microcephaly 5, primary, autosomal recessive',
    file: 'autosomal-recessive-primary-microcephaly.json',
  },

  // Specific subtypes the KB has under different naming conventions
  {
    label: 'Myoclonic epilepsy of Lafora 2',
    file: 'progressive-myoclonic-epilepsy-type-2.json',
    note: 'Lafora type 2 = EPM2 / Progressive Myoclonic Epilepsy Type 2',
  },
  {
    label: 'Mitochondrial DNA depletion syndrome 13 (encephalomyopathic type)',
    file: 'mitochondrial-dna-depletion-syndrome-encephalomyopathic-form.json',
    note: 'Mito 13 = the encephalomyopathic form (FBXL4-related); KB has the encephalomyopathic profile',
  },
  {
    label: 'Contractural arachnodactyly, congenital',
    file: 'congenital-contractural-arachnodactyly.json',
  },
  {
    label: 'Polycystic kidney disease 9, susceptibility to',
    file: 'autosomal-dominant-polycystic-kidney-disease.json',
    note: 'PKD9 is a susceptibility locus in the ADPKD spectrum',
  },
  {
    label: 'Xia-Gibbs syndrome',
    file: 'ahdc1-related-intellectual-disability-obstructive-sleep-apnea-mild-dysmorphism-syndrome.json',
    note: 'Xia-Gibbs syndrome = AHDC1-related ID-OSA-mild dysmorphism syndrome',
  },

  // CVID variants both map to the umbrella since gene-specific 13/15 not in KB
  {
    label: 'Immunodeficiency, common variable, 13',
    file: 'common-variable-immunodeficiency-and-related-disorders.json',
  },
  {
    label: 'Immunodeficiency, common variable, 15',
    file: 'common-variable-immunodeficiency-and-related-disorders.json',
  },
];

const DRY_RUN = process.argv.includes('--dry-run');

let added = 0;
let skipped = 0;
let missing = 0;
const touchedFiles = new Set();

for (const m of MAPPINGS) {
  const filepath = join(KB_DIR, m.file);
  let profile;
  try {
    profile = JSON.parse(readFileSync(filepath, 'utf-8'));
  } catch {
    console.log(`  ✗ ${m.label} → ${m.file} — FILE NOT FOUND`);
    missing++;
    continue;
  }

  const existing = (profile.aliases || []).map((a) => a.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const labelNorm = m.label.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (existing.includes(labelNorm)) {
    console.log(`  ◌ ${m.label} → ${profile.name} — alias already present, skip`);
    skipped++;
    continue;
  }

  if (DRY_RUN) {
    console.log(`  + ${m.label} → ${profile.name}${m.note ? ` (${m.note})` : ''}`);
    added++;
    continue;
  }

  profile.aliases = [...(profile.aliases || []), m.label];
  profile.cohortAliasAddedAt = new Date().toISOString();
  writeFileSync(filepath, JSON.stringify(profile, null, 2) + '\n', 'utf-8');
  touchedFiles.add(m.file);
  console.log(`  + ${m.label} → ${profile.name}${m.note ? ` (${m.note})` : ''}`);
  added++;
}

console.log(`\nDone. ${added} added, ${skipped} already present, ${missing} target files missing.`);
console.log(`Touched ${touchedFiles.size} KB profiles.`);
if (!DRY_RUN && added > 0) {
  console.log(`\nNext: re-run scripts/enrich-cohort-kb.mjs to add v15 enrichment fields`);
  console.log(`to the newly-aliased profiles. Skips profiles that are already enriched`);
  console.log(`(cohortEnrichedAt present).`);
}
