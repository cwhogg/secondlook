#!/usr/bin/env node
/**
 * Phenopacket2Prompt benchmark runner for SecondLook.
 *
 * Feeds published clinical vignettes (with known ground-truth diagnoses)
 * through the full V2 pipeline and measures Top-1/3/5/10 accuracy.
 *
 * Usage:
 *   node scripts/run-benchmark.mjs --count 50
 *   node scripts/run-benchmark.mjs --count 100 --offset 200
 *   node scripts/run-benchmark.mjs --resume            # continue from last result
 *   node scripts/run-benchmark.mjs --stats              # just print stats from results file
 *
 * Requires a running dev server at http://localhost:3000
 *
 * Dataset: Phenopacket2Prompt (Zenodo DOI 10.5281/zenodo.15065293)
 *   - 9,587 clinical vignettes with OMIM ground truth diagnoses
 *   - Published baselines: GPT-4o ~20% Top-1, o1-preview 23.6% Top-1
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DATASET_PATH = new URL('./benchmark-data/en.jsonl', import.meta.url).pathname;
const RESULTS_PATH = new URL('./benchmark-data/results.jsonl', import.meta.url).pathname;

// ===== CLI ARGS =====

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { count: 20, offset: 0, resume: false, stats: false, shuffle: false, seed: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) opts.count = parseInt(args[++i], 10);
    else if (args[i] === '--offset' && args[i + 1]) opts.offset = parseInt(args[++i], 10);
    else if (args[i] === '--resume') opts.resume = true;
    else if (args[i] === '--stats') opts.stats = true;
    else if (args[i] === '--shuffle') opts.shuffle = true;
    else if (args[i] === '--seed' && args[i + 1]) opts.seed = parseInt(args[++i], 10);
  }
  return opts;
}

// ===== HELPERS =====

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
      console.log(`         Rate limited — waiting ${waitSec}s...`);
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

// ===== DEMOGRAPHICS EXTRACTION =====

function extractDemographics(caseDescription) {
  const firstLine = caseDescription.split('\n')[0];

  // Extract sex
  let sex = 'other';
  if (/\b(man|boy|male)\b/i.test(firstLine)) sex = 'male';
  else if (/\b(woman|girl|female)\b/i.test(firstLine)) sex = 'female';

  // Extract age — try "N-year-old", "N-year, N-month old", "N-month-old"
  let age = '';
  const yearMatch = firstLine.match(/(\d+)-year[-, ]/);
  const monthOnly = firstLine.match(/(\d+)-month-old/);
  const dayOnly = firstLine.match(/(\d+)-day/);

  if (yearMatch) {
    age = yearMatch[1];
  } else if (monthOnly) {
    age = String(Math.max(0, Math.round(parseInt(monthOnly[1]) / 12)));
  } else if (dayOnly) {
    age = '0';
  }

  // If no age found from first line, search the full text
  if (!age) {
    const fullYearMatch = caseDescription.match(/(\d+)\s*(?:-\s*)?year[s]?[- ]*old/i);
    const fullMonthMatch = caseDescription.match(/(\d+)\s*(?:-\s*)?month[s]?[- ]*old/i);
    const fullDayMatch = caseDescription.match(/(\d+)\s*(?:-\s*)?day[s]?[- ]*old/i);
    const ageOfMatch = caseDescription.match(/(?:age|aged)\s+(\d+)/i);
    const atAgeMatch = caseDescription.match(/at\s+(?:the\s+)?age\s+of\s+(\d+)/i);

    if (fullYearMatch) age = fullYearMatch[1];
    else if (ageOfMatch) age = ageOfMatch[1];
    else if (atAgeMatch) age = atAgeMatch[1];
    else if (fullMonthMatch) age = String(Math.max(0, Math.round(parseInt(fullMonthMatch[1]) / 12)));
    else if (fullDayMatch) age = '0';
  }

  // Final fallback: default to "unknown" age rather than empty string (which fails Zod validation)
  if (!age) age = '30';

  return { age, sex };
}

// ===== DIAGNOSIS MATCHING =====

/** Normalize a disease name for comparison */
function normalizeName(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents: é → e
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[-–—]/g, ' ')
    .replace(/[,;:()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize subtype notation: "Ia" → "1a", "type 1a" → "1a", "type II" → "2" */
function normalizeSubtype(name) {
  const romanMap = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8' };
  return name
    .toLowerCase()
    .replace(/\btype\s+/gi, '')                    // strip "type " prefix
    .replace(/\b(i{1,3}|iv|vi{0,3}|viii?)\b/g,     // roman → arabic
      (m) => romanMap[m] || m)
    .replace(/[-–—]/g, ' ')
    .replace(/[,;:[\]{}'']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract significant medical terms (words >2 chars, not stopwords) */
const STOPWORDS = new Set([
  'the', 'and', 'with', 'type', 'syndrome', 'disease', 'disorder',
  'related', 'due', 'caused', 'form', 'variant', 'familial',
  'hereditary', 'congenital', 'infantile', 'juvenile', 'adult',
  'early', 'late', 'onset', 'severe', 'mild', 'chronic', 'acute',
  'not', 'database', 'other', 'novel',
]);

function extractMedicalTerms(name) {
  return name
    .replace(/\([^)]*\)/g, '') // strip parenthetical abbreviations like (MFM), (IBM)
    .replace(/[-–—]/g, ' ')
    .replace(/[,;:[\]{}'']/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w) && !/^\d+[a-z]?$/.test(w));
}

/** Extract text inside parentheses as separate candidate names */
function extractParentheticalNames(diagnosis) {
  const names = [];
  const parenRegex = /\(([^)]+)\)/g;
  let match;
  while ((match = parenRegex.exec(diagnosis)) !== null) {
    let content = match[1].trim();
    // Skip pure abbreviations (all caps, <6 chars) like (MFM), (IBM)
    if (/^[A-Z0-9]{1,6}$/.test(content)) continue;
    // Handle "e.g., X, Y, or Z" patterns — split into individual candidates
    content = content.replace(/^e\.?g\.?,?\s*/i, '');
    // Strip prefixes like "formerly", "previously", "also known as"
    content = content.replace(/^(?:formerly|previously|also\s+known\s+as|aka)\s+/i, '');
    const parts = content.split(/,\s*(?:or\s+)?/);
    for (const part of parts) {
      const cleaned = part.trim();
      if (cleaned.length > 3) names.push(cleaned);
    }
  }
  return names;
}

/** Check if two names match using normalized comparison */
function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  // Substring (either direction)
  if (na.length > 4 && nb.length > 4) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  // Subtype-normalized comparison
  const sa = normalizeSubtype(a);
  const sb = normalizeSubtype(b);
  if (sa === sb) return true;
  if (sa.length > 4 && sb.length > 4) {
    if (sa.includes(sb) || sb.includes(sa)) return true;
  }
  return false;
}

