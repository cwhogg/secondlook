#!/usr/bin/env node
/**
 * topn-recall.mjs
 *
 * Answers "what % of cases have the correct diagnosis anywhere in
 * SL's top-N (N=1,3,5,10)?" — the closed-world ceiling for any
 * downstream workup strategy (eliminative negatives, confirmatory
 * testing, refinement questions). This is the marketing-friendly
 * "how close does SL get you to the answer" metric family.
 *
 * Per-cohort × per-grader × per-N table for every stored eval cohort
 * with n>=MIN_N. No LLM calls — pulls Top-N directly from stored
 * v4Grading (firstCorrectRank / v4Grading.top{1,3,10}), tieredGrading
 * (rankAtVariant / rankAtAny), and grading (correctDiagnosisRank).
 *
 * Env:
 *   BASE_URL           default https://secondlook.vercel.app
 *   TESTING_PASSWORD   required
 *   MIN_N              default 20
 */

import { writeFileSync } from 'node:fs'

const BASE_URL = process.env.BASE_URL || 'https://secondlook.vercel.app'
const PASSWORD = process.env.TESTING_PASSWORD || ''
const MIN_N = Number(process.env.MIN_N || 20)
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 500)

if (!PASSWORD) {
  console.error('TESTING_PASSWORD env required')
  process.exit(2)
}

const HEADERS = { 'x-admin-password': PASSWORD }

async function* iterateCases() {
  let offset = 0
  while (true) {
    const url = `${BASE_URL}/api/admin/test-cases?limit=${PAGE_SIZE}&offset=${offset}`
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) throw new Error(`GET test-cases HTTP ${res.status}`)
    const body = await res.json()
    const cases = Array.isArray(body.testCases) ? body.testCases : []
    if (cases.length === 0) return
    for (const tc of cases) yield tc
    offset += cases.length
    process.stderr.write(`  ${offset}\r`)
    if (cases.length < PAGE_SIZE) return
  }
}

function keyFor(tc) {
  const pr = tc.pipelineResult || {}
  const pv = pr.pipelineMetadata?.pipelineVersion || 'unknown'
  const sampling = tc.evalSamplingMode || 'unspecified'
  const evalV = tc.evalVersion || 'unspecified'
  return `${pv}|${sampling}|${evalV}`
}

function isBaseline(pv) {
  return typeof pv === 'string' && pv.startsWith('baseline-')
}

/**
 * Extract per-N recall booleans from each grader present on the case.
 * Null when the grader wasn't applied — kept out of the denominator.
 */
function extractRecall(tc) {
  const out = {
    // v2 fuzzy LLM
    v2: { top1: null, top3: null, top5: null, top10: null },
    // v3 tier LLM — "any-tier" recall (rankAtAny <= N)
    v3_any: { top1: null, top3: null, top5: null, top10: null },
    // v3 tier LLM — clinical recall (rankAtVariant <= N, exact or variant match)
    v3_clinical: { top1: null, top3: null, top5: null, top10: null },
    // v4 Mondo any-credit (score > 0)
    v4_any: { top1: null, top3: null, top5: null, top10: null },
    // v4 Mondo FULL only (score == 1.0)
    v4_full: { top1: null, top3: null, top5: null, top10: null },
  }
  if (tc.grading) {
    const r = tc.grading.correctDiagnosisRank
    for (const [k, n] of [['top1', 1], ['top3', 3], ['top5', 5], ['top10', 10]]) {
      out.v2[k] = typeof r === 'number' && r >= 1 && r <= n
      if (r === null) out.v2[k] = false
    }
  }
  const tg = tc.tieredGrading
  if (tg) {
    for (const [k, n] of [['top1', 1], ['top3', 3], ['top5', 5], ['top10', 10]]) {
      out.v3_any[k] = tg.rankAtAny !== null && tg.rankAtAny <= n
      out.v3_clinical[k] = tg.rankAtVariant !== null && tg.rankAtVariant <= n
    }
  }
  const g4 = tc.v4Grading
  if (g4) {
    // v4 stores explicit top1/top3/top10 booleans; derive top5 from
    // firstCorrectRank which is null when nothing hit.
    out.v4_any.top1 = g4.top1 === true
    out.v4_any.top3 = g4.top3 === true
    out.v4_any.top10 = g4.top10 === true
    const fcr = g4.firstCorrectRank
    out.v4_any.top5 = typeof fcr === 'number' && fcr >= 1 && fcr <= 5
    out.v4_full.top1 = g4.top1Full === true
    out.v4_full.top3 = g4.top3Full === true
    out.v4_full.top10 = g4.top10Full === true
    const fcrF = g4.firstFullCreditRank
    out.v4_full.top5 = typeof fcrF === 'number' && fcrF >= 1 && fcrF <= 5
  }
  return out
}

function wilson95(hits, n) {
  if (n === 0) return [0, 0]
  const p = hits / n
  const z = 1.96
  const denom = 1 + (z * z) / n
  const center = p + (z * z) / (2 * n)
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [
    Math.max(0, ((center - spread) / denom) * 100),
    Math.min(100, ((center + spread) / denom) * 100),
  ]
}

const buckets = new Map() // key -> per grader { top1/3/5/10 hits, denom }
let processed = 0

console.error(`Fetching from ${BASE_URL}…`)
for await (const tc of iterateCases()) {
  processed++
  const key = keyFor(tc)
  let b = buckets.get(key)
  if (!b) {
    b = {}
    for (const g of ['v2', 'v3_any', 'v3_clinical', 'v4_any', 'v4_full']) {
      b[g] = { top1: { h: 0, d: 0 }, top3: { h: 0, d: 0 }, top5: { h: 0, d: 0 }, top10: { h: 0, d: 0 } }
    }
    buckets.set(key, b)
  }
  const r = extractRecall(tc)
  for (const g of Object.keys(r)) {
    for (const k of Object.keys(r[g])) {
      if (r[g][k] === null) continue
      b[g][k].d++
      if (r[g][k]) b[g][k].h++
    }
  }
}
console.error(`\nProcessed ${processed} cases into ${buckets.size} buckets.`)

