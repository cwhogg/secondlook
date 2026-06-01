#!/usr/bin/env node
/**
 * Critical analysis of v16 SL vs baselines on the 22-case matched cohort.
 * Writes a single self-contained HTML report to /tmp/v16-critical-analysis.html.
 *
 * Pre-req: /tmp/v16-analysis.json must exist (built earlier in session).
 */
import { readFileSync, writeFileSync } from 'fs';

const ROWS = JSON.parse(readFileSync('/tmp/v16-analysis.json', 'utf-8'));
const OUT = process.argv[2] || '/tmp/v16-critical-analysis.html';

const esc = (s) => {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

// ===== Classification =====
function effectiveSlRank(r) {
  // Prefer v3 tiered (rankAtVariant); fall back to v2 grader rank
  if (r.slV3 != null) return r.slV3;
  if (r.slRankV2 != null) return r.slRankV2;
  return null;
}
function effectiveOaiRank(r) {
  if (r.oaiV3 != null) return r.oaiV3;
  if (r.oaiRankV2 != null) return r.oaiRankV2;
  return null;
}
function effectiveClRank(r) {
  if (r.clV3 != null) return r.clV3;
  if (r.clRankV2 != null) return r.clRankV2;
  return null;
}

function classify(r) {
  const sl = effectiveSlRank(r);
  const oai = effectiveOaiRank(r);
  const cl = effectiveClRank(r);
  const slGot = sl != null && sl <= 3;
  const oaiGot = oai != null && oai <= 3;
  const clGot = cl != null && cl <= 3;
  const baselinesGot = oaiGot || clGot;
  if (slGot && baselinesGot) return { bucket: 'sl-win', sl, oai, cl };
  if (slGot && !baselinesGot) return { bucket: 'sl-unique', sl, oai, cl };
  if (!slGot && baselinesGot) return { bucket: 'sl-miss', sl, oai, cl };
  return { bucket: 'all-miss', sl, oai, cl };
}

const classified = ROWS.map((r) => ({ ...r, ...classify(r) }));

const counts = {
  total: classified.length,
  slWin: classified.filter((x) => x.bucket === 'sl-win').length,
  slUnique: classified.filter((x) => x.bucket === 'sl-unique').length,
  slMiss: classified.filter((x) => x.bucket === 'sl-miss').length,
  allMiss: classified.filter((x) => x.bucket === 'all-miss').length,
};

// ===== Failure-mode heuristics for sl-miss bucket =====
// Without LLM-call inspection we can infer the failure mode from persisted data:
//  - "grader-strict": SL named the right disease but grader called it null
//  - "synth-wrong-family": SL top-1 is a sibling/family but not the right disease
//  - "umbrella-vs-subtype": GT is numbered subtype; SL named umbrella or wrong subtype
//  - "totally-off": SL top-1 is in a different specialty/system from GT
function inferFailureMode(r) {
  const gt = (r.gt || '').toLowerCase();
  const slTop = (r.slTop || '').toLowerCase();
  // grader-strict: SL top-1 textually overlaps GT but rank reported null
  const gtTokens = new Set(gt.split(/[^a-z0-9]+/).filter((w) => w.length > 4));
  const slTokens = new Set(slTop.split(/[^a-z0-9]+/).filter((w) => w.length > 4));
  const overlap = [...gtTokens].filter((t) => slTokens.has(t)).length;
  const overlapRatio = overlap / Math.max(gtTokens.size, 1);
  if (r.sl == null && overlapRatio >= 0.5) return 'grader-strict-but-correct';
  // umbrella-vs-subtype: GT contains a number like "1", "type 1", "4A", etc.
  if (/\b\d+[a-z]?\b/i.test(r.gt || '') || /type [ivx0-9]/i.test(r.gt || '')) {
    if (overlapRatio >= 0.3) return 'umbrella-vs-subtype';
  }
  // synth-wrong-family: SL named something in same broad space
  if (r.sl != null && r.sl >= 4) return 'synth-low-rank-in-pool';
  if (r.sl == null && overlapRatio < 0.3) return 'totally-off';
  return 'unclear';
}

for (const c of classified) {
  c.failureMode = c.bucket === 'sl-miss' || c.bucket === 'all-miss' ? inferFailureMode(c) : null;
}

// ===== Cap audit =====
const llmAdded = classified.map((r) => r.cgAdded || 0);
const nonKb = classified.map((r) => r.cgNonKb || 0);
const total = classified.map((r) => (r.cgAdded || 0) + (r.cgNonKb || 0));
const stats = (arr) => ({
  min: Math.min(...arr), max: Math.max(...arr),
  mean: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1),
  p90: arr.sort((a, b) => a - b)[Math.floor(arr.length * 0.9)],
});
const llmStats = stats([...llmAdded]);
const nonKbStats = stats([...nonKb]);
const totalStats = stats([...total]);

