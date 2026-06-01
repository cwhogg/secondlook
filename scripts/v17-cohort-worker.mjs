#!/usr/bin/env node
/**
 * Per-case worker for the v17 cohort run.
 *
 * Usage: node scripts/v17-cohort-worker.mjs <ppkt_id>
 *
 * Reads:
 *   /tmp/v17-cohort/<ppkt>.patient.json
 *   /tmp/v17-cohort/<ppkt>.meta.json
 *   /tmp/v16-analysis.json — for v16 baseline comparison
 *
 * Calls prod /api/analyze-patient-v2 via `vercel curl`, parses the SSE response,
 * builds a v17 testCase, persists it via prod /api/admin/test-cases.
 *
 * Emits a single completion summary line on stdout (so a parent monitor can
 * react per-case).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PPKT = process.argv[2];
if (!PPKT) {
  console.error('usage: v17-cohort-worker.mjs <ppkt_id>');
  process.exit(2);
}

const OUT_DIR = '/tmp/v17-cohort';
const patientPath = `${OUT_DIR}/${PPKT}.patient.json`;
const metaPath = `${OUT_DIR}/${PPKT}.meta.json`;
const ssePath = `${OUT_DIR}/${PPKT}.sse.txt`;

if (!existsSync(patientPath) || !existsSync(metaPath)) {
  console.error(`[${PPKT}] missing prep files`);
  process.exit(2);
}

// === 1. Call analyze-patient-v2 via vercel curl ===
const start = Date.now();
const BYPASS = process.env.COHORT_BYPASS_SECRET || '';

const runVercelCurl = (subPath, dataPath, extraHeaders = []) => new Promise((resolveP, reject) => {
  const args = [
    'curl', subPath, '--',
    '-N', '--max-time', '540', '-s', '-w', '\nHTTP_STATUS=%{http_code}\n',
    '--header', 'Content-Type: application/json',
  ];
  for (const h of extraHeaders) {
    args.push('--header', h);
  }
  args.push('--request', 'POST', '--data-binary', `@${dataPath}`);
  const child = spawn('vercel', args, { cwd: ROOT });
  let out = '';
  let err = '';
  // Stream stdout so we can read mid-progress events (heartbeats, stage
  // detail) and detect server-side hangs vs liveness.
  child.stdout.on('data', (d) => {
    out += d.toString();
    // Best-effort: parse the latest data: events as they arrive.
    const newLines = d.toString().split('\n');
    for (const line of newLines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const ev = JSON.parse(line.slice(6));
        if (ev.stage === 'heartbeat' && ev.detail) {
          // Heartbeat from server — proves the function is alive.
          process.stderr.write(`[${PPKT}] hb: ${ev.detail}\n`);
        } else if (ev.detail && ev.stage && ev.stage !== 'heartbeat') {
          process.stderr.write(`[${PPKT}] ${ev.stage}: ${ev.detail.slice(0, 100)}\n`);
        }
      } catch { /* not JSON */ }
    }
  });
  child.stderr.on('data', (d) => { err += d.toString(); });
  child.on('exit', (code) => {
    if (code !== 0) reject(new Error(`vercel curl exit ${code}: ${err.slice(0, 300)}`));
    else resolveP(out);
  });
});

const extraHeaders = BYPASS ? [`X-Cohort-Bypass: ${BYPASS}`] : [];

let sseRaw;
try {
  sseRaw = await runVercelCurl('/api/analyze-patient-v2', patientPath, extraHeaders);
} catch (err) {
  const elapsedSec = Math.round((Date.now() - start) / 1000);
  console.log(`COMPLETE ${PPKT} status=VERCEL_CURL_FAILED elapsed=${elapsedSec}s err=${err.message.slice(0, 200)}`);
  process.exit(1);
}
writeFileSync(ssePath, sseRaw);

// === 2. Parse SSE for final analysisResult and check for errors ===
// Three failure modes to distinguish:
//   - 429 rate-limited (JSON body with "error" + "retryAfter")
//   - SSE 'type: error' event (server-side throw during pipeline)
//   - timeout (no 'type: result' AND no error, ran the full 540s)
const httpStatusMatch = sseRaw.match(/HTTP_STATUS=(\d+)/);
const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[1], 10) : 0;

