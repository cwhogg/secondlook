/**
 * Feature-vs-syndrome post-finalize reranker (v27.2).
 *
 * Loop 1 evidence (docs/loss-loop-2026-06-16/state.md): a prompt-level rule
 * inside the Claude finalizer was not enough to fix the feature-vs-syndrome
 * failure mode. When the feature name is *disease-shaped* (Neurofibroma,
 * Café-au-lait macules, Hypoparathyroidism — names that read as diseases
 * even though clinically they're features of a broader syndrome), the
 * finalizer's lexical bias keeps them at #1.
 *
 * This stage runs after Claude finalize. It calls Claude haiku as a cheap
 * dedicated arbiter with a single-purpose prompt: "classify each top-5
 * candidate as SYNDROMIC vs FEATURE, then promote the most syndromic when
 * #1 is a feature whose hallmark broader syndrome is below." Output is
 * exclusively a reordering — the stage never invents new diagnoses, never
 * drops any, never modifies fields other than rank.
 *
 * Class-wide: the prompt enumerates the *kinds* of feature names that
 * count (tumor / lesion / morphological finding / single-organ deficiency
 * / biochemical defect / radiographic finding) without naming specific
 * diseases. The arbiter is asked to recognize the class, not memorize
 * disease-specific tables.
 */
import { callAnthropic } from '../anthropic';
import type { DiagnosisHypothesis, PatientCase } from '../types';

const RERANKER_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a single-purpose clinical arbiter. Your only job: given a top-5 differential, decide whether the #1 entry names a SYNDROMIC DISEASE entity or merely a FEATURE/finding of one. If #1 is a feature AND any of #2–#5 names the syndromic disease whose hallmark feature this is, promote the syndrome above the feature. Otherwise leave order unchanged.

CLASSIFICATION:
- SYNDROMIC = a multi-system disease entity (a named genetic syndrome, autoimmune disease, metabolic disease, deficiency syndrome, etc.). It typically explains multiple clinical findings together.
- FEATURE = a single tumor / lesion / morphological finding / radiographic finding / single-hormone or enzyme deficiency / single-organ structural anomaly / biochemical defect. Even if the name SOUNDS like a disease (e.g. "Neurofibroma", "Café-au-lait macules", "Hypoparathyroidism", "Adenoma sebaceum", "Subependymal giant-cell astrocytoma", "Port-wine nevus"), if the entity is fundamentally a single manifestation that a broader syndrome would subsume, classify as FEATURE.

DECISION RULE — apply in order:
1. Classify each of the 5 entries as SYNDROMIC or FEATURE based on the entity name alone.
2. If #1 is SYNDROMIC, output the input order unchanged.
3. If #1 is FEATURE, look at #2–#5 for any SYNDROMIC entry whose name implies it routinely includes the #1 feature as a hallmark manifestation (e.g., the syndrome's clinical definition would explain that feature). If such a syndrome exists, promote it to #1 and demote the feature to where the syndrome was; keep the other entries in place.
4. If #1 is FEATURE but no covering syndrome appears in #2–#5, leave order unchanged.

The patient case is given for context, but DO NOT use it to invent new diagnoses or rerank for any reason other than the feature-vs-syndrome rule above. Your output is ONLY a reordering of the input.

OUTPUT (JSON only, no markdown):
{
  "classifications": [
    { "rank": 1, "diagnosis": "<exact input name>", "class": "SYNDROMIC" | "FEATURE" }
    // ... for ranks 1-5
  ],
  "swap": <null | { "newTop1Rank": <integer 2-5>, "reason": "<one sentence: syndrome X includes feature Y as a hallmark>" }>,
  "finalOrder": ["<diagnosis-name-rank-1>", "<diagnosis-name-rank-2>", "<diagnosis-name-rank-3>", "<diagnosis-name-rank-4>", "<diagnosis-name-rank-5>"]
}

