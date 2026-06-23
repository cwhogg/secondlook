/**
 * Differential broadener (v28 — pipeline Option B).
 *
 * Why this exists: the v27 audit showed 98% of all hypotheses across the
 * random cohort were criteria-grounded (in our ~9k-disease KB), and 76% of
 * cases produced ZERO reasoning-evaluated hypotheses. Specialists are
 * over-anchoring to the KB candidates they were shown. A correct diagnosis
 * not represented in our KB therefore has no path to the patient's report.
 *
 * This stage is a small dedicated channel whose only job is to propose
 * rare-disease candidates that are NOT in the specialist hypothesis pool.
 * Single Claude Sonnet 4.6 call. Output marked knowledgeBaseMatch=false +
 * evaluationType='reasoning-evaluated' so it flows through the evidence
 * evaluator's reasoning-track. Fail-soft.
 *
 * Sonnet, not Haiku: this stage requires recall from the long tail of rare
 * disease names — a knowledge-breadth task, not a structural one. Haiku is
 * great at classification / grounding tasks elsewhere in the pipeline; for
 * deep-tail diagnostic recall the larger Sonnet model is the right tradeoff
 * between Haiku's coverage gaps and Opus's overkill cost. See conversation
 * 2026-06-23 for the rationale and the upgrade-to-Opus fallback plan.
 */
import { callAnthropic } from '../anthropic';
import type { PatientCase, DiagnosisHypothesis } from '../types';

const BROADENER_MODEL = 'claude-sonnet-4-6';
const BROADENER_AGENT_NAME = 'differential-broadener';

const SYSTEM_PROMPT = `You are a senior rare-disease consultant. The patient case has already been reviewed by a panel of domain specialists who proposed a list of candidate diagnoses anchored on a curated knowledge base of about 9,000 rare diseases.

Your single job: propose 2–4 ADDITIONAL rare-disease candidates that:
  1. Are NOT already in the list of diagnoses below.
  2. Plausibly fit the patient's presentation (symptoms present and absent).
  3. Are conditions you know from clinical literature but that may NOT be well-represented in standard rare-disease knowledge bases (think: recently described syndromes, ultra-rare presentations, or established conditions that anchoring specialists tend to overlook).

DO NOT propose:
  - Diagnoses already in the existing list (even with slightly different wording).
  - Common conditions a generalist would consider (this is rare-disease only).
  - Speculative or invented disease names — every candidate must be a real, published clinical entity you have specific knowledge of.

If no genuinely additional rare-disease candidate fits, return an empty array. Empty output is better than padding with weak candidates.

OUTPUT FORMAT (JSON only, no markdown fences):
{
  "additionalHypotheses": [
    {
      "diagnosis": "<specific disease entity name; use the most specific, conventional clinical name>",
      "clinicalReasoning": "<one to three sentences explaining why this fits the patient's presentation AND why it might have been overlooked>",
      "confidenceScore": <integer 10–55; this is your honest probability — these are by definition harder calls than the specialists' top candidates>,
      "rareDisease": true,
      "specialistRequired": "<specialty that would confirm, or empty string>"
    }
  ]
}`;

interface BroadenerOutput {
  additionalHypotheses?: Array<{
    diagnosis?: string;
    clinicalReasoning?: string;
    confidenceScore?: number;
    rareDisease?: boolean;
    specialistRequired?: string;
  }>;
}

function buildPatientBlock(patientCase: PatientCase): string {
  const symptoms = (patientCase.symptoms || [])
    .map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase)
    .filter(Boolean)
    .join(', ');
  const excluded = (patientCase.excludedFindings || []).join(', ');
  const fam = patientCase.medicalHistory?.familyHistory?.length
    ? `Family history: ${patientCase.medicalHistory.familyHistory.join(', ')}.`
    : '';
  const pmh = patientCase.medicalHistory?.pastMedicalHistory?.length
    ? `Past medical history: ${patientCase.medicalHistory.pastMedicalHistory.join(', ')}.`
    : '';
  const chief = patientCase.chiefComplaint?.description
    ? `Chief complaint: ${patientCase.chiefComplaint.description}.`
    : '';
  return `PATIENT: ${patientCase.demographics.age}yo ${patientCase.demographics.sex}. ${chief}
Symptoms present: ${symptoms}.
${excluded ? `Findings EXPLICITLY EXCLUDED (denied / absent / ruled out — these are negative evidence): ${excluded}.` : ''}
${fam}
${pmh}`.trim();
}

