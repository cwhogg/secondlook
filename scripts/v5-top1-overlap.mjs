#!/usr/bin/env node
/**
 * v5 Top-1 baseline overlap
 *
 * For each of the 26 ppkt_ids where SecondLook v5 hit Top-1, look up the
 * sibling o3 v5 and claude opus-4-7 v5 runs from KV and report their
 * correctDiagnosisRank. Tells us: of the cases SL won outright, how many
 * did each single-shot baseline also win?
 *
 * Sets the historical anchor we'll compare the v12-replay results against.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const V5_TOP1_HIT_PPKT_IDS = [
  "PMID_29290338_Family_UG_R665_F_individual_F",
  "PMID_11175294_Patient_B15",
  "PMID_29290338_Family_UAB_R4624_individual_RS",
  "PMID_35190816_STX_31394400_P1",
  "PMID_20513137_individual_NF00886_GSM_GSM492682",
  "PMID_23993194_Family_4_Case_6",
  "PMID_31337854_Patient_55",
  "PMID_24736735_G028",
  "PMID_9199560_Maslen_1997_Patient_CS971736",
  "PMID_26178382_MADR_690_I1",
  "PMID_14569098_F9_individual_1",
  "PMID_33674768_Patient_70_Miyake_2012_Hum_Mutat_34_108",
  "PMID_30804983_9_month_old_girl",
  "PMID_26178382_UAB_R7464",
  "PMID_28513613_family_2",
  "PMID_37843397_Patient_UM38",
  "PMID_32219868_F2_IV_1",
  "PMID_28782633_Family_1_14_year_old_male_P8",
  "PMID_27764983_Family_1_individual_TJ",
  "PMID_37843397_Patient_UM49",
  "PMID_15781812_individual_104",
  "PMID_26981933_Family_F_individual_F2",
  "PMID_38284454_Patient_13",
  "PMID_33674768_Patient_32_This_study",
  "PMID_12203992_Patient_D30",
  "PMID_17160901_family_C_individual_2",
];

const ID_SET = new Set(V5_TOP1_HIT_PPKT_IDS);

const res = await fetch(`${BASE}/api/admin/test-cases`);
if (!res.ok) {
  console.error(`fetch failed: ${res.status}`);
  process.exit(1);
}
const data = await res.json();
const all = data.testCases || [];

// Filter to v5-tagged Eval testCases for our 26 ppkt_ids.
// The ppkt_id is stored on the testCase as groundTruth.diagnosis or similar —
// inspect a sample to find the right field.
const sample = all.find(tc => tc.testVersion === 'Eval' && tc.evalVersion === 'v5');
if (!sample) {
  console.error('No v5 Eval testCases found in KV');
  process.exit(1);
}

// ppkt_id is persisted under `categoryHint` on Eval testCases (see
// generation flow at /api/admin/test-cases — the eval runner sets the
// hint from the original Phenopacket2Prompt row id).
const ppktKey = 'categoryHint';
console.log(`Using ppkt_id field: ${ppktKey}\n`);

// Build a per-ppkt_id × engine lookup.
// Each (ppkt_id, evalRunMode) should have one v5 testCase.
const byPpktByEngine = new Map(); // ppkt_id -> { secondlook, openai, claude }
for (const tc of all) {
  if (tc.testVersion !== 'Eval') continue;
  if (tc.evalVersion !== 'v5') continue;
  const ppkt = tc[ppktKey];
  if (!ppkt || !ID_SET.has(ppkt)) continue;
  const engine = tc.evalRunMode || 'secondlook';
  if (!byPpktByEngine.has(ppkt)) byPpktByEngine.set(ppkt, {});
  // If multiple v5 runs for the same engine+ppkt, keep the most recent.
  const existing = byPpktByEngine.get(ppkt)[engine];
  if (!existing || (tc.createdAt > existing.createdAt)) {
    byPpktByEngine.get(ppkt)[engine] = tc;
  }
}

// Build the per-case table.
const rows = [];
let foundCount = 0;
for (const ppkt of V5_TOP1_HIT_PPKT_IDS) {
  const trio = byPpktByEngine.get(ppkt);
  if (!trio) {
    rows.push({ ppkt, dx: '(no v5 testCases found)', sl: '-', oai: '-', cl: '-' });
    continue;
  }
  foundCount++;
  const sl = trio.secondlook;
  const oai = trio.openai;
  const cl = trio.claude;
  const dx = sl?.groundTruth?.diagnosis || oai?.groundTruth?.diagnosis || cl?.groundTruth?.diagnosis || '?';
  const slRank = sl?.grading?.correctDiagnosisRank ?? null;
  const oaiRank = oai?.grading?.correctDiagnosisRank ?? null;
  const clRank = cl?.grading?.correctDiagnosisRank ?? null;
  rows.push({
    ppkt: ppkt.slice(0, 50),
    dx: dx.slice(0, 45),
    sl: slRank === null ? '-' : (slRank === 1 ? '#1' : `#${slRank}`),
    oai: oaiRank === null ? '-' : (oaiRank === 1 ? '#1' : `#${oaiRank}`),
    cl: clRank === null ? '-' : (clRank === 1 ? '#1' : `#${clRank}`),
  });
}

// Print the per-case table.
const colW = { ppkt: 52, dx: 47, sl: 5, oai: 5, cl: 5 };
const head = `${'ppkt_id'.padEnd(colW.ppkt)}  ${'ground truth'.padEnd(colW.dx)}  ${'SL'.padStart(colW.sl)}  ${'OAI'.padStart(colW.oai)}  ${'CL'.padStart(colW.cl)}`;
console.log(head);
console.log('─'.repeat(head.length));
for (const r of rows) {
  console.log(
    `${r.ppkt.padEnd(colW.ppkt)}  ${r.dx.padEnd(colW.dx)}  ${r.sl.padStart(colW.sl)}  ${r.oai.padStart(colW.oai)}  ${r.cl.padStart(colW.cl)}`
  );
}

// Aggregate.
let slTop1 = 0, oaiTop1 = 0, clTop1 = 0;
let slTop5 = 0, oaiTop5 = 0, clTop5 = 0;
let slMissing = 0, oaiMissing = 0, clMissing = 0;
for (const ppkt of V5_TOP1_HIT_PPKT_IDS) {
  const trio = byPpktByEngine.get(ppkt) || {};
  const slRank = trio.secondlook?.grading?.correctDiagnosisRank ?? null;
  const oaiRank = trio.openai?.grading?.correctDiagnosisRank ?? null;
  const clRank = trio.claude?.grading?.correctDiagnosisRank ?? null;
  if (slRank === null) slMissing++; else { if (slRank === 1) slTop1++; if (slRank <= 5) slTop5++; }
  if (oaiRank === null) oaiMissing++; else { if (oaiRank === 1) oaiTop1++; if (oaiRank <= 5) oaiTop5++; }
  if (clRank === null) clMissing++; else { if (clRank === 1) clTop1++; if (clRank <= 5) clTop5++; }
}

console.log('\n' + '─'.repeat(head.length));
console.log(`SUMMARY across ${V5_TOP1_HIT_PPKT_IDS.length} ppkt_ids (SL v5 Top-1 hits)`);
console.log(`SL  v5:   Top-1 ${slTop1}/${V5_TOP1_HIT_PPKT_IDS.length - slMissing}    Top-5 ${slTop5}/${V5_TOP1_HIT_PPKT_IDS.length - slMissing}    missing: ${slMissing}`);
console.log(`OAI v5:   Top-1 ${oaiTop1}/${V5_TOP1_HIT_PPKT_IDS.length - oaiMissing}    Top-5 ${oaiTop5}/${V5_TOP1_HIT_PPKT_IDS.length - oaiMissing}    missing: ${oaiMissing}`);
console.log(`CL  v5:   Top-1 ${clTop1}/${V5_TOP1_HIT_PPKT_IDS.length - clMissing}    Top-5 ${clTop5}/${V5_TOP1_HIT_PPKT_IDS.length - clMissing}    missing: ${clMissing}`);
console.log(`\nKB rows located: ${foundCount}/${V5_TOP1_HIT_PPKT_IDS.length}`);
