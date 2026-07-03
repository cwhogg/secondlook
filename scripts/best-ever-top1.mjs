#!/usr/bin/env node
/**
 * best-ever-top1.mjs
 *
 * Enumerate every stored SecondLook eval case, bucket by
 * (evalSamplingMode, pipelineVersion, evalVersion), and compute the
 * Top-1 correct rate under each grader present on the record. Emit a
 * leaderboard so we can answer "best-ever Top-1 on n>=20, any
 * definition" without cherry-picking.
 *
 * Grader definitions considered:
 *   - v2 (fuzzy LLM):        grading.correctDiagnosisRank === 1
 *   - v3 (tier LLM):         tieredGrading.isTop1 === true
 *                            (or rankAtExact === 1 for exact-only)
 *                            (or rankAtVariant === 1 for exact-or-variant)
 *   - v4 Mondo any-credit:   v4Grading.top1 === true
 *   - v4 Mondo FULL only:    v4Grading.top1Full === true
 *
 * Env:
 *   BASE_URL           default https://secondlook.vercel.app
 *   TESTING_PASSWORD   required against prod (skip for localhost with unset TESTING_PASSWORD)
 *   MIN_N              minimum cohort size to include, default 20
 *   PAGE_SIZE          page size for API pagination, default 500
 */

import { writeFileSync } from 'node:fs'

const BASE_URL = process.env.BASE_URL || 'https://secondlook.vercel.app'
const PASSWORD = process.env.TESTING_PASSWORD || ''
const MIN_N = Number(process.env.MIN_N || 20)
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 500)

if (!PASSWORD) {
  console.error('TESTING_PASSWORD env var required against prod')
  process.exit(2)
}

const HEADERS = { 'x-admin-password': PASSWORD }

/**
 * Paginate through /api/admin/test-cases and yield every record.
 * The response is slimmed by default (recommendedTesting stripped etc.)
 * which is fine here — we only need grading fields + version metadata.
 */
async function* iterateCases() {
  let offset = 0
  let total = null
  while (true) {
    const url = `${BASE_URL}/api/admin/test-cases?limit=${PAGE_SIZE}&offset=${offset}`
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) {
      throw new Error(`GET test-cases HTTP ${res.status}: ${await res.text().catch(() => '')}`)
    }
    const body = await res.json()
    const cases = Array.isArray(body.testCases) ? body.testCases : []
    if (cases.length === 0) return
    total ??= body.pagination?.total ?? null
    for (const tc of cases) yield tc
    offset += cases.length
    process.stderr.write(`  fetched ${offset}${total ? ` / ${total}` : ''}\r`)
    if (cases.length < PAGE_SIZE) return
  }
}

/**
 * Bucket key. We split by:
 *   - source (secondlook / baseline-openai / baseline-claude / other)
 *   - pipelineVersion (or fallback label for baselines)
 *   - evalSamplingMode (standard50 / uniform / diversified / …)
 *   - evalVersion (v1/v2/v3 — the eval-cohort tag)
 *
 * Baselines share a version label with the specific stub they came from
 * (baseline-openai-baseline / baseline-claude-baseline); keep them as
 * separate buckets so the leaderboard can compare SL vs each.
 */
function keyFor(tc) {
  const pr = tc.pipelineResult || {}
  const pv = pr.pipelineMetadata?.pipelineVersion || 'unknown'
  const source = tc.source || 'unknown'
  const sampling = tc.evalSamplingMode || 'unspecified'
  const evalV = tc.evalVersion || 'unspecified'
  return `${source}|${pv}|${sampling}|${evalV}`
}

/**
 * Per-case Top-1 booleans under each grader present. Returns null for a
 * grader when that grader wasn't applied to the case (so we don't count
 * a false denominator).
 */
function extractTop1(tc) {
  const out = {
    v2: null, // fuzzy LLM
    v3_exact: null, // exact-only, strict
    v3_variant: null, // exact or variant (the "clinical Top-1" definition)
    v3_isTop1: null, // whatever the grader called isTop1 (usually === v3_variant)
    v4_any: null, // Mondo any-credit
    v4_full: null, // Mondo FULL only
  }
  if (tc.grading && typeof tc.grading.correctDiagnosisRank === 'number') {
    out.v2 = tc.grading.correctDiagnosisRank === 1
  } else if (tc.grading && tc.grading.correctDiagnosisRank === null) {
    out.v2 = false
  }
  const tg = tc.tieredGrading
  if (tg) {
    out.v3_exact = tg.rankAtExact === 1
    out.v3_variant = tg.rankAtVariant === 1
    out.v3_isTop1 = tg.isTop1 === true
  }
  const g4 = tc.v4Grading
  if (g4) {
    out.v4_any = g4.top1 === true
    out.v4_full = g4.top1Full === true
  }
  return out
}

