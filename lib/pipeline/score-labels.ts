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

export function qualitativeLabel(score: number): ScoreLabel {
  if (score >= 80) {
    return {
      tier: "strong",
      label: "Strong fit",
      description: "Diagnostic criteria largely met; features map convincingly to this disease.",
    }
  }
  if (score >= 60) {
    return {
      tier: "moderate",
      label: "Moderate fit",
      description: "Most key features present; reasonable diagnostic confidence.",
    }
  }
  if (score >= 40) {
    return {
      tier: "suggestive",
      label: "Suggestive",
      description: "Partial criteria fulfillment or overlap with related diseases.",
    }
  }
  if (score >= 20) {
    return {
      tier: "possible",
      label: "Possible",
      description: "Limited evidence; consider in workup but lower-priority.",
    }
  }
  return {
    tier: "weak",
    label: "Weak fit",
    description: "Mainly listed to exclude; unlikely on current evidence.",
  }
}
