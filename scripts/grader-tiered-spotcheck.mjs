#!/usr/bin/env node
/**
 * Spot-check the tiered grader logic by calling Anthropic directly.
 * Bypasses the HTTP endpoint to avoid Next.js dev cache issues during build.
 * Validates: prompt design + tier rubric + JSON parsing.
 */

import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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

const GRADER_SYSTEM_PROMPT = `You are a senior clinical geneticist with deep expertise across rare-disease nosology, gene-based naming conventions, eponyms, and historical disease classifications. You are grading an automated diagnostic system by comparing its ranked differential diagnosis against a ground-truth disease label.

For EACH ENTRY in the engine's ranked list, assign exactly one tier from this rubric:

EXACT — Same disease entity as the ground truth. Accept all of:
  • Synonyms ("Beals syndrome" = "Congenital contractural arachnodactyly")
  • Eponyms vs descriptive ("Parkinson's disease" = "Parkinson disease")
  • Gene-based vs phenotype-based ("UMOD-related ADTKD" = "Familial juvenile hyperuricemic nephropathy")
  • Modern vs historical naming
  • Punctuation/spacing/case variants
  • Adding clarifying parentheticals to the same disease (e.g., engine says
    "Neurofibromatosis Type 1 (NF1, von Recklinghausen disease)" — this is
    EXACT for ground truth "Neurofibromatosis type 1")
  The two strings refer to the same OMIM/Orphanet entity.

VARIANT — Engine names the parent UMBRELLA when the ground truth is a numbered
  subtype of that umbrella. Examples:
  • Engine "CVID" / ground truth "CVID-15" → VARIANT
  • Engine "Mitochondrial DNA depletion syndrome" / truth "Mito DNA Depletion 13" → VARIANT
  • Engine "Cornelia de Lange syndrome" / truth "CdLS-1" → VARIANT
  • Engine "ADTKD" / truth "ADTKD-1" → VARIANT
  This tier accepts the umbrella regardless of whether the case data supports
  specifying the subtype. The engine has identified the correct broader
  disease entity.

FAMILY — Engine names a DIFFERENT numbered/named member of the same parent
  disease as the ground truth. Both are specific subtypes of the same umbrella,
  but the engine picked the wrong one. Examples:
  • Engine "ADTKD-MUC1" / truth "ADTKD-UMOD" → FAMILY (both named members of ADTKD)
  • Engine "Mito DNA depletion 12" / truth "Mito DNA depletion 13" → FAMILY
  • Engine "CVID-13" / truth "CVID-15" → FAMILY
  This is NOT umbrella vs subtype — both engine output and ground truth are
  specific subtypes within the same parent disease.

SIBLING — Different disease in the same broad clinical category. Closely
  related phenotypically or by management but distinct disease entities not
  in the same parent disease family. Examples:
  • "Legius syndrome" / "Neurofibromatosis type 1" → SIBLING (different gene,
    different disease, closely-related phenotype)
  • "Unverricht-Lundborg disease (EPM1)" / "Lafora disease (EPM2)" → SIBLING
    (both PMEs, different genes, different diseases)
  • "22q11.2 deletion syndrome" / "SATB2-associated syndrome" → SIBLING
    (both neurodev, different gene, distinct disease entity)
  Use SIBLING when the diseases are clinically related but each has its own
  OMIM/Orphanet entity and they aren't variants of a shared parent.

UNRELATED — Different disease entirely. The engine's pick has no diagnostic
  relationship to the ground truth.

OUTPUT REQUIREMENTS:
- Return a tier for EVERY entry in the ranked list, in order.
- Each entry gets a brief one-sentence reasoning citing what placed it in
  that tier (e.g., "Same disease, accepted synonym" or "Wrong member of
  ADTKD family — engine said MUC1, truth is UMOD").
- Do NOT consider how confident the engine seemed or any clinical reasoning
  it provided. ONLY judge the diagnosis name itself against the ground truth.
- Be strict about FAMILY vs SIBLING: if the two diseases aren't both numbered
  members of the same parent umbrella, they are SIBLING at most, not FAMILY.

Return as JSON with no markdown fences.`;

