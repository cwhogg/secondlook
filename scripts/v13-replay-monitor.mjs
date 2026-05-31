#!/usr/bin/env node
/**
 * v13 replay progress monitor
 *
 * Polls /api/admin/test-cases every 90s and emits a single stdout line
 * whenever the v13 graded-trio count changes. Each line is a chat
 * notification. Built for use inside the Monitor tool — keep stdout
 * tight (one line per genuine event).
 *
 * Also emits a one-line summary at startup so the first poll is visible.
 *
 * Compares against historical v5 baselines (the 26 SL Top-1 cohort) so
 * each update carries the running delta:
 *   "v13 trios: 4/26 — SL 4/4 (v5 was 4/4), OAI 3/4 (v5 was 3/4), CL 3/4"
 */

const BASE = process.env.BASE_URL || 'http://localhost:3002';

const V5_TOP1_HIT_PPKT_IDS = new Set([
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
]);

async function poll() {
  try {
    const res = await fetch(`${BASE}/api/admin/test-cases`);
    if (!res.ok) return { error: `fetch ${res.status}` };
    const data = await res.json();
    const all = data.testCases || [];

    // For each ppkt_id in our 26, find v13 and v5 graded testCases per mode.
    const v13ByPpktByMode = new Map(); // ppkt -> { secondlook, openai, claude }
    const v5ByPpktByMode = new Map();
    for (const tc of all) {
      if (tc.testVersion !== 'Eval') continue;
      if (tc.status !== 'graded' || !tc.grading) continue;
      const hint = tc.categoryHint;
      if (!V5_TOP1_HIT_PPKT_IDS.has(hint)) continue;
      const mode = tc.evalRunMode || 'secondlook';
      const map = tc.evalVersion === 'v13' ? v13ByPpktByMode : tc.evalVersion === 'v5' ? v5ByPpktByMode : null;
      if (!map) continue;
      if (!map.has(hint)) map.set(hint, {});
      const slot = map.get(hint);
      if (!slot[mode] || tc.createdAt > slot[mode].createdAt) slot[mode] = tc;
    }

    let v13TrioCount = 0;
    let slHit = 0, oaiHit = 0, clHit = 0;
    let slDen = 0, oaiDen = 0, clDen = 0;
    let v5SlHitForCompleted = 0, v5OaiHitForCompleted = 0, v5ClHitForCompleted = 0;

    for (const [ppkt, modes] of v13ByPpktByMode) {
      const complete = modes.secondlook && modes.openai && modes.claude;
      if (!complete) continue;
      v13TrioCount++;
      const slRank = modes.secondlook.grading.correctDiagnosisRank;
      const oaiRank = modes.openai.grading.correctDiagnosisRank;
      const clRank = modes.claude.grading.correctDiagnosisRank;
      if (slRank !== null) { slDen++; if (slRank === 1) slHit++; }
      if (oaiRank !== null) { oaiDen++; if (oaiRank === 1) oaiHit++; }
      if (clRank !== null) { clDen++; if (clRank === 1) clHit++; }
      // What did v5 do on the SAME ppkt_id (so the delta is per-completed-case)?
      const v5 = v5ByPpktByMode.get(ppkt) || {};
      if (v5.secondlook?.grading?.correctDiagnosisRank === 1) v5SlHitForCompleted++;
      if (v5.openai?.grading?.correctDiagnosisRank === 1) v5OaiHitForCompleted++;
      if (v5.claude?.grading?.correctDiagnosisRank === 1) v5ClHitForCompleted++;
    }

    return {
      v13TrioCount,
      slHit, slDen,
      oaiHit, oaiDen,
      clHit, clDen,
      v5SlHitForCompleted,
      v5OaiHitForCompleted,
      v5ClHitForCompleted,
    };
  } catch (e) {
    return { error: e.message };
  }
}

function summarize(s) {
  if (s.error) return `[v13 monitor] poll error: ${s.error}`;
  return (
    `[v13 replay] ${s.v13TrioCount}/26 trios — ` +
    `SL ${s.slHit}/${s.slDen} (v5: ${s.v5SlHitForCompleted}/${s.v13TrioCount}) · ` +
    `OAI ${s.oaiHit}/${s.oaiDen} (v5: ${s.v5OaiHitForCompleted}/${s.v13TrioCount}) · ` +
    `CL ${s.clHit}/${s.clDen} (v5: ${s.v5ClHitForCompleted}/${s.v13TrioCount})`
  );
}

let lastSummary = '';
let lastTrioCount = -1;

// Emit once immediately so the user sees the current state.
const first = await poll();
console.log(summarize(first));
lastSummary = summarize(first);
lastTrioCount = first.v13TrioCount ?? -1;

const POLL_MS = 90 * 1000;
const MAX_MINUTES = 90;
const DEADLINE = Date.now() + MAX_MINUTES * 60 * 1000;

while (Date.now() < DEADLINE) {
  await new Promise((r) => setTimeout(r, POLL_MS));
  const s = await poll();
  const sum = summarize(s);
  // Only emit when the trio count advances OR on a fatal error change.
  if (s.error && lastSummary !== sum) {
    console.log(sum);
    lastSummary = sum;
  } else if (!s.error && s.v13TrioCount !== lastTrioCount) {
    console.log(sum);
    lastTrioCount = s.v13TrioCount;
    lastSummary = sum;
    if (s.v13TrioCount >= 26) {
      console.log('[v13 replay] COMPLETE — 26/26 trios graded. Run scripts/v13-vs-v5-compare.mjs for the full side-by-side table.');
      break;
    }
  }
}
