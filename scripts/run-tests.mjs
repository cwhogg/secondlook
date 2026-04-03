#!/usr/bin/env node
/**
 * Automated test runner for the SecondLook diagnostic pipeline.
 * Replicates the testing page flow: generate → parse → UMLS map → pipeline (SSE) → grade.
 *
 * Usage:
 *   node scripts/run-tests.mjs --difficulties 3,4,5 --count 3 --version v2
 *
 * Requires a running dev server at http://localhost:3000
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ===== CLI ARGS =====

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { difficulties: [3, 4, 5], count: 3, version: 'v9' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--difficulties' && args[i + 1]) {
      opts.difficulties = args[++i].split(',').map(Number);
    } else if (args[i] === '--count' && args[i + 1]) {
      opts.count = parseInt(args[++i], 10);
    } else if (args[i] === '--version' && args[i + 1]) {
      opts.version = args[++i];
    }
  }
  return opts;
}

// ===== HELPERS =====

async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Parse SSE stream from analyze-patient-v2 and return the final result event */
async function runPipelineSSE(patientCase) {
  let res;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(`${BASE_URL}/api/analyze-patient-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patientCase),
    });

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const waitSec = (body.retryAfter || 60) + 5;
      console.log(`         Rate limited — waiting ${waitSec}s before retry ${attempt + 2}/5...`);
      await sleep(waitSec * 1000);
      continue;
    }
    break;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pipeline failed (${res.status}): ${text}`);
  }

  const text = await res.text();
  const events = text.split('\n\n')
    .filter(chunk => chunk.startsWith('data: '))
    .map(chunk => {
      try { return JSON.parse(chunk.replace('data: ', '')); }
      catch { return null; }
    })
    .filter(Boolean);

  const resultEvent = events.find(e => e.type === 'result');
  const errorEvent = events.find(e => e.type === 'error');

  if (errorEvent) throw new Error(`Pipeline error: ${errorEvent.error}`);
  if (!resultEvent) throw new Error('No result event in SSE stream');

  return resultEvent.analysis;
}

/** Replicate buildPatientCase from the testing page */
async function buildPatientCase(patient) {
  // Step 1: Parse symptoms from narrative
  const parseData = await apiPost('/api/parse-symptoms', {
    text: patient.narrative,
    patientAge: patient.demographics.age,
    patientSex: patient.demographics.sex,
  });

  const parsedSymptoms = parseData.symptoms || [];
  if (parsedSymptoms.length === 0) throw new Error('No symptoms parsed from narrative');

  // Step 2: Map each symptom through UMLS
  const mappedSymptoms = [];
  for (const symptom of parsedSymptoms) {
    const primaryTerm = symptom.medicalTerm || symptom.originalPhrase;
    const alternativeTerms = symptom.alternativeSearchTerms || [];

    // Call UMLS search via the API endpoint
    let umlsResult = { concepts: [], confidence: 0, error: false, searchTermUsed: primaryTerm };
    try {
      const umlsData = await apiPost('/api/umls-search', { searchTerm: primaryTerm });
      umlsResult = { concepts: umlsData.concepts || [], confidence: umlsData.confidence || 0, error: false, searchTermUsed: primaryTerm };
    } catch {
      // Try alternatives
      for (const alt of alternativeTerms) {
        try {
          const umlsData = await apiPost('/api/umls-search', { searchTerm: alt });
          if (umlsData.concepts?.length > 0) {
            umlsResult = { concepts: umlsData.concepts, confidence: umlsData.confidence || 0, error: false, searchTermUsed: alt };
            break;
          }
        } catch { /* continue */ }
      }
    }

    mappedSymptoms.push({
      originalPhrase: symptom.originalPhrase || symptom.text || 'Unknown',
      medicalTerm: symptom.medicalTerm || symptom.originalPhrase || 'Unknown',
      alternativeSearchTerms: alternativeTerms,
      category: symptom.category || null,
      severity: symptom.severity || null,
      duration: symptom.duration || null,
      bodyPart: symptom.bodyPart || null,
      umlsConcepts: umlsResult.concepts,
      selectedConcept: umlsResult.concepts[0] || null,
      confidence: umlsResult.confidence,
      confirmed: false,
      mappingError: umlsResult.error,
      feedbackStatus: 'none',
      searchTermUsed: umlsResult.searchTermUsed,
    });
  }

  // Normalize sex — LLM sometimes generates non-standard values like
  // "assigned female at birth (46,XY)" or "female (mother, caregiver proxy...)"
  const rawSex = (patient.demographics.sex || '').toLowerCase();
  const normalizedSex = rawSex.startsWith('male') ? 'male'
    : rawSex.startsWith('female') ? 'female'
    : rawSex.includes('male') ? 'male'
    : rawSex.includes('female') ? 'female'
    : 'other';

  return {
    extractedSymptoms: mappedSymptoms,
    patientCase: {
      demographics: { ...patient.demographics, sex: normalizedSex },
      symptoms: mappedSymptoms,
      symptomPatterns: null,
      patientHypothesis: null,
      medicalHistory: {
        currentMedications: patient.medicalHistory?.currentMedications || [],
        pastMedicalHistory: patient.medicalHistory?.pastMedicalHistory || [],
        familyHistory: patient.medicalHistory?.familyHistory || [],
        recentTests: patient.medicalHistory?.recentTests || [],
        medicalCare: '',
        testingHistory: [],
      },
    },
  };
}

