#!/usr/bin/env node
/**
 * v17 smoke test — run a single existing case through the v17 pipeline by
 * reusing the patient data from a prior v16 testCase, then persist the result
 * as a fresh evalVersion: 'v17' testCase so the eval UI and case-deep-dive
 * tooling can inspect it.
 *
 * Usage:
 *   node scripts/smoke-v17.mjs <ppkt_id>
 *   # default: PMID_10580070_Family_D_individual_II_1
 */
import { setTimeout as sleep } from 'timers/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3002';
const PPKT_ID = process.argv[2] || 'PMID_10580070_Family_D_individual_II_1';

console.log(`[smoke-v17] target ppkt: ${PPKT_ID}`);
console.log(`[smoke-v17] dev server: ${BASE}`);

// 1. Pull the existing v16 case to reuse patient data
const tcRes = await fetch(`${BASE}/api/admin/test-cases`);
const tcData = await tcRes.json();
const sample = (tcData.testCases || []).find((t) =>
  t.categoryHint === PPKT_ID
  && t.evalVersion === 'v16'
  && t.evalRunMode === 'secondlook'
);
if (!sample) {
  console.error(`[smoke-v17] no v16 SL testCase for ${PPKT_ID}`);
  process.exit(1);
}
console.log(`[smoke-v17] reusing patient data from ${sample.id}`);
console.log(`[smoke-v17] GT: ${sample.groundTruth.diagnosis}`);
console.log(`[smoke-v17] extracted symptom count: ${sample.extractedSymptoms?.length || 0}`);

// 2. Build the patientCase payload analyze-patient-v2 expects.
const patientCase = {
  demographics: {
    age: sample.generatedPatient.demographics.age,
    sex: sample.generatedPatient.demographics.sex,
  },
  chiefComplaint: {
    description: sample.generatedPatient.chiefComplaint || '',
  },
  symptoms: sample.extractedSymptoms || [],
  excludedFindings: sample.extractedExcludedFindings?.map?.((f) =>
    typeof f === 'string' ? f : f.originalPhrase || f.medicalTerm || ''
  ).filter(Boolean) || [],
  labResults: [],
  medicalHistory: sample.generatedPatient.medicalHistory || {},
};

console.log(`[smoke-v17] calling /api/analyze-patient-v2 (this will take ~3-6 min)...`);
const start = Date.now();
const res = await fetch(`${BASE}/api/analyze-patient-v2`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(patientCase),
});
console.log(`[smoke-v17] status: ${res.status}`);
if (!res.ok) {
  const text = await res.text();
  console.error(`[smoke-v17] failed: ${text.slice(0, 500)}`);
  process.exit(1);
}

// The endpoint streams SSE — read all events.
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = '';
let finalResult = null;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() || '';
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload) continue;
    try {
      const event = JSON.parse(payload);
      if (event.stage === 'complete' && event.data?.analysisResult) {
        finalResult = event.data.analysisResult;
      }
      if (event.detail) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        console.log(`[smoke-v17] [${elapsed}s] ${event.stage}: ${event.detail}`);
      }
    } catch { /* SSE keepalive or non-JSON */ }
  }
}

if (!finalResult) {
  console.error('[smoke-v17] no final analysisResult in SSE stream');
  process.exit(1);
}

const elapsedSec = ((Date.now() - start) / 1000).toFixed(0);
console.log(`\n[smoke-v17] pipeline completed in ${elapsedSec}s`);
console.log(`[smoke-v17] pipelineVersion: ${finalResult.pipelineMetadata?.pipelineVersion}`);
console.log(`[smoke-v17] stages: ${finalResult.pipelineMetadata?.stages?.length}`);
console.log(`[smoke-v17] top-5:`);
(finalResult.differentialDiagnoses || []).slice(0, 5).forEach((d, i) => {
  console.log(`   ${i + 1}. ${d.diagnosis} [conf=${d.confidenceScore} evi=${d.evidenceScore}]`);
});

// 3. Persist as a v17 testCase
const testId = `eval_${PPKT_ID}_secondlook_${Date.now()}`;
const testCase = {
  id: testId,
  createdAt: new Date().toISOString(),
  difficulty: 3,
  categoryHint: PPKT_ID,
  testVersion: 'Eval',
  evalVersion: 'v17',
  evalRunMode: 'secondlook',
  status: 'completed',
  source: 'generated',
  groundTruth: sample.groundTruth,
  generatedPatient: sample.generatedPatient,
  extractedSymptoms: sample.extractedSymptoms,
  extractedExcludedFindings: sample.extractedExcludedFindings,
  pipelineResult: finalResult,
};

const persistRes = await fetch(`${BASE}/api/admin/test-cases`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ upsert: [testCase] }),
});
console.log(`[smoke-v17] persist status: ${persistRes.status}`);
console.log(`[smoke-v17] testCase id: ${testId}`);
console.log(`\n[smoke-v17] DONE`);