/** Check if pipeline diagnosis matches ground truth */
function diagnosisMatches(pipelineDiag, groundTruth) {
  const pDiag = pipelineDiag.diagnosis || '';
  const gtLabel = groundTruth.label || '';
  const gtId = groundTruth.id || '';

  // 1. Exact OMIM match
  if (gtId && pipelineDiag.omimId) {
    const pOmim = pipelineDiag.omimId.replace(/[^0-9]/g, '');
    const gtOmim = gtId.replace(/[^0-9]/g, '');
    if (pOmim && gtOmim && pOmim === gtOmim) return true;
  }

  // 2. Direct name match (exact, substring, subtype-normalized)
  if (namesMatch(pDiag, gtLabel)) return true;

  // 3. Strip type/subtype suffixes and compare base disease
  const stripType = s => normalizeName(s)
    .replace(/\s*type\s+\w+$/i, '')
    .replace(/\s*\d+[a-z]?$/i, '')
    .replace(/\s*(i{1,3}|iv|v|vi{0,3})$/i, '')
    .trim();

  const pBase = stripType(pDiag);
  const gtBase = stripType(gtLabel);
  if (pBase.length > 4 && gtBase.length > 4 && pBase === gtBase) return true;

  // 4. Medical term overlap (handles word-order differences and OMIM naming)
  const pTerms = extractMedicalTerms(pDiag);
  const gtTerms = extractMedicalTerms(gtLabel);

  if (pTerms.length >= 1 && gtTerms.length >= 1) {
    const shorter = pTerms.length <= gtTerms.length ? pTerms : gtTerms;
    const longerSet = new Set(pTerms.length <= gtTerms.length ? gtTerms : pTerms);
    const overlap = shorter.filter(t => longerSet.has(t)).length;

    // All terms match: require ≥2 terms, OR ≥1 term if it's a long compound word (>15 chars)
    if (overlap === shorter.length) {
      if (shorter.length >= 2) return true;
      if (shorter.length === 1 && shorter[0].length > 15) return true;
    }

    // High overlap: ≥75% of shorter terms match AND ≥3 overlapping terms
    // Catches cases like "Thrombophilia due to Factor VIII" vs "Thrombophilia 13 due to factor VIII defect"
    if (overlap >= 3 && overlap / shorter.length >= 0.75) return true;
  }

  // 5. Check parenthetical content — pipeline often puts specific names inside parens
  // e.g., "Inherited Retinal Dystrophy (e.g., Retinitis Pigmentosa variant)"
  const parenNames = extractParentheticalNames(pDiag);
  for (const parenName of parenNames) {
    if (namesMatch(parenName, gtLabel)) return true;
    // Also check base disease match (strip subtype suffixes)
    const parenBase = stripType(parenName);
    if (parenBase.length > 4 && gtBase.length > 4 && parenBase === gtBase) return true;
    // Also check medical term overlap with parenthetical content
    const parenTerms = extractMedicalTerms(parenName);
    if (parenTerms.length >= 1 && gtTerms.length >= 1) {
      const shorter = parenTerms.length <= gtTerms.length ? parenTerms : gtTerms;
      const longerSet = new Set(parenTerms.length <= gtTerms.length ? gtTerms : parenTerms);
      const overlap = shorter.filter(t => longerSet.has(t)).length;
      if (overlap === shorter.length && shorter.length >= 1) {
        // For single-term matches, require the term to be distinctive (>6 chars)
        if (shorter.length >= 2) return true;
        if (shorter.length === 1 && shorter[0].length > 6) return true;
      }
    }
  }

  return false;
}