const sseLines = sseRaw.split('\n');
let analysis = null;
let sseError = null;
for (const line of sseLines) {
  if (!line.startsWith('data: ')) continue;
  try {
    const ev = JSON.parse(line.slice(6));
    if (ev.type === 'result' && ev.analysis) {
      analysis = ev.analysis;
    } else if (ev.type === 'error' && ev.error) {
      sseError = ev.error;
    }
  } catch { /* keepalive */ }
}

if (!analysis) {
  const elapsedSec = Math.round((Date.now() - start) / 1000);
  let status, errSummary;
  if (httpStatus === 429) {
    // Body is JSON not SSE in this case
    let body = sseRaw.replace(/\nHTTP_STATUS=\d+\n?$/, '');
    let retryAfter = null;
    try { retryAfter = JSON.parse(body).retryAfter; } catch {}
    status = 'RATE_LIMITED';
    errSummary = `retryAfter=${retryAfter}s`;
  } else if (sseError) {
    status = 'PIPELINE_ERROR';
    errSummary = sseError.slice(0, 250);
  } else if (elapsedSec >= 530) {
    status = 'TIMEOUT';
    errSummary = `hit --max-time 540s`;
  } else if (httpStatus && httpStatus !== 200) {
    status = `HTTP_${httpStatus}`;
    errSummary = sseRaw.slice(0, 300).replace(/\n/g, ' ');
  } else {
    status = 'NO_RESULT';
    errSummary = `httpStatus=${httpStatus} sseBytes=${sseRaw.length}`;
  }
  console.log(`COMPLETE ${PPKT} status=${status} elapsed=${elapsedSec}s err="${errSummary}"`);
  process.exit(1);
}

// === 3. Build v17 testCase + persist ===
const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
const testCase = {
  id: `eval_${PPKT}_secondlook_${Date.now()}`,
  createdAt: new Date().toISOString(),
  difficulty: 3,
  categoryHint: PPKT,
  testVersion: 'Eval',
  evalVersion: 'v17',
  evalRunMode: 'secondlook',
  status: 'graded',
  source: 'generated',
  groundTruth: meta.groundTruth,
  generatedPatient: meta.generatedPatient,
  extractedSymptoms: meta.extractedSymptoms,
  extractedExcludedFindings: meta.extractedExcludedFindings,
  pipelineResult: analysis,
};

// === Inline v2 grading so the testCase lands on /eval with grade attached ===
// SecondLook tab on /eval requires tc.grading to render trio rows. Without
// this step, freshly-completed v17 cases appear ungraded and need backfill.
const gradeRequest = {
  groundTruth: {
    diagnosis: meta.groundTruth.diagnosis,
    icd10: meta.groundTruth.icd10 || null,
    prevalence: meta.groundTruth.prevalence || null,
    keyFindings: meta.groundTruth.keyFindings || [],
    expectedBodySystems: meta.groundTruth.expectedBodySystems || [],
    expectedSpecialists: meta.groundTruth.expectedSpecialists || [],
    nearMisses: meta.groundTruth.nearMisses || [],
  },
  differentialDiagnoses: (analysis.differentialDiagnoses || []).slice(0, 10).map((d) => ({
    diagnosis: d.diagnosis,
    evidenceScore: d.evidenceScore || 0,
    confidenceScore: d.confidenceScore || 0,
    clinicalReasoning: d.clinicalReasoning || '',
    supportingEvidence: d.supportingEvidence || [],
    sourceAgent: d.sourceAgent || 'unknown',
    evaluationType: d.evaluationType || 'reasoning-evaluated',
    knowledgeBaseMatch: !!d.knowledgeBaseMatch,
    icd10Code: d.icd10Code,
  })),
  pipelineMetadata: analysis.pipelineMetadata || {},
  familyEnrichments: analysis.familyEnrichments,
  difficulty: 3,
};