// ===== LOAD / SAVE TEST CASES =====

async function loadTestCases() {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/test-cases`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.testCases ?? [];
  } catch { return []; }
}

async function saveTestCases(cases) {
  await fetch(`${BASE_URL}/api/admin/test-cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testCases: cases }),
  });
}

// ===== SINGLE TEST RUNNER =====

async function runSingleTest(difficulty, version, existingCases) {
  const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TEST: difficulty=${difficulty}, version=${version}, id=${testId}`);
  console.log(`${'='.repeat(60)}`);

  // 1. Generate patient
  console.log('  [1/4] Generating patient case...');
  const genData = await apiPost('/api/admin/generate-patient', {
    difficulty,
    excludeDiseases: existingCases.map(tc => tc.groundTruth.diagnosis),
  });
  console.log(`         Disease: ${genData.groundTruth.diagnosis}`);
  console.log(`         Archetype: ${genData.generationMetadata.archetype}`);

  let testCase = {
    id: testId,
    createdAt: new Date().toISOString(),
    difficulty,
    testVersion: version,
    status: 'generated',
    source: 'generated',
    groundTruth: genData.groundTruth,
    generatedPatient: genData.patient,
    generationMetadata: genData.generationMetadata,
  };

  // 2. Parse symptoms + UMLS mapping
  console.log('  [2/4] Parsing symptoms & UMLS mapping...');
  const { patientCase, extractedSymptoms } = await buildPatientCase(genData.patient);
  const mappedCount = extractedSymptoms.filter(s => !s.mappingError).length;
  console.log(`         ${extractedSymptoms.length} symptoms parsed, ${mappedCount} UMLS-mapped`);
  testCase.extractedSymptoms = extractedSymptoms;

  // 3. Run pipeline
  console.log('  [3/4] Running diagnostic pipeline (this takes a while)...');
  const pipelineStart = Date.now();
  const analysis = await runPipelineSSE(patientCase);
  const pipelineSec = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  console.log(`         Pipeline complete in ${pipelineSec}s`);
  console.log(`         Top diagnosis: ${analysis.differentialDiagnoses?.[0]?.diagnosis || 'none'}`);
  testCase.pipelineResult = analysis;
  testCase.status = 'completed';

  // 4. Grade
  console.log('  [4/4] Grading...');
  const gradeData = await apiPost('/api/admin/grade-test', {
    groundTruth: genData.groundTruth,
    differentialDiagnoses: analysis.differentialDiagnoses || [],
    pipelineMetadata: analysis.pipelineMetadata,
    familyEnrichments: analysis.familyEnrichments,
    difficulty,
  });
  testCase.grading = gradeData.grading;
  testCase.gradingMetadata = gradeData.gradingMetadata;
  testCase.status = 'graded';

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`         Grade: ${gradeData.grading.grade} (${gradeData.grading.score}/100)`);
  console.log(`         Correct rank: ${gradeData.grading.correctDiagnosisRank ?? 'not found'}`);
  console.log(`         Total time: ${totalSec}s`);

  return testCase;
}

// ===== MAIN =====

async function main() {
  const opts = parseArgs();
  console.log(`\nSecondLook Test Runner`);
  console.log(`  Difficulties: ${opts.difficulties.join(', ')}`);
  console.log(`  Tests per difficulty: ${opts.count}`);
  console.log(`  Version: ${opts.version}`);
  console.log(`  Server: ${BASE_URL}`);

  // Verify server is up
  try {
    const res = await fetch(`${BASE_URL}/api/admin/test-cases`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (e) {
    console.error(`\nERROR: Cannot reach dev server at ${BASE_URL}`);
    console.error(`Start the server with: pnpm dev`);
    process.exit(1);
  }

  let allCases = await loadTestCases();
  console.log(`\nLoaded ${allCases.length} existing test cases`);

  // Count existing GRADED tests for this version per difficulty (for resume support)
  const existingByDiff = {};
  for (const tc of allCases) {
    if ((tc.testVersion || 'v1') === opts.version && tc.status === 'graded') {
      existingByDiff[tc.difficulty] = (existingByDiff[tc.difficulty] || 0) + 1;
    }
  }

  // Build the run plan: skip difficulties that already have enough graded tests
  const targetByDiff = {};
  for (const diff of opts.difficulties) {
    const existing = existingByDiff[diff] || 0;
    const remaining = Math.max(0, opts.count - existing);
    targetByDiff[diff] = opts.count;
    if (existing > 0) {
      console.log(`  D${diff}: ${existing} already graded, ${remaining} remaining`);
    }
  }

  const totalPlanned = Object.entries(targetByDiff).reduce((sum, [diff, target]) => {
    return sum + Math.max(0, target - (existingByDiff[diff] || 0));
  }, 0);

  if (totalPlanned === 0) {
    console.log(`\nAll ${opts.difficulties.length * opts.count} tests already graded for ${opts.version}. Nothing to do.`);
  }

  const results = [];
  let completed = 0;
  const MAX_RETRIES = 2; // max retries per failed test

  // Run tests per difficulty, retrying on technical failures
  for (const diff of opts.difficulties) {
    const target = targetByDiff[diff];
    let graded = existingByDiff[diff] || 0;
    let retries = 0;

    while (graded < target) {
      completed++;
      const totalRemaining = Object.entries(targetByDiff).reduce((sum, [d, t]) => {
        const done = d < String(diff) ? t : d === String(diff) ? graded : (existingByDiff[d] || 0);
        return sum + Math.max(0, t - done);
      }, 0);
      console.log(`\n>>> Test ${completed}/${completed + totalRemaining - 1}`);

      try {
        const tc = await runSingleTest(diff, opts.version, allCases);
        results.push(tc);
        allCases = [tc, ...allCases];
        graded++;
        retries = 0; // reset retries on success

        // Save after each test so progress isn't lost
        await saveTestCases(allCases);
        console.log(`  ✓ Saved (${allCases.length} total cases)`);
      } catch (err) {
        console.error(`\n  ✗ FAILED: ${err.message}`);
        retries++;
        if (retries <= MAX_RETRIES) {
          console.log(`  ↻ Retrying D${diff} (attempt ${retries + 1}/${MAX_RETRIES + 1})...`);
        } else {
          console.error(`  ✗ Max retries reached for D${diff}, moving on`);
          break;
        }
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SUMMARY — ${opts.version} tests`);
  console.log(`${'='.repeat(60)}`);

  const graded = results.filter(r => r.status === 'graded');
  if (graded.length === 0) {
    console.log('  No tests completed successfully.');
  } else {
    const byDiff = {};
    for (const tc of graded) {
      if (!byDiff[tc.difficulty]) byDiff[tc.difficulty] = [];
      byDiff[tc.difficulty].push(tc);
    }

    console.log(`  ${'Diff'.padEnd(12)} ${'n'.padEnd(4)} ${'Avg'.padEnd(8)} ${'Top-1'.padEnd(8)} Grades`);
    for (const [diff, cases] of Object.entries(byDiff).sort((a, b) => a[0] - b[0])) {
      const avg = (cases.reduce((s, c) => s + c.grading.score, 0) / cases.length).toFixed(1);
      const top1 = cases.filter(c => c.grading.correctDiagnosisRank === 1).length;
      const grades = cases.map(c => c.grading.grade).join(', ');
      console.log(`  ${('D' + diff).padEnd(12)} ${String(cases.length).padEnd(4)} ${avg.padEnd(8)} ${(top1 + '/' + cases.length).padEnd(8)} ${grades}`);
    }

    const totalAvg = (graded.reduce((s, c) => s + c.grading.score, 0) / graded.length).toFixed(1);
    console.log(`  ${'─'.repeat(48)}`);
    console.log(`  ${'Overall'.padEnd(12)} ${String(graded.length).padEnd(4)} ${totalAvg}`);
  }

  console.log(`\nDone.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
