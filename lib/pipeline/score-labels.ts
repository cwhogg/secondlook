// Client-safe qualitative score labels.
//
// Kept in its own file (no server-only KB imports) so it can be imported
// from React client components without dragging in `fs`/`path` dependencies
// from the scoring formula module.

export interface ScoreLabel {
  tier: "strong" | "moderate" | "suggestive" | "possible" | "weak"
  label: string
  description: string
}

// Cutoffs anchored to the actual range the deterministic formula produces
// (theoretical max 80 KB / 90 non-KB; realistic top-1 ceiling ~65 because a
// vignette never contains 100% symptom match or genetic confirmation).
// Setting "Strong" at 80+ made the top tier mathematically unreachable on
// the KB track. These bands instead reflect "where good fits actually
// land", so the labels are informative on every case rather than skewed
// toward Possible/Weak.
export function qualitativeLabel(score: number): ScoreLabel {
  if (score >= 60) {
    return {
      tier: "strong",
      label: "Strong fit",
      description: "Top candidate well-supported by the evidence at hand; this is the leading diagnosis the data points to.",
    }
  }
  if (score >= 45) {
    return {
      tier: "moderate",
      label: "Moderate fit",
      description: "Clear lead candidate — plausible diagnosis worth pursuing as a primary working hypothesis.",
    }
  }
  if (score >= 30) {
    return {
      tier: "suggestive",
      label: "Suggestive",
      description: "Worth investigating; partial criteria fulfillment or symptom overlap, but lacking confirmation.",
    }
  }
  if (score >= 15) {
    return {
      tier: "possible",
      label: "Possible",
      description: "In the differential to consider; lower-priority but not excluded.",
    }
  }
  return {
    tier: "weak",
    label: "Weak fit",
    description: "Unlikely on current evidence; primarily listed for exclusion.",
  }
}