const gradePath = `${OUT_DIR}/${PPKT}.grade-req.json`;
writeFileSync(gradePath, JSON.stringify(gradeRequest));
let grading = null;
try {
  const gradeRaw = await runVercelCurl('/api/admin/grade-test', gradePath);
  const gradeBody = gradeRaw.replace(/\nHTTP_STATUS=\d+\n?$/, '');
  const gradeJson = JSON.parse(gradeBody);
  if (gradeJson.grading) {
    grading = {
      ...gradeJson.grading,
      grade: gradeJson.grading.grade,
      score: gradeJson.grading.score,
      correctDiagnosisRank: gradeJson.grading.correctDiagnosisRank ?? null,
      inTop3: gradeJson.grading.inTop3 || false,
      inTop5: gradeJson.grading.inTop5 || false,
      feedback: gradeJson.grading.feedback || '',
      tierMatch: gradeJson.grading.tierMatch,
      gradedAt: new Date().toISOString(),
    };
    testCase.grading = grading;
  }
} catch (gradeErr) {
  // Grading failure is non-fatal — case still gets persisted without grading;
  // the backfill script can fill it later.
  process.stderr.write(`[${PPKT}] grading failed: ${gradeErr.message.slice(0, 200)}\n`);
}

const persistPath = `${OUT_DIR}/${PPKT}.persist.json`;
writeFileSync(persistPath, JSON.stringify({ upsert: [testCase] }));
try {
  await runVercelCurl('/api/admin/test-cases', persistPath);
} catch (err) {
  const elapsedSec = Math.round((Date.now() - start) / 1000);
  console.log(`COMPLETE ${PPKT} status=PERSIST_FAILED elapsed=${elapsedSec}s err=${err.message.slice(0, 200)}`);
  process.exit(1);
}

// === 4. Quick analysis vs v16 baseline ===
const v16Analysis = JSON.parse(readFileSync('/tmp/v16-analysis.json', 'utf-8'));
const v16Row = v16Analysis.find((r) => r.cat === PPKT);
const v16SlRank = v16Row?.slV3 ?? v16Row?.slRankV2 ?? null;
const v16SlTop = v16Row?.slTop || '?';

const gt = (meta.groundTruth?.diagnosis || '').toLowerCase();
const diffs = analysis.differentialDiagnoses || [];
const slTop1 = diffs[0]?.diagnosis || '';

// Crude rank-of-GT — token overlap, not LLM grading.
const gtTokens = new Set(gt.split(/[^a-z0-9]+/).filter((w) => w.length > 4));
let v17SlRank = null;
for (let i = 0; i < Math.min(10, diffs.length); i++) {
  const d = (diffs[i].diagnosis || '').toLowerCase();
  const dTokens = new Set(d.split(/[^a-z0-9]+/).filter((w) => w.length > 4));
  const overlap = [...gtTokens].filter((t) => dTokens.has(t)).length;
  const ratio = overlap / Math.max(gtTokens.size, 1);
  if (ratio >= 0.5) { v17SlRank = i + 1; break; }
}

const meta_ = analysis.pipelineMetadata || {};
const stages = meta_.stages?.length || 0;
const specialists = meta_.specialistPool?.perSpecialistResults?.filter((s) => !s.failureReason).length || 0;
const totalSpec = meta_.specialistPool?.selected?.length || 0;
const dedup = `${meta_.dedupStats?.inputCount}->${meta_.dedupStats?.outputCount}`;
const critique = meta_.critique?.suggestionCount || 0;
const rankChanges = meta_.finalizerChanges?.rankChangesFromFirstPass || 0;
const tokens = meta_.totalTokensUsed || 0;
const cost = meta_.totalCostEstimate?.toFixed(2) || '?';
const elapsedSec = Math.round((Date.now() - start) / 1000);

// Single completion line — parent monitor parses this.
console.log(`COMPLETE ${PPKT} v17_rank=${v17SlRank ?? 'null'} v16_rank=${v16SlRank ?? 'null'} v17_top="${slTop1}" v16_top="${v16SlTop}" gt="${meta.groundTruth?.diagnosis}" stages=${stages} specialists=${specialists}/${totalSpec} dedup=${dedup} critique_suggestions=${critique} rank_changes=${rankChanges} tokens=${tokens} cost=$${cost} elapsed=${elapsedSec}s id=${testCase.id}`);
