#!/usr/bin/env tsx
/**
 * v4 grader regrade-and-compare script.
 *
 * Run with:
 *   npx tsx scripts/grade-eval-v4.ts --eval-version v24
 *   npx tsx scripts/grade-eval-v4.ts --eval-version v22 --sampling standard50 --persist
 *
 * Re-scores an already-completed cohort using the paper-faithful Mondo
 * grading methodology (see lib/grading/mondo-match.ts). Reads cases from KV
 * via the existing /api/admin/test-cases endpoint, runs each pipeline's
 * differential through v4, and prints a side-by-side comparison with the
 * existing v3 numbers stored on each case. Optionally upserts v4Grading
 * back to KV (additive — never overwrites grading or tieredGrading).
 *
 * v4 is OPT-IN. v2 and v3 remain the default headline graders. This script
 * never runs as part of a normal eval flow.
 *
 * CLI flags:
 *   --eval-version v24            (required) filter cohort by evalVersion
 *   --sampling standard50         (default; pass empty string to disable)
 *   --persist                     write v4Grading back to KV
 *   --modes secondlook,openai,claude   (default all three)
 *   --limit N                     cap how many trios are graded
 *   --no-fuzzy                    disable Stage B fallback (faster, lower grounding rate)
 *   --dry-run                     preview targets; don't grade
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  gradeDifferentialV4,
  groundToMondo,
  type DifferentialInput,
  type FuzzyResolver,
  type GroundingOptions,
} from '../lib/grading/mondo-match.ts';
import type { TestCase, V4Grading } from '../lib/types/admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ===== CLI parsing =====

const argv = process.argv.slice(2);
function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}
function arg(name: string, fallback?: string): string | undefined {
  const idx = argv.findIndex((a) => a === `--${name}`);
  if (idx === -1 || idx === argv.length - 1) return fallback;
  return argv[idx + 1];
}

const EVAL_VERSION = arg('eval-version');
const SAMPLING_RAW = arg('sampling', 'standard50');
const SAMPLING = SAMPLING_RAW === '' ? undefined : SAMPLING_RAW;
const PERSIST = flag('persist');
const MODES = (arg('modes', 'secondlook,openai,claude') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean) as Array<'secondlook' | 'openai' | 'claude'>;
const LIMIT = parseInt(arg('limit', String(Number.MAX_SAFE_INTEGER)) || '', 10);
const USE_FUZZY = !flag('no-fuzzy');
const DRY_RUN = flag('dry-run');
const BASE = process.env.BASE_URL || 'https://secondlook.vercel.app';

if (!EVAL_VERSION) {
  console.error('FATAL: --eval-version is required (e.g. --eval-version v24)');
  process.exit(1);
}

// Load .env.local for the Anthropic key (mirrors regrade-v5-v15-tiered.mjs).
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const envText = readFileSync(join(ROOT, '.env.local'), 'utf8');
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
  } catch { /* file optional */ }
}

if (USE_FUZZY && !process.env.ANTHROPIC_API_KEY) {
  console.error('FATAL: ANTHROPIC_API_KEY required for fuzzy grounding (Stage B). Pass --no-fuzzy to skip.');
  process.exit(1);
}

// ===== Stage B Anthropic resolver =====

const FUZZY_MODEL = 'claude-haiku-4-5-20251001';
const FUZZY_TEMPERATURE = 0;