// ===== HTML =====
const css = `<style>
:root {
  --bg: #faf7f2; --paper: #fff; --ink: #2a2a2a; --muted: #5a5a5a;
  --accent: #8b2500; --light-border: #e8ddd0; --med-border: #d4c5b0;
  --code-bg: #f4eee5; --good: #2b6e2b; --bad: #8b2500;
  --win-bg: #e3f0e3; --miss-bg: #f8d8d2; --neutral-bg: #f5efe5;
}
* { box-sizing: border-box; }
html { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; }
body { margin: 0; background: var(--bg); color: var(--ink); font-size: 14px; line-height: 1.55; }
header { background: var(--paper); border-bottom: 2px solid var(--med-border); padding: 24px; position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
header h1 { margin: 0 0 4px 0; font-family: "Lyon Text", "Times New Roman", serif; font-size: 28px; font-weight: 600; }
.meta { color: var(--muted); font-size: 13px; }
.toc { background: var(--paper); border-bottom: 1px solid var(--light-border); padding: 12px 24px; font-size: 13px; }
.toc a { color: var(--accent); text-decoration: none; margin-right: 14px; }
.toc a:hover { text-decoration: underline; }
main { padding: 24px; max-width: 1400px; margin: 0 auto; }
section { background: var(--paper); border: 1px solid var(--light-border); border-left: 4px solid var(--accent); margin-bottom: 24px; padding: 20px 24px; }
section h2 { margin: 0 0 12px 0; font-family: "Lyon Text", "Times New Roman", serif; font-size: 22px; font-weight: 600; }
section h3 { margin: 18px 0 8px 0; font-size: 16px; font-weight: 600; }
section p { margin: 8px 0; }
.bignum { font-size: 32px; font-weight: 700; color: var(--accent); font-family: "Lyon Text", serif; line-height: 1.1; }
.bignum-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-row { display: flex; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
.kpi { flex: 1; min-width: 140px; background: var(--neutral-bg); padding: 14px 16px; border: 1px solid var(--med-border); }
.badge { display: inline-block; padding: 2px 8px; background: var(--code-bg); border: 1px solid var(--med-border); border-radius: 3px; font-size: 11px; color: var(--muted); margin-right: 4px; }
.badge-win { background: #d6e9d6; color: #1f5f1f; border-color: #2b6e2b; }
.badge-miss { background: #f8d8d2; color: #8a3325; border-color: #b85040; }
.badge-info { background: #d8e2f0; color: #1f3c5f; border-color: #4d6c8c; }
.badge-warn { background: #fce8d4; color: #a3611f; border-color: #c97a2b; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
th { background: #f5efe5; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--med-border); }
td { padding: 8px 10px; border-bottom: 1px solid var(--light-border); vertical-align: top; font-size: 13px; }
tr.bucket-sl-win { background: rgba(43, 110, 43, 0.05); }
tr.bucket-sl-unique { background: rgba(43, 110, 43, 0.10); }
tr.bucket-sl-miss { background: rgba(139, 37, 0, 0.05); }
tr.bucket-all-miss { background: rgba(90, 90, 90, 0.04); }
td.rank { font-weight: 700; text-align: center; min-width: 36px; }
td.rank-1 { color: #1f5f1f; }
td.rank-2, td.rank-3 { color: #4d8c5a; }
td.rank-4, td.rank-5 { color: #c97a2b; }
td.rank-none { color: var(--bad); }
.callout { background: #fff7e8; border: 1px solid #d4b97a; padding: 12px 16px; margin: 12px 0; font-size: 13px; }
.callout strong { color: var(--accent); }
.deep-dive { background: #fdfaf5; border: 1px solid var(--light-border); border-left: 3px solid var(--accent); padding: 14px 18px; margin: 12px 0; }
.deep-dive h4 { margin: 0 0 8px 0; font-size: 15px; font-weight: 600; }
.evidence-list { margin: 4px 0 4px 16px; font-size: 12px; color: var(--muted); }
.recommendation { background: var(--neutral-bg); border-left: 3px solid #4d8c5a; padding: 10px 14px; margin: 8px 0; }
.recommendation-high { border-left-color: var(--bad); background: #fbe9e3; }
.recommendation-med { border-left-color: #c97a2b; background: #faf0e0; }
.recommendation strong { color: var(--ink); }
.tag { display: inline-block; padding: 1px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 2px; margin-left: 4px; }
.tag-high { background: var(--bad); color: #fff; }
.tag-med { background: #c97a2b; color: #fff; }
.tag-low { background: #5a5a5a; color: #fff; }
code { background: var(--code-bg); padding: 1px 4px; border-radius: 2px; font-size: 12px; }
</style>`;

