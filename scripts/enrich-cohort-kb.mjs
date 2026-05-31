#!/usr/bin/env node
/**
 * v15 step 4: targeted KB enrichment for the v5 cohort diseases.
 *
 * For the ~34 unique diseases in the v5 cohort (and where the KB has a
 * matching profile), call gpt-4.1 to generate three structured fields:
 *
 *   - commonPitfalls: clinical traps and common misdiagnoses
 *   - extendedDiscriminators: disease-pair-specific discriminating features
 *     beyond what differentialDiagnoses already lists
 *   - ruleOutCriteria: findings whose presence essentially excludes this dx
 *
 * Writes the fields back to the JSON profile under lib/knowledge/diseases/.
 * The synthesizer (v15 step 3) already looks for these fields and surfaces
 * them per hypothesis when present.
 *
 * One-time cost estimate: ~34 diseases × 1 call × gpt-4.1 ≈ $1-3 total.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/enrich-cohort-kb.mjs
 *   OPENAI_API_KEY=sk-... node scripts/enrich-cohort-kb.mjs --dry-run
 *   OPENAI_API_KEY=sk-... node scripts/enrich-cohort-kb.mjs --only "Neurofibromatosis Type 1"
 *
 * Env loading: reads .env.local if OPENAI_API_KEY isn't already set.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const KB_DIR = join(ROOT, 'lib', 'knowledge', 'diseases');

// Load .env.local if needed
if (!process.env.OPENAI_API_KEY) {
  try {
    const envText = readFileSync(join(ROOT, '.env.local'), 'utf-8');
    for (const line of envText.split('\n')) {
      const trim = line.trim();
      if (!trim || trim.startsWith('#')) continue;
      const eq = trim.indexOf('=');
      if (eq === -1) continue;
      const key = trim.slice(0, eq).trim();
      let val = trim.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY (set env var or add to .env.local)');
  process.exit(1);
}

// v5 cohort disease names pulled from the existing v5 testCases. These are
// ground-truth labels — they may not match KB-profile canonical names
// exactly; the fuzzy matcher below handles variants.
const COHORT_DISEASES = [
  'Neurofibromatosis, type 1',
  'Developmental and epileptic encephalopathy 4',
  'Marfan syndrome',
  'Glass syndrome',
  'Xia-Gibbs syndrome',
  'Mitochondrial DNA depletion syndrome 13 (encephalomyopathic type)',
  'Cornelia de Lange syndrome 1',
  'Tubulointerstitial kidney disease, autosomal dominant, 1',
  'Kabuki syndrome 2',
  'Lipodystrophy, familial partial, type 2',
  'Short QT syndrome 3',
  'Ververi-Brady syndrome 2',
  'Microcephaly 5, primary, autosomal recessive',
  'Oocyte/zygote/embryo maturation arrest 23',
  'Dursun-Ozgul neurodevelopmental syndrome',
  'Spinocerebellar ataxia 29, congenital nonprogressive',
  'Spastic paraplegia 93, autosomal recessive',
  'Greig cephalopolysyndactyly syndrome',
  'Contractural arachnodactyly, congenital',
  'Immunodeficiency 131',
  'Developmental and epileptic encephalopathy 112',
  'Amelogenesis imperfecta, type IJ',
  'Anemia, sideroblastic, and spinocerebellar ataxia',
  'Optic atrophy 12',
  'Immunodeficiency, common variable, 15',
  'Glycogen storage disease VI',
  'Myoclonic epilepsy of Lafora 2',
  'Immunodeficiency, common variable, 13',
  'Inosine triphosphatase deficiency',
  'Neurodevelopmental disorder with hypotonia and characteristic brain abnormalities',
  'Adrenal hyperplasia, congenital, due to 21-hydroxylase deficiency',
  'Intellectual developmental disorder with autism and macrocephaly',
  'Parkinson disease 26, autosomal dominant, susceptibility to',
  'Polycystic kidney disease 9, susceptibility to',
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Bidirectional-substring matcher mirroring matchesDiseaseProfile in
// lib/agents/evidence-evaluator.ts (kept aligned so the runtime and the
// enrichment script have the same notion of "matches the KB profile").
function matches(diagNormalized, profile) {
  const nameNorm = norm(profile.name);
  if (diagNormalized === nameNorm) return true;
  if (diagNormalized.includes(nameNorm) || nameNorm.includes(diagNormalized)) return true;
  for (const a of profile.aliases || []) {
    const an = norm(a);
    if (an === diagNormalized || an.includes(diagNormalized) || diagNormalized.includes(an)) return true;
  }
  if (profile.id && profile.id.replace(/-/g, '') === diagNormalized) return true;
  return false;
}

console.log('Loading KB...');
const files = readdirSync(KB_DIR).filter((f) => f.endsWith('.json'));
const db = files.map((f) => {
  const p = JSON.parse(readFileSync(join(KB_DIR, f), 'utf-8'));
  return { file: f, profile: p };
});
console.log(`Loaded ${db.length} KB profiles`);

// Resolve each cohort name to a KB profile (or null if no match)
const resolutions = [];
for (const cohortName of COHORT_DISEASES) {
  const dn = norm(cohortName);
  let hit = db.find((e) => norm(e.profile.name) === dn);
  if (!hit) hit = db.find((e) => (e.profile.aliases || []).some((a) => norm(a) === dn));
  if (!hit) hit = db.find((e) => {
    const en = norm(e.profile.name);
    return en.length >= 12 && (en.includes(dn) || dn.includes(en));
  });
  resolutions.push({ cohortName, file: hit?.file || null, profileName: hit?.profile.name || null });
}

const matched = resolutions.filter((r) => r.file !== null);
const unmatched = resolutions.filter((r) => r.file === null);

console.log(`\nMatched: ${matched.length} / ${COHORT_DISEASES.length}`);
for (const r of matched) console.log(`  ✓ ${r.cohortName} → ${r.profileName}`);
console.log(`\nUnmatched (no KB profile, will skip):`);
for (const r of unmatched) console.log(`  ✗ ${r.cohortName}`);

if (ONLY) {
  console.log(`\nFiltering to --only "${ONLY}"`);
}

// Skip profiles already enriched in a prior run (cohortEnrichedAt present)
// so re-running after the alias-addition step only touches the newly-mapped
// profiles. Pass --force to re-enrich everything.
const FORCE = process.argv.includes('--force');
let prefilter = matched.filter((r) => !ONLY || norm(r.profileName).includes(norm(ONLY)) || norm(r.cohortName).includes(norm(ONLY)));
let skippedAlreadyEnriched = 0;
if (!FORCE) {
  prefilter = prefilter.filter((r) => {
    const fp = JSON.parse(readFileSync(join(KB_DIR, r.file), 'utf-8'));
    if (fp.cohortEnrichedAt) {
      skippedAlreadyEnriched++;
      return false;
    }
    return true;
  });
}
const targets = prefilter;
console.log(`\nWill enrich ${targets.length} profile(s)${skippedAlreadyEnriched ? ` (skipped ${skippedAlreadyEnriched} already enriched; pass --force to re-enrich)` : ''} ${DRY_RUN ? '(dry-run)' : ''}`);

if (DRY_RUN) {
  console.log('\nDry run — no API calls made. Re-run without --dry-run to enrich.');
  process.exit(0);
}

const SYS_PROMPT = `You are a senior clinical diagnostician with subspecialty expertise across rare disease medicine. You are augmenting an automated diagnostic system's knowledge base with structured discriminator data that the system can present to a downstream synthesizer when this disease appears in a candidate pool.

Produce ONLY accurate, well-established clinical facts. If a field is genuinely unclear or you would be guessing, leave it empty rather than fabricating.

OUTPUT STRICTLY:
- commonPitfalls: 3-5 short statements about how this disease is commonly misdiagnosed or where clinicians miss it. Examples: "Commonly misdiagnosed as primary hyperparathyroidism because of the secondary HPT trap," "Lisch nodules require slit-lamp examination — easily missed on routine ophthalmologic exam."
- extendedDiscriminators: 3-5 entries, each comparing this disease against a specific frequently-confused alternative. Each entry has vsCondition (the alternative) and feature (the specific finding that distinguishes them).
- ruleOutCriteria: 2-4 statements describing findings whose presence essentially excludes this disease. Use only true ruleouts, not weak negative evidence.

Do not invent diseases or features. Cite well-established clinical knowledge only.`;

async function enrichOne(target) {
  const filepath = join(KB_DIR, target.file);
  const profile = JSON.parse(readFileSync(filepath, 'utf-8'));

  const userPrompt = `Disease: ${profile.name}
Aliases: ${(profile.aliases || []).join(', ') || 'none'}
ICD-10: ${(profile.icd10Codes || []).join(', ') || 'none'}
OMIM: ${profile.omimId || 'none'}
Existing differential diagnoses already in KB: ${(profile.differentialDiagnoses || []).map((d) => d.diseaseId).join(', ') || 'none'}

Generate the three enrichment fields.`;

  const body = {
    model: 'gpt-4.1',
    temperature: 0.2,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: SYS_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'emit_enrichment',
          parameters: {
            type: 'object',
            properties: {
              commonPitfalls: {
                type: 'array',
                items: { type: 'string' },
                minItems: 3,
                maxItems: 5,
              },
              extendedDiscriminators: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    vsCondition: { type: 'string' },
                    feature: { type: 'string' },
                  },
                  required: ['vsCondition', 'feature'],
                },
                minItems: 3,
                maxItems: 5,
              },
              ruleOutCriteria: {
                type: 'array',
                items: { type: 'string' },
                minItems: 2,
                maxItems: 4,
              },
            },
            required: ['commonPitfalls', 'extendedDiscriminators', 'ruleOutCriteria'],
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'emit_enrichment' } },
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error('No tool call in response');
  const enrichment = JSON.parse(toolCall.function.arguments);

  // Validate shape
  if (!Array.isArray(enrichment.commonPitfalls)) throw new Error('Missing commonPitfalls');
  if (!Array.isArray(enrichment.extendedDiscriminators)) throw new Error('Missing extendedDiscriminators');
  if (!Array.isArray(enrichment.ruleOutCriteria)) throw new Error('Missing ruleOutCriteria');

  // Attach + write
  profile.commonPitfalls = enrichment.commonPitfalls;
  profile.extendedDiscriminators = enrichment.extendedDiscriminators;
  profile.ruleOutCriteria = enrichment.ruleOutCriteria;
  profile.cohortEnrichedAt = new Date().toISOString();

  writeFileSync(filepath, JSON.stringify(profile, null, 2) + '\n', 'utf-8');

  return {
    pitfalls: enrichment.commonPitfalls.length,
    discriminators: enrichment.extendedDiscriminators.length,
    ruleouts: enrichment.ruleOutCriteria.length,
    tokens: data.usage?.total_tokens || 0,
  };
}

let totalTokens = 0;
let completed = 0;
let failed = 0;
const start = Date.now();

for (const target of targets) {
  process.stdout.write(`Enriching ${target.profileName}... `);
  try {
    const stats = await enrichOne(target);
    totalTokens += stats.tokens;
    completed++;
    console.log(`done (${stats.pitfalls} pitfalls, ${stats.discriminators} discriminators, ${stats.ruleouts} ruleouts, ${stats.tokens} tokens)`);
  } catch (e) {
    failed++;
    console.log(`FAIL — ${e.message}`);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const estCost = (totalTokens / 1000000) * 5; // ~$5/M tokens for gpt-4.1 (rough)
console.log(`\nDone. ${completed} enriched, ${failed} failed, ${totalTokens} total tokens, ${elapsed}s, ~$${estCost.toFixed(2)} estimated cost`);