/**
 * Wilson score 95% CI for a proportion. Returns [lo, hi] in %.
 */
function wilson95(hits, n) {
  if (n === 0) return [0, 0]
  const p = hits / n
  const z = 1.96
  const denom = 1 + (z * z) / n
  const center = p + (z * z) / (2 * n)
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  const lo = (center - spread) / denom
  const hi = (center + spread) / denom
  return [Math.max(0, lo * 100), Math.min(100, hi * 100)]
}

const buckets = new Map() // key -> { count, per-grader hit counts }
let processed = 0

console.error(`Fetching cases from ${BASE_URL} (page ${PAGE_SIZE}, min-n=${MIN_N})…`)

for await (const tc of iterateCases()) {
  processed++
  const key = keyFor(tc)
  let b = buckets.get(key)
  if (!b) {
    b = {
      n: 0,
      v2: { hits: 0, denom: 0 },
      v3_exact: { hits: 0, denom: 0 },
      v3_variant: { hits: 0, denom: 0 },
      v3_isTop1: { hits: 0, denom: 0 },
      v4_any: { hits: 0, denom: 0 },
      v4_full: { hits: 0, denom: 0 },
    }
    buckets.set(key, b)
  }
  b.n++
  const t = extractTop1(tc)
  for (const g of Object.keys(t)) {
    if (t[g] === null) continue
    b[g].denom++
    if (t[g]) b[g].hits++
  }
}
console.error(`\nProcessed ${processed} cases into ${buckets.size} buckets.`)

// Emit leaderboard: one row per (bucket, grader) with n>=MIN_N.
// Sorted descending by rate.
const rows = []
for (const [key, b] of buckets.entries()) {
  const [source, pv, sampling, evalV] = key.split('|')
  const graders = ['v2', 'v3_exact', 'v3_variant', 'v3_isTop1', 'v4_any', 'v4_full']
  for (const g of graders) {
    const { hits, denom } = b[g]
    if (denom < MIN_N) continue
    const rate = (hits / denom) * 100
    const [lo, hi] = wilson95(hits, denom)
    rows.push({
      source,
      pipelineVersion: pv,
      sampling,
      evalVersion: evalV,
      grader: g,
      hits,
      n: denom,
      rate,
      lo,
      hi,
    })
  }
}
rows.sort((a, b) => b.rate - a.rate)

if (rows.length === 0) {
  console.log(`No buckets met n>=${MIN_N}. Lower MIN_N or check the data.`)
  process.exit(0)
}

// Print the leaderboard, top 40 rows.
console.log()
console.log('Leaderboard — Top-1 correct rate across all cohorts × pipeline versions × graders')
console.log('=================================================================================')
console.log(
  [
    'source'.padEnd(22),
    'pipeline'.padEnd(14),
    'sampling'.padEnd(14),
    'eval'.padEnd(6),
    'grader'.padEnd(11),
    'top-1%'.padStart(7),
    'n'.padStart(5),
    '95% CI'.padStart(14),
  ].join('  '),
)
console.log('-'.repeat(102))
const TOP = 60
for (const r of rows.slice(0, TOP)) {
  console.log(
    [
      r.source.slice(0, 22).padEnd(22),
      (r.pipelineVersion || '').slice(0, 14).padEnd(14),
      (r.sampling || '').slice(0, 14).padEnd(14),
      (r.evalVersion || '').slice(0, 6).padEnd(6),
      r.grader.padEnd(11),
      r.rate.toFixed(1).padStart(7),
      String(r.n).padStart(5),
      `[${r.lo.toFixed(1)}, ${r.hi.toFixed(1)}]`.padStart(14),
    ].join('  '),
  )
}

// Also save the raw JSON for downstream.
const outFile = 'scripts/best-ever-top1-report.json'
writeFileSync(
  outFile,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      minN: MIN_N,
      totalCasesProcessed: processed,
      totalBuckets: buckets.size,
      rows,
    },
    null,
    2,
  ),
)
console.log()
console.log(`Full JSON written to ${outFile} (${rows.length} rows total).`)

// Emit the single headline per source × grader combination so the
// answer to "best ever, any definition" is unambiguous.
console.log()
console.log('Headline — max Top-1% per (source × grader):')
console.log('---------------------------------------------')
const headline = new Map()
for (const r of rows) {
  const k = `${r.source}|${r.grader}`
  const prev = headline.get(k)
  if (!prev || r.rate > prev.rate) headline.set(k, r)
}
const headlineRows = [...headline.values()].sort((a, b) => b.rate - a.rate)
for (const r of headlineRows) {
  console.log(
    `  ${r.source.padEnd(22)} ${r.grader.padEnd(11)} ${r.rate.toFixed(1).padStart(6)}%  n=${r.n}  (${r.pipelineVersion} / ${r.sampling})`,
  )
}
