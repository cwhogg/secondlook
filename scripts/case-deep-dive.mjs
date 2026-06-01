#!/usr/bin/env node
/**
 * Build a comprehensive single-file HTML walkthrough of one v15 SL pipeline run.
 *
 * Shows every persisted artifact: inputs, extractions, triage, candidate
 * generation, all 11 specialists' hypotheses with evidence, evidence
 * evaluator output, both synthesizers' rankings, reconciliation, report,
 * family expansion, and v3 grading.
 *
 * What's NOT shown (because not persisted in current pipeline):
 *  - Raw LLM prompts sent to each call
 *  - Raw LLM response text before structured parsing
 *  - Per-LLM reasoning chains
 *
 * Usage:
 *   node scripts/case-deep-dive.mjs                                  # default: first v15 SL case
 *   node scripts/case-deep-dive.mjs --ppkt PMID_xxxx                 # specific ppkt_id
 *   node scripts/case-deep-dive.mjs --ppkt PMID_xxxx --version v15   # specific version
 *   node scripts/case-deep-dive.mjs --out /tmp/dive.html             # output path
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:3002';

const args = process.argv.slice(2);
const argv = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};

// Multi-case mode: --ppkts a,b,c renders all cases as tabs in one HTML.
// Per-case version override: use ppkt_id@version (e.g. PMID_123@v17). The
// global --version flag applies to entries without an explicit @suffix.
// Backward-compatible: --ppkt X works as before (single case, no tabs).
const PPKT = argv('ppkt', null);
const PPKTS_RAW = argv('ppkts', null);
const PPKTS = PPKTS_RAW
  ? PPKTS_RAW.split(',').map((s) => s.trim()).filter(Boolean)
  : PPKT ? [PPKT] : [null];
const VERSION = argv('version', 'v15');
const OUT = argv('out', join(ROOT, 'case-deep-dive.html'));
const INPUT_FILE = argv('input-file', null);

let tcData;
if (INPUT_FILE) {
  console.log(`Loading testCases from ${INPUT_FILE}...`);
  tcData = JSON.parse(readFileSync(INPUT_FILE, 'utf8'));
} else {
  console.log('Fetching testCases...');
  const tcRes = await fetch(`${BASE}/api/admin/test-cases`);
  tcData = await tcRes.json();
}
const all = tcData.testCases || [];

function findCases(rawEntry) {
  if (rawEntry === null) {
    const slCase = all.find((t) =>
      t.testVersion === 'Eval' &&
      t.evalVersion === VERSION &&
      t.evalRunMode === 'secondlook' &&
      t.status === 'graded'
    );
    if (!slCase) return null;
    const ppkt = slCase.categoryHint;
    const oaiCase = all.find((t) => t.evalVersion === VERSION && t.evalRunMode === 'openai' && t.categoryHint === ppkt);
    const clCase = all.find((t) => t.evalVersion === VERSION && t.evalRunMode === 'claude' && t.categoryHint === ppkt);
    return { slCase, oaiCase, clCase, ppkt };
  }
  // Per-case version override: 'ppkt_id@version'
  const [ppktOrNull, versionOverride] = rawEntry.split('@');
  const version = versionOverride || VERSION;
  const slCase = all.find((t) =>
    t.testVersion === 'Eval' &&
    t.evalVersion === version &&
    t.evalRunMode === 'secondlook' &&
    t.categoryHint === ppktOrNull &&
    t.status === 'graded'
  );
  if (!slCase) return null;
  const ppkt = slCase.categoryHint;
  const oaiCase = all.find((t) => t.evalVersion === version && t.evalRunMode === 'openai' && t.categoryHint === ppkt);
  const clCase = all.find((t) => t.evalVersion === version && t.evalRunMode === 'claude' && t.categoryHint === ppkt);
  return { slCase, oaiCase, clCase, ppkt };
}

const caseBundles = PPKTS.map((p) => findCases(p)).filter(Boolean);
if (caseBundles.length === 0) {
  console.error('No matching completed SL cases found');
  process.exit(1);
}
for (const b of caseBundles) {
  console.log(`Picked: ${b.slCase.id}  (gt: ${b.slCase.groundTruth?.diagnosis})`);
}

// First bundle = "primary" for header / sidebar default
const slCase = caseBundles[0].slCase;
const oaiCase = caseBundles[0].oaiCase;
const clCase = caseBundles[0].clCase;

// ============================================================
// HTML BUILDERS
// ============================================================

const esc = (s) => {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const jsonBlock = (obj, label) => `
<details class="json-details">
  <summary class="json-summary">${esc(label || 'Raw JSON')}</summary>
  <pre class="json-pre">${esc(JSON.stringify(obj, null, 2))}</pre>
</details>`;

const section = (id, title, body, opts = {}) => `
<section id="${id}" class="stage ${opts.error ? 'stage-error' : ''}">
  <h2 class="stage-h">${esc(title)}</h2>
  ${body}
</section>`;

const css = `
<style>
  :root {
    --bg: #faf7f2;
    --paper: #fff;
    --ink: #2a2a2a;
    --muted: #5a5a5a;
    --accent: #8b2500;
    --light-border: #e8ddd0;
    --med-border: #d4c5b0;
    --code-bg: #f4eee5;
    --good: #2b6e2b;
    --bad: #8b2500;
    --tier-exact: #2b6e2b;
    --tier-variant: #4d8c5a;
    --tier-family: #c97a2b;
    --tier-sibling: #b85040;
    --tier-unrelated: #5a5a5a;
  }
  * { box-sizing: border-box; }
  html { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-size: 14px;
    line-height: 1.55;
  }
  header {
    background: var(--paper);
    border-bottom: 2px solid var(--med-border);
    padding: 20px 24px;
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  }
  header h1 {
    margin: 0 0 4px 0;
    font-family: "Lyon Text", "Times New Roman", serif;
    font-size: 28px;
    font-weight: 600;
  }
  header .meta {
    color: var(--muted);
    font-size: 13px;
  }
  header .meta strong { color: var(--ink); }
  .toc {
    background: var(--paper);
    border-bottom: 1px solid var(--light-border);
    padding: 12px 24px;
    font-size: 13px;
  }
  .toc a {
    color: var(--accent);
    text-decoration: none;
    margin-right: 16px;
    white-space: nowrap;
  }
  .toc a:hover { text-decoration: underline; }
  main {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }
  .stage {
    background: var(--paper);
    border: 1px solid var(--light-border);
    border-left: 4px solid var(--accent);
    margin-bottom: 24px;
    padding: 20px 24px;
    border-radius: 0;
  }
  .stage-h {
    margin: 0 0 12px 0;
    font-family: "Lyon Text", "Times New Roman", serif;
    font-size: 20px;
    color: var(--ink);
    font-weight: 600;
  }
  .stage-error { border-left-color: var(--bad); background: #fcf5f4; }
  .row { display: flex; gap: 16px; margin: 8px 0; }
  .col { flex: 1; }
  .pair { display: flex; gap: 16px; margin: 8px 0; }
  .pair .label { color: var(--muted); min-width: 140px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    background: var(--code-bg);
    border: 1px solid var(--med-border);
    border-radius: 3px;
    font-size: 11px;
    color: var(--muted);
    margin-right: 6px;
  }
  .badge-tier-exact { background: #e3f0e3; border-color: #2b6e2b; color: #1f5f1f; }
  .badge-tier-variant { background: #ebf3eb; border-color: #4d8c5a; color: #2b6e2b; }
  .badge-tier-family { background: #fce8d4; border-color: #c97a2b; color: #a3611f; }
  .badge-tier-sibling { background: #f8d8d2; border-color: #b85040; color: #8a3325; }
  .badge-tier-unrelated { background: #ececec; color: var(--muted); }
  .badge-ok { background: #d6e9d6; color: #1f5f1f; border-color: #2b6e2b; }
  .badge-err { background: #f8d8d2; color: #8a3325; border-color: #b85040; }
  .badge-info { background: #d8e2f0; color: #1f3c5f; border-color: #4d6c8c; }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--med-border);
    padding: 12px;
    overflow-x: auto;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    margin: 8px 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .json-details { margin: 8px 0; }
  .json-summary {
    cursor: pointer;
    color: var(--accent);
    font-size: 12px;
    padding: 4px 0;
  }
  .json-pre {
    background: var(--code-bg);
    max-height: 480px;
    overflow: auto;
    font-size: 11px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 13px;
  }
  th {
    background: #f5efe5;
    text-align: left;
    padding: 8px 10px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
    font-weight: 600;
    border-bottom: 1px solid var(--med-border);
  }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--light-border);
    vertical-align: top;
  }
  td.rank { font-weight: 600; color: var(--muted); width: 40px; }
  td.score { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
  .specialist-card {
    background: #fdfaf5;
    border: 1px solid var(--light-border);
    border-left: 3px solid var(--accent);
    padding: 12px 14px;
    margin: 8px 0;
  }
  .specialist-card h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
  }
  .hypothesis-row {
    padding: 8px 0;
    border-top: 1px solid var(--light-border);
  }
  .hypothesis-row:first-of-type { border-top: 0; }
  .hypothesis-name { font-weight: 600; color: var(--ink); }
  .evidence-list { margin: 4px 0 4px 16px; font-size: 12px; color: var(--muted); }
  .evidence-list li { margin: 2px 0; }
  .evidence-strong { color: var(--good); }
  .evidence-moderate { color: var(--muted); }
  .evidence-weak { color: var(--muted); opacity: 0.7; }
  .contra { color: var(--bad); }
  .criteria-met { color: var(--good); font-weight: 600; }
  .criteria-not { color: var(--bad); }
  .stage-meta {
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 8px;
  }
  .truth-banner {
    background: #f5efe5;
    border: 1px solid var(--med-border);
    padding: 12px 16px;
    margin: 12px 0;
    font-size: 14px;
  }
  .truth-banner strong { color: var(--accent); }
  .note {
    background: #fff7e8;
    border: 1px solid #d4b97a;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--muted);
    margin: 12px 0;
  }
</style>
`;

// ============================================================
// SECTION RENDERERS
// ============================================================

function renderHeader(slCase, oaiCase, clCase) {
  const gt = slCase.groundTruth || {};
  const meta = slCase.pipelineResult?.pipelineMetadata || {};
  return `
<header>
  <h1>Pipeline Deep Dive — ${esc(slCase.categoryHint)}</h1>
  <div class="meta">
    <strong>Ground truth:</strong> ${esc(gt.diagnosis)}
    ${gt.icd10 ? `<span class="badge">ICD-10 ${esc(gt.icd10)}</span>` : ''}
    <span class="badge">${esc(slCase.evalVersion)}</span>
    <span class="badge badge-info">${meta.diseasesConsidered || '?'} KB candidates</span>
    <span class="badge badge-info">${meta.stages?.length || 0} stages</span>
    <span class="badge badge-info">${meta.totalTokensUsed?.toLocaleString() || '?'} tokens total</span>
    <span class="badge badge-info">$${(meta.totalCostEstimate || 0).toFixed(3)}</span>
    <span class="badge badge-info">${Math.round((meta.totalDurationMs || 0) / 1000)}s wall time</span>
  </div>
</header>`;
}

function isV17Case(slCase) {
  const stages = slCase?.pipelineResult?.pipelineMetadata?.stages || [];
  return stages.some((s) => s.stageName === 'specialist-consultation');
}

function renderTOC(slCase) {
  const items = isV17Case(slCase) ? [
    ['input', '1. Input'],
    ['extraction', '2. Extraction'],
    ['triage', '3. Triage'],
    ['retrieval', '4. Triage KB Pool'],
    ['specialists', '5. Specialists (5)'],
    ['dedup-normalize', '6. Dedup & Normalize'],
    ['kb-attach', '7. KB Profile Attach'],
    ['evidence-eval', '8. Claude Evaluation'],
    ['synth-claude', '9. Claude Synthesis'],
    ['o3-critique', '10. o3 Critique'],
    ['claude-finalize', '11. Claude Finalize'],
    ['report', '12. Report'],
    ['family-expansion', '13. Family Expansion'],
    ['final', '14. Final Differential'],
    ['grading', '15. Grading'],
    ['llm-calls', '15b. LLM Calls'],
    ['raw', '16. Raw Data'],
  ] : [
    ['input', '1. Input'],
    ['extraction', '2. Extraction'],
    ['triage', '3. Triage'],
    ['candidate-gen', '4. LLM Candidates'],
    ['retrieval', '5. KB Enrichment'],
    ['specialists', '6. Specialists (11)'],
    ['evidence-eval', '7. Evidence Eval'],
    ['synth-o3', '8. Synth (o3)'],
    ['synth-claude', '9. Synth (Claude)'],
    ['reconciliation', '10. Reconciliation'],
    ['report', '11. Report'],
    ['family-expansion', '12. Family Expansion'],
    ['final', '13. Final Differential'],
    ['grading', '14. Grading'],
    ['llm-calls', '14b. LLM Calls'],
    ['raw', '15. Raw Data'],
  ];
  return `<div class="toc">${items.map(([h, t]) => `<a href="#${h}">${esc(t)}</a>`).join('')}</div>`;
}

function renderInput(slCase) {
  const p = slCase.generatedPatient;
  const demo = p?.demographics || {};
  return section('input', '1. Input — Patient Case', `
    <div class="truth-banner">
      <strong>Ground truth diagnosis:</strong> ${esc(slCase.groundTruth?.diagnosis)}
    </div>
    <div class="pair"><span class="label">Source:</span> Phenopacket2Prompt (${esc(slCase.categoryHint)})</div>
    <div class="pair"><span class="label">Demographics:</span> ${esc(demo.age)}yo ${esc(demo.sex)}</div>
    <div class="pair"><span class="label">Chief complaint:</span> ${esc(p?.chiefComplaint || '(none)')}</div>
    <h3>Narrative</h3>
    <pre>${esc(p?.narrative)}</pre>
    ${jsonBlock(p, 'Full generatedPatient JSON')}
  `);
}

function renderExtraction(slCase) {
  const syms = slCase.extractedSymptoms || [];
  const excs = slCase.extractedExcludedFindings || [];
  const symRows = syms.map((s, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td><code>${esc(s.originalPhrase || '')}</code></td>
      <td>${esc(s.medicalTerm || '')}</td>
      <td>${esc(s.selectedConcept?.name || '')}</td>
      <td><code>${esc(s.selectedConcept?.snomedCode || s.selectedConcept?.cui || '')}</code></td>
    </tr>`).join('');
  const excRows = excs.map((e, i) => {
    const obj = typeof e === 'string' ? { originalPhrase: e } : e;
    return `
    <tr>
      <td class="rank">${i + 1}</td>
      <td><code>${esc(obj.originalPhrase || '')}</code></td>
      <td>${esc(obj.medicalTerm || '')}</td>
      <td>${esc(obj.selectedConcept?.name || '')}</td>
    </tr>`;
  }).join('');
  return section('extraction', '2. Extraction — Symptoms + Excluded Findings', `
    <div class="stage-meta">Done by /api/parse-symptoms (gpt-4.1-mini) + UMLS lookup</div>
    <h3>Extracted symptoms (${syms.length})</h3>
    <table>
      <thead><tr><th>#</th><th>Original phrase</th><th>Medical term</th><th>UMLS concept</th><th>UMLS Code</th></tr></thead>
      <tbody>${symRows || '<tr><td colspan="5">(none)</td></tr>'}</tbody>
    </table>
    ${excs.length > 0 ? `
      <h3>Excluded findings (${excs.length})</h3>
      <table>
        <thead><tr><th>#</th><th>Original</th><th>Medical term</th><th>UMLS concept</th></tr></thead>
        <tbody>${excRows}</tbody>
      </table>
    ` : '<div class="stage-meta">(no excluded findings)</div>'}
    ${jsonBlock({ symptoms: syms, excludedFindings: excs }, 'Raw extracted JSON')}
  `);
}

function renderTriageStage(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const triage = stages.find((s) => s.stageName === 'triage');
  if (!triage) return section('triage', '3. Triage', '<div class="note">Triage stage not persisted.</div>');
  return section('triage', '3. Triage — body systems & specialist routing', `
    <div class="stage-meta">
      <span class="badge">${esc(triage.model)}</span>
      <span class="badge">${triage.tokensUsed.toLocaleString()} tokens</span>
      <span class="badge">${triage.durationMs}ms</span>
    </div>
    <pre>${esc(triage.outputSummary)}</pre>
  `);
}

function renderCandidateGen(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const cg = stages.find((s) => s.stageName === 'candidate-generation');
  const detail = slCase.pipelineResult?.pipelineMetadata?.candidateGeneration;
  if (!cg && !detail) return section('candidate-gen', '4. LLM Candidate Generation', '<div class="note">Not run on this case (v12 or earlier).</div>');

  const nonKbCount = detail?.nonKbCarried ?? detail?.noKbMatch ?? 0;
  const head = `
    <div class="stage-meta">
      ${cg ? `<span class="badge">${esc(cg.model)}</span> <span class="badge">${cg.tokensUsed.toLocaleString()} tokens</span> <span class="badge">${Math.round(cg.durationMs / 1000)}s</span>` : ''}
      ${detail ? `<span class="badge badge-info">${detail.totalGenerated} generated</span><span class="badge badge-info">${detail.addedToPool} KB-matched added</span><span class="badge">${detail.duplicateOfTriage ?? 0} dup of triage</span><span class="badge badge-info">${nonKbCount} non-KB carried</span>` : ''}
    </div>
    ${cg ? `<p>${esc(cg.outputSummary)}</p>` : ''}
  `;

  if (!detail || !detail.candidates?.length) {
    return section('candidate-gen', '4. LLM Candidate Generation — Stage 1b', head + `
      <div class="note">
        Per-candidate detail not persisted for this case. Re-run with the v15+
        pipeline (post-2026-05-31 commit a0073d1+) to capture every LLM
        candidate name and rationale.
      </div>
    `);
  }

  const dispoBadge = (d) => {
    if (d === 'added-to-pool') return '<span class="badge badge-ok">added (KB-matched)</span>';
    if (d === 'duplicate-of-triage') return '<span class="badge">duplicate</span>';
    if (d === 'non-kb-carried' || d === 'no-kb-match') return '<span class="badge badge-info">non-KB (reasoning-evaluated)</span>';
    return `<span class="badge">${esc(d)}</span>`;
  };
  const rows = detail.candidates.map((c, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td><strong>${esc(c.name)}</strong>${c.resolvedKbName && c.resolvedKbName !== c.name ? `<br/><small style="color: var(--muted)">→ KB: ${esc(c.resolvedKbName)}</small>` : ''}</td>
      <td>${dispoBadge(c.disposition)}</td>
      <td><small>${esc(c.rationale || '(no rationale captured)')}</small></td>
    </tr>
  `).join('');

  return section('candidate-gen', '4. LLM Candidate Generation — Stage 1b', head + `
    <p>o3 reasoning:high generates a broad differential of ${detail.totalGenerated} candidate diagnoses
    from raw symptoms (parallel with triage). Each is matched against the KB.
    ${detail.addedToPool} KB-matched candidates were added to the pool with their KB profile data;
    ${detail.duplicateOfTriage ?? 0} duplicated triage's retrieval; ${nonKbCount} had no matching
    KB profile and are carried through as reasoning-evaluated seed hypotheses (no structured
    criteria, but evaluated by the evidence evaluator using clinical knowledge).</p>
    <table>
      <thead><tr><th>#</th><th>Diagnosis</th><th>Disposition</th><th>Rationale</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `);
}

const _kbCache = new Map();
function loadKbProfile(diseaseId) {
  if (!diseaseId) return null;
  if (_kbCache.has(diseaseId)) return _kbCache.get(diseaseId);
  let kb = null;
  try {
    const p = join(ROOT, 'lib/knowledge/diseases', `${diseaseId}.json`);
    kb = JSON.parse(readFileSync(p, 'utf-8'));
  } catch { /* not found */ }
  _kbCache.set(diseaseId, kb);
  return kb;
}

