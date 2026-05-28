import type { DiseaseMatch } from "../../types/knowledge-base";
import type { SpecialistType } from "../types";
import { SYSTEM_TO_SPECIALIST } from "../types";

/**
 * Compute a domain-fit weight for a disease against a specialty.
 *
 * 1.00 — disease.specialistType explicitly lists this specialty
 * 0.45 — disease has overlapping body systems mapped to this specialty
 *        (covers profiles missing the specialistType tag or labelled too generically)
 * 0.12 — no clear domain link; included only so each specialist sees SOMETHING
 *        when retrieval routes nothing into their domain
 */
function domainFit(match: DiseaseMatch, specialty: SpecialistType): number {
  const specialistTypes = (match.disease.specialistType || []).map((s) => s.toLowerCase());
  if (specialistTypes.some((s) => s.includes(specialty.toLowerCase()))) {
    return 1.0;
  }

  const systemSpecialties = (match.disease.systemsAffected || []).flatMap(
    (sys) => SYSTEM_TO_SPECIALIST[sys] ?? []
  );
  if (systemSpecialties.includes(specialty)) {
    return 0.45;
  }

  return 0.12;
}

/**
 * Rerank a list of candidate diseases for a given specialty by combining the
 * existing retrieval matchScore with a per-specialty domain-fit weight.
 *
 * Returns every candidate with a combined score at or above `minScore`
 * (default 0.15 — clearly above the 0.12 no-link fallback tier, so the
 * threshold rejects junk while keeping all explicit and system-mapped
 * matches with any reasonable retrieval score). Output is sorted descending
 * by combined score.
 *
 * If no candidate clears the threshold (which only happens when nothing in
 * the pool is even loosely domain-relevant), the top `safetyFallback`
 * candidates are returned so the specialist is never handed an empty list.
 */
export function rerankCandidatesForSpecialty(
  candidates: DiseaseMatch[],
  specialty: SpecialistType,
  options: { minScore?: number; safetyFallback?: number } = {}
): DiseaseMatch[] {
  const minScore = options.minScore ?? 0.15;
  const safetyFallback = options.safetyFallback ?? 3;

  const scored = candidates
    .map((match) => ({
      match,
      score: match.matchScore * domainFit(match, specialty),
    }))
    .sort((a, b) => b.score - a.score);

  const passing = scored.filter((entry) => entry.score >= minScore);
  if (passing.length > 0) {
    return passing.map((entry) => entry.match);
  }

  return scored.slice(0, safetyFallback).map((entry) => entry.match);
}
