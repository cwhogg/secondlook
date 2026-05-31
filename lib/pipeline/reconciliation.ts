/**
 * v15 step 6: structured iterative reconciliation between o3 and Claude
 * synthesizers.
 *
 * Design (committed in docs/v15-experiment-plan.md decision 4):
 *
 *   Round 1 — independent rankings (already produced by parallel synth in
 *             orchestrator step 5)
 *     ↓
 *   If top-1 agrees → done, confidence = dual-model-consensus
 *     ↓
 *   Round 2 — each model receives the OTHER's top-1 + reasoning, asked to
 *             genuinely reconsider with three explicit options: AGREE,
 *             STAND, DISAGREE. Each must cite criteria evidence.
 *     ↓
 *   If now agrees → done, confidence = converged-at-round-2
 *     ↓
 *   Round 3 — each model receives the other's Round 2 counter-argument,
 *             asked to address it directly with criteria evidence.
 *     ↓
 *   If now agrees → done, confidence = converged-at-round-3
 *     ↓
 *   Persistent disagreement → take the diagnosis with higher criteria-
 *   fulfillment ratio from the evaluated hypothesis pool as operational
 *   top-1; confidence = persistent-disagreement. The output surfaces both
 *   candidates so the report can show the uncertainty honestly.
 *
 * The goal of disagreement is not compromise — it's truth. Averaging is
 * rejected because it smooths out signal in exactly the cases that matter
 * (one model nails the right answer, the other completely misses).
 * Free-form debate is rejected because debate dynamics produce confidence
 * not correctness. Bounded structured rounds with evidence-citation
 * requirements get the cross-provider independence benefit while
 * controlling the failure modes.
 */
import { AgentOutput } from '../agents/types';
import { DiagnosisHypothesis, PatientCase } from '../types';
import { callAnthropic } from '../anthropic';

export type ReconciliationConfidence =
  | 'dual-model-consensus'
  | 'converged-at-round-2'
  | 'converged-at-round-3'
  | 'persistent-disagreement-criteria-tiebreak'
  | 'o3-only-claude-unavailable';

export interface ReconciliationResult {
  hypotheses: DiagnosisHypothesis[];
  confidence: ReconciliationConfidence;
  reconciliationData: {
    initialAgreement: boolean;
    finalAgreement: boolean;
    roundsRun: number;
    o3InitialTop1: string;
    claudeInitialTop1: string | null;
    finalTop1: string;
    finalTop1Source: 'consensus' | 'o3-after-reconsideration' | 'claude-after-reconsideration' | 'criteria-tiebreak';
    o3RoundHistory: Array<{ round: number; topOne: string; reasoning: string; position?: 'agree' | 'stand' | 'disagree' }>;
    claudeRoundHistory: Array<{ round: number; topOne: string; reasoning: string; position?: 'agree' | 'stand' | 'disagree' }>;
    tokensUsed: number;
    durationMs: number;
  };
}

const O3_MODEL = 'o3';
const CLAUDE_MODEL = 'claude-opus-4-7';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function topOneMatches(a: string, b: string): boolean {
  const an = normalize(a);
  const bn = normalize(b);
  if (an === bn) return true;
  if (an.length >= 12 && bn.length >= 12 && (an.includes(bn) || bn.includes(an))) return true;
  return false;
}

function buildHypothesisPoolBlock(evaluatedHypotheses: DiagnosisHypothesis[]): string {
  return evaluatedHypotheses
    .slice(0, 12)
    .map((h, i) => {
      const fulfillmentTag = h.diagnosticCriteria
        ? `criteria ${h.diagnosticCriteria.metCriteria}/${h.diagnosticCriteria.totalCriteria} met (${h.diagnosticCriteria.fulfillmentPercentage}%)`
        : 'no criteria checklist';
      const evalTag = h.knowledgeBaseMatch ? 'KB-MATCHED' : 'NON-KB';
      return `${i + 1}. ${h.diagnosis} [${evalTag}, ${fulfillmentTag}]`;
    })
    .join('\n');
}

function buildPatientRecap(patientCase: PatientCase): string {
  const symptoms = patientCase.symptoms
    .slice(0, 12)
    .map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase)
    .filter(Boolean)
    .join(', ');
  const chief = patientCase.chiefComplaint?.description || '';
  return `Patient: ${patientCase.demographics.age}yo ${patientCase.demographics.sex}. ${chief ? `Chief complaint: ${chief}. ` : ''}Key findings: ${symptoms}.`;
}

