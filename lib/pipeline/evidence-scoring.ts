// Deterministic evidence scoring for diagnosis hypotheses.
//
// Replaces the synthesizer's all-in-one LLM "probabilityScore" as the field
// the differential is ranked by. The synthesizer's number still flows
// through as `confidenceScore` (LLM clinical judgment); `evidenceScore` is
// now derived from concrete signals so it's repeatable, auditable, and not
// subject to the LLM's own ranking biases that drove failures like ADTKD's
// "Secondary HPT > UMOD-ADTKD" misorder.
//
// Two tracks share the same 0-100 output scale:
//
//   KB-matched (criteria available)
//     0.40 * criteriaFulfillmentRatio
//   + 0.30 * symptomMatchScore
//   + 0.10 * specialistAgreementScore
//   - 0.05 * contradictionPenalty
//   - 0.15 * excludedFindingPenalty
//
//   Non-KB (no structured criteria)
//     0.45 * symptomMatchScore
//   + 0.30 * evidenceQualityScore     (evaluator's enum -> number)
//   + 0.15 * specialistAgreementScore
//   - 0.10 * contradictionPenalty
//
// Post-processing:
//   - downstream-of penalty: a diagnosis that is a downstream consequence
//     of another higher-scored diagnosis already in the differential gets
//     halved (an effect never outranks its cause when both are present).
//   - family-expansion: positions appended after synthesis inherit half of
//     their parent diagnosis's score, instead of the silent zero we were
//     showing users before.

import { DiagnosisHypothesis, PatientCase } from "../types"
import { DiseaseProfile, SymptomFrequency } from "../types/knowledge-base"
import { findDiseaseByName } from "../knowledge"

export const SCORING_VERSION = "v1-2026-05-29"

const TIER_WEIGHTS = {
  pathognomonic: 10,
  common: 4,
  occasional: 2,
  rare: 1,
} as const

const EVIDENCE_QUALITY_TO_NUMBER: Record<string, number> = {
  strong: 1.0,
  moderate: 0.7,
  weak: 0.4,
  insufficient: 0.1,
}

const FAMILY_EXPANSION_DISCOUNT = 0.5
const DOWNSTREAM_PENALTY = 0.5
const SPECIALIST_AGREEMENT_SATURATION = 3 // 3+ specialists agreeing = full credit
const CONTRADICTION_SATURATION = 5 // 5+ contradictions = full penalty

// Normalize a symptom or finding string for substring matching. Strict enough
// to avoid the kind of "Ciliopathy" hijack we saw earlier — substring matches
// only fire when both sides are at least 5 chars.
function normTerm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function termContains(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5) return a === b
  return a.includes(b) || b.includes(a)
}

// Score how well the patient's symptoms map onto the disease's expected
// presentation. Mirrors the 60/40 disease-coverage / patient-coverage blend
// used by the retrieval engine.
function symptomMatchScore(profile: DiseaseProfile, patient: PatientCase): number {
  const patientTerms = (patient.symptoms || [])
    .map((s) => normTerm(s.medicalTerm || s.originalPhrase))
    .filter((t) => t.length >= 4)

  if (patientTerms.length === 0) return 0

  const allDiseaseSymptoms: Array<{ term: string; weight: number }> = []
  let totalWeight = 0
  for (const tier of ["pathognomonic", "common", "occasional", "rare"] as const) {
    const w = TIER_WEIGHTS[tier]
    const symptoms: SymptomFrequency[] = profile.symptoms[tier] || []
    for (const s of symptoms) {
      allDiseaseSymptoms.push({ term: normTerm(s.symptomName), weight: w })
      totalWeight += w
      for (const alt of s.searchTerms || []) {
        const altNorm = normTerm(alt)
        if (altNorm.length >= 4) {
          // Aliases share the same weight as their parent symptom but only
          // count toward the matched-weight accumulator if they hit; do not
          // double-count toward totalWeight.
          allDiseaseSymptoms.push({ term: altNorm, weight: 0 })
        }
      }
    }
  }

  if (totalWeight === 0) return 0

  let matchedWeight = 0
  let matchedPatientCount = 0
  const matchedDiseaseSymptoms = new Set<number>()

  for (const pt of patientTerms) {
    let bestHit = -1
    let bestWeight = 0
    for (let i = 0; i < allDiseaseSymptoms.length; i++) {
      if (matchedDiseaseSymptoms.has(i)) continue
      const ds = allDiseaseSymptoms[i]
      if (termContains(pt, ds.term)) {
        if (ds.weight >= bestWeight) {
          bestHit = i
          bestWeight = ds.weight
        }
      }
    }
    if (bestHit >= 0) {
      matchedDiseaseSymptoms.add(bestHit)
      matchedWeight += bestWeight
      matchedPatientCount += 1
    }
  }

  const diseaseCoverage = matchedWeight / totalWeight
  const patientCoverage = matchedPatientCount / patientTerms.length
  return 0.6 * diseaseCoverage + 0.4 * patientCoverage
}