// Emit rows: one per (bucket, grader) with at least Top-10 n >= MIN_N.
const rows = []
for (const [key, b] of buckets.entries()) {
  const [pv, sampling, evalV] = key.split('|')
  for (const g of ['v2', 'v3_any', 'v3_clinical', 'v4_any', 'v4_full']) {
    const { top1, top3, top5, top10 } = b[g]
    const n = top10.d
    if (n < MIN_N) continue
    const row = {
      pipelineVersion: pv,
      isBaseline: isBaseline(pv),
      sampling,
      evalVersion: evalV,
      grader: g,
      n,
      top1: (top1.h / top1.d) * 100,
      top3: (top3.h / top3.d) * 100,
      top5: (top5.h / top5.d) * 100,
      top10: (top10.h / top10.d) * 100,
      top1_ci: wilson95(top1.h, top1.d),
      top3_ci: wilson95(top3.h, top3.d),
      top5_ci: wilson95(top5.h, top5.d),
      top10_ci: wilson95(top10.h, top10.d),
    }
    rows.push(row)
  }
}
rows.sort((a, b) => b.top10 - a.top10)

// Print two tables: SL cohorts and baseline cohorts, side-by-side.
function printTable(rows, title) {
  console.log()
  console.log(title)
  console.log('='.repeat(title.length))
  console.log(
    [
      'pipeline'.padEnd(24),
      'sampling'.padEnd(12),
      'eval'.padEnd(8),
      'grader'.padEnd(12),
      'n'.padStart(4),
      'Top-1'.padStart(7),
      'Top-3'.padStart(7),
      'Top-5'.padStart(7),
      'Top-10'.padStart(7),
    ].join('  '),
  )
  console.log('-'.repeat(105))
  for (const r of rows) {
    console.log(
      [
        r.pipelineVersion.slice(0, 24).padEnd(24),
        r.sampling.slice(0, 12).padEnd(12),
        r.evalVersion.slice(0, 8).padEnd(8),
        r.grader.padEnd(12),
        String(r.n).padStart(4),
        r.top1.toFixed(1).padStart(7),
        r.top3.toFixed(1).padStart(7),
        r.top5.toFixed(1).padStart(7),
        r.top10.toFixed(1).padStart(7),
      ].join('  '),
    )
  }
}

const slRows = rows.filter((r) => !r.isBaseline).slice(0, 30)
const baselineRows = rows.filter((r) => r.isBaseline).slice(0, 30)
printTable(slRows, 'SecondLook cohorts (top 30 by Top-10)')
printTable(baselineRows, 'Baseline cohorts (top 30 by Top-10)')

// The headline row we want to promote: v26 random-100 under v4 Mondo
// any-credit (paper-faithful, largest cohort).
console.log()
console.log('MARKETING HEADLINE — the number to lead with')
console.log('==============================================')
const headline = rows.find(
  (r) =>
    r.pipelineVersion.startsWith('26') &&
    r.sampling === 'random100' &&
    r.grader === 'v4_any' &&
    !r.isBaseline,
)
if (headline) {
  const [c1lo, c1hi] = headline.top1_ci
  const [c3lo, c3hi] = headline.top3_ci
  const [c5lo, c5hi] = headline.top5_ci
  const [c10lo, c10hi] = headline.top10_ci
  console.log(`  Cohort:  v26 random-100 (n=${headline.n})`)
  console.log(`  Grader:  v4 Mondo any-credit (paper-faithful, comparable to published Exomiser/GPT-4o/o1-preview)`)
  console.log()
  console.log(`  Top-1  : ${headline.top1.toFixed(1)}%   95% CI [${c1lo.toFixed(1)}, ${c1hi.toFixed(1)}]`)
  console.log(`  Top-3  : ${headline.top3.toFixed(1)}%   95% CI [${c3lo.toFixed(1)}, ${c3hi.toFixed(1)}]`)
  console.log(`  Top-5  : ${headline.top5.toFixed(1)}%   95% CI [${c5lo.toFixed(1)}, ${c5hi.toFixed(1)}]`)
  console.log(`  Top-10 : ${headline.top10.toFixed(1)}%   95% CI [${c10lo.toFixed(1)}, ${c10hi.toFixed(1)}]`)
}

// Same for the two random-100 baselines to enable claim comparison.
const baselinesRand100 = rows.filter(
  (r) =>
    r.isBaseline &&
    r.sampling === 'random100' &&
    r.grader === 'v4_any',
)
if (baselinesRand100.length > 0) {
  console.log()
  console.log('Baseline comparisons on the same v26 random-100 vignettes (v4 any-credit):')
  for (const r of baselinesRand100) {
    console.log(
      `  ${r.pipelineVersion.padEnd(28)} n=${r.n}   Top-1: ${r.top1.toFixed(1)}%   Top-3: ${r.top3.toFixed(1)}%   Top-5: ${r.top5.toFixed(1)}%   Top-10: ${r.top10.toFixed(1)}%`,
    )
  }
}

// Persist JSON.
const outFile = 'scripts/topn-recall-report.json'
writeFileSync(
  outFile,
  JSON.stringify({ generatedAt: new Date().toISOString(), minN: MIN_N, rows }, null, 2),
)
console.log()
console.log(`Full JSON written to ${outFile}`)