function buildRound2Prompt(opts: {
  patientRecap: string;
  hypothesisPool: string;
  myTop1: string;
  myReasoning: string;
  myProbabilityScore: number;
  otherTop1: string;
  otherReasoning: string;
  otherProbabilityScore: number;
}): string {
  return `${opts.patientRecap}

EVALUATED HYPOTHESIS POOL (with criteria fulfillment data):
${opts.hypothesisPool}

YOUR PRIOR TOP-1 RANKING:
Diagnosis: ${opts.myTop1}
Probability: ${opts.myProbabilityScore}/100
Your reasoning: ${opts.myReasoning}

ANOTHER INDEPENDENT EXPERT CLINICIAN with the same patient case, same hypothesis pool, and same criteria evidence has identified a DIFFERENT top-1:
Their diagnosis: ${opts.otherTop1}
Their probability: ${opts.otherProbabilityScore}/100
Their reasoning: ${opts.otherReasoning}

Honestly reconsider your ranking with this new information. You have three options:
  1. AGREE — their top-1 is more strongly supported. Update yours to theirs.
  2. STAND — keep yours and explain what specific evidence they may have overlooked.
  3. DISAGREE — keep yours and explain why their reasoning doesn't hold given the available criteria evidence.

Cite SPECIFIC criteria evidence or patient findings. Don't default to defending your original pick — genuine reconsideration is the goal.

Return JSON with no markdown fences:
{ "position": "agree" | "stand" | "disagree", "topOne": "<diagnosis name from hypothesis pool>", "probabilityScore": <0-100>, "reasoning": "<your evidence-cited explanation>" }`;
}

function buildRound3Prompt(opts: {
  patientRecap: string;
  hypothesisPool: string;
  myRound2Top1: string;
  myRound2Reasoning: string;
  otherRound2Top1: string;
  otherRound2Reasoning: string;
}): string {
  return `${opts.patientRecap}

EVALUATED HYPOTHESIS POOL (with criteria fulfillment):
${opts.hypothesisPool}

You and another independent expert exchanged reasoning in Round 2 and still disagree on top-1.

YOUR ROUND 2 TOP-1: ${opts.myRound2Top1}
Your reasoning: ${opts.myRound2Reasoning}

THEIR ROUND 2 TOP-1: ${opts.otherRound2Top1}
Their specific counter-argument to your pick: ${opts.otherRound2Reasoning}

Address their counter-argument DIRECTLY. Is there evidence in the patient findings or KB criteria that resolves this disagreement in your favor? Or do you now see their pick is better-supported?

This is Round 3 — the final round. After this we fall back to a criteria-fulfillment tiebreaker.

Return JSON with no markdown fences:
{ "topOne": "<diagnosis name from hypothesis pool>", "probabilityScore": <0-100>, "reasoning": "<your final evidence-cited position>" }`;
}