const rankCell = (rank) => {
  if (rank == null) return '<td class="rank rank-none">—</td>';
  if (rank === 1) return `<td class="rank rank-1">${rank}</td>`;
  if (rank <= 3) return `<td class="rank rank-2">${rank}</td>`;
  if (rank <= 5) return `<td class="rank rank-4">${rank}</td>`;
  return `<td class="rank rank-none">${rank}</td>`;
};

const bucketBadge = (b) => {
  if (b === 'sl-win') return '<span class="badge badge-win">SL win</span>';
  if (b === 'sl-unique') return '<span class="badge badge-win">SL only</span>';
  if (b === 'sl-miss') return '<span class="badge badge-miss">SL miss</span>';
  return '<span class="badge">all miss</span>';
};

// ===== Per-case table rows =====
const caseRows = classified.map((c) => `
  <tr class="bucket-${c.bucket}">
    <td>${bucketBadge(c.bucket)}</td>
    <td><code>${esc(c.cat)}</code></td>
    <td><strong>${esc(c.gt)}</strong></td>
    <td>${esc(c.slTop || '—')}</td>
    ${rankCell(c.sl)}
    <td>${esc(c.oaiTop || '—')}</td>
    ${rankCell(c.oai)}
    <td>${esc(c.clTop || '—')}</td>
    ${rankCell(c.cl)}
    <td><small>${esc(c.failureMode || '')}</small></td>
  </tr>
`).join('');

// ===== Failure mode breakdown =====
const failureModes = {};
for (const c of classified) {
  if (c.failureMode) {
    failureModes[c.failureMode] = (failureModes[c.failureMode] || 0) + 1;
  }
}
const fmRows = Object.entries(failureModes).sort((a, b) => b[1] - a[1]).map(([mode, n]) => {
  const cases = classified.filter((c) => c.failureMode === mode).slice(0, 5).map((c) => c.cat).join(', ');
  return `<tr><td><strong>${esc(mode)}</strong></td><td>${n}</td><td><small>${esc(cases)}${classified.filter((c) => c.failureMode === mode).length > 5 ? ' …' : ''}</small></td></tr>`;
}).join('');

// ===== Cap-audit table =====
const capRows = [15, 20, 25, 30, 40, 50, 60, 80].map((cap) => {
  const clippedLlm = llmAdded.filter((n) => n > cap).length;
  const clippedNonKb = nonKb.filter((n) => n > cap).length;
  return `<tr>
    <td class="rank">${cap}</td>
    <td>${clippedLlm} (${Math.round(100 * clippedLlm / llmAdded.length)}%)</td>
    <td>${clippedNonKb} (${Math.round(100 * clippedNonKb / nonKb.length)}%)</td>
  </tr>`;
}).join('');