function buildResolver(): FuzzyResolver {
  return async (predictionText, shortlist) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    if (shortlist.length === 0) return null;

    // Constrained prompt: Claude picks from the shortlist or returns 'none'.
    // No gold appears anywhere in the prompt or context.
    const candidates = shortlist
      .map((c, i) => `  ${i + 1}. ${c.label}  [${c.mondoId}]`)
      .join('\n');
    const userPrompt = `You are matching a free-text disease name to the single best Mondo Disease Ontology entry. Pick from the provided candidates ONLY. If none is a confident match, return "none".

Predicted disease name: "${predictionText}"

Candidates:
${candidates}

Respond with JSON only, in this exact form:
{"mondoId": "MONDO:NNNNNNN", "confidence": 0.0}
OR
{"mondoId": "none", "confidence": 0.0}

Confidence is your own 0-1 estimate. Use "none" when the predicted name does not refer to any candidate's disease entity.`;

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: FUZZY_MODEL,
          max_tokens: 200,
          temperature: FUZZY_TEMPERATURE,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!resp.ok) {
        console.warn(`[Fuzzy] Anthropic ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
        return null;
      }
      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      // Robust JSON extraction.
      const m = text.match(/\{[^}]*\}/);
      if (!m) return null;
      const parsed = JSON.parse(m[0]);
      if (!parsed.mondoId || parsed.mondoId === 'none') return null;
      // Sanity: must be in the shortlist.
      const inShortlist = shortlist.some((c) => c.mondoId === parsed.mondoId);
      if (!inShortlist) {
        console.warn(`[Fuzzy] Claude hallucinated id ${parsed.mondoId} not in shortlist; rejecting.`);
        return null;
      }
      return {
        mondoId: parsed.mondoId,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch (err) {
      console.warn(`[Fuzzy] Exception: ${(err as Error).message}`);
      return null;
    }
  };
}

// ===== Fetch cohort =====

// The list endpoint already strips heavy fields (per its slim mode), but the
// shape is otherwise a TestCase. Use it directly — the evalVersion / runMode
// / samplingMode unions are already declared on TestCase itself.
type FetchedTestCase = TestCase;

async function fetchCohort(): Promise<FetchedTestCase[]> {
  console.log(`Fetching test cases from ${BASE}/api/admin/test-cases ...`);
  // Paginate to stay under Vercel's response-size cap. Each page is ~2-3 MB
  // at limit=400 (after the slim applied by the list route).
  const PAGE = 400;
  const all: FetchedTestCase[] = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const res = await fetch(`${BASE}/api/admin/test-cases?limit=${PAGE}&offset=${offset}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch test cases (offset=${offset}): HTTP ${res.status}`);
    }
    const body = await res.json();
    const page = (body.testCases || []) as FetchedTestCase[];
    all.push(...page);
    total = body.pagination?.total ?? all.length;
    offset += PAGE;
    process.stdout.write(`  fetched ${all.length} of ${total}\r`);
    if (page.length === 0) break; // safety
  }
  const cases = all;
  console.log(`  ✓ ${cases.length} cases returned`);

  const filtered = cases.filter((tc) => {
    if (tc.testVersion !== 'Eval') return false;
    if (tc.evalVersion !== EVAL_VERSION) return false;
    if (SAMPLING && tc.evalSamplingMode !== SAMPLING) return false;
    const mode = (tc.evalRunMode || 'secondlook') as 'secondlook' | 'openai' | 'claude';
    if (!MODES.includes(mode)) return false;
    if (tc.status !== 'graded') return false;
    if (!tc.pipelineResult?.differentialDiagnoses?.length) return false;
    if (!tc.groundTruth?.icd10 || !tc.groundTruth.icd10.startsWith('OMIM:')) return false;
    return true;
  });
  console.log(`  ✓ ${filtered.length} match --eval-version ${EVAL_VERSION} --sampling ${SAMPLING || '(any)'} --modes ${MODES.join(',')}`);
  return filtered;
}

// ===== Trio grouping =====

interface Trio {
  pmid: string;
  secondlook?: FetchedTestCase;
  openai?: FetchedTestCase;
  claude?: FetchedTestCase;
}

function groupIntoTrios(cases: FetchedTestCase[]): Trio[] {
  const byPmid = new Map<string, Trio>();
  for (const tc of cases) {
    const pmid = tc.categoryHint || tc.id;
    if (!byPmid.has(pmid)) byPmid.set(pmid, { pmid });
    const trio = byPmid.get(pmid)!;
    const mode = (tc.evalRunMode || 'secondlook') as 'secondlook' | 'openai' | 'claude';
    const existing = trio[mode];
    if (!existing || Date.parse(tc.createdAt) > Date.parse(existing.createdAt)) {
      trio[mode] = tc;
    }
  }
  return Array.from(byPmid.values());
}

// ===== Differential extraction =====

function extractDifferential(tc: FetchedTestCase): DifferentialInput[] {
  const diffs = tc.pipelineResult?.differentialDiagnoses || [];
  return diffs.slice(0, 10).map((d: any) => {
    const out: DifferentialInput = { predictionText: d.diagnosis };
    // SL hypotheses carry omimId/orphanetId when KB-attached. Capture omimId
    // for the audit path only — never used as a grading shortcut.
    if (d.omimId && typeof d.omimId === 'string' && d.omimId.startsWith('OMIM:')) {
      out.intendedOmimId = d.omimId;
    }
    return out;
  });
}

// ===== Persistence =====

async function persistV4Grading(tc: FetchedTestCase, v4Grading: V4Grading): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/test-cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upsert: [{ ...tc, v4Grading }] }),
  });
  if (!res.ok) {
    console.warn(`  ! upsert failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// ===== Reporting =====

interface PipelineRollup {
  n: number;
  groundedItems: number;
  totalItems: number;
  top1: number; top3: number; top10: number;
  top1Full: number; top3Full: number; top10Full: number;
  slAuditAligned: number;
  slAuditDiverged: number;
  slAuditCasesWithIntended: number;
}

function emptyRollup(): PipelineRollup {
  return {
    n: 0, groundedItems: 0, totalItems: 0,
    top1: 0, top3: 0, top10: 0,
    top1Full: 0, top3Full: 0, top10Full: 0,
    slAuditAligned: 0, slAuditDiverged: 0, slAuditCasesWithIntended: 0,
  };
}

function pct(num: number, den: number): string {
  if (den === 0) return '   -';
  return `${((num / den) * 100).toFixed(1)}%`.padStart(6);
}

function v3ClinicalTop1(tc: FetchedTestCase): boolean {
  return tc.tieredGrading?.rankAtVariant === 1;
}

function reportRollup(rollup: PipelineRollup): void {
  const grounding = pct(rollup.groundedItems, rollup.totalItems);
  const t1 = pct(rollup.top1, rollup.n);
  const t3 = pct(rollup.top3, rollup.n);
  const t10 = pct(rollup.top10, rollup.n);
  const t1f = pct(rollup.top1Full, rollup.n);
  const t3f = pct(rollup.top3Full, rollup.n);
  const t10f = pct(rollup.top10Full, rollup.n);
  console.log(
    `  ${grounding}  |  ${t1}  ${t3}  ${t10}  |  ${t1f}  ${t3f}  ${t10f}`,
  );
}

// ===== Main =====

async function main(): Promise<void> {
  console.log('v4 grader (paper-faithful Phenopacket2Prompt / Mondo regrade)');
  console.log('=============================================================');
  console.log(`Eval version : ${EVAL_VERSION}`);
  console.log(`Sampling     : ${SAMPLING || '(any)'}`);
  console.log(`Modes        : ${MODES.join(', ')}`);
  console.log(`Fuzzy stage  : ${USE_FUZZY ? `enabled (${FUZZY_MODEL})` : 'DISABLED'}`);
  console.log(`Persist      : ${PERSIST ? 'yes (upserting v4Grading)' : 'no (report-only)'}`);
  console.log('');

  const cases = await fetchCohort();
  const trios = groupIntoTrios(cases).slice(0, LIMIT);
  console.log(`  ✓ ${trios.length} trios after grouping by PMID${LIMIT < trios.length ? ` (capped at --limit ${LIMIT})` : ''}`);

  if (DRY_RUN) {
    console.log('\nDry run — first 5 trios:');
    for (const t of trios.slice(0, 5)) {
      console.log(
        `  ${t.pmid}  SL=${t.secondlook ? '✓' : '✗'} OAI=${t.openai ? '✓' : '✗'} CL=${t.claude ? '✓' : '✗'}`,
      );
    }
    return;
  }

  const fuzzyResolver = USE_FUZZY ? buildResolver() : undefined;
  const groundingModel = USE_FUZZY ? FUZZY_MODEL : 'none';
  const opts = { fuzzyResolver, groundingModel };

  const rollups: Record<string, PipelineRollup> = {
    secondlook: emptyRollup(),
    openai: emptyRollup(),
    claude: emptyRollup(),
  };

  let processed = 0;
  for (const trio of trios) {
    for (const mode of MODES) {
      const tc = trio[mode];
      if (!tc) continue;
      const goldOmim = tc.groundTruth.icd10;
      if (!goldOmim?.startsWith('OMIM:')) continue;

      const differential = extractDifferential(tc);
      try {
        const v4 = await gradeDifferentialV4(differential, goldOmim, opts);
        const r = rollups[mode];
        r.n++;
        r.groundedItems += v4.groundedCount;
        r.totalItems += v4.totalCount;
        if (v4.top1) r.top1++;
        if (v4.top3) r.top3++;
        if (v4.top10) r.top10++;
        if (v4.top1Full) r.top1Full++;
        if (v4.top3Full) r.top3Full++;
        if (v4.top10Full) r.top10Full++;
        if (mode === 'secondlook' && v4.slAudit?.intendedIdAvailable) {
          r.slAuditCasesWithIntended++;
          r.slAuditAligned += v4.slAudit.intendedVsResolvedAlignedCount;
          r.slAuditDiverged += v4.slAudit.intendedVsResolvedDivergedCount;
        }

        if (PERSIST) await persistV4Grading(tc, v4);

        processed++;
        if (processed % 10 === 0) {
          process.stdout.write(`  ${processed} grading completed...\r`);
        }
      } catch (err) {
        console.warn(`  ! ${trio.pmid} ${mode}: ${(err as Error).message}`);
      }
    }
  }

  console.log(`\nDone. Graded ${processed} pipeline-cases.\n`);
  console.log('=========================================================================');
  console.log(`v4 (paper-faithful Mondo) vs v3 (current LLM-tier) — ${EVAL_VERSION} ${SAMPLING || ''}`);
  console.log('=========================================================================');
  console.log('             ground.  |    v4 Top-N (score>0)   |   v4 FULL Top-N (score=1)');
  console.log('Pipeline      rate    |   T-1     T-3     T-10  |   T-1     T-3     T-10   |  v3 clin T-1');
  console.log('-------------------------------------------------------------------------');
  for (const mode of MODES) {
    const r = rollups[mode];
    if (r.n === 0) {
      console.log(`${mode.padEnd(12)}  (no cases)`);
      continue;
    }
    process.stdout.write(`${mode.padEnd(12)} `);
    const grounding = pct(r.groundedItems, r.totalItems);
    const t1 = pct(r.top1, r.n);
    const t3 = pct(r.top3, r.n);
    const t10 = pct(r.top10, r.n);
    const t1f = pct(r.top1Full, r.n);
    const t3f = pct(r.top3Full, r.n);
    const t10f = pct(r.top10Full, r.n);
    // v3 number for the same case set
    const v3Hits = trios.reduce((acc, t) => {
      const tc = t[mode];
      return acc + (tc && v3ClinicalTop1(tc) ? 1 : 0);
    }, 0);
    const v3Pct = pct(v3Hits, r.n);
    console.log(` ${grounding}  |  ${t1}  ${t3}  ${t10}  |  ${t1f}  ${t3f}  ${t10f}  |  ${v3Pct}`);
  }
  console.log('-------------------------------------------------------------------------');
  console.log(`Each row's n: ${MODES.map((m) => `${m}=${rollups[m].n}`).join(', ')}`);

  // SL audit summary
  const sl = rollups.secondlook;
  if (sl.slAuditCasesWithIntended > 0) {
    const totalAudit = sl.slAuditAligned + sl.slAuditDiverged;
    const alignedPct = totalAudit > 0 ? `${((sl.slAuditAligned / totalAudit) * 100).toFixed(1)}%` : '-';
    console.log('');
    console.log('SecondLook audit path (intended id vs grounder-resolved id)');
    console.log(`  Cases with intended id available: ${sl.slAuditCasesWithIntended} of ${sl.n}`);
    console.log(`  Per-item aligned (same disease family):   ${sl.slAuditAligned} (${alignedPct})`);
    console.log(`  Per-item diverged (different disease):    ${sl.slAuditDiverged}`);
    if (sl.slAuditDiverged > 0) {
      console.log('  → Divergence indicates SL wrote text whose grounding does NOT match its KB-attached id.');
      console.log('    These are candidates for "artifact" grounding loss (SL knew the id; the text obscured it).');
    }
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