async function callO3Reconsider(systemPrompt: string, userPrompt: string, round?: number): Promise<{ content: any; tokensUsed: number; durationMs: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const start = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: O3_MODEL,
      reasoning_effort: 'high',
      max_completion_tokens: 8000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`o3 reconsider failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  let content: any;
  try {
    content = JSON.parse(text);
  } catch {
    throw new Error(`o3 reconsider returned non-JSON: ${text.slice(0, 200)}`);
  }
  const durationMs = Date.now() - start;

  try {
    const { pushLlmCall } = require('./llm-call-log');
    pushLlmCall({
      agentName: 'reconciliation-o3' + (round ? `-r${round}` : ''),
      stageName: 'reconciliation',
      provider: 'openai',
      model: O3_MODEL,
      reasoningEffort: 'high',
      maxTokens: 8000,
      systemPrompt,
      userPrompt,
      rawResponseText: text,
      structuredOutput: content,
      reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
      finishReason: data.choices?.[0]?.finish_reason,
      tokensIn: data.usage?.prompt_tokens,
      tokensOut: data.usage?.completion_tokens,
      durationMs,
    });
  } catch { /* optional */ }

  return {
    content,
    tokensUsed: (data.usage?.total_tokens as number) || 0,
    durationMs,
  };
}

async function callClaudeReconsider(systemPrompt: string, userPrompt: string, round?: number): Promise<{ content: any; tokensUsed: number; durationMs: number }> {
  // callAnthropic itself pushes to the LLM call log; we'd otherwise duplicate
  // the entry. Tag it via a one-shot context override so the log entry
  // shows up under reconciliation rather than as an unattributed Anthropic
  // call.
  try {
    const { setLogContext } = require('./llm-call-log');
    setLogContext({ agentName: 'reconciliation-claude' + (round ? `-r${round}` : ''), stageName: 'reconciliation' });
  } catch {}
  const result = await callAnthropic({
    systemPrompt,
    userPrompt,
    maxTokens: 8000,
    model: CLAUDE_MODEL,
  });
  // Restore default context so subsequent stages aren't mis-attributed
  try {
    const { setLogContext } = require('./llm-call-log');
    setLogContext({ agentName: undefined, stageName: undefined });
  } catch {}
  return {
    content: result.content,
    tokensUsed: result.tokensUsed,
    durationMs: result.durationMs,
  };
}

const RECONSIDERATION_SYSTEM_PROMPT = `You are a senior diagnostician participating in a structured second-opinion exchange with another expert clinician. Both of you have reviewed the same patient case independently and reached your own top-1 diagnosis. Now you are reviewing your colleague's reasoning to decide whether you agree, want to stand by your original pick, or genuinely disagree.

The goal of this exchange is TRUTH, not compromise. If your colleague has stronger evidence than you initially considered, update your pick. If they don't, hold your ground with specific evidence-cited reasoning. Do not concede simply because the other expert is confident — and do not refuse to update simply because you'd prefer to defend your prior position.

Reference the criteria fulfillment percentages and specific patient findings in your reasoning. Generic statements like "based on the clinical picture" are not acceptable — cite specifics.`;

function pickHypothesisFromPool(name: string, pool: DiagnosisHypothesis[]): DiagnosisHypothesis | null {
  const target = normalize(name);
  let match = pool.find((h) => normalize(h.diagnosis) === target);
  if (match) return match;
  match = pool.find((h) => {
    const hn = normalize(h.diagnosis);
    return hn.length >= 12 && (hn.includes(target) || target.includes(hn));
  });
  return match || null;
}

function buildHypothesisListWithTop1(top1: DiagnosisHypothesis, pool: DiagnosisHypothesis[]): DiagnosisHypothesis[] {
  const out: DiagnosisHypothesis[] = [top1];
  for (const h of pool) {
    if (h.diagnosis === top1.diagnosis) continue;
    out.push(h);
  }
  return out.slice(0, 10);
}

function criteriaFulfillmentTiebreak(o3Top1: string, claudeTop1: string, pool: DiagnosisHypothesis[]): 'o3' | 'claude' {
  const o3H = pickHypothesisFromPool(o3Top1, pool);
  const clH = pickHypothesisFromPool(claudeTop1, pool);
  const o3Pct = o3H?.diagnosticCriteria?.fulfillmentPercentage || 0;
  const clPct = clH?.diagnosticCriteria?.fulfillmentPercentage || 0;
  if (clPct > o3Pct) return 'claude';
  return 'o3'; // ties go to o3 (current primary)
}

export async function reconcileRankings(
  o3Result: AgentOutput,
  claudeResult: AgentOutput | null,
  patientCase: PatientCase,
  evaluatedHypotheses: DiagnosisHypothesis[],
  log?: (event: string, extra?: Record<string, any>) => void,
): Promise<ReconciliationResult> {
  const totalStart = Date.now();
  const noLog = (..._args: any[]) => {};
  const out = log || noLog;

  const o3Top1Hypo = o3Result.hypotheses[0];
  const o3Top1Name = o3Top1Hypo?.diagnosis || '';
  const o3Top1Reasoning =
    o3Result.hypotheses[0]?.clinicalReasoning ||
    (o3Result as any).synthesisData?.overallAssessment ||
    o3Result.reasoning ||
    '';
  const o3Top1Score = o3Top1Hypo?.confidenceScore || 0;

  // If Claude isn't available, fall through with o3 as final.
  if (!claudeResult) {
    out('orch.reconcile.claude_unavailable');
    return {
      hypotheses: o3Result.hypotheses,
      confidence: 'o3-only-claude-unavailable',
      reconciliationData: {
        initialAgreement: false,
        finalAgreement: false,
        roundsRun: 1,
        o3InitialTop1: o3Top1Name,
        claudeInitialTop1: null,
        finalTop1: o3Top1Name,
        finalTop1Source: 'o3-after-reconsideration',
        o3RoundHistory: [{ round: 1, topOne: o3Top1Name, reasoning: o3Top1Reasoning }],
        claudeRoundHistory: [],
        tokensUsed: 0,
        durationMs: Date.now() - totalStart,
      },
    };
  }

  const claudeTop1Hypo = claudeResult.hypotheses[0];
  const claudeTop1Name = claudeTop1Hypo?.diagnosis || '';
  const claudeTop1Reasoning =
    claudeResult.hypotheses[0]?.clinicalReasoning ||
    (claudeResult as any).synthesisData?.overallAssessment ||
    claudeResult.reasoning ||
    '';
  const claudeTop1Score = claudeTop1Hypo?.confidenceScore || 0;

  const o3History: ReconciliationResult['reconciliationData']['o3RoundHistory'] = [
    { round: 1, topOne: o3Top1Name, reasoning: o3Top1Reasoning },
  ];
  const claudeHistory: ReconciliationResult['reconciliationData']['claudeRoundHistory'] = [
    { round: 1, topOne: claudeTop1Name, reasoning: claudeTop1Reasoning },
  ];
  let totalTokens = 0;

  // ===== Round 1 agreement check =====
  if (topOneMatches(o3Top1Name, claudeTop1Name)) {
    out('orch.reconcile.round1.agree', { top1: o3Top1Name });
    return {
      hypotheses: o3Result.hypotheses,
      confidence: 'dual-model-consensus',
      reconciliationData: {
        initialAgreement: true,
        finalAgreement: true,
        roundsRun: 1,
        o3InitialTop1: o3Top1Name,
        claudeInitialTop1: claudeTop1Name,
        finalTop1: o3Top1Name,
        finalTop1Source: 'consensus',
        o3RoundHistory: o3History,
        claudeRoundHistory: claudeHistory,
        tokensUsed: 0,
        durationMs: Date.now() - totalStart,
      },
    };
  }
  out('orch.reconcile.round1.disagree', { o3: o3Top1Name, claude: claudeTop1Name });

  // ===== Round 2: information exchange =====
  const patientRecap = buildPatientRecap(patientCase);
  const hypothesisPool = buildHypothesisPoolBlock(evaluatedHypotheses);

  const o3R2Prompt = buildRound2Prompt({
    patientRecap,
    hypothesisPool,
    myTop1: o3Top1Name,
    myReasoning: o3Top1Reasoning,
    myProbabilityScore: o3Top1Score,
    otherTop1: claudeTop1Name,
    otherReasoning: claudeTop1Reasoning,
    otherProbabilityScore: claudeTop1Score,
  });
  const claudeR2Prompt = buildRound2Prompt({
    patientRecap,
    hypothesisPool,
    myTop1: claudeTop1Name,
    myReasoning: claudeTop1Reasoning,
    myProbabilityScore: claudeTop1Score,
    otherTop1: o3Top1Name,
    otherReasoning: o3Top1Reasoning,
    otherProbabilityScore: o3Top1Score,
  });

  const [o3R2, claudeR2] = await Promise.all([
    callO3Reconsider(RECONSIDERATION_SYSTEM_PROMPT, o3R2Prompt, 2),
    callClaudeReconsider(RECONSIDERATION_SYSTEM_PROMPT, claudeR2Prompt, 2),
  ]);
  totalTokens += o3R2.tokensUsed + claudeR2.tokensUsed;

  const o3R2Top1 = o3R2.content?.topOne || o3Top1Name;
  const o3R2Reasoning = o3R2.content?.reasoning || '';
  const o3R2Position = o3R2.content?.position;
  const claudeR2Top1 = claudeR2.content?.topOne || claudeTop1Name;
  const claudeR2Reasoning = claudeR2.content?.reasoning || '';
  const claudeR2Position = claudeR2.content?.position;
  o3History.push({ round: 2, topOne: o3R2Top1, reasoning: o3R2Reasoning, position: o3R2Position });
  claudeHistory.push({ round: 2, topOne: claudeR2Top1, reasoning: claudeR2Reasoning, position: claudeR2Position });

  if (topOneMatches(o3R2Top1, claudeR2Top1)) {
    out('orch.reconcile.round2.converged', { top1: o3R2Top1 });
    // Pick the converged top-1 from the evaluated pool, fall through other
    // diagnoses from o3's ranking. The merged ranking surfaces the consensus
    // pick at #1 with o3's remaining ordering behind it.
    const convergedHypo = pickHypothesisFromPool(o3R2Top1, evaluatedHypotheses) || o3Top1Hypo;
    const merged = buildHypothesisListWithTop1(convergedHypo, o3Result.hypotheses);
    return {
      hypotheses: merged,
      confidence: 'converged-at-round-2',
      reconciliationData: {
        initialAgreement: false,
        finalAgreement: true,
        roundsRun: 2,
        o3InitialTop1: o3Top1Name,
        claudeInitialTop1: claudeTop1Name,
        finalTop1: o3R2Top1,
        finalTop1Source: o3R2Position === 'agree' ? 'claude-after-reconsideration' : 'o3-after-reconsideration',
        o3RoundHistory: o3History,
        claudeRoundHistory: claudeHistory,
        tokensUsed: totalTokens,
        durationMs: Date.now() - totalStart,
      },
    };
  }
  out('orch.reconcile.round2.disagree', { o3: o3R2Top1, claude: claudeR2Top1 });

  // ===== Round 3: targeted challenge =====
  const o3R3Prompt = buildRound3Prompt({
    patientRecap,
    hypothesisPool,
    myRound2Top1: o3R2Top1,
    myRound2Reasoning: o3R2Reasoning,
    otherRound2Top1: claudeR2Top1,
    otherRound2Reasoning: claudeR2Reasoning,
  });
  const claudeR3Prompt = buildRound3Prompt({
    patientRecap,
    hypothesisPool,
    myRound2Top1: claudeR2Top1,
    myRound2Reasoning: claudeR2Reasoning,
    otherRound2Top1: o3R2Top1,
    otherRound2Reasoning: o3R2Reasoning,
  });

  const [o3R3, claudeR3] = await Promise.all([
    callO3Reconsider(RECONSIDERATION_SYSTEM_PROMPT, o3R3Prompt, 3),
    callClaudeReconsider(RECONSIDERATION_SYSTEM_PROMPT, claudeR3Prompt, 3),
  ]);
  totalTokens += o3R3.tokensUsed + claudeR3.tokensUsed;

  const o3R3Top1 = o3R3.content?.topOne || o3R2Top1;
  const o3R3Reasoning = o3R3.content?.reasoning || '';
  const claudeR3Top1 = claudeR3.content?.topOne || claudeR2Top1;
  const claudeR3Reasoning = claudeR3.content?.reasoning || '';
  o3History.push({ round: 3, topOne: o3R3Top1, reasoning: o3R3Reasoning });
  claudeHistory.push({ round: 3, topOne: claudeR3Top1, reasoning: claudeR3Reasoning });

  if (topOneMatches(o3R3Top1, claudeR3Top1)) {
    out('orch.reconcile.round3.converged', { top1: o3R3Top1 });
    const convergedHypo = pickHypothesisFromPool(o3R3Top1, evaluatedHypotheses) || o3Top1Hypo;
    const merged = buildHypothesisListWithTop1(convergedHypo, o3Result.hypotheses);
    return {
      hypotheses: merged,
      confidence: 'converged-at-round-3',
      reconciliationData: {
        initialAgreement: false,
        finalAgreement: true,
        roundsRun: 3,
        o3InitialTop1: o3Top1Name,
        claudeInitialTop1: claudeTop1Name,
        finalTop1: o3R3Top1,
        finalTop1Source: 'o3-after-reconsideration',
        o3RoundHistory: o3History,
        claudeRoundHistory: claudeHistory,
        tokensUsed: totalTokens,
        durationMs: Date.now() - totalStart,
      },
    };
  }

  // ===== Persistent disagreement → criteria-fulfillment tiebreaker =====
  const tieWinner = criteriaFulfillmentTiebreak(o3R3Top1, claudeR3Top1, evaluatedHypotheses);
  const winnerTop1 = tieWinner === 'o3' ? o3R3Top1 : claudeR3Top1;
  out('orch.reconcile.persistent_disagreement', { o3: o3R3Top1, claude: claudeR3Top1, tieWinner, finalTop1: winnerTop1 });
  const winnerHypo = pickHypothesisFromPool(winnerTop1, evaluatedHypotheses) || o3Top1Hypo;
  const merged = buildHypothesisListWithTop1(winnerHypo, o3Result.hypotheses);

  return {
    hypotheses: merged,
    confidence: 'persistent-disagreement-criteria-tiebreak',
    reconciliationData: {
      initialAgreement: false,
      finalAgreement: false,
      roundsRun: 3,
      o3InitialTop1: o3Top1Name,
      claudeInitialTop1: claudeTop1Name,
      finalTop1: winnerTop1,
      finalTop1Source: 'criteria-tiebreak',
      o3RoundHistory: o3History,
      claudeRoundHistory: claudeHistory,
      tokensUsed: totalTokens,
      durationMs: Date.now() - totalStart,
    },
  };
}
