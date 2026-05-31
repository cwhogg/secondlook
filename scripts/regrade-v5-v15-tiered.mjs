#!/usr/bin/env node
/**
 * Retroactively re-grade v5 and v15 testCases with the tiered v3 grader.
 *
 * Reads existing testCases from KV, runs the Claude grader on
 * (groundTruth, top-10 differential), writes back tieredGrading via the
 * existing test-cases upsert endpoint.
 *
 * Does NOT re-run any analysis LLM calls — pure grader pass.
 *
 * Cost estimate: ~250 testCases × $0.035 ≈ ~$10
 * Wall time: ~30-45 min (rate-limit dependent)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... node scripts/regrade-v5-v15-tiered.mjs
 *   --version v5    (only v5)
 *   --version v15   (only v15)
 *   --version v5,v15 (default, both)
 *   --skip-existing (skip testCases that already have tieredGrading)
 *   --dry-run       (preview only)
 *   --limit N       (process at most N testCases)
 */

import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:3002';

if (!process.env.ANTHROPIC_API_KEY) {
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

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const versionIdx = args.indexOf('--version');
const VERSIONS = versionIdx >= 0
  ? args[versionIdx + 1].split(',').map((s) => s.trim()).filter(Boolean)
  : ['v5', 'v15'];

const GRADER_SYSTEM_PROMPT = `You are a senior clinical geneticist with deep expertise across rare-disease nosology, gene-based naming conventions, eponyms, and historical disease classifications. You are grading an automated diagnostic system by comparing its ranked differential diagnosis against a ground-truth disease label.

For EACH ENTRY in the engine's ranked list, assign exactly one tier from this rubric:

EXACT — Same disease entity as the ground truth. Accept all of:
  • Synonyms ("Beals syndrome" = "Congenital contractural arachnodactyly")
  • Eponyms vs descriptive ("Parkinson's disease" = "Parkinson disease")
  • Gene-based vs phenotype-based ("UMOD-related ADTKD" = "Familial juvenile hyperuricemic nephropathy")
  • Modern vs historical naming
  • Punctuation/spacing/case variants
  • Adding clarifying parentheticals to the same disease
  The two strings refer to the same OMIM/Orphanet entity.

VARIANT — Engine names the parent UMBRELLA when the ground truth is a numbered
  subtype of that umbrella. Examples:
  • Engine "CVID" / ground truth "CVID-15" → VARIANT
  • Engine "Mitochondrial DNA depletion syndrome" / truth "Mito DNA Depletion 13" → VARIANT
  • Engine "Cornelia de Lange syndrome" / truth "CdLS-1" → VARIANT
  • Engine "ADTKD" / truth "ADTKD-1" → VARIANT
  The engine has identified the correct broader disease entity.

FAMILY — Engine names a DIFFERENT numbered/named member of the same parent
  disease as the ground truth. Both are specific subtypes of the same umbrella,
  but the engine picked the wrong one. Examples:
  • Engine "ADTKD-MUC1" / truth "ADTKD-UMOD" → FAMILY
  • Engine "Mito DNA depletion 12" / truth "Mito DNA depletion 13" → FAMILY
  • Engine "CVID-13" / truth "CVID-15" → FAMILY

SIBLING — Different disease in the same broad clinical category. Closely
  related phenotypically or by management but distinct disease entities not
  in the same parent disease family. Examples:
  • "Legius syndrome" / "Neurofibromatosis type 1" → SIBLING
  • "Unverricht-Lundborg disease (EPM1)" / "Lafora disease (EPM2)" → SIBLING
  • "22q11.2 deletion syndrome" / "SATB2-associated syndrome" → SIBLING

UNRELATED — Different disease entirely.

OUTPUT REQUIREMENTS:
- Return a tier for EVERY entry in the ranked list, in order.
- Each entry gets a brief one-sentence reasoning.
- ONLY judge the diagnosis name itself against the ground truth.

Return as JSON with no markdown fences.`;

function tierToScore(tier) {
  return { EXACT: 4, VARIANT: 3, FAMILY: 2, SIBLING: 1, UNRELATED: 0 }[tier] ?? -1;
}

function computeRankAtThreshold(entries, minScore) {
  for (const e of entries) {
    if (tierToScore(e.tier) >= minScore) return e.position;
  }
  return null;
}

async function gradeOne(groundTruth, diagnoses) {
  const userPrompt = `GROUND TRUTH: ${groundTruth}

ENGINE'S RANKED DIFFERENTIAL (top ${diagnoses.length}):
${diagnoses.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Assign a tier to EACH entry above.

Return as a single JSON object exactly matching this shape (no markdown fence):
{
  "entries": [
    { "position": 1, "engineOutput": "<verbatim>", "tier": "EXACT|VARIANT|FAMILY|SIBLING|UNRELATED", "reasoning": "<one-sentence>" }
  ],
  "graderConfidence": "high|medium|low",
  "graderNotes": "<optional>"
}`;

  const start = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 8000,
      system: GRADER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const dur = Date.now() - start;
  if (!res.ok) {
    throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('') || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fence) parsed = JSON.parse(fence[1]);
    else throw new Error('non-JSON response: ' + text.slice(0, 200));
  }

  const validTiers = ['EXACT', 'VARIANT', 'FAMILY', 'SIBLING', 'UNRELATED'];
  const entries = (parsed.entries || [])
    .filter((e) => typeof e.position === 'number' && validTiers.includes(e.tier))
    .map((e) => ({ position: e.position, engineOutput: e.engineOutput || '', tier: e.tier, reasoning: e.reasoning || '' }))
    .sort((a, b) => a.position - b.position);

  if (entries.length === 0) throw new Error('grader produced no valid entries');

  const rankAtExact = computeRankAtThreshold(entries, tierToScore('EXACT'));
  const rankAtVariant = computeRankAtThreshold(entries, tierToScore('VARIANT'));
  const rankAtFamily = computeRankAtThreshold(entries, tierToScore('FAMILY'));
  const rankAtAny = computeRankAtThreshold(entries, tierToScore('SIBLING'));

  return {
    gradingVersion: 'v3',
    entries,
    rankAtExact,
    rankAtVariant,
    rankAtFamily,
    rankAtAny,
    isTop1: rankAtVariant === 1,
    gradingModel: 'claude-opus-4-7',
    gradingDurationMs: dur,
    gradingTokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    graderConfidence: parsed.graderConfidence,
    graderNotes: parsed.graderNotes,
    gradedAt: new Date().toISOString(),
  };
}