async function grade(groundTruth, diagnoses) {
  const userPrompt = `GROUND TRUTH: ${groundTruth}

ENGINE'S RANKED DIFFERENTIAL (top ${diagnoses.length}):
${diagnoses.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Assign a tier (EXACT, VARIANT, FAMILY, SIBLING, or UNRELATED) to EACH entry
above against the ground truth.

Return as a single JSON object exactly matching this shape (no markdown fence, no surrounding prose):
{
  "entries": [
    { "position": 1, "engineOutput": "<verbatim>", "tier": "EXACT|VARIANT|FAMILY|SIBLING|UNRELATED", "reasoning": "<one-sentence>" }
  ],
  "graderConfidence": "high|medium|low",
  "graderNotes": "<optional brief note>"
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
  return { ...parsed, _dur: dur, _tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) };
}

const CASES = [
  {
    name: 'NF1 EXACT (verbose form)',
    groundTruth: 'Neurofibromatosis, type 1',
    diagnoses: ['Neurofibromatosis Type 1 (NF1, von Recklinghausen disease)'],
    expectedTier1: 'EXACT',
  },
  {
    name: 'NF1 SIBLING (Legius)',
    groundTruth: 'Neurofibromatosis, type 1',
    diagnoses: ['Legius Syndrome (SPRED1-related Neurofibromatosis type 1-like syndrome)'],
    expectedTier1: 'SIBLING',
  },
  {
    name: 'CVID-15 VARIANT (umbrella)',
    groundTruth: 'Immunodeficiency, common variable, 15',
    diagnoses: ['Common Variable Immunodeficiency (CVID)'],
    expectedTier1: 'VARIANT',
  },
  {
    name: 'ADTKD-1 EXACT (modern name)',
    groundTruth: 'Tubulointerstitial kidney disease, autosomal dominant, 1',
    diagnoses: ['Uromodulin-associated kidney disease (UMOD-ADTKD)'],
    expectedTier1: 'EXACT',
  },
  {
    name: 'Short QT 3 VARIANT (SQT1-6 umbrella)',
    groundTruth: 'Short QT syndrome 3',
    diagnoses: ['Congenital Short QT Syndrome (SQTS, SQT1-6)'],
    expectedTier1: 'VARIANT',
  },
  {
    name: 'Mito 13 EXACT (canonical)',
    groundTruth: 'Mitochondrial DNA depletion syndrome 13 (encephalomyopathic type)',
    diagnoses: ['Mitochondrial DNA Depletion Syndrome 13, Encephalomyopathic (FBXL4-related)'],
    expectedTier1: 'EXACT',
  },
  {
    name: 'Lafora 2 SIBLING (Unverricht-Lundborg)',
    groundTruth: 'Myoclonic epilepsy of Lafora 2',
    diagnoses: ['Unverricht-Lundborg Disease (EPM1)'],
    expectedTier1: 'SIBLING',
  },
  {
    name: 'ADTKD FAMILY (MUC1 vs UMOD)',
    groundTruth: 'Tubulointerstitial kidney disease, autosomal dominant, 1',
    diagnoses: ['MUC1-related Autosomal Dominant Tubulointerstitial Kidney Disease'],
    expectedTier1: 'FAMILY',
  },
  {
    name: 'Parkinson VARIANT (umbrella → PARK26)',
    groundTruth: 'Parkinson disease 26, autosomal dominant, susceptibility to',
    diagnoses: ["Parkinson's disease"],
    expectedTier1: 'VARIANT',
  },
  {
    name: 'Top-3 list — EXACT at pos 3',
    groundTruth: 'Neurofibromatosis, type 1',
    diagnoses: [
      'Legius Syndrome (SPRED1-related)',
      'Watson Syndrome (Neurofibromatosis-Noonan)',
      'Neurofibromatosis Type 1 (NF1)',
    ],
    expectedAt: { 1: 'SIBLING', 2: 'SIBLING', 3: 'EXACT' },
  },
];

let pass = 0, fail = 0, totalTokens = 0;

for (const c of CASES) {
  console.log(`\n[${c.name}]`);
  console.log(`  GT: "${c.groundTruth}"`);
  for (let i = 0; i < c.diagnoses.length; i++) console.log(`  #${i + 1}: "${c.diagnoses[i]}"`);

  try {
    const r = await grade(c.groundTruth, c.diagnoses);
    totalTokens += r._tokens;
    for (const e of r.entries) {
      console.log(`  → #${e.position} ${e.tier.padEnd(10)} ${(e.reasoning || '').slice(0, 100)}`);
    }
    console.log(`  → confidence: ${r.graderConfidence}  (${r._tokens} tokens, ${(r._dur / 1000).toFixed(1)}s)`);

    let ok = true;
    if (c.expectedTier1) {
      const actual = r.entries[0]?.tier;
      if (actual !== c.expectedTier1) {
        console.log(`  ⚠ EXPECTED #1=${c.expectedTier1}, got ${actual}`);
        ok = false;
      }
    }
    if (c.expectedAt) {
      for (const pos of Object.keys(c.expectedAt)) {
        const e = r.entries.find((e) => String(e.position) === pos);
        if (!e || e.tier !== c.expectedAt[pos]) {
          console.log(`  ⚠ EXPECTED #${pos}=${c.expectedAt[pos]}, got ${e?.tier}`);
          ok = false;
        }
      }
    }
    if (ok) { pass++; console.log(`  ✓ PASS`); }
    else { fail++; console.log(`  ✗ FAIL`); }
  } catch (e) {
    fail++;
    console.log(`  ✗ ERROR: ${e.message}`);
  }
}

const estCost = (totalTokens / 1000000) * 18; // rough Claude opus 4.7 mixed in+out
console.log(`\n=== Summary ===`);
console.log(`Passed: ${pass} / ${CASES.length}`);
console.log(`Failed: ${fail} / ${CASES.length}`);
console.log(`Total tokens: ${totalTokens}  Estimated cost: $${estCost.toFixed(3)}`);
