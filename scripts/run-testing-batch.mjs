#!/usr/bin/env node
/**
 * /admin/testing batch runner.
 *
 * Generates N synthetic patients per difficulty level (1-5), runs each
 * through the SecondLook V2 pipeline + OpenAI o3 single-shot + Claude
 * Opus single-shot trio, grades each with the v3 LLM grader inline,
 * and persists every step to KV as a TestCase so /admin/testing surfaces
 * the results.
 *
 * v4 / Mondo grading is not done inline — run
 *   npx tsx scripts/grade-eval-v4.ts --source admin-testing --persist
 * after this script completes to layer V4Grading on top of the records.
 *
 * Usage:
 *   node scripts/run-testing-batch.mjs --per-difficulty 10
 *   node scripts/run-testing-batch.mjs --per-difficulty 10 --parallelism 3
 *   node scripts/run-testing-batch.mjs --difficulties 3,4,5 --per-difficulty 5
 *   nohup node scripts/run-testing-batch.mjs --per-difficulty 10 > /tmp/v29-testing-batch.log 2>&1 &
 *
 * Env:
 *   BASE_URL                 default https://secondlook.vercel.app
 *   COHORT_BYPASS_SECRET     skip the analyze-patient-v2 rate limiter
 */

import { writeFileSync } from 'fs';

// ===== CLI =====
const args = process.argv.slice(2);
function arg(name, fallback) {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}
const PER_DIFFICULTY = parseInt(arg('per-difficulty', '10'), 10);
const PARALLELISM = parseInt(arg('parallelism', '3'), 10);
const DIFFICULTIES = (arg('difficulties', '1,2,3,4,5') || '')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => n >= 1 && n <= 5);
const CATEGORY_HINT = arg('category', '');
const BASE_URL = process.env.BASE_URL || 'https://secondlook.vercel.app';
const COHORT_BYPASS_SECRET = process.env.COHORT_BYPASS_SECRET;
const PIPELINE_TIMEOUT_MS = parseInt(arg('pipeline-timeout', '900000'), 10); // 15 min

const TOTAL = DIFFICULTIES.length * PER_DIFFICULTY;

console.log('v29 /admin/testing batch runner');
console.log('================================');
console.log(`Server         : ${BASE_URL}`);
console.log(`Difficulties   : ${DIFFICULTIES.join(', ')}`);
console.log(`Per difficulty : ${PER_DIFFICULTY}`);
console.log(`Total          : ${TOTAL} trios = ${TOTAL * 3} testCases`);
console.log(`Parallelism    : ${PARALLELISM}`);
console.log(`Category hint  : ${CATEGORY_HINT || '(none — any disease)'}`);
console.log('');

// ===== HTTP helpers =====
function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function postJson(path, body, { timeoutMs = 120_000, extraHeaders = {} } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`timeout ${path}`)), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function upsertTestCase(tc) {
  const res = await postJson('/api/admin/test-cases', { upsert: [tc] });
  if (!res.ok) {
    console.warn(`  ! upsert ${tc.id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

// ===== Pipeline runner (SSE) =====
async function runSecondLookPipeline(patientCase) {
  const headers = { 'Content-Type': 'application/json' };
  if (COHORT_BYPASS_SECRET) headers['x-cohort-bypass'] = COHORT_BYPASS_SECRET;
  const ac = new AbortController();
  const timer = setTimeout(
    () => ac.abort(new Error('analyze-patient-v2 timeout')),
    PIPELINE_TIMEOUT_MS,
  );
  try {
    const res = await fetch(`${BASE_URL}/api/analyze-patient-v2`, {
      method: 'POST',
      headers,
      body: JSON.stringify(patientCase),
      signal: ac.signal,
    });
    if (!res.ok) {
      throw new Error(`analyze-patient-v2 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const data = chunk.trim();
        if (!data.startsWith('data: ')) continue;
        let event;
        try {
          event = JSON.parse(data.slice(6));
        } catch {
          continue;
        }
        if (event.type === 'result' && event.success && event.analysis) {
          return event.analysis;
        }
        if (event.type === 'error') {
          throw new Error(event.error || 'pipeline error');
        }
      }
    }
    throw new Error('analyze-patient-v2 stream ended without a result');
  } finally {
    clearTimeout(timer);
  }
}