CRITICAL: every name in "finalOrder" must be an EXACT verbatim string from the input top-5. No paraphrases.`;

function buildUserPrompt(top5: DiagnosisHypothesis[], patientCase: PatientCase): string {
  const recap = `${patientCase.demographics.age}yo ${patientCase.demographics.sex}.${
    patientCase.chiefComplaint?.description ? ` Chief complaint: ${patientCase.chiefComplaint.description}.` : ''
  }`;
  const symptoms = (patientCase.symptoms || [])
    .slice(0, 12)
    .map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase)
    .filter(Boolean)
    .join(', ');
  const block = top5
    .slice(0, 5)
    .map((h, i) => `#${i + 1} ${h.diagnosis}`)
    .join('\n');
  return `PATIENT: ${recap}
Symptoms: ${symptoms || '(none parsed)'}.

TOP-5 DIFFERENTIAL:
${block}

Classify each, then decide whether to swap per the feature-vs-syndrome rule. Output JSON only.`;
}

export interface RerankerResult {
  reordered: DiagnosisHypothesis[];
  swapped: boolean;
  classifications: Array<{ rank: number; diagnosis: string; class: 'SYNDROMIC' | 'FEATURE' }>;
  swap: { newTop1Rank: number; reason: string } | null;
  durationMs: number;
  tokensUsed: number;
  model: string;
}

export async function rerankFeatureVsSyndrome(
  finalRanking: DiagnosisHypothesis[],
  patientCase: PatientCase,
): Promise<RerankerResult> {
  const top5 = finalRanking.slice(0, 5);
  const rest = finalRanking.slice(5);
  const start = Date.now();

  if (top5.length < 2) {
    return {
      reordered: finalRanking,
      swapped: false,
      classifications: [],
      swap: null,
      durationMs: Date.now() - start,
      tokensUsed: 0,
      model: RERANKER_MODEL,
    };
  }

  const result = await callAnthropic({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(top5, patientCase),
    maxTokens: 1500,
    model: RERANKER_MODEL,
  });

  const parsed = typeof result.content === 'object' && result.content !== null
    ? (result.content as {
        classifications?: Array<{ rank: number; diagnosis: string; class: 'SYNDROMIC' | 'FEATURE' }>;
        swap?: { newTop1Rank: number; reason: string } | null;
        finalOrder?: string[];
      })
    : null;

  if (!parsed || !Array.isArray(parsed.finalOrder) || parsed.finalOrder.length !== top5.length) {
    return {
      reordered: finalRanking,
      swapped: false,
      classifications: parsed?.classifications || [],
      swap: parsed?.swap || null,
      durationMs: Date.now() - start,
      tokensUsed: result.tokensUsed || 0,
      model: RERANKER_MODEL,
    };
  }

  // Map finalOrder strings back to input hypotheses by exact match
  const byName = new Map<string, DiagnosisHypothesis>();
  for (const h of top5) byName.set(h.diagnosis, h);
  const reordered5: DiagnosisHypothesis[] = [];
  for (const name of parsed.finalOrder) {
    const h = byName.get(name);
    if (!h) {
      // Reranker returned a name not in input — abort the swap entirely.
      return {
        reordered: finalRanking,
        swapped: false,
        classifications: parsed.classifications || [],
        swap: parsed.swap || null,
        durationMs: Date.now() - start,
        tokensUsed: result.tokensUsed || 0,
        model: RERANKER_MODEL,
      };
    }
    reordered5.push(h);
    byName.delete(name);
  }
  // Sanity: every input was placed exactly once
  if (byName.size !== 0) {
    return {
      reordered: finalRanking,
      swapped: false,
      classifications: parsed.classifications || [],
      swap: parsed.swap || null,
      durationMs: Date.now() - start,
      tokensUsed: result.tokensUsed || 0,
      model: RERANKER_MODEL,
    };
  }

  const swapped = reordered5[0]?.diagnosis !== top5[0]?.diagnosis;
  return {
    reordered: [...reordered5, ...rest],
    swapped,
    classifications: parsed.classifications || [],
    swap: parsed.swap || null,
    durationMs: Date.now() - start,
    tokensUsed: result.tokensUsed || 0,
    model: RERANKER_MODEL,
  };
}