function renderSymptomList(syms) {
  if (!syms || syms.length === 0) return '<em>(none)</em>';
  return `<ul class="evidence-list">${syms.map((s) => {
    if (typeof s === 'string') return `<li>${esc(s)}</li>`;
    const name = s.finding || s.name || s.symptom || JSON.stringify(s);
    const freq = s.frequency !== undefined ? s.frequency : s.frequencyPercent;
    const sys = s.bodySystem;
    return `<li>${esc(name)}${freq !== undefined ? ` <small style="color:var(--muted)">(${freq}%)</small>` : ''}${sys ? ` <span class="badge">${esc(sys)}</span>` : ''}</li>`;
  }).join('')}</ul>`;
}

function renderKbProfileBody(kb) {
  if (!kb) return '<div class="note" style="margin: 0;">No KB profile attached to this candidate. Evidence evaluator must reason from clinical knowledge alone (no curated criteria, no tiered symptom list).</div>';

  const dc = kb.diagnosticCriteria;
  const sx = kb.symptoms || {};
  const dems = kb.demographics || {};
  const kf = kb.keyFindings || {};

  const kfFmt = (arr) => arr.map((x) => esc(typeof x === 'string' ? x : (x.finding || x.gene || x.name || JSON.stringify(x)))).join(' · ');

  return `
    <div style="font-size:13px;">
      <div style="margin: 4px 0;">
        ${kb.icd10Codes?.length ? `<span class="badge">ICD-10 ${esc(kb.icd10Codes.join(', '))}</span>` : ''}
        ${kb.omimId ? `<span class="badge">OMIM ${esc(kb.omimId)}</span>` : ''}
        ${kb.orphanetId ? `<span class="badge">Orphanet ${esc(kb.orphanetId)}</span>` : ''}
        ${kb.prevalence?.classification ? `<span class="badge">${esc(kb.prevalence.classification)}</span>` : ''}
        ${kb.specialistType ? `<span class="badge">specialist: ${esc(kb.specialistType)}</span>` : ''}
        ${kb.confidenceInData ? `<span class="badge">${esc(kb.confidenceInData)} confidence</span>` : ''}
      </div>
      ${kb.aliases?.length ? `<div class="pair"><span class="label">Aliases:</span> ${esc(kb.aliases.join(', '))}</div>` : ''}
      ${(dems.typicalOnsetAge || dems.sexPredilection || dems.ethnicityPredilection) ? `
        <div class="pair"><span class="label">Demographics:</span>
          ${dems.typicalOnsetAge ? `onset ${esc(dems.typicalOnsetAge)}` : ''}${dems.sexPredilection ? ` · sex ${esc(dems.sexPredilection)}` : ''}${dems.ethnicityPredilection ? ` · ${esc(dems.ethnicityPredilection)}` : ''}
        </div>` : ''}
      ${kb.systemsAffected?.length ? `<div class="pair"><span class="label">Systems:</span> ${kb.systemsAffected.map((s) => `<span class="badge">${esc(s)}</span>`).join(' ')}</div>` : ''}

      ${dc ? `
        <h4 style="margin: 12px 0 4px;">Diagnostic criteria${dc.name ? ` — ${esc(dc.name)}` : ''}</h4>
        ${dc.totalRequired ? `<div class="stage-meta">${dc.totalRequired} required to meet criteria</div>` : ''}
        ${dc.criteria?.length ? `<ul class="evidence-list">${dc.criteria.map((c) => `<li>${esc(c.criterion || c.name || (typeof c === 'string' ? c : JSON.stringify(c)))}${c.majorOrMinor ? ` <span class="badge">${esc(c.majorOrMinor)}</span>` : ''}${c.weight ? ` <small>w=${c.weight}</small>` : ''}</li>`).join('')}</ul>` : '<div class="stage-meta">(no formal criteria list)</div>'}
      ` : ''}

      ${sx.pathognomonic?.length ? `<h4 style="margin: 12px 0 4px;">Pathognomonic symptoms (&gt;90%)</h4>${renderSymptomList(sx.pathognomonic)}` : ''}
      ${sx.common?.length ? `<h4 style="margin: 12px 0 4px;">Common symptoms (&gt;50%)</h4>${renderSymptomList(sx.common)}` : ''}
      ${sx.occasional?.length ? `<h4 style="margin: 12px 0 4px;">Occasional symptoms (10–50%)</h4>${renderSymptomList(sx.occasional)}` : ''}
      ${sx.rare?.length ? `<h4 style="margin: 12px 0 4px;">Rare symptoms (&lt;10%)</h4>${renderSymptomList(sx.rare)}` : ''}

      ${(kf.laboratory?.length || kf.imaging?.length || kf.genetic?.length || kf.other?.length) ? `
        <h4 style="margin: 12px 0 4px;">Key findings</h4>
        ${kf.laboratory?.length ? `<div><strong>Lab:</strong> ${kfFmt(kf.laboratory)}</div>` : ''}
        ${kf.imaging?.length ? `<div><strong>Imaging:</strong> ${kfFmt(kf.imaging)}</div>` : ''}
        ${kf.genetic?.length ? `<div><strong>Genetic:</strong> ${kfFmt(kf.genetic)}</div>` : ''}
        ${kf.other?.length ? `<div><strong>Other:</strong> ${kfFmt(kf.other)}</div>` : ''}
      ` : ''}

      ${kb.differentialDiagnoses?.length ? `
        <h4 style="margin: 12px 0 4px;">Sibling differential diagnoses</h4>
        <ul class="evidence-list">${kb.differentialDiagnoses.slice(0, 10).map((d) => `<li><strong>${esc(d.disease || d.name)}</strong>${d.distinguishingFeatures ? ` — ${esc(d.distinguishingFeatures)}` : ''}</li>`).join('')}</ul>
      ` : ''}

      ${kb.redFlags?.length ? `
        <h4 style="margin: 12px 0 4px;">Red flags</h4>
        <ul class="evidence-list">${kb.redFlags.map((f) => `<li>${esc(typeof f === 'string' ? f : (f.finding || JSON.stringify(f)))}</li>`).join('')}</ul>
      ` : ''}

      ${kb.commonPitfalls?.length ? `
        <h4 style="margin: 12px 0 4px;">Common pitfalls (v15 enrichment)</h4>
        <ul class="evidence-list">${kb.commonPitfalls.slice(0, 6).map((p) => `<li>${esc(typeof p === 'string' ? p : (p.pitfall || JSON.stringify(p)))}</li>`).join('')}</ul>
      ` : ''}

      ${jsonBlock(kb, 'Full KB profile JSON')}
    </div>
  `;
}

