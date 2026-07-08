#!/usr/bin/env node
/**
 * case-vs-baselines.mjs
 *
 * Take a real production case (a `req_...` id from prod-runs) and run
 * exactly what the user typed through OpenAI o3 and Claude Opus 4.7,
 * asking each for a top-10 rare-disease differential. Then dump the
 * three lists side-by-side (SL's actual + OAI + Claude) so we can eyeball
 * whether SL beats the raw-model baselines on that specific case.
 *
 * "What the user typed" here means the user-facing inputs only —
 * chief-complaint narrative, demographics, medical-history fields.
 * No mapped symptoms (SNOMED-mapped structured data), no symptom
 * patterns, no KB retrieval results, no pipeline metadata. Baselines
 * get exactly the raw text a doctor would read in a chart note.
 *
 * Uses the existing /api/admin/eval-baseline endpoint (same one that
 * ran the head-to-head baselines on Phenopacket2Prompt cases), so the
 * prompt + model + reasoning_effort match the published methodology.
 *
 * Usage:
 *   TESTING_PASSWORD=xxx BASE_URL=https://www.secondlookdx.com \
 *     node scripts/case-vs-baselines.mjs req_079bdc72-a2ea-4349-b348-787d2efde664
 *
 * Env:
 *   BASE_URL            prod URL (default: https://www.secondlookdx.com)
 *   TESTING_PASSWORD    admin password (required — auths against /api/admin/*)
 */

const BASE_URL = process.env.BASE_URL || 'https://www.secondlookdx.com'
const PASSWORD = process.env.TESTING_PASSWORD || ''

const CASE_ID = process.argv[2]
if (!CASE_ID) {
  console.error('usage: case-vs-baselines.mjs <req_id>')
  process.exit(2)
}
if (!PASSWORD) {
  console.error('TESTING_PASSWORD env required')
  process.exit(2)
}

const HEADERS = { 'x-admin-password': PASSWORD, 'Content-Type': 'application/json' }

/** Fetch the full stored prod-run by id (patientCase + analysisResult). */
async function fetchCase(id) {
  const res = await fetch(`${BASE_URL}/api/admin/prod-runs/${encodeURIComponent(id)}`, {
    headers: HEADERS,
  })
  if (!res.ok) throw new Error(`GET prod-runs/${id} ${res.status}: ${await res.text().catch(() => '')}`)
  const body = await res.json()
  return body.run
}

/**
 * Build the "raw patient" vignette from user-entered fields only.
 * Deliberately skips patientCase.symptoms (SNOMED-mapped) and
 * patientCase.symptomPatterns (analysis output) — baselines should see
 * exactly what the patient typed, not what we extracted.
 */
function buildRawVignette(patientCase) {
  const parts = []
  const demo = patientCase.demographics || {}
  const header = [
    demo.age ? `${demo.age}-year-old` : null,
    demo.sex ? demo.sex.toLowerCase() : null,
  ].filter(Boolean).join(' ') || 'Patient'
  parts.push(`Patient: ${header}.`)

  const chief = patientCase.chiefComplaint?.description?.trim()
  if (chief) {
    parts.push(`\nChief complaint and history (verbatim):\n${chief}`)
  }

  const hx = patientCase.medicalHistory || {}
  const meds = (hx.currentMedications || [])
    .map((m) => (typeof m === 'string' ? m : m?.name || m?.medication || ''))
    .filter(Boolean)
  if (meds.length) parts.push(`\nCurrent medications: ${meds.join('; ')}`)
  if (hx.pastMedicalHistory?.length) {
    parts.push(`\nPast medical history: ${hx.pastMedicalHistory.join('; ')}`)
  }
  if (hx.familyHistory?.length) {
    parts.push(`\nFamily history: ${hx.familyHistory.join('; ')}`)
  }
  if (hx.recentTests?.length || hx.testingHistory?.length) {
    const t = [...(hx.recentTests || []), ...(hx.testingHistory || [])]
    parts.push(`\nTests done: ${t.join('; ')}`)
  }
  if (hx.medicalCare) parts.push(`\nMedical care so far: ${hx.medicalCare}`)

  if (patientCase.patientHypothesis) {
    parts.push(`\nPatient's own suspicion: ${patientCase.patientHypothesis}`)
  }

  if (patientCase.labResults?.length) {
    parts.push(`\nLab results provided by patient:`)
    for (const l of patientCase.labResults) {
      const line = [l.testName, l.value, l.unit, l.referenceRange && `(ref ${l.referenceRange})`, l.flag && `[${l.flag}]`]
        .filter(Boolean).join(' ')
      parts.push(`  - ${line}`)
    }
  }

  return parts.join('\n')
}

