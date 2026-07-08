#!/usr/bin/env node
/**
 * regenerate-pdf.mjs
 *
 * Re-render the PDF report for a stored production analysis, using
 * whatever the currently-deployed /results/print template renders. Handy
 * when a fix to the report template ships and you want to hand the fixed
 * version back to a user who ran their analysis on the previous template.
 *
 * Flow:
 *   1. GET /api/admin/prod-runs/{id}  → { patientCase, analysisResult }
 *   2. POST { analysisResult, patientCase } to /api/generate-pdf
 *   3. Stream the PDF response into a local file
 *
 * Usage:
 *   TESTING_PASSWORD=xxx BASE_URL=https://www.secondlookdx.com \
 *     node scripts/regenerate-pdf.mjs <req_id> [output.pdf]
 *
 * Default output filename: secondlook-<req_id>-<YYYY-MM-DD>.pdf in cwd.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE_URL = process.env.BASE_URL || 'https://www.secondlookdx.com'
const PASSWORD = process.env.TESTING_PASSWORD || ''

const CASE_ID = process.argv[2]
const OUT_PATH_ARG = process.argv[3]

if (!CASE_ID) {
  console.error('usage: regenerate-pdf.mjs <req_id> [output.pdf]')
  process.exit(2)
}
if (!PASSWORD) {
  console.error('TESTING_PASSWORD env required')
  process.exit(2)
}

async function fetchCase(id) {
  const res = await fetch(`${BASE_URL}/api/admin/prod-runs/${encodeURIComponent(id)}`, {
    headers: { 'x-admin-password': PASSWORD },
  })
  if (!res.ok) {
    throw new Error(`GET prod-runs/${id} ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const body = await res.json()
  return body.run
}

async function generatePdf(run) {
  const res = await fetch(`${BASE_URL}/api/generate-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      analysisResult: run.analysisResult,
      patientCase: run.patientCase,
      metadata: {
        requestId: run.id,
        createdAt: run.createdAt,
        // Best-effort: the report page reads a duration if we hand it
        // through, otherwise it renders without one.
        durationMs: run.durationMs,
      },
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`POST generate-pdf ${res.status}: ${detail.slice(0, 500)}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (!ct.startsWith('application/pdf')) {
    throw new Error(`Unexpected content-type "${ct}" (expected application/pdf)`)
  }
  return Buffer.from(await res.arrayBuffer())
}

;(async () => {
  console.log(`Fetching case ${CASE_ID} from ${BASE_URL}…`)
  const run = await fetchCase(CASE_ID)
  console.log(
    `  patient=${run.patientCase?.demographics?.age}${run.patientCase?.demographics?.sex ? '/' + run.patientCase.demographics.sex.slice(0, 1) : ''}`,
    `symptoms=${run.patientCase?.symptoms?.length ?? 0}`,
    `dxs=${run.analysisResult?.differentialDiagnoses?.length ?? 0}`,
    `stored=${run.createdAt}`,
  )

  const date = new Date().toISOString().slice(0, 10)
  const defaultName = `secondlook-${CASE_ID}-${date}.pdf`
  const outPath = resolve(process.cwd(), OUT_PATH_ARG || defaultName)

  console.log(`Requesting fresh PDF render (may take 5-10s cold)…`)
  const t0 = Date.now()
  const pdf = await generatePdf(run)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  writeFileSync(outPath, pdf)
  console.log(`  wrote ${outPath} (${(pdf.length / 1024).toFixed(1)} KB in ${elapsed}s)`)
  console.log('Done.')
})().catch((err) => {
  console.error('FAILED:', err?.message || err)
  process.exit(1)
})