function renderKBRetrieval(slCase, { v17 = false } = {}) {
  const triage = slCase.pipelineResult?.pipelineMetadata?.retrievalScores || [];
  const cgCands = slCase.pipelineResult?.pipelineMetadata?.candidateGeneration?.candidates || [];

  // Union pool, deduped by KB id. Track which source(s) contributed each.
  const byKey = new Map();
  for (const t of triage) {
    if (!t.diseaseId) continue;
    byKey.set(t.diseaseId, {
      diseaseId: t.diseaseId,
      name: t.diseaseName,
      sources: new Set(['triage']),
      retrievalScore: t.matchScore,
      componentScores: t.componentScores,
    });
  }
  const o3NonKb = [];
  for (const c of cgCands) {
    const id = c.resolvedKbProfile;
    if (!id) {
      // Accept both legacy 'no-kb-match' and new 'non-kb-carried' disposition.
      if (c.disposition === 'non-kb-carried' || c.disposition === 'no-kb-match') {
        o3NonKb.push(c);
      }
      continue;
    }
    if (byKey.has(id)) {
      const entry = byKey.get(id);
      entry.sources.add('o3');
      entry.o3Rationale = c.rationale;
      entry.o3OriginalName = c.name;
    } else {
      byKey.set(id, {
        diseaseId: id,
        name: c.resolvedKbName || c.name,
        sources: new Set(['o3']),
        o3Rationale: c.rationale,
        o3OriginalName: c.name,
      });
    }
  }

  const pool = Array.from(byKey.values()).sort((a, b) => (b.retrievalScore || 0) - (a.retrievalScore || 0));
  const withKb = pool.filter((p) => loadKbProfile(p.diseaseId));
  const missingKb = pool.filter((p) => !loadKbProfile(p.diseaseId));

  const sourceBadge = (sources) => {
    const out = [];
    if (sources.has('triage')) out.push('<span class="badge badge-info">triage</span>');
    if (sources.has('o3')) out.push('<span class="badge badge-info">o3</span>');
    return out.join(' ');
  };

  const renderCard = (c, i) => {
    const kb = loadKbProfile(c.diseaseId);
    return `
      <details class="json-details" style="border:1px solid var(--light-border); padding:8px 12px; margin-bottom:8px; background:#fefdfb;"${i < 3 ? ' open' : ''}>
        <summary class="json-summary">
          <strong>#${i + 1} ${esc(c.name)}</strong>
          ${sourceBadge(c.sources)}
          ${c.retrievalScore !== undefined ? `<span class="badge">match ${Number(c.retrievalScore).toFixed(2)}</span>` : ''}
          ${kb ? '<span class="badge badge-ok">KB attached</span>' : '<span class="badge badge-err">KB id not found</span>'}
          ${kb?.diagnosticCriteria?.criteria?.length ? `<span class="badge">${kb.diagnosticCriteria.criteria.length} criteria</span>` : ''}
          ${kb ? `<span class="badge">${((kb.symptoms?.pathognomonic?.length || 0) + (kb.symptoms?.common?.length || 0) + (kb.symptoms?.occasional?.length || 0) + (kb.symptoms?.rare?.length || 0))} symptoms</span>` : ''}
        </summary>
        <div style="padding: 8px 12px;">
          <div class="pair"><span class="label">KB id:</span> <code>${esc(c.diseaseId)}</code></div>
          ${c.o3OriginalName && c.o3OriginalName !== c.name ? `<div class="pair"><span class="label">o3 name:</span> <em>${esc(c.o3OriginalName)}</em></div>` : ''}
          ${c.o3Rationale ? `<div class="pair"><span class="label">o3 rationale:</span> <em>${esc(c.o3Rationale)}</em></div>` : ''}
          ${c.componentScores ? `<div class="pair"><span class="label">Triage scores:</span> sym ${(c.componentScores.symptom || 0).toFixed(2)} · sys ${(c.componentScores.system || 0).toFixed(2)} · demo ${(c.componentScores.demographic || 0).toFixed(2)} · prev ${(c.componentScores.prevalence || 0).toFixed(2)}</div>` : ''}
          ${renderKbProfileBody(kb)}
        </div>
      </details>
    `;
  };

  const renderNonKbCard = (c, i) => `
    <details class="json-details" style="border:1px solid var(--light-border); padding:8px 12px; margin-bottom:8px; background:#fefdfb;">
      <summary class="json-summary">
        <strong>#${i + 1} ${esc(c.name)}</strong>
        <span class="badge badge-info">o3</span>
        <span class="badge badge-info">non-KB (reasoning-evaluated)</span>
      </summary>
      <div style="padding: 8px 12px;">
        ${c.rationale ? `<div class="pair"><span class="label">o3 rationale:</span> <em>${esc(c.rationale)}</em></div>` : ''}
        <div class="note" style="margin-top: 8px;">No KB profile attached. The evidence evaluator scores this candidate via clinical reasoning quality (same 0–100 scale as KB-matched candidates) rather than structured criteria fulfillment.</div>
      </div>
    </details>
  `;
  const nonKbList = o3NonKb.length ? `
    <h3 style="margin-top: 16px;">Non-KB candidates carried through (${o3NonKb.length}) — reasoning-evaluated</h3>
    <div class="stage-meta">These o3 hypotheses had no matching KB profile. They appear alongside KB-matched candidates in the evidence-evaluator / synthesizer input pool with equal weight, scored on clinical reasoning quality rather than criteria fulfillment.</div>
    ${o3NonKb.map(renderNonKbCard).join('')}
  ` : '';

  const missingList = missingKb.length ? `
    <div class="note"><strong>${missingKb.length} candidate(s) had a KB id that didn't resolve to a profile on disk:</strong>
      ${missingKb.map((c) => `<code>${esc(c.diseaseId)}</code>`).join(' · ')}
    </div>
  ` : '';

  const title = v17
    ? '4. Triage KB Retrieval Pool — candidates fed into specialists'
    : '5. KB Enrichment — full KB profile appended to each candidate';
  const intro = v17
    ? `<div class="stage-meta">
        In v17 this is an INPUT, not an output: the symptom-matched retrieval pool from
        triage (with full KB profiles loaded) is passed to each specialist as their
        candidate slice. Specialists then generate hypotheses (some KB-matched, some not).
        Full KB profiles are re-attached to the deduped surviving hypotheses in Stage 7
        — those are the ones the evaluator sees, not these triage candidates directly.
      </div>`
    : `<div class="stage-meta">
        For each KB-matched candidate from the union pool (triage retrieval +
        o3 candidate generation), the complete KB profile (diagnostic criteria,
        tiered symptoms, key findings, sibling DDx, red flags) is appended.
        o3-generated candidates with no KB match are carried through as
        reasoning-evaluated seeds with the o3 rationale only. Both flow into
        the evidence evaluator and synthesizer with equal weight.
      </div>`;
  return section('retrieval', title, `
    ${intro}
    <div style="margin: 4px 0 12px;">
      <span class="badge badge-info">${pool.length} KB-matched in union pool</span>
      <span class="badge badge-info">${withKb.length} with KB profile attached</span>
      <span class="badge badge-info">${triage.length} from triage</span>
      <span class="badge badge-info">${cgCands.filter((c) => c.resolvedKbProfile).length} from o3 (KB-matched)</span>
      ${o3NonKb.length ? `<span class="badge badge-info">${o3NonKb.length} non-KB carried (reasoning-evaluated)</span>` : ''}
    </div>
    ${missingList}
    ${pool.map(renderCard).join('')}
    ${nonKbList}
  `);
}