async function callBaseline(model, caseDescription, ppkt_id) {
  const t0 = Date.now()
  const res = await fetch(`${BASE_URL}/api/admin/eval-baseline`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ ppkt_id, caseDescription, model }),
  })
  const durationMs = Date.now() - t0
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`eval-baseline (${model}) ${res.status}: ${detail.slice(0, 400)}`)
  }
  const body = await res.json()
  return { diagnoses: body.diagnoses || [], durationMs, model: body.generationMetadata?.model || model }
}

function printList(header, items) {
  console.log(`\n${'─'.repeat(72)}`)
  console.log(header)
  console.log(`${'─'.repeat(72)}`)
  items.slice(0, 10).forEach((d, i) => {
    const name = typeof d === 'string' ? d : d.diagnosis
    const reason = typeof d === 'string' ? '' : (d.reasoning || d.clinicalReasoning || '')
    console.log(`  ${String(i + 1).padStart(2)}. ${name}`)
    if (reason) console.log(`      ${reason.slice(0, 200).replace(/\n/g, ' ')}`)
  })
}

;(async () => {
  console.log(`Fetching case ${CASE_ID} from ${BASE_URL}…`)
  const run = await fetchCase(CASE_ID)
  const vignette = buildRawVignette(run.patientCase)

  console.log(`\n${'═'.repeat(72)}`)
  console.log('RAW VIGNETTE SENT TO BASELINES')
  console.log(`${'═'.repeat(72)}`)
  console.log(vignette)
  console.log(`\n(${vignette.length} chars, ~${Math.round(vignette.length / 4)} tokens)`)

  const slDiagnoses = run.analysisResult?.differentialDiagnoses || []
  printList(`SECONDLOOK — actual pipeline output (top 10)`, slDiagnoses)

  console.log(`\nCalling OpenAI o3 baseline (30-90s expected)…`)
  const oai = await callBaseline('openai', vignette, CASE_ID)
  printList(`OPENAI o3 — raw baseline (top 10, ${(oai.durationMs / 1000).toFixed(1)}s)`, oai.diagnoses)

  console.log(`\nCalling Claude Opus 4.7 baseline (30-90s expected)…`)
  const cla = await callBaseline('claude', vignette, CASE_ID)
  printList(`CLAUDE OPUS 4.7 — raw baseline (top 10, ${(cla.durationMs / 1000).toFixed(1)}s)`, cla.diagnoses)

  const sl1 = slDiagnoses[0]?.diagnosis || '(none)'
  const oai1 = oai.diagnoses[0]?.diagnosis || '(none)'
  const cla1 = cla.diagnoses[0]?.diagnosis || '(none)'
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`SUMMARY — position-#1 side by side`)
  console.log(`${'═'.repeat(72)}`)
  console.log(`  SecondLook       : ${sl1}`)
  console.log(`  OpenAI o3        : ${oai1}`)
  console.log(`  Claude Opus 4.7  : ${cla1}`)
  console.log(`\nDone.`)
})().catch((err) => {
  console.error('FAILED:', err?.message || err)
  process.exit(1)
})
