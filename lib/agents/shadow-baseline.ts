/**
 * Shadow baseline (v31): runs a single o3-reasoning:high one-shot
 * differential in parallel with the SL pipeline. After the finalizer
 * produces its top-10, the shadow check inspects whether the baseline's
 * top-1 pick disagrees with SL's top-1 AND has materially stronger
 * KB-criteria fulfillment in the patient case. When both conditions
 * hold, the baseline pick is promoted to #1 and the prior #1 demoted.
 *
 * Why: o3 has continued improving at one-shot rare-disease ranking
 * faster than Claude opus (the model class SL uses for synthesis and
 * finalization). This stage lets SL pick up o3's continuing T-1 gains
 * without flipping the architecture or weakening the specialist
 * diversity mandate (which preserves SL's T-3/T-10 lead).
 *
 * Cost: one extra o3 reasoning:high call (~$0.30-0.50/case). Latency:
 * runs in parallel with specialists, so net wall-time addition is
 * usually 0 (the baseline finishes well before the finalizer).
 *
 * Fail-soft: any error in the baseline call or KB lookup is logged
 * and skipped. SL's finalized ranking is the fallback. No regression
 * possible vs the pre-shadow architecture.
 */
import type { PatientCase, DiagnosisHypothesis } from '../types';
import { findDiseaseByName } from '../knowledge';
import { isDiagnosisMatch } from '../grading/deterministic-match';

const OPENAI_MODEL = 'o3';
const PROMOTION_MARGIN = 0.05; // require >= 5pp criteria-fulfillment edge to flip

const SHADOW_SYSTEM_PROMPT = `You are a clinical diagnostician asked to produce a differential diagnosis from a clinical vignette. There is a single definitive diagnosis for this case, and it is a diagnosis that is known today to exist in humans (almost always confirmable by a genetic test, occasionally by validated clinical criteria). The vignette may include excluded findings ("however, the following features were excluded: ..."); treat those features as absent. Return STRICT JSON only, no prose.`;

const SHADOW_USER_PROMPT_PREFIX = `Give a differential diagnosis as a list of candidate diagnoses ranked by probability starting with the most likely candidate. Each candidate should be a specific real disease name. Return only this JSON:
{
  "diagnoses": [
    { "diagnosis": "Disease name" }
  ]
}
Exactly 10 entries, ranked most likely first, distinct diseases.

CLINICAL VIGNETTE:
`;

export interface ShadowBaselineResult {
  topDiagnoses: string[];
  durationMs: number;
  tokensUsed: number;
}

/**
 * Build the same single-shot case description the eval-baseline endpoint
 * uses, so the shadow result is directly comparable to the OAI o3 trio
 * baseline numbers we measure in the eval cohorts.
 */
function buildCaseDescription(patientCase: PatientCase): string {
  const demo = `${patientCase.demographics.age}yo ${patientCase.demographics.sex}`;
  const chief = patientCase.chiefComplaint?.description
    ? `Chief complaint: ${patientCase.chiefComplaint.description}`
    : '';
  const symptoms = (patientCase.symptoms || [])
    .map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase)
    .filter(Boolean)
    .join(', ');
  const excluded =
    patientCase.excludedFindings && patientCase.excludedFindings.length > 0
      ? `\n\nHowever, the following features were excluded: ${patientCase.excludedFindings.join(', ')}.`
      : '';
  return [demo, chief, symptoms && `Symptoms: ${symptoms}`].filter(Boolean).join('. ') + excluded;
}