// ===== Baseline runner =====
async function runBaseline(generatedPatientNarrative, ppktLikeId, model) {
  const res = await postJson(
    '/api/admin/eval-baseline',
    {
      ppkt_id: ppktLikeId,
      caseDescription: generatedPatientNarrative,
      model,
    },
    { timeoutMs: 600_000 },
  );
  if (!res.ok) {
    throw new Error(`${model} baseline ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  // Synthesize the AnalysisResult shape /admin/testing expects.
  const diagnoses = data.diagnoses || [];
  const hypotheses = diagnoses.slice(0, 5).map((d, i) => ({
    diagnosis: d.diagnosis,
    confidenceScore: Math.max(20, 95 - i * 15),
    evidenceScore: Math.max(20, 95 - i * 15),
    rareDisease: false,
    supportingEvidence: [],
    contradictoryEvidence: [],
    clinicalReasoning: d.reasoning || '',
    typicalPresentation: '',
    specialistRequired: '',
    diagnosticCriteria: {
      criteriaName: 'Clinical assessment',
      totalCriteria: 0,
      metCriteria: 0,
      criteriaDetails: [],
      fulfillmentPercentage: 0,
    },
    sourceAgent: `${model}-baseline`,
    evaluationType: 'reasoning-evaluated',
    knowledgeBaseMatch: false,
  }));
  const genMeta = data.generationMetadata || { model, tokensUsed: 0, durationMs: 0 };
  return {
    differentialDiagnoses: hypotheses,
    pipelineMetadata: {
      pipelineVersion: `baseline-${model}-baseline`,
      stages: [
        {
          stageName: 'baseline-call',
          durationMs: genMeta.durationMs,
          tokensUsed: genMeta.tokensUsed,
          model: genMeta.model,
          agentName: `${model}-baseline`,
          inputSummary: 'Verbatim generated patient narrative',
          outputSummary: `${hypotheses.length} ranked differential diagnoses`,
        },
      ],
      totalDurationMs: genMeta.durationMs,
      totalTokensUsed: genMeta.tokensUsed,
      totalCostEstimate: 0,
    },
  };
}

// ===== Grader =====
async function gradeWithV3(testCase, pipelineResult) {
  const res = await postJson(
    '/api/admin/grade-test',
    {
      groundTruth: testCase.groundTruth,
      differentialDiagnoses: pipelineResult.differentialDiagnoses,
      pipelineMetadata: pipelineResult.pipelineMetadata,
      difficulty: testCase.difficulty,
    },
    { timeoutMs: 120_000 },
  );
  if (!res.ok) {
    throw new Error(`grade-test ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

// ===== buildPatientCase analog (server-side) =====
// /admin/testing's buildPatientCase calls /api/parse-symptoms to extract
// SNOMED/UMLS-mapped symptoms from the narrative. We do the same here so
// the SL pipeline receives a properly-structured case.
async function buildPatientCase(generatedPatient) {
  const parseRes = await postJson(
    '/api/parse-symptoms',
    {
      text: generatedPatient.narrative,
      patientAge: generatedPatient.demographics.age,
      patientSex: generatedPatient.demographics.sex,
    },
    { timeoutMs: 120_000 },
  );
  if (!parseRes.ok) {
    throw new Error(`parse-symptoms ${parseRes.status}: ${(await parseRes.text()).slice(0, 200)}`);
  }
  const parsed = await parseRes.json();
  const symptoms = (parsed.mappedSymptoms || []).map((s) => ({
    originalPhrase: s.originalPhrase || '',
    medicalTerm: s.medicalTerm || s.originalPhrase || '',
    selectedConcept: s.selectedConcept || null,
    bodyPart: s.bodyPart,
    category: s.category,
    severity: s.severity || 'unknown',
    duration: s.duration || 'unknown',
    onset: s.onset || 'unknown',
  }));
  const excludedFindings = (parsed.excludedFindings || []).map((e) =>
    typeof e === 'string' ? e : e.medicalTerm || e.originalPhrase || '',
  );
  return {
    demographics: generatedPatient.demographics,
    chiefComplaint: {
      description: generatedPatient.narrative,
      duration: 'unknown',
      severity: 5,
    },
    symptoms,
    excludedFindings,
    labResults: [],
    symptomPatterns: null,
    patientHypothesis: null,
    medicalHistory: {
      currentMedications: [],
      pastMedicalHistory: [],
      familyHistory: [],
      recentTests: [],
      medicalCare: '',
      testingHistory: [],
    },
  };
}

// ===== Single trio worker =====
async function processOneTrio(slot, slotLabel, difficulty) {
  const logp = (m) => process.stdout.write(`${slotLabel} ${m}\n`);

  // (1) Generate
  logp(`gen d${difficulty}...`);
  const genRes = await postJson(
    '/api/admin/generate-patient',
    {
      difficulty,
      categoryHint: CATEGORY_HINT || undefined,
    },
    { timeoutMs: 180_000 },
  );
  if (!genRes.ok) {
    throw new Error(`generate-patient ${genRes.status}: ${(await genRes.text()).slice(0, 200)}`);
  }
  const genData = await genRes.json();
  const groundTruth = genData.groundTruth;
  const patient = genData.patient;
  const genMeta = genData.generationMetadata;
  const slId = newId('test');

  const baseFields = {
    createdAt: new Date().toISOString(),
    difficulty,
    categoryHint: CATEGORY_HINT || undefined,
    source: 'generated',
    groundTruth,
    generatedPatient: patient,
    generationMetadata: genMeta,
  };
  const slCase = { ...baseFields, id: slId, testVersion: 'v29', status: 'generated' };
  await upsertTestCase(slCase);
  logp(`  gt: ${groundTruth.diagnosis} (omim: ${groundTruth.omimId || 'null'})`);

  // (2) Build the patient case + run SL pipeline
  let patientCase;
  try {
    patientCase = await buildPatientCase(patient);
  } catch (err) {
    await upsertTestCase({ ...slCase, status: 'error', pipelineError: err.message });
    throw err;
  }
  await upsertTestCase({ ...slCase, status: 'running' });
  let slResult;
  try {
    slResult = await runSecondLookPipeline(patientCase);
  } catch (err) {
    await upsertTestCase({ ...slCase, status: 'error', pipelineError: err.message });
    throw err;
  }
  await upsertTestCase({ ...slCase, status: 'completed', pipelineResult: slResult });

  // (3) Grade SL
  try {
    const grading = await gradeWithV3(slCase, slResult);
    await upsertTestCase({
      ...slCase,
      status: 'graded',
      pipelineResult: slResult,
      grading: grading.grading,
      gradingMetadata: grading.gradingMetadata,
    });
    const r = grading.grading?.correctDiagnosisRank;
    logp(`  SL: ${r === 1 ? '✓ #1' : r ? `~ #${r}` : '✗ MISS'}`);
  } catch (err) {
    logp(`  SL grade failed: ${err.message}`);
  }

  // (4) Baselines (in parallel)
  const baselineRunner = async (model) => {
    const baseCase = {
      ...baseFields,
      id: newId(`test_${model}`),
      testVersion: model === 'openai' ? 'v29-oai-baseline' : 'v29-claude-baseline',
      status: 'running',
      baselineOf: slId,
    };
    await upsertTestCase(baseCase);
    try {
      const result = await runBaseline(patient.narrative, baseCase.id, model);
      await upsertTestCase({ ...baseCase, status: 'completed', pipelineResult: result });
      const grading = await gradeWithV3(baseCase, result);
      await upsertTestCase({
        ...baseCase,
        status: 'graded',
        pipelineResult: result,
        grading: grading.grading,
        gradingMetadata: grading.gradingMetadata,
      });
      const r = grading.grading?.correctDiagnosisRank;
      logp(`  ${model}: ${r === 1 ? '✓ #1' : r ? `~ #${r}` : '✗ MISS'}`);
    } catch (err) {
      await upsertTestCase({ ...baseCase, status: 'error', pipelineError: err.message });
      logp(`  ${model} failed: ${err.message}`);
    }
  };
  await Promise.all([baselineRunner('openai'), baselineRunner('claude')]);

  return { groundTruth, slId };
}

// ===== Worker pool =====
async function main() {
  const jobs = [];
  for (const d of DIFFICULTIES) {
    for (let i = 0; i < PER_DIFFICULTY; i++) jobs.push({ difficulty: d, idx: i });
  }
  console.log(`  ${jobs.length} jobs queued; ${PARALLELISM} workers\n`);

  let completed = 0;
  let omimSet = 0;
  let omimNull = 0;
  let errors = 0;
  const start = Date.now();

  const workers = Array.from({ length: PARALLELISM }, async (_, wi) => {
    while (jobs.length > 0) {
      const job = jobs.shift();
      if (!job) break;
      const slot = completed + 1;
      const slotLabel = `[${slot}/${TOTAL}] W${wi + 1}`;
      try {
        const out = await processOneTrio(slot, slotLabel, job.difficulty);
        completed++;
        if (out.groundTruth.omimId && String(out.groundTruth.omimId).startsWith('OMIM:')) {
          omimSet++;
        } else {
          omimNull++;
        }
      } catch (err) {
        errors++;
        completed++;
        console.warn(`${slotLabel} TRIO ERROR: ${err.message}`);
      }
      console.log(
        `  → progress ${completed}/${TOTAL} (errors ${errors}, OMIM set ${omimSet}, OMIM null ${omimNull})`,
      );
    }
  });

  await Promise.all(workers);

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log('\n================================');
  console.log('v29 testing batch complete');
  console.log('================================');
  console.log(`Total trios          : ${completed}/${TOTAL}`);
  console.log(`Errors               : ${errors}`);
  console.log(`OMIM id populated    : ${omimSet}`);
  console.log(`OMIM id null/missing : ${omimNull}`);
  console.log(`Wall time            : ${elapsed}s`);

  if (omimNull > 0) {
    console.log('');
    console.log(
      `⚠ ${omimNull} cases have no usable OMIM id. v4 Mondo grading will SKIP those cases.`,
    );
    console.log(
      '  Run the v4 grader after to see exact counts:',
    );
    console.log(
      '    npx tsx scripts/grade-eval-v4.ts --source admin-testing --persist',
    );
  }

  // Persist a tiny summary file alongside benchmark results for posterity.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const summary = {
    finishedAt: new Date().toISOString(),
    base: BASE_URL,
    difficulties: DIFFICULTIES,
    perDifficulty: PER_DIFFICULTY,
    totalAttempted: TOTAL,
    completed,
    errors,
    omimSet,
    omimNull,
    wallTimeSec: parseFloat(elapsed),
  };
  const path = `scripts/benchmark-data/v29-testing-batch-${stamp}.json`;
  try {
    writeFileSync(path, JSON.stringify(summary, null, 2));
    console.log(`\nWrote summary to ${path}`);
  } catch (err) {
    console.warn(`Failed to write summary: ${err.message}`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
