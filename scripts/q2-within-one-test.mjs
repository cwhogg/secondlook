#!/usr/bin/env node
/**
 * q2-within-one-test.mjs
 *
 * Answers "what % of patients do we get within one clear test of their
 * diagnosis?" on the v26 random-100 cohort.
 *
 * Per case:
 *   - Condition (a) top-1 exact: SL's #1 grades correct under v4 Mondo.
 *   - Condition (b) top-1 test confirms: post-hoc synthesize SL's #1
 *     recommended test (given SL's top-10 differential, gt-blind), then
 *     ask Claude Opus whether a positive result of that test would
 *     definitively confirm the ground-truth diagnosis.
 *   - Condition (c) top-5 test confirms: same as (b) but for any of the
 *     first 5 synthesized tests.
 *
 * The synthesis of the recommended tests is gt-blind on purpose — the
 * *order* of what SL would recommend is decided without knowing the
 * ground truth, then the *judgment* of confirmatory-ness is asked with
 * the ground truth explicit.
 *
 * Cost note: 2 Claude Opus calls per case × ~96 v26 random-100 cases
 * ≈ $10-25 depending on prompt length. Cheap sanity read.
 *
 * Env:
 *   BASE_URL             prod URL
 *   TESTING_PASSWORD     admin password
 *   ANTHROPIC_API_KEY    Claude key (Opus 4.7)
 *   LIMIT                cap on cases run (default all v26 random100)
 */

import { writeFileSync } from 'node:fs'

const BASE_URL = process.env.BASE_URL || 'https://secondlook.vercel.app'
const PASSWORD = process.env.TESTING_PASSWORD || ''
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-7'
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity

if (!PASSWORD) {
  console.error('TESTING_PASSWORD env required')
  process.exit(2)
}
if (!ANTHROPIC_KEY) {
  console.error('ANTHROPIC_API_KEY env required')
  process.exit(2)
}

const HEADERS = { 'x-admin-password': PASSWORD }

async function loadCohort() {
  const all = []
  let offset = 0
  while (true) {
    const res = await fetch(`${BASE_URL}/api/admin/test-cases?limit=500&offset=${offset}&includeLlmCalls=1`, {
      headers: HEADERS,
    })
    if (!res.ok) throw new Error(`GET test-cases HTTP ${res.status}`)
    const body = await res.json()
    const cases = body.testCases || []
    all.push(...cases)
    if (cases.length < 500) break
    offset += cases.length
  }
  const v26 = all.filter(
    (tc) =>
      (tc.pipelineResult?.pipelineMetadata?.pipelineVersion || '').startsWith('26') &&
      tc.evalSamplingMode === 'random100',
  )
  return v26
}

async function claudeJson({ system, user, maxTokens = 1500 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Claude ${res.status}: ${t.slice(0, 400)}`)
  }
  const body = await res.json()
  const text = body?.content?.[0]?.text || ''
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error(`Claude returned no JSON: ${text.slice(0, 200)}`)
  const jsonText = text.slice(start, end + 1)
  try {
    return JSON.parse(jsonText)
  } catch (e) {
    throw new Error(`Claude JSON parse: ${e.message}: ${jsonText.slice(0, 400)}`)
  }
}

/**
 * gt-blind: given SL's differential, list top-5 recommended tests.
 */
async function synthesizeTests(caseDescription, topDiagnoses) {
  const dxList = topDiagnoses
    .slice(0, 10)
    .map((d, i) => `${i + 1}. ${d.diagnosis}`)
    .join('\n')
  const system = `You are a clinician deciding which diagnostic tests to order next. You will be given a patient's clinical presentation and a differential diagnosis produced by an AI. Return the top 5 most informative diagnostic tests to order, ranked most-informative first. Prefer tests that discriminate between candidates. Return STRICT JSON only.`
  const user = `Patient case:
${caseDescription}

Current differential (ranked, most likely first):
${dxList}

Return JSON:
{
  "tests": [
    { "testName": "specific test as would be written on an order", "testType": "genetic | biochemical | imaging | histology | clinical | serologic | functional", "rationale": "one short sentence", "targetDiagnoses": ["which candidates this test discriminates or confirms"] }
  ]
}
Exactly 5 tests, ordered most-informative first.`
  return await claudeJson({ system, user, maxTokens: 1200 })
}

/**
 * gt-aware: for each candidate test, would a positive result confirm gt?
 */
async function judgeConfirmation(caseDescription, groundTruthDx, groundTruthOmim, tests) {
  const testList = tests
    .map((t, i) => `${i + 1}. ${t.testName} (${t.testType})`)
    .join('\n')
  const system = `You are a clinical genetics / diagnostics expert. For each proposed test, judge whether a positive result would *definitively* confirm a specific ground-truth diagnosis. "Definitively" means the finding is diagnostic on its own or fulfills the disease's formal required criterion — not merely supportive or consistent. Return STRICT JSON only.`
  const user = `Patient case:
${caseDescription}

Ground-truth diagnosis: ${groundTruthDx}${groundTruthOmim ? ` (${groundTruthOmim})` : ''}

Proposed tests (ordered most-informative first):
${testList}

For each test, decide whether a positive result would *definitively* confirm the ground-truth diagnosis. "yes" = a positive result on this test uniquely confirms this exact diagnosis (or its umbrella / gene family that the ground truth belongs to). "probable" = a positive result is highly suggestive but not sole-confirmatory. "no" = a positive result does not confirm this specific diagnosis (either wrong condition, or condition-nonspecific).

Return JSON:
{
  "verdicts": [
    { "index": 1, "confirms": "yes" | "probable" | "no", "reason": "one short sentence" },
    ... one entry per test, indexes 1..N ...
  ]
}`
  return await claudeJson({ system, user, maxTokens: 1200 })
}

function narrativeOf(tc) {
  return (
    tc.generatedPatient?.narrative ||
    tc.groundTruth?.keyFindings?.join(', ') ||
    ''
  )
}

async function analyzeCase(tc) {
  const dx = tc.pipelineResult?.differentialDiagnoses || []
  const gtDx = tc.groundTruth?.diagnosis || '(unknown)'
  const gtOmim = tc.groundTruth?.icd10 || ''
  const narrative = narrativeOf(tc)
  const conditionA = tc.v4Grading?.top1 === true

  const synth = await synthesizeTests(narrative, dx)
  const tests = Array.isArray(synth?.tests) ? synth.tests.slice(0, 5) : []
  if (tests.length === 0) {
    return { conditionA, conditionB: false, conditionC: false, tests: [], verdicts: [] }
  }

  const judge = await judgeConfirmation(narrative, gtDx, gtOmim, tests)
  const verdicts = Array.isArray(judge?.verdicts) ? judge.verdicts : []
  const yes = new Set()
  for (const v of verdicts) {
    if (v.confirms === 'yes') yes.add(v.index)
  }
  const conditionB = yes.has(1)
  const conditionC = tests.some((_, i) => yes.has(i + 1))
  return { conditionA, conditionB, conditionC, tests, verdicts }
}

function wilson95(hits, n) {
  if (n === 0) return [0, 0]
  const p = hits / n
  const z = 1.96
  const denom = 1 + (z * z) / n
  const center = p + (z * z) / (2 * n)
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, ((center - spread) / denom) * 100), Math.min(100, ((center + spread) / denom) * 100)]
}

