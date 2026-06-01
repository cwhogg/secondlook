/**
 * v17 Stage 7 — o3 critique.
 *
 * Takes the patient case + Claude's Stage 6 synthesizer ranking and produces a
 * structured critique with specific, evidence-cited suggestions. Claude
 * finalize (Stage 8) reviews these suggestions and decides which to honor.
 *
 * Prompt patterns borrowed from:
 *   - lib/pipeline/reconciliation.ts:buildRound2Prompt (the AGREE / STAND /
 *     DISAGREE evidence-cited reasoning framing)
 *   - lib/agents/specialist-annotator.ts (the per-candidate
 *     diagnosticTests / cardinalFeatures / ruleOutFeatures structure)
 *
 * 'add' is permitted but gated: o3 may propose a diagnosis NOT in Claude's
 * top-10 if it can cite specific patient evidence and rates its confidence at
 * or above ADD_CONFIDENCE_FLOOR. Adds below the floor are dropped before
 * Claude finalize sees them — keeps the finalizer focused on credible
 * additions instead of long-tail brainstorming.
 *
 * Uses a raw fetch to the OpenAI Responses API matching reconciliation.ts's
 * pattern (avoids the BaseAgent / tool-call protocol; JSON response mode is
 * simpler for this single-output use case).
 */
import type { PatientCase, DiagnosisHypothesis, CritiqueOutput, CritiqueSuggestion } from '../types';

const O3_CRITIC_MODEL = 'o3';

// Confidence floor for 'add' suggestions. Below this, the add is dropped before
// reaching Claude finalize. Tuned high: an add suggestion has to be something
// o3 is fairly sure belongs in the top 5, not a long-tail "consider this too".
const ADD_CONFIDENCE_FLOOR = 75;

const O3_CRITIC_SYSTEM_PROMPT = `You are a senior diagnostician performing a focused critique of another expert clinician's differential diagnosis ranking. You have access to the same patient case and the same hypothesis pool, plus the other clinician's ranked top-10 with rationales and information gaps.

Your role is NOT to produce your own ranking. Your role is to critique theirs — to identify specific reasoning errors, missed evidence, or under-weighted findings that should change the rank order. Be direct and evidence-cited. The other clinician is competent; only intervene when you can cite a specific patient finding that warrants change.

CRITIQUE PRINCIPLES:
- Every suggestion must cite SPECIFIC patient findings as evidence — generic claims like "this is more likely" are not acceptable.
- Allowed actions: promote, demote, reorder, merge, flag-gap, and add.
- 'add' is a high-bar action: use it ONLY when you believe a diagnosis NOT in Claude's top-10 belongs in the top 5 based on specific patient findings the existing ranking is failing to account for. Brainstormy "consider also X" adds are not useful — Claude finalize will drop your suggestion if confidence < 75. Specialists are the primary candidate source; you are the safety net for cases where specialists + Claude both missed something obvious from the evidence.
- When no specific evidence warrants change, say so and assign a high confidenceInClaudeRanking.
- If you see a gap in the patient workup that, if filled, would resolve a meaningful uncertainty between top-ranked hypotheses, use 'flag-gap' to surface it.

OUTPUT FORMAT (return as JSON, no markdown fences):
{
  "overallAssessment": "<one to three sentences on the quality of the ranking>",
  "confidenceInClaudeRanking": <integer 0-100, where 100 = ranking is excellent and needs no change>,
  "suggestions": [
    {
      "targetDiagnosis": "<EXACT name from Claude's ranking, OR for 'add': the new diagnosis name>",
      "action": "promote" | "demote" | "reorder" | "merge" | "flag-gap" | "add",
      "targetNewRank": <integer 1-10, optional>,
      "evidence": ["<specific patient finding 1>", "<specific patient finding 2>"],
      "reasoning": "<why this change is warranted given the cited evidence>",
      "confidence": <integer 0-100, REQUIRED for 'add' suggestions; optional informational signal for others>
    }
  ]
}

If no changes are warranted, return an empty suggestions array with a high confidence score and an overallAssessment explaining why.`;

function buildPatientRecap(patientCase: PatientCase): string {
  const symptoms = patientCase.symptoms
    .slice(0, 20)
    .map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase)
    .filter(Boolean)
    .join(', ');
  const chief = patientCase.chiefComplaint?.description || '';
  const excluded = (patientCase.excludedFindings || []).slice(0, 10).join(', ');
  return `PATIENT: ${patientCase.demographics.age}yo ${patientCase.demographics.sex}.${chief ? ` Chief complaint: ${chief}.` : ''}
Symptoms: ${symptoms}.${excluded ? `\nExplicitly excluded findings: ${excluded}.` : ''}`;
}