// Fraction of the disease's pathognomonic-or-common features that the
// patient has been shown explicitly NOT to have. Strong negative signal.
function excludedFindingPenalty(profile: DiseaseProfile, patient: PatientCase): number {
  const excluded = (patient.excludedFindings || [])
    .map((s) => normTerm(s))
    .filter((t) => t.length >= 4)
  if (excluded.length === 0) return 0

  const highTier: string[] = []
  for (const s of profile.symptoms.pathognomonic || []) highTier.push(normTerm(s.symptomName))
  for (const s of profile.symptoms.common || []) highTier.push(normTerm(s.symptomName))
  if (highTier.length === 0) return 0

  let hits = 0
  for (const ht of highTier) {
    if (excluded.some((ex) => termContains(ht, ex))) hits++
  }
  return hits / highTier.length
}

function specialistAgreementScore(sourceAgents: string[]): number {
  return Math.min(1, sourceAgents.length / SPECIALIST_AGREEMENT_SATURATION)
}

function contradictionPenalty(h: DiagnosisHypothesis): number {
  const fromArr = Array.isArray(h.contradictoryEvidence) ? h.contradictoryEvidence.length : 0
  // Evidence evaluator also stashes a separate _contradictions string array.
  const evalContradictions = (h as any)._contradictions
  const fromEval = Array.isArray(evalContradictions) ? evalContradictions.length : 0
  return Math.min(1, (fromArr + fromEval) / CONTRADICTION_SATURATION)
}

// Map the evidence evaluator's enum to a 0-1 number for the non-KB track.
function evidenceQualityScore(h: DiagnosisHypothesis): number {
  const eq = (h as any)._evidenceQuality
  if (typeof eq === "string" && eq in EVIDENCE_QUALITY_TO_NUMBER) {
    return EVIDENCE_QUALITY_TO_NUMBER[eq]
  }
  return 0.4 // neutral-weak default when evaluator didn't tag this hypothesis
}

// Pull the list of specialists that proposed this diagnosis. We accept both
// the new structured `sourceAgents` array (preferred) and the legacy comma-
// joined `sourceAgent` string (back-compat with historical data).
export function sourceAgentList(h: DiagnosisHypothesis): string[] {
  if (Array.isArray((h as any).sourceAgents) && (h as any).sourceAgents.length > 0) {
    return (h as any).sourceAgents
  }
  if (typeof h.sourceAgent === "string" && h.sourceAgent.trim().length > 0) {
    return h.sourceAgent.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
  }
  return []
}

