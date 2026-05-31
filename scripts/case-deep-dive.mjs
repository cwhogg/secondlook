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

const PPKT = argv('ppkt', null);
const VERSION = argv('version', 'v15');
const OUT = argv('out', join(ROOT, 'case-deep-dive.html'));

console.log('Fetching testCases...');
const tcRes = await fetch(`${BASE}/api/admin/test-cases`);
const tcData = await tcRes.json();
const all = tcData.testCases || [];

// Find the SL case
let slCase;
if (PPKT) {
  slCase = all.find((t) =>
    t.testVersion === 'Eval' &&
    t.evalVersion === VERSION &&
    t.evalRunMode === 'secondlook' &&
    t.categoryHint === PPKT &&
    t.status === 'graded'
  );
} else {
  slCase = all.find((t) =>
    t.testVersion === 'Eval' &&
    t.evalVersion === VERSION &&
    t.evalRunMode === 'secondlook' &&
    t.status === 'graded'
  );
}

if (!slCase) {
  console.error('No matching completed SL case found');
  process.exit(1);
}

const ppkt = slCase.categoryHint;
// Find sibling OAI and Claude cases on same ppkt
const oaiCase = all.find((t) => t.evalVersion === VERSION && t.evalRunMode === 'openai' && t.categoryHint === ppkt);
const clCase = all.find((t) => t.evalVersion === VERSION && t.evalRunMode === 'claude' && t.categoryHint === ppkt);

console.log('Picked SL case:', slCase.id);
console.log('ppkt:', ppkt);
console.log('Ground truth:', slCase.groundTruth?.diagnosis);

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