function renderSpecialists(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const v15Sps = stages.filter((s) => s.stageName === 'specialist');
  const v16Sps = stages.filter((s) => s.stageName === 'specialist-annotation');
  const v17Sps = stages.filter((s) => s.stageName === 'specialist-consultation');
  const failed = stages.filter((s) => s.stageName === 'specialist-failed');

  // v16 architecture: annotation cards + per-hypothesis annotations rendered below
  const isV17Consultation = v17Sps.length > 0;
  const isV16Annotation = !isV17Consultation && v16Sps.length > 0;
  const sps = isV17Consultation ? v17Sps : isV16Annotation ? v16Sps : v15Sps;

  const sCards = sps.map((sp) => `
    <div class="specialist-card">
      <h4>${esc(sp.agentName)}
        <span class="badge">${sp.tokensUsed.toLocaleString()} tokens</span>
        <span class="badge">${Math.round(sp.durationMs / 1000)}s</span>
      </h4>
      <div class="stage-meta">${esc(sp.outputSummary)}</div>
    </div>
  `).join('');

  const failCards = failed.length > 0 ? `
    <h3>Failed specialists (${failed.length})</h3>
    ${failed.map((f) => `
      <div class="specialist-card stage-error">
        <h4>${esc(f.agentName)} <span class="badge badge-err">FAILED</span></h4>
        <div class="stage-meta">${esc(f.outputSummary)}</div>
      </div>
    `).join('')}
  ` : '';

  // v16-architecture per-hypothesis annotation drill-downs. Each hypothesis
  // carries the annotations array if it was produced via the v16 annotator
  // flow. Show the per-specialist breakdown per candidate.
  let perHypothesisAnnotations = '';
  if (isV16Annotation) {
    const diffs = slCase.pipelineResult?.differentialDiagnoses || [];
    const annotatedHyps = diffs.filter((d) => Array.isArray(d.annotations) && d.annotations.length > 0).slice(0, 20);
    if (annotatedHyps.length > 0) {
      perHypothesisAnnotations = `
        <h3>Per-candidate specialist annotations (${annotatedHyps.length} hypotheses shown)</h3>
        ${annotatedHyps.map((h) => `
          <details class="json-details" style="border:1px solid var(--light-border); padding:8px 12px; margin-bottom:8px; background:#fefdfb;">
            <summary class="json-summary">
              <strong>${esc(h.diagnosis)}</strong>
              <span class="badge">${h.annotations.length} specialist annotations</span>
              <span class="badge">avg conf ${Math.round(h.annotations.reduce((s, a) => s + (a.domainConfidence || 0), 0) / h.annotations.length)}</span>
              ${h.knowledgeBaseMatch ? '<span class="badge badge-ok">KB</span>' : ''}
            </summary>
            <div style="padding: 8px 12px;">
              ${h.aggregatedTests?.length > 0 ? `
                <h4 style="margin: 8px 0 4px;">Tests to order (aggregated across specialists)</h4>
                <ul class="evidence-list">${h.aggregatedTests.slice(0, 12).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
              ` : ''}
              ${h.aggregatedCardinal?.length > 0 ? `
                <h4 style="margin: 8px 0 4px;">Cardinal features to look for</h4>
                <ul class="evidence-list">${h.aggregatedCardinal.slice(0, 12).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
              ` : ''}
              ${h.aggregatedRuleOut?.length > 0 ? `
                <h4 style="margin: 8px 0 4px;">Rule-out features</h4>
                <ul class="evidence-list">${h.aggregatedRuleOut.slice(0, 12).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
              ` : ''}
              <h4 style="margin: 12px 0 4px;">Per-specialist annotations</h4>
              <table>
                <thead><tr><th>Specialist</th><th>Conf</th><th>Reasoning</th><th>Tests</th><th>Cardinal</th><th>Rule-out</th></tr></thead>
                <tbody>
                  ${h.annotations.map((a) => `
                    <tr>
                      <td><strong>${esc(a.specialty)}</strong></td>
                      <td class="score">${a.domainConfidence}</td>
                      <td><small>${esc(a.clinicalReasoning || '')}</small></td>
                      <td><small>${(a.diagnosticTests || []).slice(0, 3).map((t) => esc(t)).join('<br/>')}</small></td>
                      <td><small>${(a.cardinalFeatures || []).slice(0, 3).map((f) => esc(f)).join('<br/>')}</small></td>
                      <td><small>${(a.ruleOutFeatures || []).slice(0, 3).map((f) => esc(f)).join('<br/>')}</small></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </details>
        `).join('')}
      `;
    }
  }

  // v17 per-hypothesis specialty attribution. Each merged hypothesis carries
  // sourceAgents (which specialists proposed it), domainConfidenceMap (each
  // specialist's confidence 0-100), nameVariants (raw names each emitted),
  // and supportingEvidence[].attributedTo (which specialist surfaced each
  // evidence item). Render a drill-down per hypothesis.
  let v17PerHypothesisBreakdown = '';
  if (isV17Consultation) {
    const diffs = slCase.pipelineResult?.differentialDiagnoses || [];
    const withAttribution = diffs.filter((d) => Array.isArray(d.sourceAgents) && d.sourceAgents.length > 0).slice(0, 25);
    if (withAttribution.length > 0) {
      v17PerHypothesisBreakdown = `
        <h3>Per-hypothesis specialty attribution (${withAttribution.length} hypotheses shown)</h3>
        <div class="stage-meta">After dedup, each surviving hypothesis carries the set of specialists that proposed it,
          per-specialist confidence (0-100), the canonical name + raw nameVariants each one used, and per-evidence-item attribution.</div>
        ${withAttribution.map((h) => {
          const confMap = h.domainConfidenceMap || {};
          const confEntries = Object.entries(confMap).sort((a, b) => b[1] - a[1]);
          const avgConf = confEntries.length > 0 ? Math.round(confEntries.reduce((s, [, v]) => s + v, 0) / confEntries.length) : 0;
          const evidence = (h.supportingEvidence || []);
          const evByAgent = {};
          for (const e of evidence) {
            const a = e.attributedTo || 'unknown';
            if (!evByAgent[a]) evByAgent[a] = [];
            evByAgent[a].push(e);
          }
          return `
          <details class="json-details" style="border:1px solid var(--light-border); padding:8px 12px; margin-bottom:8px; background:#fefdfb;">
            <summary class="json-summary">
              <strong>${esc(h.diagnosis)}</strong>
              <span class="badge">${h.sourceAgents.length}/${sps.length} specialists agree</span>
              <span class="badge">avg conf ${avgConf}</span>
              ${h.knowledgeBaseMatch ? '<span class="badge badge-ok">KB</span>' : '<span class="badge">non-KB</span>'}
              ${h.evaluationType ? `<span class="badge">${esc(h.evaluationType)}</span>` : ''}
            </summary>
            <div style="padding: 8px 12px;">
              ${Array.isArray(h.nameVariants) && h.nameVariants.length > 1 ? `
                <h4 style="margin: 8px 0 4px;">Name variants merged (${h.nameVariants.length})</h4>
                <ul class="evidence-list">${h.nameVariants.slice(0, 10).map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
              ` : ''}
              <h4 style="margin: 12px 0 4px;">Per-specialist confidence</h4>
              <table>
                <thead><tr><th>Specialist</th><th>Confidence (0-100)</th><th>Evidence items attributed</th></tr></thead>
                <tbody>
                  ${confEntries.map(([agent, conf]) => `
                    <tr>
                      <td><strong>${esc(agent)}</strong></td>
                      <td class="score">${conf}</td>
                      <td class="score">${(evByAgent[agent] || []).length}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ${h.diagnosticTests?.length > 0 ? `
                <h4 style="margin: 12px 0 4px;">Diagnostic tests proposed</h4>
                <ul class="evidence-list">${h.diagnosticTests.slice(0, 10).map((t) => `<li>${esc(typeof t === 'string' ? t : (t.test || t.name || JSON.stringify(t)))}</li>`).join('')}</ul>
              ` : ''}
              ${h.cardinalFeatures?.length > 0 ? `
                <h4 style="margin: 12px 0 4px;">Cardinal features</h4>
                <ul class="evidence-list">${h.cardinalFeatures.slice(0, 10).map((f) => `<li>${esc(typeof f === 'string' ? f : JSON.stringify(f))}</li>`).join('')}</ul>
              ` : ''}
              ${h.ruleOutFeatures?.length > 0 ? `
                <h4 style="margin: 12px 0 4px;">Rule-out features</h4>
                <ul class="evidence-list">${h.ruleOutFeatures.slice(0, 10).map((f) => `<li>${esc(typeof f === 'string' ? f : JSON.stringify(f))}</li>`).join('')}</ul>
              ` : ''}
              <h4 style="margin: 12px 0 4px;">Supporting evidence by specialist</h4>
              <table>
                <thead><tr><th>Specialist</th><th>Finding</th><th>Patient symptom</th><th>Strength</th></tr></thead>
                <tbody>
                  ${evidence.slice(0, 20).map((e) => `
                    <tr>
                      <td><strong>${esc(e.attributedTo || '—')}</strong></td>
                      <td><small>${esc(e.finding || '')}</small></td>
                      <td><small>${esc(e.patientSymptom || '')}</small></td>
                      <td class="score">${esc(e.strength || '')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </details>`;
        }).join('')}
      `;
    }
  }

  const header = isV17Consultation
    ? `5. Specialist Consultation (v17) — ${sps.length} parallel o3 specialists generating hypotheses`
    : isV16Annotation
    ? `6. Specialist Annotation (v16) — ${sps.length} specialists annotating ${slCase.pipelineResult?.differentialDiagnoses?.length || '?'} candidates`
    : `6. Specialist Consultation (v15) — ${sps.length} parallel hypothesis-generation agents`;

  const intro = isV17Consultation
    ? `<div class="stage-meta">
        v17 architecture: ${sps.length} specialists (geneticist + general-internist anchors, plus top 3 from triage ranking)
        run o3:reasoning=high in parallel on the patient case + per-specialty KB candidates (general-internist gets none —
        un-anchored counterweight). Each emits 3-7 hypotheses with full evidence. Outputs flow into deterministic dedup (next stage).
      </div>`
    : isV16Annotation
    ? `<div class="stage-meta">
        v16 architecture: hypothesis pool fixed upstream (triage + candidate generation union).
        ${sps.length} specialists (top 5 by triage + geneticist + general-internist) each annotate
        all candidates with per-candidate diagnosticTests, cardinalFeatures, ruleOutFeatures,
        supporting/contradictory evidence, and domainConfidence.
      </div>`
    : `<div class="stage-meta">
        v15 architecture: each specialist runs o3:reasoning=high on the patient case + KB candidates
        filtered/reranked for its domain. Outputs ~3-5 hypotheses with evidence per specialist.
      </div>`;

  return section('specialists', header, `
    ${intro}
    ${sCards}
    ${failCards}
    ${perHypothesisAnnotations}
    ${v17PerHypothesisBreakdown}
    ${!isV16Annotation && !isV17Consultation ? `<div class="note">
      Per-specialist hypothesis-level evidence is aggregated into the evidence-evaluator stage below
      (the source-of-truth merged view). Individual specialist hypotheses aren't persisted separately
      after the merge — the next stage shows them combined.
    </div>` : ''}
  `);
}

function renderDedupNormalize(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const stage = stages.find((s) => s.stageName === 'dedup-normalize');
  const stats = slCase.pipelineResult?.pipelineMetadata?.dedupStats;
  if (!stage && !stats) return '';
  const validBadge = stats?.validationPassed ? '<span class="badge badge-ok">PASS</span>' : '<span class="badge badge-err">FAIL</span>';

  const groupRows = (stats?.groups || []).map((g, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td><strong>${esc(g.canonical)}</strong></td>
      <td>${g.variants?.length || 1}</td>
      <td>${(g.contributingSpecialists || []).map((s) => `<span class="badge">${esc(s)}</span>`).join(' ')}</td>
      <td class="score">${g.evidenceItemsContributed ?? '—'}</td>
      <td><span class="badge">${esc(g.canonicalChosenBy || g.matchPath || '—')}</span></td>
    </tr>
    ${g.variants && g.variants.length > 1 ? `
      <tr><td></td><td colspan="5" style="padding-top: 0; font-size: 12px; color: var(--muted);">
        merged variants: ${g.variants.map((v) => `<code>${esc(v)}</code>`).join(' · ')}
      </td></tr>` : ''}
  `).join('');

  const unmatchedBlock = stats?.unmatched?.length ? `
    <h3 style="margin-top: 16px;">Singletons (proposed by only 1 specialist, no merge — ${stats.unmatched.length})</h3>
    <div class="stage-meta">Each carried through to evaluation unmodified. High count here can indicate over-splitting (real duplicates missed) — cross-check via suspicious-pairs below.</div>
    <ul class="evidence-list">${stats.unmatched.slice(0, 30).map((u) => `<li><strong>${esc(u.diagnosis)}</strong> <span class="badge">${esc(u.specialty || '?')}</span></li>`).join('')}</ul>
  ` : '';

  const suspiciousBlock = stats?.suspiciousPairs?.length ? `
    <h3 style="margin-top: 16px;">Suspicious near-matches (${stats.suspiciousPairs.length}) — flagged but NOT merged</h3>
    <div class="stage-meta">Pairs the matcher saw as textually close but kept separate. Manual review territory for over-splitting bugs.</div>
    <ul class="evidence-list">${stats.suspiciousPairs.slice(0, 20).map((p) => `<li><code>${esc(p.a)}</code> vs <code>${esc(p.b)}</code> — edit distance ${p.editDistance ?? '?'} (${esc(p.reason || '?')})</li>`).join('')}</ul>
  ` : '';

  return section('dedup-normalize', '6. Dedup & Normalize — merge variant names across specialists', `
    <div class="stage-meta">
      ${stage ? `<span class="badge">${esc(stage.agentName)}</span> <span class="badge">deterministic</span> <span class="badge">${stage.durationMs}ms</span>` : ''}
      ${stats ? `
        <span class="badge badge-info">${stats.inputCount} → ${stats.outputCount} merged</span>
        <span class="badge badge-info">evidence ${stats.evidenceItemsInput} → ${stats.evidenceItemsOutput}</span>
        <span class="badge badge-info">${stats.attributionsOutput} attributions</span>
        validation: ${validBadge}
      ` : ''}
    </div>
    <p>Deterministic step (no LLM). Hypotheses from the 5 specialists are grouped by normalized name
    (substring/alias matching). Canonical name selection: <strong>KB-anchored</strong> first (use the
    KB profile's curated name if any variant resolves), else <strong>specialist consensus</strong>
    (most-proposed wins), else <strong>shortest variant</strong> (umbrella over subtype). Evidence
    items, diagnostic tests, cardinal features, and rule-outs are merged with per-specialist attribution preserved.</p>
    ${stats?.groups?.length ? `
      <h3>Merge groups (${stats.groups.length})</h3>
      <table>
        <thead><tr><th>#</th><th>Canonical name</th><th>Variants merged</th><th>Specialists</th><th>Ev items</th><th>Chosen by</th></tr></thead>
        <tbody>${groupRows}</tbody>
      </table>
    ` : ''}
    ${unmatchedBlock}
    ${suspiciousBlock}
  `);
}

function renderKbAttach(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const stage = stages.find((s) => s.stageName === 'kb-annotation-merge');
  if (!stage) return '';

  const diffs = slCase.pipelineResult?.differentialDiagnoses || [];
  // Only the survivors-of-dedup hypotheses carry kbProfile attachments at this stage.
  // Show one drill-down per hypothesis with its KB profile if present.
  const hyps = diffs.slice(0, 20);
  const cards = hyps.map((h, i) => {
    const kb = h.kbProfile || (h.knowledgeBaseMatch && h._kbDiseaseId ? loadKbProfile(h._kbDiseaseId) : null);
    return `
      <details class="json-details" style="border:1px solid var(--light-border); padding:8px 12px; margin-bottom:8px; background:#fefdfb;"${i < 3 ? ' open' : ''}>
        <summary class="json-summary">
          <strong>#${i + 1} ${esc(h.diagnosis)}</strong>
          ${h.knowledgeBaseMatch ? '<span class="badge badge-ok">KB attached</span>' : '<span class="badge">non-KB (reasoning-only)</span>'}
          ${kb?.diagnosticCriteria?.criteria?.length ? `<span class="badge">${kb.diagnosticCriteria.criteria.length} criteria</span>` : ''}
          ${kb ? `<span class="badge">${((kb.symptoms?.pathognomonic?.length || 0) + (kb.symptoms?.common?.length || 0) + (kb.symptoms?.occasional?.length || 0) + (kb.symptoms?.rare?.length || 0))} symptoms</span>` : ''}
          ${h.orphanetId ? `<span class="badge">Orphanet ${esc(h.orphanetId)}</span>` : ''}
          ${h.omimId ? `<span class="badge">OMIM ${esc(h.omimId)}</span>` : ''}
        </summary>
        <div style="padding: 8px 12px;">
          ${renderKbProfileBody(kb)}
        </div>
      </details>
    `;
  }).join('');

  return section('kb-attach', '7. KB Profile Attach — full profile attached to each surviving hypothesis', `
    <div class="stage-meta">
      <span class="badge">${esc(stage.agentName)}</span>
      <span class="badge">deterministic</span>
      <span class="badge">${stage.durationMs}ms</span>
      <br/><span class="badge badge-info">${esc(stage.outputSummary || '')}</span>
    </div>
    <p>After dedup, each canonical hypothesis name is looked up in the KB. Matches get the
    full curated profile (diagnostic criteria, tiered symptoms, key findings, sibling DDx,
    red flags) attached for the Claude evaluator. Non-matches are flagged as reasoning-only
    and scored by the evaluator on clinical-reasoning quality (same 0–100 scale).</p>
    ${cards}
  `);
}

function renderO3Critique(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const stage = stages.find((s) => s.stageName === 'o3-critique');
  const crit = slCase.pipelineResult?.pipelineMetadata?.critique;
  if (!stage && !crit) return '';

  const actionBadge = (a) => {
    if (a === 'promote') return '<span class="badge badge-ok">PROMOTE</span>';
    if (a === 'demote') return '<span class="badge badge-err">DEMOTE</span>';
    if (a === 'reorder') return '<span class="badge badge-info">REORDER</span>';
    if (a === 'merge') return '<span class="badge">MERGE</span>';
    if (a === 'flag-gap') return '<span class="badge">FLAG-GAP</span>';
    if (a === 'add') return '<span class="badge badge-ok">ADD (new)</span>';
    return `<span class="badge">${esc(a || '?')}</span>`;
  };
  const suggestionsBlock = (crit?.suggestions?.length)
    ? `
      <h3 style="margin-top: 16px;">Per-suggestion detail (${crit.suggestions.length})</h3>
      <table>
        <thead>
          <tr><th>#</th><th>Target diagnosis</th><th>Action</th><th>New rank</th><th>Conf</th><th>Evidence cited</th><th>Reasoning</th></tr>
        </thead>
        <tbody>
          ${crit.suggestions.map((s, i) => `
            <tr>
              <td class="rank">${i + 1}</td>
              <td><strong>${esc(s.targetDiagnosis)}</strong></td>
              <td>${actionBadge(s.action)}</td>
              <td class="score">${s.targetNewRank ?? '—'}</td>
              <td class="score">${typeof s.confidence === 'number' ? s.confidence : '—'}</td>
              <td><small>${(s.evidence || []).map((e) => `• ${esc(e)}`).join('<br/>')}</small></td>
              <td><small>${esc(s.reasoning || '')}</small></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '<div class="note">No per-suggestion detail persisted on this case (older run pre-dating the structured-suggestion persistence change). Raw suggestions and reasoning are in the o3-critic LLM call in Section 15b.</div>';

  return section('o3-critique', '10. o3 Critique — second-opinion review of Claude\'s ranking', `
    <div class="stage-meta">
      ${stage ? `<span class="badge">${esc(stage.model)}</span> <span class="badge">${stage.tokensUsed?.toLocaleString()} tokens</span> <span class="badge">${Math.round((stage.durationMs || 0) / 1000)}s</span>` : ''}
      ${crit ? `
        <br/>
        <span class="badge badge-info">confidence in Claude ranking: ${crit.confidenceInClaudeRanking}/100</span>
        <span class="badge badge-info">${crit.suggestionCount} suggestions</span>
        <span class="badge badge-ok">${crit.acceptedCount} accepted by Claude finalize</span>
      ` : ''}
    </div>
    <p>o3 reasoning:high reviews Claude's <strong>full ranking</strong> (every evaluated
    hypothesis, not just the top-10) and emits structured suggestions:
    <code>promote</code>, <code>demote</code>, <code>reorder</code>, <code>merge</code>,
    <code>flag-gap</code>, or <code>add</code>. <code>add</code> is gated by a confidence floor
    (suggestions below the threshold are dropped before Claude finalize sees them) — used when
    o3 is highly confident a diagnosis missed by specialists + Claude belongs in the final
    top-10. Claude finalize (next stage) accepts or rejects each suggestion and selects the
    final top-10.</p>
    ${crit?.overallAssessment ? `<p><strong>Overall assessment:</strong> <em>${esc(crit.overallAssessment)}</em></p>` : ''}
    ${stage?.outputSummary ? `<p><strong>Output:</strong> ${esc(stage.outputSummary)}</p>` : ''}
    ${suggestionsBlock}
  `);
}

function renderClaudeFinalize(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const stage = stages.find((s) => s.stageName === 'claude-finalize');
  const fc = slCase.pipelineResult?.pipelineMetadata?.finalizerChanges;
  if (!stage && !fc) return '';

  const diffs = slCase.pipelineResult?.differentialDiagnoses || [];
  const ranked = diffs.filter((d) => d.changesFromFirstPass).slice(0, 15);

  const changesRows = ranked.length ? ranked.map((d, i) => {
    const ch = d.changesFromFirstPass || {};
    const delta = ch.rankBefore !== undefined && ch.rankAfter !== undefined
      ? ch.rankBefore - ch.rankAfter
      : null;
    const deltaBadge = delta === null
      ? '<span class="badge">—</span>'
      : delta > 0
      ? `<span class="badge badge-ok">▲ +${delta}</span>`
      : delta < 0
      ? `<span class="badge badge-err">▼ ${delta}</span>`
      : '<span class="badge">=</span>';
    return `
      <tr>
        <td class="rank">${i + 1}</td>
        <td><strong>${esc(d.diagnosis)}</strong></td>
        <td class="score">${ch.rankBefore ?? '—'}</td>
        <td class="score">${ch.rankAfter ?? i + 1}</td>
        <td>${deltaBadge}</td>
        <td><small>${esc(ch.changeReason || '')}</small></td>
      </tr>
    `;
  }).join('') : '';

  return section('claude-finalize', '11. Claude Finalize — accept/reject critique, emit final ranking', `
    <div class="stage-meta">
      ${stage ? `<span class="badge">${esc(stage.model)}</span> <span class="badge">${stage.tokensUsed?.toLocaleString()} tokens</span> <span class="badge">${Math.round((stage.durationMs || 0) / 1000)}s</span>` : ''}
      ${fc ? `
        <br/>
        <span class="badge badge-info">${fc.rankChangesFromFirstPass} rank changes from Claude's first pass</span>
        ${fc.removedFromTop10?.length ? `<span class="badge badge-err">removed from top10: ${fc.removedFromTop10.length}</span>` : ''}
        ${fc.addedToTop10?.length ? `<span class="badge badge-ok">added to top10: ${fc.addedToTop10.length}</span>` : ''}
      ` : ''}
    </div>
    <p>Claude opus-4-7 reasoning:medium reviews its own full first-pass ranking
    (Section 9) + o3's critique suggestions (Section 10) and <strong>selects the final
    top-10</strong> the patient sees. Entries from positions 11+ in synth can be
    promoted into the top-10 here; entries from the synth top-10 can be dropped.
    Each surviving hypothesis carries <code>changesFromFirstPass</code> (rankBefore/After + reason)
    explaining why it moved.</p>
    ${stage?.outputSummary ? `<p><strong>Output:</strong> ${esc(stage.outputSummary)}</p>` : ''}
    ${ranked.length ? `
      <h3>Per-hypothesis rank changes (${ranked.length})</h3>
      <table>
        <thead><tr><th>#</th><th>Diagnosis</th><th>Before</th><th>After</th><th>Δ</th><th>Reason</th></tr></thead>
        <tbody>${changesRows}</tbody>
      </table>
    ` : ''}
  `);
}

function renderEvidenceEval(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  // v17 names this stage 'claude-evaluation'; v15/v16 named it 'evidence-evaluation'.
  const ev = stages.find((s) => s.stageName === 'claude-evaluation')
          || stages.find((s) => s.stageName === 'evidence-evaluation');
  const isV17 = !!stages.find((s) => s.stageName === 'claude-evaluation');
  // Pull the final hypothesis pool from differentialDiagnoses (these are the
  // synth's final ranked output, but each entry has the upstream criteria
  // fulfillment + supporting/contradictory evidence built by the evaluator).
  const diffs = slCase.pipelineResult?.differentialDiagnoses || [];
  const evalHyp = diffs.filter((d) => d.sourceAgent !== 'family-expansion');

  const hypTable = evalHyp.slice(0, 12).map((h, i) => {
    const dc = h.diagnosticCriteria || {};
    const criteriaPct = dc.totalCriteria ? Math.round((dc.metCriteria / dc.totalCriteria) * 100) : null;
    const supp = (h.supportingEvidence || []).slice(0, 5);
    const contra = (h.contradictoryEvidence || []).slice(0, 3);
    return `
      <details class="json-details">
        <summary class="json-summary"><strong>#${i + 1} ${esc(h.diagnosis)}</strong>
          <span class="badge">${esc(h.evaluationType || 'reasoning')}</span>
          ${criteriaPct !== null ? `<span class="badge">${dc.metCriteria}/${dc.totalCriteria} criteria met (${criteriaPct}%)</span>` : ''}
          ${h.knowledgeBaseMatch ? '<span class="badge badge-ok">KB-matched</span>' : '<span class="badge">non-KB</span>'}
          <span class="badge">source: ${esc(h.sourceAgent || '')}</span>
        </summary>
        <div style="padding: 8px 12px 12px; background: var(--code-bg);">
          ${dc.criteriaDetails?.length > 0 ? `
            <strong>Criteria checklist:</strong>
            <ul class="evidence-list">
              ${dc.criteriaDetails.map((c) => `<li class="${c.met ? 'criteria-met' : 'criteria-not'}">${c.met ? '✓' : '✗'} ${esc(c.criterion)}${c.evidence ? ` — <em>${esc(c.evidence)}</em>` : ''}</li>`).join('')}
            </ul>
          ` : ''}
          <strong>Supporting evidence:</strong>
          <ul class="evidence-list">
            ${supp.map((e) => `<li class="evidence-${e.strength || 'weak'}">[${esc(e.strength || '')}] ${esc(e.finding)} ← <em>"${esc(e.patientSymptom || '')}"</em></li>`).join('') || '<li>(none)</li>'}
          </ul>
          ${contra.length > 0 ? `
            <strong>Contradictory evidence:</strong>
            <ul class="evidence-list">
              ${contra.map((e) => `<li class="contra">[${esc(e.strength || '')}] ${esc(e.finding)} ← <em>"${esc(e.patientSymptom || '')}"</em></li>`).join('')}
            </ul>
          ` : ''}
          ${h.clinicalReasoning ? `<p><strong>Clinical reasoning:</strong> ${esc(h.clinicalReasoning)}</p>` : ''}
          ${h._strengthAssessment ? `<p><strong>Evaluator strength assessment:</strong> ${esc(h._strengthAssessment)}</p>` : ''}
        </div>
      </details>
    `;
  }).join('');

  const evalTitle = isV17
    ? '8. Claude Evaluation — criteria-grounded scoring (Claude opus-4-7 reasoning:high)'
    : '7. Evidence Evaluation — criteria checking & evidence scoring';
  const evalIntro = isV17
    ? `<p>Claude evaluator scores each KB-attached hypothesis against its diagnostic criteria
       (criteria-grounded) and each non-KB hypothesis on clinical-reasoning quality
       (reasoning-evaluated) — same 0–100 scale either way. Output feeds Claude synthesis.</p>`
    : `<p>Showing the synth's final top-12 hypotheses with their upstream evaluator data (criteria checklist, supporting/contradictory evidence with patient-symptom anchors).</p>`;
  return section('evidence-eval', evalTitle, `
    <div class="stage-meta">
      ${ev ? `<span class="badge">${esc(ev.model)}</span> <span class="badge">${ev.tokensUsed?.toLocaleString()} tokens</span> <span class="badge">${Math.round((ev.durationMs || 0) / 1000)}s</span>` : ''}
      ${ev?.outputSummary ? `<br/>${esc(ev.outputSummary)}` : ''}
    </div>
    ${evalIntro}
    ${hypTable}
  `);
}

function renderSynthesizers(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const synthO3 = stages.find((s) => s.stageName === 'synthesis');
  // v17 uses 'claude-synthesis'; v15 used 'synthesis-claude'.
  const synthClaudeV17 = stages.find((s) => s.stageName === 'claude-synthesis');
  const synthClaudeV15 = stages.find((s) => s.stageName === 'synthesis-claude');
  const synthClaude = synthClaudeV17 || synthClaudeV15;
  const isV17 = !!synthClaudeV17;
  const recon = slCase.pipelineResult?.pipelineMetadata?.reconciliation;

  // v17 has no o3 synth stage — Claude is the sole synthesizer, critiqued by o3 next.
  const o3Section = isV17 ? '' : section('synth-o3', '8. Synthesizer — o3 reasoning:high', `
    <div class="stage-meta">
      <span class="badge">${esc(synthO3?.model)}</span>
      <span class="badge">${synthO3?.tokensUsed?.toLocaleString()} tokens</span>
      <span class="badge">${Math.round((synthO3?.durationMs || 0) / 1000)}s</span>
    </div>
    <p><strong>o3's initial top-1:</strong> <em>${esc(recon?.o3InitialTop1 || synthO3?.outputSummary?.replace(/^Top diagnosis:\s*/, ''))}</em></p>
    <div class="note">
      The full ranked list o3 produced is the input to reconciliation. After reconciliation
      the final ranking is what appears in the differential below (section 13).
    </div>
  `);

  const claudeTitle = isV17
    ? '9. Claude Synthesis — full ranking of all deduped hypotheses'
    : '9. Synthesizer — Claude opus-4-7 reasoning:high (parallel)';
  const claudeIntro = isV17
    ? `<p>Claude opus-4-7 reasoning:high ranks <strong>every</strong> evaluated hypothesis
       (not just a top-10) so the downstream critique and finalize stages see the full
       differential. The 10-cap moves to Stage 11 (Claude finalize) — synth's job here
       is to produce a coherent full ordering, not to narrow the field.</p>`
    : `<p><strong>Claude's initial top-1:</strong> <em>${esc(recon?.claudeInitialTop1 || synthClaude?.outputSummary?.replace(/^Top:\s*/, ''))}</em></p>`;

  const claudeSection = synthClaude ? section('synth-claude', claudeTitle, `
    <div class="stage-meta">
      <span class="badge">${esc(synthClaude.model)}</span>
      <span class="badge">${synthClaude.tokensUsed?.toLocaleString()} tokens</span>
      <span class="badge">${Math.round((synthClaude.durationMs || 0) / 1000)}s</span>
    </div>
    ${claudeIntro}
    ${synthClaude.outputSummary ? `<p><strong>Top:</strong> <em>${esc(synthClaude.outputSummary)}</em></p>` : ''}
  `) : section('synth-claude', '9. Synthesizer (Claude)', '<div class="note">Not run on this case (pre-v15 architecture).</div>');

  return o3Section + claudeSection;
}

function renderReconciliation(slCase) {
  const recon = slCase.pipelineResult?.pipelineMetadata?.reconciliation;
  if (!recon) return section('reconciliation', '10. Reconciliation', '<div class="note">No reconciliation data (pre-v15 architecture).</div>');

  const confBadge = recon.confidence === 'dual-model-consensus' ? 'badge-ok' : recon.confidence === 'persistent-disagreement-criteria-tiebreak' ? 'badge-err' : 'badge-info';

  const positionBadge = (p) => {
    if (!p) return '';
    if (p === 'agree') return '<span class="badge badge-ok">AGREE</span>';
    if (p === 'stand') return '<span class="badge badge-info">STAND</span>';
    if (p === 'disagree') return '<span class="badge badge-err">DISAGREE</span>';
    return `<span class="badge">${esc(p)}</span>`;
  };

  const o3Hist = recon.o3RoundHistory || [];
  const clHist = recon.claudeRoundHistory || [];
  const maxRound = Math.max(o3Hist.length, clHist.length);

  // Render side-by-side round history with each model's top-1, position, and reasoning
  let roundRows = '';
  for (let i = 0; i < maxRound; i++) {
    const o3R = o3Hist[i] || {};
    const clR = clHist[i] || {};
    roundRows += `
      <tr>
        <td><strong>Round ${i + 1}</strong></td>
        <td>
          ${o3R.topOne ? `<div><strong>${esc(o3R.topOne)}</strong> ${positionBadge(o3R.position)}</div>` : '<em>(no entry)</em>'}
          ${o3R.reasoning ? `<details class="json-details"><summary class="json-summary">reasoning</summary><div style="padding:6px 8px; background:var(--code-bg); font-size:12px;">${esc(o3R.reasoning)}</div></details>` : ''}
        </td>
        <td>
          ${clR.topOne ? `<div><strong>${esc(clR.topOne)}</strong> ${positionBadge(clR.position)}</div>` : '<em>(no entry)</em>'}
          ${clR.reasoning ? `<details class="json-details"><summary class="json-summary">reasoning</summary><div style="padding:6px 8px; background:var(--code-bg); font-size:12px;">${esc(clR.reasoning)}</div></details>` : ''}
        </td>
      </tr>`;
  }

  // Pull reconciliation LLM calls (Round 2 / Round 3 raw prompts + responses)
  const allCalls = slCase.pipelineResult?.pipelineMetadata?.llmCalls || [];
  const reconCalls = allCalls.filter((c) => (c.agentName || '').includes('reconciliation') || c.stageName === 'reconciliation');
  // Group by round
  const callsByRound = new Map();
  for (const c of reconCalls) {
    const m = (c.agentName || '').match(/-r(\d+)$/);
    const r = m ? Number(m[1]) : null;
    if (r === null) continue;
    if (!callsByRound.has(r)) callsByRound.set(r, []);
    callsByRound.get(r).push(c);
  }

  const renderCallDrilldown = (c) => `
    <details class="json-details" style="border:1px solid var(--light-border); padding:6px 10px; margin:6px 0; background:#fefdfb;">
      <summary class="json-summary">
        <strong>${esc(c.agentName)}</strong>
        <span class="badge badge-info">${esc(c.provider)}/${esc(c.model)}</span>
        ${c.reasoningEffort ? `<span class="badge">${esc(c.reasoningEffort)}</span>` : ''}
        <span class="badge">${c.tokensIn ?? '?'}→${c.tokensOut ?? '?'} tok</span>
        ${c.reasoningTokens ? `<span class="badge badge-info">${c.reasoningTokens} reasoning</span>` : ''}
        <span class="badge">${Math.round((c.durationMs || 0) / 1000)}s</span>
        ${c.finishReason ? `<span class="badge">finish: ${esc(c.finishReason)}</span>` : ''}
      </summary>
      <div style="padding: 6px 0;">
        <h4 style="margin: 10px 0 4px;">System prompt</h4>
        <pre>${esc(c.systemPrompt || '(none)')}</pre>
        <h4 style="margin: 10px 0 4px;">User prompt</h4>
        <pre>${esc(c.userPrompt || '(none)')}</pre>
        ${c.rawResponseText ? `<h4 style="margin: 10px 0 4px;">Raw response</h4><pre>${esc(c.rawResponseText)}</pre>` : ''}
        ${c.structuredOutput ? `<h4 style="margin: 10px 0 4px;">Structured output</h4><pre>${esc(typeof c.structuredOutput === 'string' ? c.structuredOutput : JSON.stringify(c.structuredOutput, null, 2))}</pre>` : ''}
      </div>
    </details>
  `;

  let drilldown = '';
  if (callsByRound.size > 0) {
    const rounds = Array.from(callsByRound.keys()).sort((a, b) => a - b);
    drilldown = `
      <h3 style="margin-top: 16px;">Per-round LLM calls (raw prompts + responses)</h3>
      ${rounds.map((r) => `
        <h4 style="margin: 12px 0 6px;">Round ${r}</h4>
        ${callsByRound.get(r).map(renderCallDrilldown).join('')}
      `).join('')}
    `;
  } else if (recon.roundsRun > 1) {
    drilldown = `
      <div class="note">
        Per-round LLM calls weren't logged for this case (predates the LLM call
        logger). The round history above still carries each model's
        position + reasoning text. Newer runs capture the full prompt/response
        for every Round 2 / Round 3 call.
      </div>
    `;
  }

  return section('reconciliation', '10. Reconciliation — structured iterative agreement', `
    <div class="stage-meta">
      <span class="badge ${confBadge}">${esc(recon.confidence)}</span>
      <span class="badge">${recon.roundsRun || 1} round(s)</span>
      ${recon.tokensUsed > 0 ? `<span class="badge">${recon.tokensUsed.toLocaleString()} tokens</span>` : ''}
      ${recon.durationMs > 0 ? `<span class="badge">${Math.round(recon.durationMs / 1000)}s</span>` : ''}
    </div>
    <table>
      <thead><tr><th></th><th>o3</th><th>Claude</th></tr></thead>
      <tbody>
        ${roundRows}
      </tbody>
    </table>
    <table style="margin-top: 12px;">
      <tbody>
        <tr><td><strong>Final top-1</strong></td><td><strong>${esc(recon.finalTop1)}</strong> <span class="badge">${esc(recon.finalTop1Source)}</span></td></tr>
        <tr><td>Initial agreement</td><td>${recon.initialAgreement ? '✓ agreed at Round 1' : '✗ disagreed at Round 1'}</td></tr>
        <tr><td>Final agreement</td><td>${recon.finalAgreement ? '✓ converged' : '✗ persistent disagreement (criteria tiebreaker)'}</td></tr>
      </tbody>
    </table>
    ${drilldown}
  `);
}

function renderReport(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const rep = stages.find((s) => s.stageName === 'report');
  const pr = slCase.pipelineResult;
  const reportNum = isV17Case(slCase) ? '12' : '11';
  return section('report', `${reportNum}. Report Generation`, `
    ${rep ? `<div class="stage-meta">
      <span class="badge">${esc(rep.model)}</span>
      <span class="badge">${rep.tokensUsed?.toLocaleString()} tokens</span>
      <span class="badge">${Math.round((rep.durationMs || 0) / 1000)}s</span>
    </div>` : ''}
    ${pr?.overallAssessment ? `<p><strong>Overall assessment:</strong> ${esc(pr.overallAssessment)}</p>` : ''}
    ${pr?.recommendedTesting?.length > 0 ? `
      <p><strong>Recommended testing:</strong></p>
      <ul class="evidence-list">${pr.recommendedTesting.map((t) => `<li>${esc(typeof t === 'string' ? t : t.test || JSON.stringify(t))}</li>`).join('')}</ul>
    ` : ''}
    ${pr?.nextSteps?.immediateActions?.length > 0 ? `
      <p><strong>Immediate actions:</strong></p>
      <ul class="evidence-list">${pr.nextSteps.immediateActions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    ` : ''}
    ${jsonBlock({ overallAssessment: pr?.overallAssessment, recommendedTesting: pr?.recommendedTesting, nextSteps: pr?.nextSteps, dataGaps: pr?.dataGaps }, 'Full report JSON')}
  `);
}

function renderFamilyExpansion(slCase) {
  const fe = slCase.pipelineResult?.familyEnrichments || [];
  const feNum = isV17Case(slCase) ? '13' : '12';
  if (fe.length === 0 && !slCase.pipelineResult?.differentialDiagnoses?.some((d) => d.sourceAgent === 'family-expansion')) {
    return section('family-expansion', `${feNum}. Family Expansion (positions 11-15)`, '<div class="note">No family expansions added for this case.</div>');
  }
  const expansions = slCase.pipelineResult?.differentialDiagnoses?.filter((d) => d.sourceAgent === 'family-expansion') || [];
  const rows = expansions.map((d, i) => `
    <tr>
      <td class="rank">#${11 + i}</td>
      <td>${esc(d.diagnosis)}</td>
      <td><code>${esc(d.icd10Code || '')}</code></td>
      <td>${esc(d.expansionSource || '')}</td>
      <td>${esc(d.parentDiagnosis || '')}</td>
    </tr>
  `).join('');
  return section('family-expansion', `${feNum}. Family Expansion — KB-linked siblings at positions 11-15`, `
    <div class="stage-meta">Deterministic (no LLM). Walks top diagnoses, finds same-family KB profiles, appends.</div>
    <table>
      <thead><tr><th>Position</th><th>Disease</th><th>ICD-10</th><th>Source</th><th>Parent</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `);
}

function renderFinalDifferential(slCase, oaiCase, clCase) {
  const diffs = slCase.pipelineResult?.differentialDiagnoses || [];
  const rows = diffs.slice(0, 15).map((d, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td>
        <div class="hypothesis-name">${esc(d.diagnosis)}</div>
        ${d.icd10Code ? `<small style="color: var(--muted)">ICD-10 ${esc(d.icd10Code)}</small>` : ''}
      </td>
      <td class="score">${d.confidenceScore || 0}</td>
      <td class="score">${d.evidenceScore || 0}</td>
      <td>${d.knowledgeBaseMatch ? '<span class="badge badge-ok">KB</span>' : '<span class="badge">non-KB</span>'}</td>
      <td><small>${esc(d.sourceAgent || '')}</small></td>
    </tr>
  `).join('');

  const baselines = (oaiCase || clCase) ? `
    <h3>Single-shot baseline comparison</h3>
    <table>
      <thead><tr><th>Engine</th><th>Top-1</th><th>Old grader rank</th><th>v3 tier</th></tr></thead>
      <tbody>
        ${oaiCase ? `<tr><td>OAI o3 single-shot</td><td>${esc(oaiCase.pipelineResult?.differentialDiagnoses?.[0]?.diagnosis)}</td><td>${oaiCase.grading?.correctDiagnosisRank ?? 'null'}</td><td>${esc(oaiCase.tieredGrading?.entries?.[0]?.tier || '?')}</td></tr>` : ''}
        ${clCase ? `<tr><td>Claude opus-4-7 single-shot</td><td>${esc(clCase.pipelineResult?.differentialDiagnoses?.[0]?.diagnosis)}</td><td>${clCase.grading?.correctDiagnosisRank ?? 'null'}</td><td>${esc(clCase.tieredGrading?.entries?.[0]?.tier || '?')}</td></tr>` : ''}
      </tbody>
    </table>
  ` : '';

  const finalNum = isV17Case(slCase) ? '14' : '13';
  const finalIntro = isV17Case(slCase)
    ? 'Output of v17 pipeline: Claude-finalize ranked top 10 plus family expansion at 11-15.'
    : 'Output of v15 pipeline: synth-ranked top 10 plus family expansion at 11-15.';
  return section('final', `${finalNum}. Final Differential (top 15) — pipeline output`, `
    <div class="stage-meta">${finalIntro}</div>
    <table>
      <thead><tr><th>#</th><th>Diagnosis</th><th>Conf</th><th>Evi</th><th>Type</th><th>Source</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${baselines}
  `);
}

function renderGrading(slCase) {
  const v2 = slCase.grading;
  const v3 = slCase.tieredGrading;
  const gradeNum = isV17Case(slCase) ? '15' : '14';
  return section('grading', `${gradeNum}. Grading`, `
    ${v2 ? `
      <h3>v2 (old LLM grader)</h3>
      <div class="stage-meta">
        <span class="badge">Score ${v2.score}</span>
        <span class="badge">Grade ${esc(v2.grade)}</span>
        <span class="badge">Rank ${v2.correctDiagnosisRank ?? 'null'}</span>
        <span class="badge">Top-3: ${v2.inTop3 ? '✓' : '✗'}</span>
        <span class="badge">Top-5: ${v2.inTop5 ? '✓' : '✗'}</span>
        ${v2.tierMatch?.tier ? `<span class="badge">${esc(v2.tierMatch.tier)}</span>` : ''}
      </div>
      ${v2.feedback ? `<p><strong>Feedback:</strong> ${esc(v2.feedback)}</p>` : ''}
    ` : ''}
    ${v3 ? `
      <h3>v3 (tiered Claude grader)</h3>
      <div class="stage-meta">
        <span class="badge ${v3.isTop1 ? 'badge-ok' : ''}">isTop1 (EXACT+VARIANT): ${v3.isTop1 ? '✓' : '✗'}</span>
        <span class="badge">EXACT rank: ${v3.rankAtExact ?? 'null'}</span>
        <span class="badge">VARIANT rank: ${v3.rankAtVariant ?? 'null'}</span>
        <span class="badge">FAMILY rank: ${v3.rankAtFamily ?? 'null'}</span>
        <span class="badge">Any rank: ${v3.rankAtAny ?? 'null'}</span>
        <span class="badge">confidence: ${esc(v3.graderConfidence)}</span>
      </div>
      <table>
        <thead><tr><th>#</th><th>Engine output</th><th>Tier</th><th>Grader reasoning</th></tr></thead>
        <tbody>
          ${v3.entries.map((e) => `
            <tr>
              <td class="rank">${e.position}</td>
              <td>${esc(e.engineOutput)}</td>
              <td><span class="badge badge-tier-${(e.tier || 'unrelated').toLowerCase()}">${esc(e.tier)}</span></td>
              <td><small>${esc(e.reasoning)}</small></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${v3.graderNotes ? `<p><strong>Grader notes:</strong> ${esc(v3.graderNotes)}</p>` : ''}
    ` : '<div class="note">v3 grader not run yet for this case.</div>'}
  `);
}

function renderLlmCalls(slCase) {
  const calls = slCase.pipelineResult?.pipelineMetadata?.llmCalls || [];
  if (calls.length === 0) {
    return section('llm-calls', `${isV17Case(slCase) ? '15b' : '14b'}. LLM Calls — raw prompts and responses`, `
      <div class="note">
        No per-call logs persisted for this case. Run a fresh case with
        <code>LOG_LLM_CALLS=1</code> (default in v16+) and the orchestrator
        will capture every prompt, every response, and every reasoning trace
        for offline inspection.
      </div>
    `);
  }

  const totalTokens = calls.reduce((s, c) => s + (c.tokensIn || 0) + (c.tokensOut || 0), 0);
  const reasoningTotal = calls.reduce((s, c) => s + (c.reasoningTokens || 0), 0);

  const callCards = calls.map((c, i) => `
    <details class="json-details" style="border:1px solid var(--light-border); padding: 8px 12px; margin-bottom: 8px; background: #fefdfb;">
      <summary class="json-summary">
        <strong>Call ${c.callIndex ?? i + 1}</strong>
        <span class="badge">${esc(c.agentName || c.stageName || 'unknown')}</span>
        <span class="badge badge-info">${esc(c.provider)}/${esc(c.model)}</span>
        ${c.reasoningEffort ? `<span class="badge">${esc(c.reasoningEffort)}</span>` : ''}
        <span class="badge">${c.tokensIn ?? '?'}→${c.tokensOut ?? '?'} tok</span>
        ${c.reasoningTokens ? `<span class="badge badge-info">${c.reasoningTokens} reasoning</span>` : ''}
        <span class="badge">${Math.round((c.durationMs || 0) / 1000)}s</span>
        ${c.error ? '<span class="badge badge-err">ERROR</span>' : ''}
      </summary>
      <div style="padding: 8px 0;">
        <div class="pair"><span class="label">Started:</span> ${esc(c.startedAt)}</div>
        ${c.finishReason ? `<div class="pair"><span class="label">Finish reason:</span> <code>${esc(c.finishReason)}</code></div>` : ''}
        ${c.temperature !== undefined ? `<div class="pair"><span class="label">Temperature:</span> ${c.temperature}</div>` : ''}
        ${c.maxTokens ? `<div class="pair"><span class="label">Max tokens:</span> ${c.maxTokens}</div>` : ''}
        ${c.toolNames?.length ? `<div class="pair"><span class="label">Tools:</span> ${c.toolNames.map((n) => `<code>${esc(n)}</code>`).join(', ')}</div>` : ''}
        ${c.toolChoice ? `<div class="pair"><span class="label">Tool choice:</span> <code>${esc(c.toolChoice)}</code></div>` : ''}

        <h4 style="margin: 12px 0 4px;">System prompt ${c.systemPromptTruncated ? '(truncated)' : ''}</h4>
        <pre>${esc(c.systemPrompt || '(none)')}</pre>

        <h4 style="margin: 12px 0 4px;">User prompt ${c.userPromptTruncated ? '(truncated)' : ''}</h4>
        <pre>${esc(c.userPrompt || '(none)')}</pre>

        ${c.rawResponseText ? `
          <h4 style="margin: 12px 0 4px;">Raw response text ${c.rawResponseTextTruncated ? '(truncated)' : ''}</h4>
          <pre>${esc(c.rawResponseText)}</pre>
        ` : ''}

        ${c.reasoningSummary ? `
          <h4 style="margin: 12px 0 4px;">Reasoning summary</h4>
          <pre>${esc(c.reasoningSummary)}</pre>
        ` : ''}

        ${c.structuredOutput ? `
          <h4 style="margin: 12px 0 4px;">Structured output</h4>
          <pre>${esc(typeof c.structuredOutput === 'string' ? c.structuredOutput : JSON.stringify(c.structuredOutput, null, 2))}</pre>
        ` : ''}

        ${c.error ? `<div class="note" style="background: #fdecec; border-color: var(--bad);"><strong>Error:</strong> ${esc(c.error)}</div>` : ''}
      </div>
    </details>
  `).join('');

  return section('llm-calls', `${isV17Case(slCase) ? '15b' : '14b'}. LLM Calls — ${calls.length} captured`, `
    <div class="stage-meta">
      <span class="badge">${calls.length} calls</span>
      <span class="badge">${totalTokens.toLocaleString()} tokens in/out</span>
      ${reasoningTotal > 0 ? `<span class="badge badge-info">${reasoningTotal.toLocaleString()} reasoning tokens</span>` : ''}
    </div>
    <p>Each call: system + user prompts as sent, raw response text where available
    (Anthropic returns text; OpenAI tool-call responses store only the parsed
    arguments), structured output, finish reason, token counts including
    o-series reasoning tokens, duration.</p>
    ${callCards}
  `);
}

function renderRawData(slCase, oaiCase, clCase) {
  return section('raw', `${isV17Case(slCase) ? '16' : '15'}. Raw Data — full JSON dumps`, `
    ${jsonBlock(slCase, 'Full SL testCase (this is everything persisted in KV)')}
    ${oaiCase ? jsonBlock(oaiCase, 'OAI baseline testCase') : ''}
    ${clCase ? jsonBlock(clCase, 'Claude baseline testCase') : ''}
  `);
}

// ============================================================
// BUILD HTML
// ============================================================

function renderCaseBody(bundle) {
  const { slCase: sl, oaiCase: oa, clCase: cl } = bundle;
  if (isV17Case(sl)) {
    // v17 actual flow order: triage → triage KB pool → specialists → dedup → KB attach
    // → claude eval → claude synth → o3 critique → claude finalize → report.
    return `
      ${renderHeader(sl, oa, cl)}
      ${renderTOC(sl)}
      <main>
        ${renderInput(sl)}
        ${renderExtraction(sl)}
        ${renderTriageStage(sl)}
        ${renderKBRetrieval(sl, { v17: true })}
        ${renderSpecialists(sl)}
        ${renderDedupNormalize(sl)}
        ${renderKbAttach(sl)}
        ${renderEvidenceEval(sl)}
        ${renderSynthesizers(sl)}
        ${renderO3Critique(sl)}
        ${renderClaudeFinalize(sl)}
        ${renderReport(sl)}
        ${renderFamilyExpansion(sl)}
        ${renderFinalDifferential(sl, oa, cl)}
        ${renderGrading(sl)}
        ${renderLlmCalls(sl)}
        ${renderRawData(sl, oa, cl)}
      </main>
    `;
  }
  // v15/v16 legacy order — kept verbatim for backward-compatible deep dives.
  return `
    ${renderHeader(sl, oa, cl)}
    ${renderTOC(sl)}
    <main>
      ${renderInput(sl)}
      ${renderExtraction(sl)}
      ${renderTriageStage(sl)}
      ${renderCandidateGen(sl)}
      ${renderKBRetrieval(sl)}
      ${renderSpecialists(sl)}
      ${renderEvidenceEval(sl)}
      ${renderSynthesizers(sl)}
      ${renderReconciliation(sl)}
      ${renderReport(sl)}
      ${renderFamilyExpansion(sl)}
      ${renderFinalDifferential(sl, oa, cl)}
      ${renderGrading(sl)}
      ${renderLlmCalls(sl)}
      ${renderRawData(sl, oa, cl)}
    </main>
  `;
}

// Tabs CSS — uses :checked sibling selectors so no JS needed
const tabCss = caseBundles.length > 1 ? `
<style>
  .tab-radio { display: none; }
  .tab-nav {
    position: sticky; top: 0; z-index: 20;
    background: var(--paper);
    border-bottom: 2px solid var(--med-border);
    padding: 0 24px;
    display: flex; gap: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  }
  .tab-label {
    padding: 14px 18px;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    color: var(--muted);
    font-weight: 600;
    font-size: 13px;
    transition: all 0.15s;
    user-select: none;
  }
  .tab-label:hover { color: var(--ink); background: #fdfaf5; }
  .tab-label small { display: block; font-weight: 400; color: var(--muted); font-size: 11px; margin-top: 2px; }
  .tab-pane { display: none; }
  ${caseBundles.map((b, i) => `
    #tab-${i}:checked ~ .tab-nav label[for="tab-${i}"] {
      color: var(--accent);
      border-bottom-color: var(--accent);
      background: var(--paper);
    }
    #tab-${i}:checked ~ #pane-${i} { display: block; }
  `).join('')}
</style>
` : '';

function renderTabNav() {
  if (caseBundles.length <= 1) return '';
  return `<nav class="tab-nav">
    ${caseBundles.map((b, i) => `
      <label class="tab-label" for="tab-${i}">
        ${esc(b.slCase.groundTruth?.diagnosis || '?')}
        <small>${esc(b.slCase.categoryHint)}</small>
      </label>
    `).join('')}
  </nav>`;
}

const titleStr = caseBundles.length > 1
  ? `Pipeline Deep Dive — ${caseBundles.length} cases`
  : `Pipeline Deep Dive — ${esc(slCase.categoryHint)}`;

const radios = caseBundles.length > 1
  ? caseBundles.map((b, i) => `<input type="radio" class="tab-radio" name="case-tab" id="tab-${i}"${i === 0 ? ' checked' : ''}>`).join('')
  : '';

const panes = caseBundles.map((b, i) => `
  <div class="tab-pane" id="pane-${i}">
    ${renderCaseBody(b)}
  </div>
`).join('');

const wrappedBody = caseBundles.length > 1
  ? `${radios}${renderTabNav()}${panes}`
  : renderCaseBody(caseBundles[0]);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${titleStr}</title>
  ${css}
  ${tabCss}
</head>
<body>
  ${wrappedBody}
</body>
</html>
`;

writeFileSync(OUT, html, 'utf-8');
console.log(`\nWrote ${html.length.toLocaleString()} bytes to ${OUT}`);
console.log('Open with: open ' + OUT);