function buildExistingListBlock(existing: DiagnosisHypothesis[]): string {
  return existing
    .map((h, i) => `${i + 1}. ${h.diagnosis}`)
    .join('\n');
}

export interface BroadenerResult {
  hypotheses: DiagnosisHypothesis[];
  durationMs: number;
  tokensUsed: number;
  model: string;
  rawCount: number; // how many the LLM returned before our filter
  acceptedCount: number;
}

/**
 * Generate 2–4 additional non-KB-anchored rare-disease candidates that
 * complement the specialist hypothesis pool.
 *
 * Returns SpecialistV17Hypothesis entries marked knowledgeBaseMatch=false
 * and evaluationType='reasoning-evaluated' so the downstream evaluator
 * routes them through its reasoning-evaluated track.
 */
export async function broadenDifferential(
  patientCase: PatientCase,
  existingHypotheses: DiagnosisHypothesis[],
): Promise<BroadenerResult> {
  const start = Date.now();
  const userPrompt = `EXISTING SPECIALIST DIFFERENTIAL (do not propose any of these):
${buildExistingListBlock(existingHypotheses)}

${buildPatientBlock(patientCase)}

Propose 2–4 additional rare-disease candidates per the rules in the system prompt. Empty array is acceptable if none genuinely fit.`;

  const result = await callAnthropic({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2000,
    model: BROADENER_MODEL,
  });

  const parsed = typeof result.content === 'object' && result.content !== null
    ? (result.content as BroadenerOutput)
    : null;

  const raw = Array.isArray(parsed?.additionalHypotheses) ? parsed!.additionalHypotheses! : [];
  const existingNames = new Set(
    existingHypotheses.map((h) => h.diagnosis.toLowerCase().trim()),
  );

  const accepted: DiagnosisHypothesis[] = [];
  for (const item of raw) {
    if (!item.diagnosis || typeof item.diagnosis !== 'string') continue;
    const trimmed = item.diagnosis.trim();
    if (!trimmed) continue;
    // Drop any candidate the LLM smuggled back from the existing list.
    if (existingNames.has(trimmed.toLowerCase())) continue;

    const confidenceScore =
      typeof item.confidenceScore === 'number' && Number.isFinite(item.confidenceScore)
        ? Math.max(5, Math.min(60, Math.round(item.confidenceScore)))
        : 25;

    const hyp: DiagnosisHypothesis = {
      diagnosis: trimmed,
      confidenceScore,
      evidenceScore: 0,
      rareDisease: item.rareDisease === false ? false : true,
      supportingEvidence: [],
      contradictoryEvidence: [],
      clinicalReasoning:
        typeof item.clinicalReasoning === 'string' && item.clinicalReasoning.trim()
          ? item.clinicalReasoning.trim()
          : 'Proposed by the differential-broadener stage as a candidate not represented in the specialist pool.',
      typicalPresentation: '',
      specialistRequired: typeof item.specialistRequired === 'string' ? item.specialistRequired : '',
      diagnosticCriteria: {
        criteriaName: '',
        totalCriteria: 0,
        metCriteria: 0,
        criteriaDetails: [],
        fulfillmentPercentage: 0,
      },
      sourceAgent: BROADENER_AGENT_NAME,
      sourceAgents: [BROADENER_AGENT_NAME],
      evaluationType: 'reasoning-evaluated',
      knowledgeBaseMatch: false,
    };
    accepted.push(hyp);
  }

  return {
    hypotheses: accepted,
    durationMs: Date.now() - start,
    tokensUsed: result.tokensUsed || 0,
    model: BROADENER_MODEL,
    rawCount: raw.length,
    acceptedCount: accepted.length,
  };
}

export { BROADENER_AGENT_NAME };