function renderTOC() {
  const items = [
    ['input', '1. Input'],
    ['extraction', '2. Extraction'],
    ['triage', '3. Triage'],
    ['candidate-gen', '4. LLM Candidates'],
    ['retrieval', '5. KB Retrieval'],
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
      <thead><tr><th>#</th><th>Original phrase</th><th>Medical term</th><th>UMLS concept</th><th>Code</th></tr></thead>
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
  if (!cg) return section('candidate-gen', '4. LLM Candidate Generation', '<div class="note">Not run on this case (v12 or earlier).</div>');
  return section('candidate-gen', '4. LLM Candidate Generation — Stage 1b', `
    <div class="stage-meta">
      <span class="badge">${esc(cg.model)}</span>
      <span class="badge">${cg.tokensUsed.toLocaleString()} tokens</span>
      <span class="badge">${Math.round(cg.durationMs / 1000)}s</span>
    </div>
    <p>${esc(cg.outputSummary)}</p>
    <div class="note">
      <strong>Note:</strong> raw list of LLM-generated candidate names isn't persisted —
      only the counts (40 generated → 30 added to KB-retrieved pool → 3 had no KB match).
    </div>
  `);
}

function renderKBRetrieval(slCase) {
  const retrievals = slCase.pipelineResult?.pipelineMetadata?.retrievalScores || [];
  const rows = retrievals.slice(0, 30).map((r, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td>${esc(r.diseaseName)}</td>
      <td><code>${esc(r.diseaseId)}</code></td>
      <td class="score">${(r.matchScore || 0).toFixed(2)}</td>
      <td class="score">${(r.componentScores?.symptom || 0).toFixed(2)}</td>
      <td class="score">${(r.componentScores?.system || 0).toFixed(2)}</td>
      <td class="score">${(r.componentScores?.demographic || 0).toFixed(2)}</td>
      <td class="score">${(r.componentScores?.prevalence || 0).toFixed(2)}</td>
    </tr>
  `).join('');
  return section('retrieval', '5. KB Retrieval — top candidates from the knowledge base', `
    <div class="stage-meta">
      ${retrievals.length} KB candidates passed to specialists. Showing top 30.
    </div>
    <table>
      <thead><tr><th>#</th><th>Disease</th><th>ID</th><th>Match</th><th>Sym</th><th>Sys</th><th>Demo</th><th>Prev</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8">(no retrieval scores)</td></tr>'}</tbody>
    </table>
  `);
}

function renderSpecialists(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const sps = stages.filter((s) => s.stageName === 'specialist');
  const failed = stages.filter((s) => s.stageName === 'specialist-failed');

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

  return section('specialists', `6. Specialist Consultation — ${sps.length} parallel agents`, `
    <div class="stage-meta">
      Each specialist runs o3:reasoning=high on the patient case + KB candidates filtered/reranked
      for its domain. Outputs ~3-5 hypotheses with evidence per specialist.
    </div>
    ${sCards}
    ${failCards}
    <div class="note">
      Per-specialist hypothesis-level evidence is aggregated into the evidence-evaluator stage below
      (the source-of-truth merged view). Individual specialist hypotheses aren't persisted separately
      after the merge — the next stage shows them combined.
    </div>
  `);
}

function renderEvidenceEval(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const ev = stages.find((s) => s.stageName === 'evidence-evaluation');
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

  return section('evidence-eval', '7. Evidence Evaluation — criteria checking & evidence scoring', `
    <div class="stage-meta">
      ${ev ? `<span class="badge">${esc(ev.model)}</span> <span class="badge">${ev.tokensUsed?.toLocaleString()} tokens</span> <span class="badge">${Math.round((ev.durationMs || 0) / 1000)}s</span>` : ''}
      ${ev?.outputSummary ? `<br/>${esc(ev.outputSummary)}` : ''}
    </div>
    <p>Showing the synth's final top-12 hypotheses with their upstream evaluator data (criteria checklist, supporting/contradictory evidence with patient-symptom anchors).</p>
    ${hypTable}
  `);
}

function renderSynthesizers(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const synthO3 = stages.find((s) => s.stageName === 'synthesis');
  const synthClaude = stages.find((s) => s.stageName === 'synthesis-claude');
  const recon = slCase.pipelineResult?.pipelineMetadata?.reconciliation;

  const o3Section = section('synth-o3', '8. Synthesizer — o3 reasoning:high', `
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

  const claudeSection = synthClaude ? section('synth-claude', '9. Synthesizer — Claude opus-4-7 reasoning:high (parallel)', `
    <div class="stage-meta">
      <span class="badge">${esc(synthClaude.model)}</span>
      <span class="badge">${synthClaude.tokensUsed?.toLocaleString()} tokens</span>
      <span class="badge">${Math.round((synthClaude.durationMs || 0) / 1000)}s</span>
    </div>
    <p><strong>Claude's initial top-1:</strong> <em>${esc(recon?.claudeInitialTop1 || synthClaude.outputSummary?.replace(/^Top:\s*/, ''))}</em></p>
  `) : section('synth-claude', '9. Synthesizer (Claude)', '<div class="note">Not run on this case (pre-v15 architecture).</div>');

  return o3Section + claudeSection;
}

function renderReconciliation(slCase) {
  const recon = slCase.pipelineResult?.pipelineMetadata?.reconciliation;
  if (!recon) return section('reconciliation', '10. Reconciliation', '<div class="note">No reconciliation data (pre-v15 architecture or older grading).</div>');

  const confBadge = recon.confidence === 'dual-model-consensus' ? 'badge-ok' : recon.confidence === 'persistent-disagreement-criteria-tiebreak' ? 'badge-err' : 'badge-info';

  return section('reconciliation', '10. Reconciliation — structured iterative agreement', `
    <div class="stage-meta">
      <span class="badge ${confBadge}">${esc(recon.confidence)}</span>
      <span class="badge">${recon.roundsRun || 1} round(s)</span>
      ${recon.tokensUsed > 0 ? `<span class="badge">${recon.tokensUsed.toLocaleString()} tokens</span>` : ''}
      ${recon.durationMs > 0 ? `<span class="badge">${Math.round(recon.durationMs / 1000)}s</span>` : ''}
    </div>
    <table>
      <thead><tr><th>Step</th><th>o3</th><th>Claude</th></tr></thead>
      <tbody>
        <tr><td>Initial top-1</td><td>${esc(recon.o3InitialTop1)}</td><td>${esc(recon.claudeInitialTop1)}</td></tr>
        <tr><td><strong>Final top-1</strong></td><td colspan="2"><strong>${esc(recon.finalTop1)}</strong> <span class="badge">${esc(recon.finalTop1Source)}</span></td></tr>
        <tr><td>Initial agreement</td><td colspan="2">${recon.initialAgreement ? '✓ agreed at Round 1' : '✗ disagreed at Round 1'}</td></tr>
        <tr><td>Final agreement</td><td colspan="2">${recon.finalAgreement ? '✓ converged' : '✗ persistent disagreement (criteria tiebreaker)'}</td></tr>
      </tbody>
    </table>
    <div class="note">
      The full per-round prompts and responses for o3 and Claude during Round 2 and Round 3
      reconsideration aren't persisted in this version of the pipeline. The summary above
      reflects the round-1 inputs and the final converged answer.
    </div>
  `);
}

function renderReport(slCase) {
  const stages = slCase.pipelineResult?.pipelineMetadata?.stages || [];
  const rep = stages.find((s) => s.stageName === 'report');
  const pr = slCase.pipelineResult;
  return section('report', '11. Report Generation', `
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
  if (fe.length === 0 && !slCase.pipelineResult?.differentialDiagnoses?.some((d) => d.sourceAgent === 'family-expansion')) {
    return section('family-expansion', '12. Family Expansion (positions 11-15)', '<div class="note">No family expansions added for this case.</div>');
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
  return section('family-expansion', '12. Family Expansion — KB-linked siblings at positions 11-15', `
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

  return section('final', '13. Final Differential (top 15) — pipeline output', `
    <div class="stage-meta">Output of v15 pipeline: synth-ranked top 10 plus family expansion at 11-15.</div>
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
  return section('grading', '14. Grading', `
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
    return section('llm-calls', '14b. LLM Calls — raw prompts and responses', `
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

  return section('llm-calls', `14b. LLM Calls — ${calls.length} captured`, `
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
  return section('raw', '15. Raw Data — full JSON dumps', `
    ${jsonBlock(slCase, 'Full SL testCase (this is everything persisted in KV)')}
    ${oaiCase ? jsonBlock(oaiCase, 'OAI baseline testCase') : ''}
    ${clCase ? jsonBlock(clCase, 'Claude baseline testCase') : ''}
  `);
}

// ============================================================
// BUILD HTML
// ============================================================

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pipeline Deep Dive — ${esc(slCase.categoryHint)}</title>
  ${css}
</head>
<body>
  ${renderHeader(slCase, oaiCase, clCase)}
  ${renderTOC()}
  <main>
    ${renderInput(slCase)}
    ${renderExtraction(slCase)}
    ${renderTriageStage(slCase)}
    ${renderCandidateGen(slCase)}
    ${renderKBRetrieval(slCase)}
    ${renderSpecialists(slCase)}
    ${renderEvidenceEval(slCase)}
    ${renderSynthesizers(slCase)}
    ${renderReconciliation(slCase)}
    ${renderReport(slCase)}
    ${renderFamilyExpansion(slCase)}
    ${renderFinalDifferential(slCase, oaiCase, clCase)}
    ${renderGrading(slCase)}
    ${renderLlmCalls(slCase)}
    ${renderRawData(slCase, oaiCase, clCase)}
  </main>
</body>
</html>
`;

writeFileSync(OUT, html, 'utf-8');
console.log(`\nWrote ${html.length.toLocaleString()} bytes to ${OUT}`);
console.log('Open with: open ' + OUT);