export interface ScoreBreakdown {
  evidenceScoreRaw: number
  trackUsed: "kb-grounded" | "non-kb-reasoning"
  components: {
    criteriaFulfillmentRatio?: number
    symptomMatchScore: number
    specialistAgreementScore: number
    contradictionPenalty: number
    excludedFindingPenalty: number
    evidenceQualityScore?: number
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

export function computeMechanicalEvidenceScore(
  h: DiagnosisHypothesis,
  patient: PatientCase,
): { score: number; breakdown: ScoreBreakdown } {
  const kbProfile = findDiseaseByName(h.diagnosis)
  const sources = sourceAgentList(h)
  const agreementScore = specialistAgreementScore(sources)
  const contradictionPen = contradictionPenalty(h)

  const symptomMatch = kbProfile ? symptomMatchScore(kbProfile, patient) : 0
  const excludedPen = kbProfile ? excludedFindingPenalty(kbProfile, patient) : 0

  // Use criteria fulfillment when both the evaluator marked this KB-grounded
  // AND it actually filled in criteria. A criteria-grounded eval with
  // 0/0 criteria (sparse KB profile) falls back to the non-KB track so we
  // don't anchor the score on "0% of zero criteria met".
  const dc = h.diagnosticCriteria
  const hasUsableCriteria = h.knowledgeBaseMatch && dc && dc.totalCriteria > 0

  let raw: number
  let breakdown: ScoreBreakdown

  if (hasUsableCriteria) {
    const criteriaRatio = clamp01(dc.metCriteria / dc.totalCriteria)
    raw =
      0.4 * criteriaRatio +
      0.3 * clamp01(symptomMatch) +
      0.1 * clamp01(agreementScore) -
      0.05 * clamp01(contradictionPen) -
      0.15 * clamp01(excludedPen)
    breakdown = {
      evidenceScoreRaw: raw * 100,
      trackUsed: "kb-grounded",
      components: {
        criteriaFulfillmentRatio: criteriaRatio,
        symptomMatchScore: symptomMatch,
        specialistAgreementScore: agreementScore,
        contradictionPenalty: contradictionPen,
        excludedFindingPenalty: excludedPen,
      },
    }
  } else {
    const evidenceQ = evidenceQualityScore(h)
    raw =
      0.45 * clamp01(symptomMatch) +
      0.3 * clamp01(evidenceQ) +
      0.15 * clamp01(agreementScore) -
      0.1 * clamp01(contradictionPen)
    breakdown = {
      evidenceScoreRaw: raw * 100,
      trackUsed: "non-kb-reasoning",
      components: {
        symptomMatchScore: symptomMatch,
        evidenceQualityScore: evidenceQ,
        specialistAgreementScore: agreementScore,
        contradictionPenalty: contradictionPen,
        excludedFindingPenalty: 0,
      },
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(raw * 100)))
  return { score, breakdown }
}

// Apply downstream-condition penalty: a diagnosis listed as downstreamOf
// another diagnosis (also in the differential) with a higher score is
// demoted by DOWNSTREAM_PENALTY. Returns a new array with updated
// evidenceScore values; does not mutate input.
export function applyDownstreamPenalty(
  hypotheses: DiagnosisHypothesis[],
): DiagnosisHypothesis[] {
  if (hypotheses.length < 2) return hypotheses

  const byNorm = new Map<string, DiagnosisHypothesis>()
  for (const h of hypotheses) byNorm.set(normTerm(h.diagnosis), h)

  return hypotheses.map((h) => {
    const downstreamOf = (h as any)._downstreamOf as string[] | undefined
    if (!downstreamOf || downstreamOf.length === 0) return h
    let demote = false
    for (const cause of downstreamOf) {
      const causeNorm = normTerm(cause)
      const causeHyp = byNorm.get(causeNorm)
      if (causeHyp && causeHyp.evidenceScore > h.evidenceScore) {
        demote = true
        break
      }
    }
    if (!demote) return h
    return {
      ...h,
      evidenceScore: Math.round(h.evidenceScore * DOWNSTREAM_PENALTY),
    }
  })
}

// Replace family-expansion zeros with half the parent diagnosis's score.
// `expansions[i].parentDiagnosis` carries the name of the synth-ranked entry
// whose KB profile listed this variant. If the parent score isn't available,
// fall back to a small constant (10) so the variant doesn't appear as
// "complete miss" when in reality we just don't know.
export function applyFamilyExpansionScoring(
  rankedHypotheses: DiagnosisHypothesis[],
  expansions: DiagnosisHypothesis[],
): DiagnosisHypothesis[] {
  if (expansions.length === 0) return expansions
  const byNorm = new Map<string, DiagnosisHypothesis>()
  for (const h of rankedHypotheses) byNorm.set(normTerm(h.diagnosis), h)

  return expansions.map((ex) => {
    const parentName = (ex as any).parentDiagnosis as string | undefined
    let parentScore = 0
    if (parentName) {
      const p = byNorm.get(normTerm(parentName))
      if (p) parentScore = p.evidenceScore
    }
    const inherited = Math.round(parentScore * FAMILY_EXPANSION_DISCOUNT)
    return {
      ...ex,
      evidenceScore: Math.max(10, inherited),
      confidenceScore: Math.max(10, inherited),
    }
  })
}

// Re-export the qualitative label helper from its client-safe module so
// server-side callers can still import it from one place. Client components
// MUST import from "./score-labels" directly to avoid pulling fs/path in.
export { qualitativeLabel } from "./score-labels"
export type { ScoreLabel } from "./score-labels"