// Fetch all testCases
console.log('Fetching testCases from', BASE);
const tcRes = await fetch(`${BASE}/api/admin/test-cases`);
if (!tcRes.ok) {
  console.error(`Failed to fetch testCases: ${tcRes.status}`);
  process.exit(1);
}
const tcData = await tcRes.json();
const all = tcData.testCases || [];

// Filter to candidates
const candidates = all.filter((tc) => {
  if (tc.testVersion !== 'Eval') return false;
  if (!VERSIONS.includes(tc.evalVersion)) return false;
  if (tc.status !== 'graded') return false;
  if (!tc.pipelineResult?.differentialDiagnoses?.length) return false;
  if (!tc.groundTruth?.diagnosis) return false;
  if (SKIP_EXISTING && tc.tieredGrading) return false;
  return true;
});

console.log(`Found ${candidates.length} testCases to regrade (versions: ${VERSIONS.join(',')})`);
if (LIMIT < Infinity) console.log(`Limiting to ${LIMIT}`);

const targets = candidates.slice(0, LIMIT);

if (DRY_RUN) {
  console.log('\nDry run — first 5 candidates:');
  for (const tc of targets.slice(0, 5)) {
    console.log(`  ${tc.id.slice(0, 50)}  ${tc.evalVersion} ${tc.evalRunMode}  dx="${tc.groundTruth.diagnosis.slice(0, 50)}"`);
  }
  console.log(`\nTotal would process: ${targets.length}`);
  process.exit(0);
}

let completed = 0;
let failed = 0;
let totalTokens = 0;
const startWall = Date.now();
const upsertBatch = [];
const BATCH_SIZE = 5; // upsert in small batches to keep KV writes fast

async function flushBatch() {
  if (upsertBatch.length === 0) return;
  const res = await fetch(`${BASE}/api/admin/test-cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upsert: upsertBatch }),
  });
  if (!res.ok) {
    console.error(`Batch upsert failed: ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  upsertBatch.length = 0;
}

for (const tc of targets) {
  const diagNames = tc.pipelineResult.differentialDiagnoses.slice(0, 10).map((d) => d.diagnosis);
  process.stdout.write(`[${completed + failed + 1}/${targets.length}] ${tc.evalVersion} ${tc.evalRunMode} ${tc.categoryHint?.slice(0, 35).padEnd(35) || '?'} ... `);
  try {
    const tiered = await gradeOne(tc.groundTruth.diagnosis, diagNames);
    totalTokens += tiered.gradingTokensUsed;
    completed++;
    console.log(`✓ E=${tiered.rankAtExact} V=${tiered.rankAtVariant} F=${tiered.rankAtFamily} (${tiered.gradingTokensUsed}t)`);

    // Queue upsert with the testCase shape merged with tieredGrading
    upsertBatch.push({ ...tc, tieredGrading: tiered });
    if (upsertBatch.length >= BATCH_SIZE) await flushBatch();
  } catch (e) {
    failed++;
    console.log(`✗ ${e.message.slice(0, 100)}`);
  }
}

await flushBatch();

const elapsedMin = ((Date.now() - startWall) / 60000).toFixed(1);
const estCost = (totalTokens / 1000000) * 18;
console.log(`\nDone. ${completed} graded, ${failed} failed. ${totalTokens} tokens. $${estCost.toFixed(2)}. ${elapsedMin}min`);
