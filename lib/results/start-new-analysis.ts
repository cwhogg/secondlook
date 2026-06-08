// Helper for the "Start new analysis" buttons. Clears all client-side
// patient data (step forms, extracted symptoms, latest analysis result)
// before navigating back to step 1, so the new flow starts from a clean
// slate. The /testing auth flag is deliberately NOT cleared.

const LOCAL_KEYS = [
  "step1Data",
  "step2Data",
  "step3Data",
  "step4Data",
  "mappedSymptoms",
] as const

const SESSION_KEYS = ["analysisResults", "analysisMetadata"] as const

export function clearAnalysisCache(): void {
  if (typeof window === "undefined") return
  try {
    for (const key of LOCAL_KEYS) localStorage.removeItem(key)
    for (const key of SESSION_KEYS) sessionStorage.removeItem(key)
  } catch (err) {
    console.warn("clearAnalysisCache: failed to clear storage", err)
  }
}

interface RouterLike {
  push: (path: string) => void
}

export function startNewAnalysis(router: RouterLike, target: string = "/step-1"): void {
  clearAnalysisCache()
  router.push(target)
}