/** Find the rank (1-based) of the correct diagnosis in the pipeline output */
function findCorrectRank(differentialDiagnoses, groundTruthDiag) {
  for (let i = 0; i < differentialDiagnoses.length; i++) {
    // Check against all ground truth diagnoses (usually just 1)
    for (const gt of groundTruthDiag) {
      if (diagnosisMatches(differentialDiagnoses[i], gt)) {
        return i + 1;
      }
    }
  }
  return null;
}

// ===== BUILD PATIENT CASE =====

async function buildPatientCase(caseDescription) {
  const demographics = extractDemographics(caseDescription);

  // Parse symptoms from the clinical vignette
  const parseData = await apiPost('/api/parse-symptoms', {
    text: caseDescription,
    patientAge: demographics.age,
    patientSex: demographics.sex,
  });

  const parsedSymptoms = parseData.symptoms || [];
  if (parsedSymptoms.length === 0) throw new Error('No symptoms parsed');

  // UMLS map each symptom
  const mappedSymptoms = [];
  for (const symptom of parsedSymptoms) {
    const primaryTerm = symptom.medicalTerm || symptom.originalPhrase;
    const alternativeTerms = symptom.alternativeSearchTerms || [];

    let umlsResult = { concepts: [], confidence: 0, error: false, searchTermUsed: primaryTerm };
    try {
      const umlsData = await apiPost('/api/umls-search', { searchTerm: primaryTerm });
      umlsResult = { concepts: umlsData.concepts || [], confidence: umlsData.confidence || 0, error: false, searchTermUsed: primaryTerm };
    } catch {
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

  return {
    demographics,
    symptoms: mappedSymptoms,
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

// ===== LOAD DATASET =====

function loadDataset() {
  const text = readFileSync(DATASET_PATH, 'utf8');
  return text.trim().split('\n').map(line => JSON.parse(line));
}

function loadCompletedIds() {
  if (!existsSync(RESULTS_PATH)) return new Set();
  const text = readFileSync(RESULTS_PATH, 'utf8').trim();
  if (!text) return new Set();
  return new Set(
    text.split('\n').map(line => {
      try { return JSON.parse(line).ppkt_id; }
      catch { return null; }
    }).filter(Boolean)
  );
}

function loadResults() {
  if (!existsSync(RESULTS_PATH)) return [];
  const text = readFileSync(RESULTS_PATH, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);
}

function appendResult(result) {
  appendFileSync(RESULTS_PATH, JSON.stringify(result) + '\n');
}

// ===== SEEDED SHUFFLE =====

function seededShuffle(arr, seed) {
  const copy = [...arr];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ===== STATS =====

function printStats(results) {
  const total = results.length;
  if (total === 0) {
    console.log('  No results to analyze.');
    return;
  }

  const completed = results.filter(r => r.status === 'completed');
  const errors = results.filter(r => r.status === 'error');

  const top1 = completed.filter(r => r.correctRank === 1).length;
  const top3 = completed.filter(r => r.correctRank !== null && r.correctRank <= 3).length;
  const top5 = completed.filter(r => r.correctRank !== null && r.correctRank <= 5).length;
  const top10 = completed.filter(r => r.correctRank !== null && r.correctRank <= 10).length;
  const found = completed.filter(r => r.correctRank !== null).length;
  const n = completed.length;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  BENCHMARK RESULTS — Phenopacket2Prompt`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Cases run:     ${total} (${completed.length} completed, ${errors.length} errors)`);
  console.log(`  Found anywhere: ${found}/${n} (${(100 * found / n).toFixed(1)}%)`);
  console.log();
  console.log(`  ${'Metric'.padEnd(15)} ${'Count'.padEnd(10)} Rate`);
  console.log(`  ${'─'.repeat(40)}`);
  console.log(`  ${'Top-1'.padEnd(15)} ${(top1 + '/' + n).padEnd(10)} ${(100 * top1 / n).toFixed(1)}%`);
  console.log(`  ${'Top-3'.padEnd(15)} ${(top3 + '/' + n).padEnd(10)} ${(100 * top3 / n).toFixed(1)}%`);
  console.log(`  ${'Top-5'.padEnd(15)} ${(top5 + '/' + n).padEnd(10)} ${(100 * top5 / n).toFixed(1)}%`);
  console.log(`  ${'Top-10'.padEnd(15)} ${(top10 + '/' + n).padEnd(10)} ${(100 * top10 / n).toFixed(1)}%`);

  // Published baselines for comparison
  console.log();
  console.log(`  Published baselines (5,213 cases):`);
  console.log(`  ${'─'.repeat(40)}`);
  console.log(`  ${'Exomiser'.padEnd(15)} ${''.padEnd(10)} Top-1: 35.5%  Top-3: 46.3%  Top-10: 58.5%`);
  console.log(`  ${'o1-preview'.padEnd(15)} ${''.padEnd(10)} Top-1: 23.6%  Top-3: 31.2%  Top-10: 36.8%`);
  console.log(`  ${'GPT-4o'.padEnd(15)} ${''.padEnd(10)} Top-1: ~20%   Top-3: ~27%   Top-10: ~31%`);

  // Show some misses for analysis
  const misses = completed.filter(r => r.correctRank === null).slice(0, 5);
  if (misses.length > 0) {
    console.log();
    console.log(`  Sample misses:`);
    for (const m of misses) {
      console.log(`    GT: ${m.groundTruth[0]?.label || '?'}`);
      console.log(`    #1: ${m.topDiagnoses?.[0] || 'none'}`);
      console.log();
    }
  }

  // Rank distribution
  const rankDist = {};
  for (const r of completed) {
    const bucket = r.correctRank === null ? 'miss'
      : r.correctRank <= 1 ? '1'
      : r.correctRank <= 3 ? '2-3'
      : r.correctRank <= 5 ? '4-5'
      : r.correctRank <= 10 ? '6-10'
      : '>10';
    rankDist[bucket] = (rankDist[bucket] || 0) + 1;
  }
  console.log(`  Rank distribution:`);
  for (const [bucket, count] of Object.entries(rankDist)) {
    const bar = '█'.repeat(Math.round(50 * count / n));
    console.log(`    ${bucket.padEnd(6)} ${String(count).padEnd(5)} ${bar}`);
  }
}

// ===== TEST CASE STORAGE =====

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

/** Extract HPO symptom terms from case_description for keyFindings */
function extractKeyFindings(caseDescription) {
  // The vignette lists symptoms after "presented with" and excluded after "excluded:"
  const presentedMatch = caseDescription.match(/presented with\s+(.+?)(?:\.\s*However|$)/s);
  if (!presentedMatch) return [];
  return presentedMatch[1]
    .split(/,\s*(?:and\s+)?/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 100);
}

// ===== SINGLE CASE RUNNER =====

async function runSingleCase(entry, allTestCases) {
  const startTime = Date.now();
  const { ppkt_id, diagnosis: groundTruthDiag, case_description } = entry;
  const testId = `eval_${ppkt_id}`;

  try {
    // 1. Build patient case (parse symptoms + UMLS map)
    const patientCase = await buildPatientCase(case_description);
    const symptomCount = patientCase.symptoms.length;
    const mappedCount = patientCase.symptoms.filter(s => !s.mappingError).length;

    // 2. Run pipeline
    const pipelineStart = Date.now();
    const analysis = await runPipelineSSE(patientCase);
    const pipelineSec = ((Date.now() - pipelineStart) / 1000).toFixed(1);

    // 3. Match against ground truth
    const diffs = analysis.differentialDiagnoses || [];
    const correctRank = findCorrectRank(diffs, groundTruthDiag);
    const topDiagnoses = diffs.slice(0, 5).map(d => d.diagnosis);

    // 4. Grade via the grading endpoint
    const gtLabel = groundTruthDiag[0]?.label || 'Unknown';
    const gtOmimId = groundTruthDiag[0]?.id || '';
    const keyFindings = extractKeyFindings(case_description);
    const demographics = extractDemographics(case_description);

    let grading = null;
    let gradingMetadata = null;
    try {
      const gradeData = await apiPost('/api/admin/grade-test', {
        groundTruth: {
          diagnosis: gtLabel,
          icd10: gtOmimId,
          keyFindings,
          expectedBodySystems: [],
          expectedSpecialists: [],
        },
        differentialDiagnoses: diffs,
        pipelineMetadata: analysis.pipelineMetadata,
        difficulty: 3, // neutral difficulty for benchmark cases
      });
      grading = gradeData.grading;
      gradingMetadata = gradeData.gradingMetadata;
    } catch (e) {
      console.log(`         Grading failed: ${e.message.slice(0, 80)}`);
    }

    // 5. Build TestCase for the testing page
    const testCase = {
      id: testId,
      createdAt: new Date().toISOString(),
      difficulty: 3,
      categoryHint: ppkt_id,
      testVersion: 'Eval',
      status: grading ? 'graded' : 'completed',
      source: 'generated',
      groundTruth: {
        diagnosis: gtLabel,
        icd10: gtOmimId,
        keyFindings,
        expectedBodySystems: [],
        expectedSpecialists: [],
      },
      generatedPatient: {
        narrative: case_description,
        demographics: { age: demographics.age, sex: demographics.sex },
        chiefComplaint: '',
        symptoms: [],
        medicalHistory: {
          pastMedicalHistory: [],
          familyHistory: [],
          currentMedications: [],
          recentTests: [],
        },
      },
      generationMetadata: {
        model: 'phenopacket2prompt',
        tokensUsed: 0,
        durationMs: 0,
        source: 'generated',
      },
      extractedSymptoms: patientCase.symptoms,
      pipelineResult: analysis,
      ...(grading && { grading }),
      ...(gradingMetadata && { gradingMetadata }),
    };

    // Save to testing page
    allTestCases.unshift(testCase);
    await saveTestCases(allTestCases);

    const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const rankStr = correctRank !== null ? `#${correctRank}` : 'MISS';
    const emoji = correctRank === 1 ? '✓' : correctRank !== null ? '~' : '✗';
    const gradeStr = grading ? ` Grade: ${grading.grade}` : '';
    console.log(`  ${emoji} ${rankStr.padEnd(6)} GT: ${groundTruthDiag[0]?.label}${gradeStr}`);
    console.log(`           #1: ${topDiagnoses[0] || 'none'} (${pipelineSec}s, ${symptomCount} symptoms)`);

    return {
      ppkt_id,
      status: 'completed',
      groundTruth: groundTruthDiag,
      correctRank,
      topDiagnoses,
      symptomCount,
      mappedCount,
      pipelineSec: parseFloat(pipelineSec),
      totalSec: parseFloat(totalSec),
      grade: grading?.grade || null,
      score: grading?.score || null,
    };
  } catch (err) {
    const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✗ ERROR  GT: ${groundTruthDiag[0]?.label}`);
    console.log(`           ${err.message.slice(0, 100)}`);

    return {
      ppkt_id,
      status: 'error',
      groundTruth: groundTruthDiag,
      correctRank: null,
      topDiagnoses: [],
      error: err.message,
      totalSec: parseFloat(totalSec),
    };
  }
}

// ===== MAIN =====

async function main() {
  const opts = parseArgs();

  // Stats-only mode
  if (opts.stats) {
    const results = loadResults();
    printStats(results);
    return;
  }

  console.log(`\nSecondLook Benchmark Runner — Phenopacket2Prompt`);
  console.log(`  Server: ${BASE_URL}`);
  console.log(`  Dataset: ${DATASET_PATH}`);

  // Verify server is up
  try {
    const res = await fetch(`${BASE_URL}/api/admin/test-cases`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (e) {
    console.error(`\nERROR: Cannot reach dev server at ${BASE_URL}`);
    console.error(`Start the server with: pnpm dev`);
    process.exit(1);
  }

  // Load dataset
  let dataset = loadDataset();
  console.log(`  Total cases in dataset: ${dataset.length}`);

  // Shuffle if requested
  if (opts.shuffle) {
    const seed = opts.seed ?? Date.now();
    dataset = seededShuffle(dataset, seed);
    console.log(`  Shuffled with seed: ${seed}`);
  }

  // Resume mode: skip already-completed cases
  const completedIds = loadCompletedIds();
  if (opts.resume && completedIds.size > 0) {
    console.log(`  Resuming: ${completedIds.size} cases already completed`);
    dataset = dataset.filter(entry => !completedIds.has(entry.ppkt_id));
  } else if (!opts.resume) {
    // Apply offset
    dataset = dataset.slice(opts.offset);
  }

  // Apply count limit
  const casesToRun = dataset.slice(0, opts.count);
  console.log(`  Cases to run: ${casesToRun.length}`);
  console.log();

  // Load existing test cases from testing page
  let allTestCases = await loadTestCases();
  console.log(`  Existing test cases: ${allTestCases.length}`);

  // Run cases
  let completed = 0;
  const sessionResults = [];

  for (const entry of casesToRun) {
    completed++;
    console.log(`\n[${completed}/${casesToRun.length}] ${entry.ppkt_id}`);

    const result = await runSingleCase(entry, allTestCases);
    appendResult(result);
    sessionResults.push(result);
  }

  // Print stats for this session + all results
  console.log(`\n--- Session results (${sessionResults.length} cases) ---`);
  printStats(sessionResults);

  const allResults = loadResults();
  if (allResults.length > sessionResults.length) {
    console.log(`\n--- All results (${allResults.length} cases) ---`);
    printStats(allResults);
  }

  console.log(`\nResults saved to: ${RESULTS_PATH}`);
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