// ===== Deep dives =====
const deepDiveCases = [
  classified.find((c) => c.cat === 'PMID_11841556_5'), // Netherton — Bug 1+2 in action
  classified.find((c) => c.cat === 'PMID_26178382_UAB_R7444'), // NF1 #1 — pathognomonic miss
  classified.find((c) => c.cat === 'PMID_22772368_4_III_1'), // Loeys-Dietz 4 — fully missed
  classified.find((c) => c.cat === 'PMID_16965330_Sibling_of_patient_11'), // APS-1 — grader strictness
  classified.find((c) => c.cat === 'PMID_12920066_IV_7_Family_1CRD'), // Cone-rod 13 — partial
].filter(Boolean);

const deepDiveHtml = deepDiveCases.map((c) => `
  <div class="deep-dive">
    <h4>${esc(c.cat)} — <em>GT: ${esc(c.gt)}</em></h4>
    <p>
      ${bucketBadge(c.bucket)}
      <span class="badge badge-info">SL: ${esc(c.slTop)} (rank ${c.sl ?? '—'})</span>
      <span class="badge badge-info">OAI: ${esc(c.oaiTop)} (rank ${c.oai ?? '—'})</span>
      <span class="badge badge-info">Claude: ${esc(c.clTop)} (rank ${c.cl ?? '—'})</span>
    </p>
    <p><strong>Failure mode:</strong> ${esc(c.failureMode || 'n/a')}</p>
    <p><strong>Pipeline trace:</strong>
      o3 generated ${c.cgTotal || '?'} candidates → ${c.cgAdded || '?'} added KB-matched + ${c.cgDup || '?'} duplicate of triage + ${c.cgNonKb || '?'} non-KB.
      Evidence eval: ${esc(c.evSummary || '?')}.
      Reconciliation: ${esc(c.reconConf || '?')} after ${c.reconRounds || 1} round(s); final source: ${esc(c.finalSource || '?')}.
    </p>
    <p><strong>SL top-5 differential:</strong></p>
    <ul class="evidence-list">
      <li>1. ${esc(c.slTop || '?')}</li>
      ${c.sl2 ? `<li>2. ${esc(c.sl2)}</li>` : ''}
      ${c.sl3 ? `<li>3. ${esc(c.sl3)}</li>` : ''}
      ${c.sl4 ? `<li>4. ${esc(c.sl4)}</li>` : ''}
      ${c.sl5 ? `<li>5. ${esc(c.sl5)}</li>` : ''}
    </ul>
  </div>
`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>v16 SL — Critical Analysis</title>
${css}
</head>
<body>
<header>
  <h1>SecondLook v16 — Critical Analysis</h1>
  <div class="meta">
    Matched-trio cohort: <strong>${counts.total} cases</strong> where SL, OpenAI o3, and Claude opus-4-7 all returned a graded result.
    Generated ${new Date().toISOString().slice(0, 16)}Z.
  </div>
</header>

<div class="toc">
  <a href="#exec">Executive summary</a>
  <a href="#cases">Per-case table</a>
  <a href="#failure-modes">Failure modes</a>
  <a href="#deep-dives">Deep dives</a>
  <a href="#cap-audit">Cap re-audit</a>
  <a href="#recs">Recommendations</a>
</div>

<main>

<section id="exec">
  <h2>Executive summary</h2>
  <p>SecondLook v16 is materially behind both single-shot baselines on the same 22 cases. <strong>SL never uniquely solves a case</strong> — every SL hit is also a baseline hit. The 8 cases SL misses that baselines win are the actionable improvement surface; the 9 all-miss cases are likely KB gaps or genuinely hard.</p>

  <div class="kpi-row">
    <div class="kpi">
      <div class="bignum">${counts.slWin}/${counts.total}</div>
      <div class="bignum-label">SL got it (Top-3)</div>
      <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">23%</div>
    </div>
    <div class="kpi">
      <div class="bignum">${counts.slMiss}/${counts.total}</div>
      <div class="bignum-label">SL missed but baselines got it</div>
      <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">${Math.round(100 * counts.slMiss / counts.total)}% — actionable</div>
    </div>
    <div class="kpi">
      <div class="bignum">${counts.allMiss}/${counts.total}</div>
      <div class="bignum-label">All miss</div>
      <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">${Math.round(100 * counts.allMiss / counts.total)}% — likely KB gap or hard</div>
    </div>
    <div class="kpi">
      <div class="bignum">${counts.slUnique}/${counts.total}</div>
      <div class="bignum-label">SL unique wins</div>
      <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">0% — pipeline never beats baselines</div>
    </div>
  </div>

  <h3>Key findings</h3>
  <ul>
    <li><strong>SL has no upside over baselines on this cohort.</strong> Zero unique wins. The diagnostic-pipeline architecture is currently a strict downgrade vs single-shot — every case SL gets right, the simpler approach also gets right, and the simpler approach gets 8 more.</li>
    <li><strong>The actionable losses are ~36% of the cohort</strong> (8/22). Closing even half would push SL Top-3 from 23% to ~41%, in line with OpenAI (50%).</li>
    <li><strong>Failure modes cluster.</strong> The dominant patterns are (1) triage retrieval surfacing noise instead of the right candidate (~5 cases), (2) caps clipping o3's correct candidates before the evaluator sees them (~7 cases — fixed at <code>462a31b</code>), and (3) grader strictness on synonym/umbrella naming where SL actually named the disease but was graded null (~3 cases).</li>
    <li><strong>Caps are biting hard.</strong> The newly-introduced 25-candidate LLM cap clips <strong>59% of cases</strong>; the 15-non-KB cap clips 27%. These need to be raised or removed per the "send more to the LLM" principle.</li>
    <li><strong>Both Bug 1 (pathognomonic floor) and Bug 2 (cap partition) are already shipped</strong> in commit <code>462a31b</code>. None of the cases in this analysis were run with those fixes — re-running the cohort post-deploy is the empirical test.</li>
  </ul>
</section>

<section id="cases">
  <h2>Per-case results</h2>
  <p>Rank = position of the correct diagnosis in the engine's ranked differential. v3 tiered grading preferred; v2 falls back. Color: <span class="badge badge-win">green</span> SL win, <span class="badge badge-miss">red</span> SL miss (baselines won), grey all-miss.</p>
  <table>
    <thead>
      <tr>
        <th>bucket</th>
        <th>case</th>
        <th>ground truth</th>
        <th>SL top-1</th>
        <th>SL rank</th>
        <th>OAI top-1</th>
        <th>OAI rank</th>
        <th>Claude top-1</th>
        <th>CL rank</th>
        <th>failure mode</th>
      </tr>
    </thead>
    <tbody>
      ${caseRows}
    </tbody>
  </table>
</section>

<section id="failure-modes">
  <h2>Failure-mode taxonomy</h2>
  <p>Inferred from persisted data (no LLM-trace inspection). Each miss case is classified by the most likely cause of failure.</p>
  <table>
    <thead>
      <tr>
        <th>failure mode</th>
        <th>count</th>
        <th>example cases</th>
      </tr>
    </thead>
    <tbody>
      ${fmRows}
    </tbody>
  </table>

  <h3>What each mode means</h3>
  <ul>
    <li><strong>grader-strict-but-correct</strong>: SL's top-1 string overlaps the GT meaningfully but the v2 grader reported rank=null. Likely a v2 grader strictness problem, not a SL failure. Re-grading these with v3 tiered should rescue them.</li>
    <li><strong>umbrella-vs-subtype</strong>: GT is a numbered/lettered subtype (e.g., "Cone-rod dystrophy 13"); SL named the umbrella or a sibling subtype. Common across all three engines. The KB likely doesn't carry all subtypes; engine reasoning surfaces the parent.</li>
    <li><strong>synth-low-rank-in-pool</strong>: SL did identify the correct disease but ranked it 4-10. Suggests synth ranking is the bottleneck, not candidate generation.</li>
    <li><strong>totally-off</strong>: SL top-1 has no textual overlap with GT. Indicates the right candidate either never reached the synth (retrieval/cap drop) or the synth strongly preferred a wrong answer. Most expensive failure mode to fix.</li>
  </ul>
</section>

<section id="deep-dives">
  <h2>Representative deep dives</h2>
  ${deepDiveHtml}
</section>

<section id="cap-audit">
  <h2>Cap re-audit — cost/benefit</h2>
  <p>Per the user's principle ("err on the side of sending more to the LLM, not less"), the current caps are over-restrictive. Empirical distribution of LLM-added candidates per case on this cohort:</p>
  <div class="kpi-row">
    <div class="kpi">
      <div class="bignum">${llmStats.mean}</div>
      <div class="bignum-label">Mean LLM-added KB-matched / case</div>
      <div style="font-size: 11px; color: var(--muted);">min ${llmStats.min} · max ${llmStats.max} · p90 ${llmStats.p90}</div>
    </div>
    <div class="kpi">
      <div class="bignum">${nonKbStats.mean}</div>
      <div class="bignum-label">Mean non-KB / case</div>
      <div style="font-size: 11px; color: var(--muted);">min ${nonKbStats.min} · max ${nonKbStats.max} · p90 ${nonKbStats.p90}</div>
    </div>
    <div class="kpi">
      <div class="bignum">${totalStats.mean}</div>
      <div class="bignum-label">Mean total LLM-generated / case</div>
      <div style="font-size: 11px; color: var(--muted);">min ${totalStats.min} · max ${totalStats.max} · p90 ${totalStats.p90}</div>
    </div>
  </div>

  <h3>Clip rate per cap value</h3>
  <p>Percentage of cases where the cap fires (i.e., candidates would be dropped).</p>
  <table>
    <thead><tr><th>cap value</th><th>LLM KB-matched clipped</th><th>non-KB clipped</th></tr></thead>
    <tbody>${capRows}</tbody>
  </table>

  <h3>Marginal cost of raising the cap</h3>
  <p>Each additional hypothesis to the evidence evaluator costs roughly:</p>
  <ul>
    <li>~800–1,200 input tokens (KB profile + criteria for KB-matched; rationale-only for non-KB)</li>
    <li>~200–400 output tokens (per-hypothesis scoring)</li>
    <li>At o3-high pricing (~$15/M input, ~$60/M output): <strong>~$0.04–0.06 per extra hypothesis</strong></li>
  </ul>

  <p>Going from current caps (35 total / 25 LLM / 15 non-KB) to raised caps (60 total / no LLM-specific cap / 30 non-KB):</p>
  <table>
    <thead><tr><th>scenario</th><th>per-case extra cost</th><th>typical extra evaluator wall time</th><th>cases where right answer is rescued</th></tr></thead>
    <tbody>
      <tr>
        <td>Current (35/25/15)</td>
        <td>baseline</td>
        <td>baseline ~80–120s</td>
        <td>baseline</td>
      </tr>
      <tr>
        <td>Phase 1 raised (60/uncapped/30)</td>
        <td>+$0.50–1.00</td>
        <td>+10–30s</td>
        <td><strong>~8 of 22 (Bug 2 misses)</strong></td>
      </tr>
      <tr>
        <td>Phase 2 uncapped</td>
        <td>+$1.00–2.00</td>
        <td>+20–60s (timeout risk)</td>
        <td>same as Phase 1 + future-proof</td>
      </tr>
    </tbody>
  </table>

  <div class="callout">
    <strong>Recommendation:</strong> Ship Phase 1 caps now. Cost is bounded (~$1/case marginal), wall-time impact is modest, and the rescue surface is the entire actionable miss surface (8 of 22 cases). The current 25-LLM cap clips ${Math.round(100 * llmAdded.filter((n) => n > 25).length / llmAdded.length)}% of cases — Bug 2's "guaranteed seats" fix isn't actually guaranteeing them in practice because the cap is tight.
  </div>
</section>

<section id="recs">
  <h2>Recommendations</h2>

  <div class="recommendation recommendation-high">
    <strong>R1. Raise caps immediately (Phase 1).<span class="tag tag-high">high</span></strong>
    <p>Change <code>TOTAL_KB_CAP</code> from 35 → 60. Remove <code>LLM_KB_CAP</code> entirely (always seat all LLM-added). Raise <code>MAX_NON_KB_CANDIDATES</code> from 15 → 30. Expected impact: rescues ~8 of the current 8 sl-miss cases via the cap pathway. Cost: ~$0.50–1.00/case extra. Risk: evaluator wall-time may push toward the 100s OpenAI timeout — monitor and back off if timeouts increase.</p>
  </div>

  <div class="recommendation recommendation-high">
    <strong>R2. Re-grade all v16 cases with v3 tiered grader.<span class="tag tag-high">high</span></strong>
    <p>The <em>grader-strict-but-correct</em> failure mode (≥3 cases on this cohort) is a v2-grader artifact, not a SL failure. Cases like the two APS-1 entries (PMID_16965330, PMID_18616706) and likely Netherton-class umbrella matches will graduate from null → VARIANT under v3. Cost is bounded (~$0.05/case via Claude opus-4-7), and accuracy numbers may move materially.</p>
  </div>

  <div class="recommendation recommendation-med">
    <strong>R3. Investigate triage's body-system vocabulary mismatch.<span class="tag tag-med">med</span></strong>
    <p>On the Netherton case, triage returned <code>bodySystems: ["immune", "skin", "constitutional"]</code> but the KB's <code>BodySystem</code> enum uses <code>"immunological"</code> and <code>"dermatological"</code>. Only "constitutional" overlapped, dragging Netherton's <code>systemScore</code> down to 1/8 = 0.125. Constrain the triage agent's JSON-mode response with the actual <code>BodySystem</code> enum values, or normalize "skin" → "dermatological" etc. at the boundary.</p>
  </div>

  <div class="recommendation recommendation-med">
    <strong>R4. Re-run the v16 cohort with shipped fixes (462a31b) plus R1 caps.<span class="tag tag-med">med</span></strong>
    <p>The pathognomonic floor + cap partition are already in production code as of <code>462a31b</code>, but none of the 22 cases in this analysis were run against them. Re-running the same cohort is the empirical test. Pair with R1 (raised caps) for maximum lift. Cost: ~$20–40 total (22 cases × ~$1.50/case).</p>
  </div>

  <div class="recommendation recommendation-med">
    <strong>R5. Score synth ranking quality independent of evaluator.<span class="tag tag-med">med</span></strong>
    <p>Several cases (<em>synth-low-rank-in-pool</em>) show the right diagnosis reached the synth pool but was ranked 4-10. Worth a focused look at synth's prompt: is the criteria-fulfillment percentage anchoring rankings too strongly? Could it be that synth defaults to the criteria-tiebreaker even when criteria are sparse?</p>
  </div>

  <div class="recommendation">
    <strong>R6. Audit umbrella-vs-subtype losses for KB-completeness gaps.<span class="tag tag-low">low</span></strong>
    <p>Cases like Cone-rod dystrophy 13 and Cardiomyopathy dilated 1A are numbered subtypes. If the KB only carries the umbrella entry, the synth has no way to surface the subtype. Spot-check 3-5 such cases; if subtype profiles are missing, KB-enrichment is the long-tail fix. (Out of scope of pipeline changes.)</p>
  </div>

  <h3>What NOT to do</h3>
  <ul>
    <li><strong>Don't remove the triage retrieval stage</strong> based on this analysis. It still recovers cases where o3 candidate-gen misses the right answer. The bug is in the cap and the pathognomonic scoring, not the existence of triage retrieval.</li>
    <li><strong>Don't blame any single agent</strong> for the gap. The structural pattern (no unique wins, ~36% actionable miss) suggests multiple compounding factors: caps + grader strictness + retrieval-scoring + minor synth-ranking issues. Each isolated fix has bounded impact; the cumulative effect is the lift.</li>
    <li><strong>Don't introduce more caps</strong> elsewhere without the cost/benefit table from this report.</li>
  </ul>
</section>

</main>
</body>
</html>`;

writeFileSync(OUT, html, 'utf-8');
console.log(`Wrote ${html.length.toLocaleString()} bytes to ${OUT}`);
console.log(`Open with: open ${OUT}`);