async function main() {
  console.error(`Loading v26 random-100 cases from ${BASE_URL}…`)
  let cohort = await loadCohort()
  console.error(`Loaded ${cohort.length} v26 random-100 cases`)
  if (LIMIT < cohort.length) cohort = cohort.slice(0, LIMIT)

  const perCase = []
  let done = 0
  for (const tc of cohort) {
    try {
      const r = await analyzeCase(tc)
      perCase.push({
        id: tc.id,
        gt: tc.groundTruth?.diagnosis,
        gtOmim: tc.groundTruth?.icd10,
        top1: tc.pipelineResult?.differentialDiagnoses?.[0]?.diagnosis,
        conditionA: r.conditionA,
        conditionB: r.conditionB,
        conditionC: r.conditionC,
        tests: r.tests,
        verdicts: r.verdicts,
      })
    } catch (err) {
      perCase.push({
        id: tc.id,
        gt: tc.groundTruth?.diagnosis,
        error: err.message,
      })
    }
    done++
    process.stderr.write(`  ${done}/${cohort.length}\r`)
  }
  console.error()

  const valid = perCase.filter((c) => !c.error)
  const nA = valid.filter((c) => c.conditionA).length
  const nAB = valid.filter((c) => c.conditionA || c.conditionB).length
  const nABC = valid.filter((c) => c.conditionA || c.conditionB || c.conditionC).length
  const N = valid.length

  console.log()
  console.log(`Q2 — "Within one clear test of the diagnosis" — v26 random-100`)
  console.log('====================================================================')
  console.log(`Valid cases: ${N} of ${perCase.length}`)
  console.log()
  const fmt = (hits) => {
    const rate = (hits / N) * 100
    const [lo, hi] = wilson95(hits, N)
    return `${rate.toFixed(1)}%  (${hits}/${N})  95% CI [${lo.toFixed(1)}, ${hi.toFixed(1)}]`
  }
  console.log(`(a) Top-1 correct (v4 Mondo any-credit):        ${fmt(nA)}`)
  console.log(`(a) OR (b) Top-1 test confirms ground truth:    ${fmt(nAB)}`)
  console.log(`(a) OR (b) OR (c) Any top-5 test confirms:      ${fmt(nABC)}`)
  console.log()
  const lift_ab = nAB - nA
  const lift_abc = nABC - nA
  console.log(`Lift from adding top-1 test-confirmation:       +${lift_ab} cases (+${(lift_ab / N * 100).toFixed(1)}pp)`)
  console.log(`Lift from adding top-5 test-confirmation:       +${lift_abc} cases (+${(lift_abc / N * 100).toFixed(1)}pp)`)

  const outFile = 'scripts/q2-within-one-test-report.json'
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        cohort: 'v26 random-100',
        model: CLAUDE_MODEL,
        totals: {
          N,
          conditionA: nA,
          conditionAB: nAB,
          conditionABC: nABC,
        },
        perCase,
      },
      null,
      2,
    ),
  )
  console.log(`\nPer-case audit written to ${outFile}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