export async function runShadowBaseline(
  patientCase: PatientCase,
): Promise<ShadowBaselineResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const start = Date.now();
  const caseDescription = buildCaseDescription(patientCase);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        reasoning_effort: 'high',
        messages: [
          { role: 'system', content: SHADOW_SYSTEM_PROMPT },
          { role: 'user', content: SHADOW_USER_PROMPT_PREFIX + caseDescription },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      console.warn(`[shadow-baseline] o3 call ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    const topDiagnoses = Array.isArray(parsed?.diagnoses)
      ? parsed.diagnoses
          .map((d: any) => (typeof d?.diagnosis === 'string' ? d.diagnosis : null))
          .filter(Boolean)
          .slice(0, 10)
      : [];
    if (topDiagnoses.length === 0) return null;
    const tokensUsed = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0);
    return { topDiagnoses, durationMs: Date.now() - start, tokensUsed };
  } catch (err: any) {
    console.warn(`[shadow-baseline] threw: ${err?.message || 'unknown'}`);
    return null;
  }
}

/**
 * Compute the criteria-fulfillment fraction a hypothesis has against the
 * patient's case. Falls back to evidenceScore (normalized) when no KB
 * diagnosticCriteria are attached. Returns 0 when neither is available.
 */
function fulfillmentScore(h: DiagnosisHypothesis): number {
  const cf = h.diagnosticCriteria;
  if (cf && cf.totalCriteria > 0) return cf.metCriteria / cf.totalCriteria;
  if (typeof h.evidenceScore === 'number' && h.evidenceScore > 0) return h.evidenceScore / 100;
  if (typeof h.confidenceScore === 'number' && h.confidenceScore > 0) return h.confidenceScore / 100;
  return 0;
}

export interface ShadowPromotionResult {
  ranking: DiagnosisHypothesis[];
  promoted: boolean;
  reason: string;
  baselineTop1?: string;
  baselineTop1Score?: number;
  slTop1Score?: number;
}

/**
 * Apply the shadow baseline promotion rule against the SL finalized ranking.
 * Only promotes when ALL conditions hold:
 *   1. Baseline returned a top-1
 *   2. Baseline top-1 disagrees with SL top-1 (umbrella-aware via isDiagnosisMatch)
 *   3. Baseline top-1 is present in SL's top-10 (so we have a measured
 *      criteria-fulfillment score) OR it resolves to a KB profile we can
 *      score against the patient's symptoms
 *   4. Baseline top-1's fulfillment score exceeds SL top-1's by >= PROMOTION_MARGIN
 *
 * Generalized rule, no disease-specific logic. Returns the (possibly
 * unchanged) ranking and a structured reason for the summary log.
 */
export function applyShadowBaselinePromotion(
  finalRanking: DiagnosisHypothesis[],
  shadowResult: ShadowBaselineResult | null,
): ShadowPromotionResult {
  if (!shadowResult || shadowResult.topDiagnoses.length === 0 || finalRanking.length === 0) {
    return { ranking: finalRanking, promoted: false, reason: 'no shadow baseline available' };
  }
  const baselineTop1 = shadowResult.topDiagnoses[0];
  const slTop1 = finalRanking[0];

  // Condition 2: must disagree
  if (isDiagnosisMatch(baselineTop1, slTop1.diagnosis)) {
    return {
      ranking: finalRanking,
      promoted: false,
      reason: 'baseline agrees with SL top-1',
      baselineTop1,
    };
  }

  // Condition 3a: baseline pick already in SL's top-10 — use its existing
  // criteria-fulfillment score.
  const baselineIdx = finalRanking.findIndex((h) => isDiagnosisMatch(baselineTop1, h.diagnosis));

  let baselineHypothesis: DiagnosisHypothesis;
  if (baselineIdx >= 0) {
    baselineHypothesis = finalRanking[baselineIdx];
  } else {
    // Condition 3b: baseline pick not in SL's top-10. Look it up in the KB
    // to measure criteria fulfillment. If KB has no matching profile or no
    // criteria attached, we can't make the comparison — skip rather than
    // guess.
    const profile = findDiseaseByName(baselineTop1);
    if (!profile) {
      return {
        ranking: finalRanking,
        promoted: false,
        reason: 'baseline pick not in SL top-10 and no KB match',
        baselineTop1,
      };
    }
    // Use the KB profile's criteria count as the denominator and assume
    // fulfillment is unknown without re-running evidence-evaluator. We
    // conservatively decline to promote in this case — the v4 grader will
    // still credit the baseline pick if SL added it elsewhere.
    return {
      ranking: finalRanking,
      promoted: false,
      reason: 'baseline pick in KB but not in SL top-10; refuse blind promotion',
      baselineTop1,
    };
  }

  // Condition 4: fulfillment-score margin check
  const baselineScore = fulfillmentScore(baselineHypothesis);
  const slScore = fulfillmentScore(slTop1);
  if (baselineScore < slScore + PROMOTION_MARGIN) {
    return {
      ranking: finalRanking,
      promoted: false,
      reason: `SL top-1 has stronger or equivalent criteria fulfillment (${slScore.toFixed(2)} vs ${baselineScore.toFixed(2)}, margin ${PROMOTION_MARGIN} not met)`,
      baselineTop1,
      baselineTop1Score: baselineScore,
      slTop1Score: slScore,
    };
  }

  // All conditions met — swap. Baseline pick to #1, prior #1 to baselineIdx
  // slot (preserves the rest of the ranking).
  const newRanking = [...finalRanking];
  newRanking[0] = baselineHypothesis;
  newRanking[baselineIdx] = slTop1;

  return {
    ranking: newRanking,
    promoted: true,
    reason: `baseline pick promoted (criteria ${baselineScore.toFixed(2)} > SL ${slScore.toFixed(2)}, margin ${PROMOTION_MARGIN})`,
    baselineTop1,
    baselineTop1Score: baselineScore,
    slTop1Score: slScore,
  };
}
