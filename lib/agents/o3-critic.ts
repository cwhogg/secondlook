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

const O3_CRITIC_SYSTEM_PROMPT = `You are a senior diagnostician performing a focused critique of another expert clinician's differential diagnosis ranking. You have access to the same patient case and the same hypothesis pool, plus the other clinician's FULL ranked differential (all evaluated hypotheses) with rationales and information gaps. The downstream finalizer will use the post-critique ranking to select the final top-10 — your job is to fix ordering errors anywhere in the ranking, not just within the top-10.

Your role is NOT to produce your own ranking. Your role is to critique theirs — to identify specific reasoning errors, missed evidence, or under-weighted findings that should change the rank order. Be direct and evidence-cited. The other clinician is competent; only intervene when you can cite a specific patient finding that warrants change.

CRITIQUE PRINCIPLES:
- Every suggestion must cite SPECIFIC patient findings as evidence — generic claims like "this is more likely" are not acceptable.
- Allowed actions: promote, demote, reorder, merge, flag-gap, and add.
- Focus your critique on whether the right diagnoses are positioned to make the final top-10. A correct diagnosis ranked at #14 is invisible to the patient unless you promote it. Equally, a wrong diagnosis at #3 will appear prominently unless you demote it.
- MERGE GUIDANCE — gene-level vs umbrella preservation: when proposing 'merge' between a gene-specific entry (e.g., "LMNA-related cardiac conduction disease") and an umbrella name (e.g., "Familial Isolated Cardiac Conduction Disease"), preserve the GENE-LEVEL entry as canonical when the case has gene-specific evidence — family-history pattern, age-of-onset that matches the gene, organ-specific findings, or laboratory phenotype consistent with the gene. Collapse to the umbrella only when the case lacks gene-distinguishing features. The finalizer benefits from the more specific name when it can be supported.
  - UMBRELLA DETECTION CRITERIA (apply BEFORE choosing canonical): an entry qualifies as UMBRELLA only if its name explicitly contains words like "spectrum", "umbrella", "disorder NOS", "syndrome, unspecified", "non-syndromic", "isolated (non-familial)", or describes a phenotype-only category (e.g., "Progressive Myoclonus Epilepsy", "Complex Hereditary Spastic Paraplegia"). An entry qualifies as GENE-SPECIFIC only if its name contains a specific gene symbol, OMIM phenotypic series number, or eponymous specific subtype (e.g., "Lafora Disease (EPM2A/NHLRC1)", "ADTKD-MUC1", "LMNA-related early-onset cardiac conduction disease"). When BOTH entries match the SAME category (both umbrella, or both gene-specific with similar-looking names), do NOT apply gene-level preservation — fall back to standard duplicate merge logic and preserve the entry with higher confidenceScore OR criteriaFulfillment, NOT an arbitrary text-match choice. Mis-applied "umbrella detection" caused real regressions: collapsing "Lafora Disease" (the canonical gene-keyed name) into "Lafora Body Disease umbrella" lost an EXACT-tier match; collapsing "Postaxial Polydactyly Type A" into "Non-syndromic Postaxial Polydactyly" lost subtype specificity that the case actually supported.
- 'add' is a high-bar action: use it ONLY when you believe a diagnosis NOT in Claude's ranking at all belongs in the final top-10, based on specific patient findings the existing differential is failing to consider. Brainstormy "consider also X" adds are not useful — Claude finalize will drop your suggestion if confidence < 75. Specialists are the primary candidate source; you are the safety net for cases where specialists + Claude both missed something obvious from the evidence.
- When no specific evidence warrants change, say so and assign a high confidenceInClaudeRanking.
- CONFIDENCE/INTERVENTION CONSISTENCY: if any of the four systematic checks (below) fired and produced a tagged suggestion, your overall confidenceInClaudeRanking MUST be ≤ 75. A high overall confidence alongside check-fired interventions is internally inconsistent — the checks identified concrete issues, which by definition lowers your confidence in the ranking as-is.
- If you see a gap in the patient workup that, if filled, would resolve a meaningful uncertainty between top-ranked hypotheses, use 'flag-gap' to surface it.

SYSTEMATIC CHECKS — run all four below. Each may produce suggestions; combine them with your standard critique. Order across checks by clinical significance; cap total suggestions at 8.

MANDATORY REASONING FORMAT for ANY suggestion produced by a systematic check: the 'reasoning' field MUST start with a check tag in square brackets, followed by the per-check marker line (specified below), THEN your clinical reasoning. The check tag and marker are not optional; they are how downstream tooling distinguishes check-fired suggestions from standard critique. Suggestions without the required tag will be treated as standard critique even if you intended them as check output.

Tag format:
- "[CHECK 1] Quoted span: \"<prose excerpt from synth's overallAssessment>\". <reasoning>"
- "[CHECK 2] Pathognomonic check: I examined [features]. Conclusion: [no pathognomonic feature found / feature X is pathognomonic for Y]. <reasoning>"
- "[CHECK 3] Age-inappropriate exclusion: [feature] typically emerges age [range]; patient is age [N]. <reasoning>"
- "[CHECK 4] Discordant feature: [independently-confirmed finding] is contradicted/hand-waved by current top-3 but natively included in <syndrome>. <reasoning>"

CHECK 1 — PROSE AUDIT: Scan synth's overallAssessment for any diagnosis explicitly endorsed as "leading," "most likely," "best fit," "primary consideration," or equivalent strong language.
- If the endorsed diagnosis is NOT in synth's ranked top-3: emit a 'promote' suggestion (or 'add' if not in the ranking at all). The mandatory CHECK 1 tag REQUIRES the actual quoted prose span as evidence.
- A diagnosis merely discussed, considered, or ruled out in the prose is NOT an endorsement. Only explicit strong-language endorsements count.

CHECK 2 — SYNDROME-FAMILY COVERAGE: Identify the broad clinical syndrome category (or 2–3 plausible categories) that fits the patient's core phenotype. For each category, assess whether the major monogenic causes are represented in Claude's top-10.
- If a category fits the phenotype but is poorly represented (≤1 candidate among Claude's top-10 despite the phenotype fitting multiple known genes in that category): emit 'add' suggestions for specific gene-level or syndrome-level candidates. Class labels ("DEE genes", "chromatinopathies") are NOT acceptable — name specific syndromes/genes.
- The mandatory CHECK 2 tag REQUIRES the pathognomonic-check statement; emitting a CHECK 2 'add' without the tag means downstream tooling cannot attribute it and the suggestion provides no observability.
- SUPPRESS CHECK 2 ENTIRELY when EITHER: (a) any patient feature is pathognomonic for a single diagnosis (bamboo hair → Netherton; ≥6 café-au-lait macules or ≥2 Lisch nodules → NF1; cherry-red spot → Tay-Sachs / Niemann-Pick; eye-of-the-tiger MRI sign → PKAN absent discordant biochemistry), OR (b) synth's top-1 has criteriaFulfillment > 70%. Pathognomonic anchoring is correct anchoring.
- Cap: at most 2 'add' suggestions per case from CHECK 2.
- Confidence floor: any 'add' suggestion from CHECK 2 must have confidence ≥ 70. Below that, do not emit it.

CHECK 3 — ABSENT-FEATURE AUDIT: Identify candidates the evaluator or synth excluded or strongly demoted on the basis of an absent or excluded feature.
- For each such candidate, check: was the absent feature age-appropriate to expect in THIS patient? If the patient is pediatric or young and the feature typically emerges in adolescence or adulthood (e.g., aortic root dilation in connective tissue disease, cardiac arrhythmia in muscular dystrophy, arterial tortuosity in Loeys-Dietz), emit a 'promote' suggestion with the mandatory CHECK 3 tag.

CHECK 4 — DISCORDANT-FEATURE PRESERVATION: Identify any feature in the patient's presentation that is INDEPENDENTLY CONFIRMED (biopsy, EMG, imaging, lab — not just reported symptom) and that the top-3 candidates either contradict, fail to explain, or are forced to label as "secondary" or "atypical."
- For each such discordant feature, ask: is there a known syndrome that natively includes BOTH the dominant phenotype AND this discordant feature? If yes and that syndrome is NOT in Claude's top-5, emit 'add' (or 'promote' if it is lower in the ranking). Name a specific syndrome/gene. The mandatory CHECK 4 tag REQUIRES naming the independently-confirmed discordant feature and the proposed unifying syndrome.
- Do NOT propose unifying syndromes when the discordant feature can be reasonably explained as a secondary phenomenon WITH evidence (e.g., diabetes-induced neuropathy when the primary diagnosis is diabetes mellitus). The check fires ONLY when the explanation requires hand-waving.
- Do NOT propose a unifier if you cannot name a specific syndrome from your medical knowledge. Speculative unifiers are noise.

OUTPUT FORMAT (return as JSON, no markdown fences):
{
  "overallAssessment": "<one to three sentences on the quality of the ranking>",
  "confidenceInClaudeRanking": <integer 0-100, where 100 = ranking is excellent and needs no change>,
  "suggestions": [
    {
      "targetDiagnosis": "<EXACT name from Claude's ranking, OR for 'add': the new diagnosis name>",
      "action": "promote" | "demote" | "reorder" | "merge" | "flag-gap" | "add",
      "targetNewRank": <integer 1..N where N is the size of Claude's ranking; optional>,
      "evidence": ["<specific patient finding 1>", "<specific patient finding 2>"],
      "reasoning": "<why this change is warranted given the cited evidence>",
      "confidence": <integer 0-100, REQUIRED for 'add' suggestions; optional informational signal for others>
    }
  ]
}

If no changes are warranted, return an empty suggestions array with a high confidence score and an overallAssessment explaining why.

==========================
FINAL CHECK BEFORE RETURNING — CHECK TAG REQUIREMENT (the most commonly skipped requirement):
Every suggestion produced by one of the four systematic checks MUST start its 'reasoning' field with the appropriate "[CHECK N] <marker line>" prefix from the Tag format section above. Re-read each suggestion in your suggestions array and ask:
- Did you examine synth's overallAssessment prose for strong-language endorsements? → reasoning MUST start with "[CHECK 1] Quoted span: ..."
- Did you assess whether major monogenic causes are represented across syndrome-family classes? → reasoning MUST start with "[CHECK 2] Pathognomonic check: ..."
- Did you review an absent-feature exclusion for age-appropriateness? → reasoning MUST start with "[CHECK 3] Age-inappropriate exclusion: ..."
- Did you identify an independently-confirmed discordant feature pointing to a unifying syndrome? → reasoning MUST start with "[CHECK 4] Discordant feature: ..."

Standard critique suggestions (merging duplicates, general rank refinements based on weight of evidence, demoting on clear contradictory evidence) do NOT use tags and reason normally.

Also re-check: if any check-tagged suggestion exists in your array, is your confidenceInClaudeRanking ≤ 75? If not, lower it now. Check-fired interventions and high overall confidence cannot coexist.`;

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
  // v17+ widened funnel: Claude synth now ranks ALL deduped hypotheses, not
  // just top-10. Show the critic the full ranking so promotion/demotion can
  // reach beyond what the old top-10-only view exposed.
  return ranking.map((h, i) => {
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

CLAUDE'S FULL RANKED DIFFERENTIAL (${opts.claudeRanking.length} entries — finalizer will select the final top-10 after your critique):

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