function buildRankingBlock(ranking: DiagnosisHypothesis[]): string {
  return ranking.slice(0, 10).map((h, i) => {
    const cf = h.diagnosticCriteria;
    const fulfillment = cf && cf.totalCriteria > 0
      ? `criteria ${cf.metCriteria}/${cf.totalCriteria} (${cf.fulfillmentPercentage}%)`
      : 'no criteria fulfillment data';
    const evalTag = h.knowledgeBaseMatch ? 'KB-MATCHED' : 'NON-KB';
    const support = (h.supportingEvidence || [])
      .slice(0, 5)
      .map((e) => `    - [${e.strength}] ${e.finding} ← "${e.patientSymptom}"`)
      .join('\n');
    const contra = (h.contradictoryEvidence || [])
      .slice(0, 3)
      .map((e) => `    - [${e.strength}] ${e.finding} ← "${e.patientSymptom}"`)
      .join('\n');
    return `#${i + 1} ${h.diagnosis} [${evalTag}, ${fulfillment}, confidence ${h.confidenceScore}, evidence ${h.evidenceScore}]
  Reasoning: ${(h.clinicalReasoning || '').slice(0, 600)}
  Supporting evidence:
${support || '    (none provided)'}${contra ? `\n  Contradictory evidence:\n${contra}` : ''}`;
  }).join('\n\n');
}

function buildUserPrompt(opts: {
  patientCase: PatientCase;
  claudeRanking: DiagnosisHypothesis[];
  claudeOverallAssessment?: string;
  claudeInformationGaps?: string[];
}): string {
  const recap = buildPatientRecap(opts.patientCase);
  const rankingBlock = buildRankingBlock(opts.claudeRanking);
  const claudeReasoning = opts.claudeOverallAssessment
    ? `\nClaude's overall assessment:\n${opts.claudeOverallAssessment}\n`
    : '';
  const gaps = (opts.claudeInformationGaps || []).length > 0
    ? `\nClaude's noted information gaps:\n${opts.claudeInformationGaps!.map((g) => `- ${g}`).join('\n')}\n`
    : '';
  return `${recap}

CLAUDE'S RANKED DIFFERENTIAL (top ${Math.min(10, opts.claudeRanking.length)}):

${rankingBlock}
${claudeReasoning}${gaps}
Now produce your critique. Cite specific patient findings as evidence for each suggestion. If no changes are warranted, return an empty suggestions array with a high confidence score.`;
}

export class O3CriticAgent {
  public readonly name = 'o3-critic';

  async execute(opts: {
    patientCase: PatientCase;
    claudeRanking: DiagnosisHypothesis[];
    claudeOverallAssessment?: string;
    claudeInformationGaps?: string[];
  }): Promise<CritiqueOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const systemPrompt = O3_CRITIC_SYSTEM_PROMPT;
    const userPrompt = buildUserPrompt(opts);

    const start = Date.now();
    const requestBody = {
      model: O3_CRITIC_MODEL,
      reasoning_effort: 'high',
      max_completion_tokens: 40000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`o3 critic failed: ${res.status} ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const rawText: string = data.choices?.[0]?.message?.content || '';
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const fence = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (!fence) {
        throw new Error(`o3 critic returned non-JSON: ${rawText.slice(0, 200)}`);
      }
      parsed = JSON.parse(fence[1]);
    }

    const durationMs = Date.now() - start;
    const tokensUsed = (data.usage?.total_tokens as number) || 0;

    // Push to LLM call log (matches reconciliation.ts pattern).
    try {
      const { pushLlmCall } = require('../pipeline/llm-call-log');
      pushLlmCall({
        agentName: 'o3-critic',
        stageName: 'o3-critique',
        provider: 'openai',
        model: O3_CRITIC_MODEL,
        reasoningEffort: 'high',
        maxTokens: 40000,
        systemPrompt,
        userPrompt,
        rawResponseText: rawText,
        structuredOutput: parsed,
        reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
        finishReason: data.choices?.[0]?.finish_reason,
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
        durationMs,
      });
    } catch { /* logger optional */ }

    // Validate + normalize the output.
    const allowedActions = new Set(['promote', 'demote', 'reorder', 'merge', 'flag-gap', 'add']);
    const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const suggestions: CritiqueSuggestion[] = rawSuggestions
      .filter((s: any) => typeof s?.targetDiagnosis === 'string' && allowedActions.has(s.action))
      .map((s: any) => ({
        targetDiagnosis: s.targetDiagnosis,
        action: s.action as CritiqueSuggestion['action'],
        targetNewRank: typeof s.targetNewRank === 'number' ? s.targetNewRank : undefined,
        evidence: Array.isArray(s.evidence) ? s.evidence.filter((e: any) => typeof e === 'string') : [],
        reasoning: typeof s.reasoning === 'string' ? s.reasoning : '',
        confidence: typeof s.confidence === 'number' ? Math.max(0, Math.min(100, s.confidence)) : undefined,
      }))
      // Gate 'add' on confidence floor — drop weak adds so Claude finalize stays
      // focused on credible additions. Other actions are not confidence-gated
      // (the existing entry has already passed specialist + eval review).
      .filter((s: CritiqueSuggestion) => s.action !== 'add' || (s.confidence ?? 0) >= ADD_CONFIDENCE_FLOOR);

    const overallAssessment = typeof parsed.overallAssessment === 'string'
      ? parsed.overallAssessment
      : '';
    const confidenceInClaudeRanking = typeof parsed.confidenceInClaudeRanking === 'number'
      ? Math.max(0, Math.min(100, parsed.confidenceInClaudeRanking))
      : 50;

    return {
      overallAssessment,
      suggestions,
      confidenceInClaudeRanking,
      tokensUsed,
      durationMs,
      model: O3_CRITIC_MODEL,
    };
  }
}
