"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { TestCase, TestSuiteStats, GroundTruth, GeneratedPatient } from "@/lib/types/admin"
import type { AnalysisResult, DiagnosisHypothesis } from "@/lib/types/index"
import type { PipelineProgress } from "@/lib/types/pipeline"
import {
  loadTestCases,
  upsertTestCases,
  deleteTestCases,
  awaitTestCaseSaves,
  subscribeToTestCaseSaveErrors,
  computeStats,
  buildPatientCase,
  StatsBanner,
  StatusBadge,
  GradeBadge,
  GroundTruthSection,
  ExtractedSymptomsSection,
  PipelineProgressDisplay,
  StepIndicator,
  PipelineResultsSection,
  GradingSection,
} from "@/components/testing-shared"

interface EvalCase {
  ppkt_id: string
  diagnosis: Array<{ id: string; label: string }>
  case_description: string
  demographics: { age: string; sex: "male" | "female" | "other" }
}

const EVAL_VERSION_COLORS: Record<string, string> = {
  v1: "bg-gray-50 text-gray-700 border-gray-300",
  v2: "bg-blue-50 text-blue-800 border-blue-300",
  v3: "bg-emerald-50 text-emerald-800 border-emerald-300",
  v4: "bg-violet-50 text-violet-800 border-violet-300",
}

function EvalVersionBadge({ version }: { version?: 'v1' | 'v2' | 'v3' | 'v4' }) {
  if (!version) return null
  const cls = EVAL_VERSION_COLORS[version] ?? "bg-gray-50 text-gray-700 border-gray-300"
  return (
    <span className={`px-2 py-0.5 text-xs font-medium border ${cls}`}>
      Eval {version}
    </span>
  )
}

type ModelTab = "secondlook" | "openai" | "claude"
type EvalTab = ModelTab | "runevals"
const MODEL_TABS: ModelTab[] = ["secondlook", "openai", "claude"]

const TAB_LABEL: Record<EvalTab, string> = {
  runevals: "Run Evals",
  secondlook: "SecondLook",
  openai: "OpenAI",
  claude: "Claude",
}

const TAB_SUBTITLE: Record<EvalTab, string> = {
  runevals: "Run the same cases across SecondLook, OpenAI o3, and Claude opus-4-7 in parallel. Cases where any model errors are skipped entirely so each row in the comparison table uses the same denominator.",
  secondlook: "Run real clinical vignettes from the Phenopacket2Prompt dataset through the full SecondLook diagnostic pipeline.",
  openai: "Send each vignette verbatim to OpenAI's top reasoning model (o3, reasoning effort high) and ask for the top 5 differential diagnoses. No pipeline, no KB.",
  claude: "Send each vignette verbatim to Anthropic's top model (claude-opus-4-7) and ask for the top 5 differential diagnoses. No pipeline, no KB.",
}

const tabOf = (tc: TestCase): ModelTab => (tc.evalRunMode as ModelTab) ?? "secondlook"

const MODEL_DISPLAY: Record<ModelTab, string> = {
  secondlook: "SecondLook v3",
  openai: "OpenAI o3",
  claude: "Claude opus-4-7",
}

interface MatchedTrio {
  ppkt_id: string
  diagnosis: string
  secondlook: TestCase
  openai: TestCase
  claude: TestCase
}

// A trio is a categoryHint (ppkt_id) where all three models have graded testCases.
function getMatchedTrios(testCases: TestCase[]): MatchedTrio[] {
  const byHint = new Map<string, Partial<Record<ModelTab, TestCase>>>()
  for (const tc of testCases) {
    if (tc.testVersion !== "Eval") continue
    if (tc.status !== "graded" || !tc.grading) continue
    const mode = tabOf(tc)
    const hint = tc.categoryHint || ""
    if (!hint) continue
    if (!byHint.has(hint)) byHint.set(hint, {})
    byHint.get(hint)![mode] = tc
  }
  const trios: MatchedTrio[] = []
  for (const [ppkt_id, entry] of byHint) {
    if (entry.secondlook && entry.openai && entry.claude) {
      trios.push({
        ppkt_id,
        diagnosis: entry.secondlook.groundTruth?.diagnosis || "(unknown)",
        secondlook: entry.secondlook,
        openai: entry.openai,
        claude: entry.claude,
      })
    }
  }
  // Newest first by SecondLook createdAt (the trio's three testCases share a
  // common timestamp within a few ms, so SecondLook is a fine proxy).
  trios.sort((a, b) => b.secondlook.createdAt.localeCompare(a.secondlook.createdAt))
  return trios
}

function getTrioCohort(testCases: TestCase[]): Record<ModelTab, TestCase[]> {
  const trios = getMatchedTrios(testCases)
  return {
    secondlook: trios.map((t) => t.secondlook),
    openai: trios.map((t) => t.openai),
    claude: trios.map((t) => t.claude),
  }
}

// ppkt_ids that already have a complete graded trio (so the next batch can exclude them).
function getCompleteTrioHints(testCases: TestCase[]): Set<string> {
  return new Set(getMatchedTrios(testCases).map((t) => t.ppkt_id))
}

function synthesizeBaselineResult(
  diagnoses: Array<{ diagnosis: string; reasoning?: string }>,
  sourceAgent: string,
  generationMeta: { model: string; tokensUsed: number; durationMs: number },
): AnalysisResult {
  const hypotheses: DiagnosisHypothesis[] = diagnoses.slice(0, 5).map((d, i) => ({
    diagnosis: d.diagnosis,
    confidenceScore: Math.max(20, 95 - i * 15),
    evidenceScore: Math.max(20, 95 - i * 15),
    rareDisease: false,
    supportingEvidence: [],
    contradictoryEvidence: [],
    clinicalReasoning: d.reasoning || "",
    typicalPresentation: "",
    specialistRequired: "",
    diagnosticCriteria: {
      criteriaName: "Clinical assessment",
      totalCriteria: 0,
      metCriteria: 0,
      criteriaDetails: [],
      fulfillmentPercentage: 0,
    },
    sourceAgent,
    evaluationType: "reasoning-evaluated",
    knowledgeBaseMatch: false,
  }))
  return {
    differentialDiagnoses: hypotheses,
    differentialClusters: [],
    excludedCommonDiagnoses: [],
    dataGaps: [],
    recommendedTesting: [],
    nextSteps: {
      immediateActions: [],
      specialistReferrals: [],
      followUpTiming: "",
      redFlags: [],
    },
    overallAssessment: "",
    pipelineMetadata: {
      pipelineVersion: `baseline-${sourceAgent}`,
      stages: [
        {
          stageName: "baseline-call",
          durationMs: generationMeta.durationMs,
          tokensUsed: generationMeta.tokensUsed,
          model: generationMeta.model,
          agentName: sourceAgent,
          inputSummary: "Verbatim clinical vignette",
          outputSummary: `${hypotheses.length} ranked differential diagnoses`,
        },
      ],
      totalDurationMs: generationMeta.durationMs,
      totalTokensUsed: generationMeta.tokensUsed,
      totalCostEstimate: 0,
      knowledgeBaseVersion: "n/a",
      diseasesConsidered: 0,
      retrievalScores: [],
    },
  } as unknown as AnalysisResult
}

function caseDescriptionToPatient(
  caseDescription: string,
  demographics: EvalCase["demographics"],
): GeneratedPatient {
  return {
    narrative: caseDescription,
    demographics: { age: demographics.age, sex: demographics.sex },
    chiefComplaint: "",
    symptoms: [],
    medicalHistory: {
      pastMedicalHistory: [],
      familyHistory: [],
      currentMedications: [],
      recentTests: [],
    },
  }
}

function buildGroundTruth(evalCase: EvalCase): GroundTruth {
  const top = evalCase.diagnosis[0] || { id: "", label: "Unknown" }
  return {
    diagnosis: top.label,
    icd10: top.id || null,
    keyFindings: [],
    expectedBodySystems: [],
    expectedSpecialists: [],
    nearMisses: [],
  }
}

export default function EvalPage() {
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [passwordInput, setPasswordInput] = useState("")
  const [authError, setAuthError] = useState("")

  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [activeTab, setActiveTab] = useState<EvalTab>("runevals")
  const [activeTestId, setActiveTestId] = useState<string | null>(null)
  const [count, setCount] = useState(5)
  const [isFetchingCases, setIsFetchingCases] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isGrading, setIsGrading] = useState(false)
  const [pipelineEvents, setPipelineEvents] = useState<PipelineProgress[]>([])
  const [progressPercent, setProgressPercent] = useState(0)
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const [stopRequested, setStopRequested] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stopRequestedRef = useRef(false)

  // Trio runner state — drives the new Run Evals tab.
  type TrioModelStatus = "pending" | "running" | "done" | "error"
  interface TrioCaseStatus {
    ppkt_id: string
    secondlook: TrioModelStatus
    openai: TrioModelStatus
    claude: TrioModelStatus
  }
  const [isTrioRunning, setIsTrioRunning] = useState(false)
  const [trioBatchProgress, setTrioBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const [trioCaseStatus, setTrioCaseStatus] = useState<TrioCaseStatus | null>(null)
  const [trioStopRequested, setTrioStopRequested] = useState(false)
  const trioStopRequestedRef = useRef(false)

  // Surface save failures (HTTP 4xx/5xx or network) so silent data loss is
  // visible instead of leaving the user trusting in-memory state.
  useEffect(() => subscribeToTestCaseSaveErrors(setSaveError), [])

  useEffect(() => {
    const authorized = sessionStorage.getItem("testingAuthorized")
    if (authorized === "true") {
      setIsAuthorized(true)
      setAuthChecked(true)
    } else {
      fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "" }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.authorized) {
            setIsAuthorized(true)
            sessionStorage.setItem("testingAuthorized", "true")
          }
          setAuthChecked(true)
        })
        .catch(() => setAuthChecked(true))
    }
  }, [])

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError("")
    try {
      const res = await fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      })
      const data = await res.json()
      if (data.authorized) {
        sessionStorage.setItem("testingAuthorized", "true")
        setIsAuthorized(true)
      } else {
        setAuthError("Invalid password")
      }
    } catch {
      setAuthError("Failed to verify password")
    }
  }

  // Synchronous mirror of testCases. React 18+ defers setState updaters to
  // the next render commit, so any value computed *inside* an updater
  // function is unavailable on the immediately-following line. Reading and
  // writing through this ref instead gives us a guaranteed-current view
  // and a guaranteed-defined value to save.
  const testCasesRef = useRef<TestCase[]>([])

  useEffect(() => {
    loadTestCases().then((loaded) => {
      testCasesRef.current = loaded
      setTestCases(loaded)
    })
  }, [])

  // EXPLICIT save: every helper computes the next array from the ref, writes
  // the ref synchronously, calls setTestCases for the display, and fires
  // upsertTestCases / deleteTestCases with the concrete computed value. No
  // closure-captured nulls, no reference-equality diff.
  const upsertCase = useCallback((tc: TestCase) => {
    const cur = testCasesRef.current
    const idx = cur.findIndex((t) => t.id === tc.id)
    const next = idx === -1 ? [tc, ...cur] : cur.map((t) => (t.id === tc.id ? tc : t))
    testCasesRef.current = next
    setTestCases(next)
    upsertTestCases([tc])
  }, [])
  const patchCase = useCallback((id: string, patch: Partial<TestCase>) => {
    const cur = testCasesRef.current
    const current = cur.find((t) => t.id === id)
    if (!current) return
    const updated = { ...current, ...patch }
    const next = cur.map((t) => (t.id === id ? updated : t))
    testCasesRef.current = next
    setTestCases(next)
    upsertTestCases([updated])
  }, [])
  const removeCaseById = useCallback((id: string) => {
    const next = testCasesRef.current.filter((t) => t.id !== id)
    testCasesRef.current = next
    setTestCases(next)
    deleteTestCases([id])
  }, [])

  const evalCases = testCases.filter((tc) => tc.testVersion === "Eval")
  const tabCases = evalCases.filter((tc) => tabOf(tc) === activeTab)
  // Re-key by evalVersion so the StatsBanner's "Version Summary" splits the
  // current tab's cohort into v1 / v2 / v3.
  const tabCasesForStats = tabCases.map((tc) => ({
    ...tc,
    testVersion: (tc.evalVersion ?? "v1") as TestCase["testVersion"],
  }))
  const evalStats: TestSuiteStats | null = computeStats(tabCasesForStats)

  const activeTest = testCases.find((tc) => tc.id === activeTestId) || null

  const getStepStatus = (step: "fetch" | "pipeline" | "grade"): "pending" | "active" | "done" => {
    if (step === "fetch") {
      if (isFetchingCases) return "active"
      if (isRunning || isGrading) return "done"
      return "pending"
    }
    if (step === "pipeline") {
      if (isRunning) return "active"
      if (isGrading) return "done"
      return "pending"
    }
    if (isGrading) return "active"
    return "pending"
  }

  const isAnyRunning = isFetchingCases || isRunning || isGrading

  const fetchEvalCases = async (n: number): Promise<EvalCase[]> => {
    setIsFetchingCases(true)
    try {
      // Exclude only ppkt_ids already run on the current tab — each tab samples
      // its own cohort, so SecondLook + OpenAI + Claude can all be measured on
      // overlapping cases when desired.
      const existingIds = tabCases.map((tc) => tc.categoryHint).filter(Boolean).join(",")
      const url = `/api/admin/eval-case?count=${n}&exclude=${encodeURIComponent(existingIds)}`
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Eval case fetch failed: ${res.statusText}`)
      }
      const data = await res.json()
      return data.cases as EvalCase[]
    } finally {
      setIsFetchingCases(false)
    }
  }

  const runPipeline = async (testId: string, patient: GeneratedPatient): Promise<AnalysisResult> => {
    setIsRunning(true)
    setPipelineEvents([])
    setProgressPercent(0)

    patchCase(testId, {
      status: "running",
      pipelineResult: undefined,
      grading: undefined,
      gradingMetadata: undefined,
      pipelineError: undefined,
    })

    try {
      setExtractionStatus("Parsing symptoms from narrative...")
      const { patientCase, extractedSymptoms, extractedExcludedFindings } = await buildPatientCase(patient, (msg: string) => setExtractionStatus(msg))
      setExtractionStatus(null)

      patchCase(testId, { extractedSymptoms, extractedExcludedFindings })

      const abortController = new AbortController()
      abortRef.current = abortController

      const response = await fetch("/api/analyze-patient-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientCase),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errorBody = await response.text()
        let errorMessage = `Pipeline failed: ${response.statusText}`
        try {
          const parsed = JSON.parse(errorBody)
          if (parsed.error) errorMessage = parsed.error
        } catch {}
        throw new Error(errorMessage)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let pipelineResult: AnalysisResult | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || ""

        for (const chunk of lines) {
          const dataLine = chunk.trim()
          if (!dataLine.startsWith("data: ")) continue
          const jsonStr = dataLine.slice(6)
          let event: any
          try {
            event = JSON.parse(jsonStr)
          } catch {
            continue
          }

          if (event.type === "progress") {
            const progressEvent: PipelineProgress = {
              stage: event.stage,
              stageNumber: event.stageNumber,
              totalStages: event.totalStages,
              percentage: event.percentage,
              detail: event.detail,
              data: event.data,
            } as PipelineProgress
            setPipelineEvents((prev) => [...prev, progressEvent])
            setProgressPercent(event.percentage)
          } else if (event.type === "result") {
            if (!event.success || !event.analysis) throw new Error("Invalid analysis result from pipeline")
            pipelineResult = event.analysis
            patchCase(testId, { status: "completed", pipelineResult: pipelineResult! })
          } else if (event.type === "error") {
            throw new Error(event.error || "Pipeline error")
          }
        }
        if (pipelineResult) break
      }

      if (!pipelineResult) throw new Error("Pipeline stream ended without a result")
      return pipelineResult
    } catch (err: any) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        patchCase(testId, { status: "error", pipelineError: err.message })
      }
      throw err
    } finally {
      setIsRunning(false)
      abortRef.current = null
    }
  }

  const gradeCase = async (testId: string, groundTruth: GroundTruth, result: AnalysisResult) => {
    setIsGrading(true)
    try {
      const response = await fetch("/api/admin/grade-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groundTruth,
          differentialDiagnoses: result.differentialDiagnoses,
          pipelineMetadata: result.pipelineMetadata,
          familyEnrichments: result.familyEnrichments,
          difficulty: 3,
        }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Grading failed: ${response.statusText}`)
      }
      const data = await response.json()
      patchCase(testId, { status: "graded", grading: data.grading, gradingMetadata: data.gradingMetadata })
    } finally {
      setIsGrading(false)
    }
  }

  const runBaseline = async (
    testId: string,
    evalCase: EvalCase,
    model: "openai" | "claude",
  ): Promise<AnalysisResult> => {
    setIsRunning(true)
    setPipelineEvents([])
    setProgressPercent(0)
    setExtractionStatus(`Calling ${model === "openai" ? "OpenAI (o3)" : "Claude (opus-4-7)"} ...`)

    patchCase(testId, {
      status: "running",
      pipelineResult: undefined,
      grading: undefined,
      gradingMetadata: undefined,
      pipelineError: undefined,
    })

    try {
      const response = await fetch("/api/admin/eval-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ppkt_id: evalCase.ppkt_id,
          caseDescription: evalCase.case_description,
          model,
        }),
      })
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        throw new Error(errBody.error || `Baseline call failed: ${response.statusText}`)
      }
      const data = await response.json()
      const sourceAgent = `${model}-baseline`
      const synth = synthesizeBaselineResult(
        data.diagnoses || [],
        sourceAgent,
        data.generationMetadata || { model, tokensUsed: 0, durationMs: 0 },
      )
      setExtractionStatus(null)
      setProgressPercent(100)
      patchCase(testId, { status: "completed", pipelineResult: synth })
      return synth
    } catch (err: any) {
      setExtractionStatus(null)
      patchCase(testId, { status: "error", pipelineError: err.message })
      throw err
    } finally {
      setIsRunning(false)
    }
  }

  // ===== TRIO RUNNER =====
  // Silent helpers that update testCase state via upsertCase/patchCase but
  // do NOT touch any global display state — they can run in parallel without
  // racing for the same isRunning / extractionStatus / progressPercent slots.

  const runSecondLookForTrio = useCallback(
    async (testId: string, patient: GeneratedPatient, groundTruth: GroundTruth): Promise<void> => {
      patchCase(testId, {
        status: "running",
        pipelineResult: undefined,
        grading: undefined,
        gradingMetadata: undefined,
        pipelineError: undefined,
      })
      const { patientCase, extractedSymptoms, extractedExcludedFindings } = await buildPatientCase(patient)
      patchCase(testId, { extractedSymptoms, extractedExcludedFindings })

      const response = await fetch("/api/analyze-patient-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientCase),
      })
      if (!response.ok) {
        const body = await response.text()
        let msg = `Pipeline ${response.status}`
        try { const j = JSON.parse(body); if (j.error) msg = j.error } catch {}
        throw new Error(msg)
      }
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let result: AnalysisResult | null = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || ""
        for (const chunk of lines) {
          const dataLine = chunk.trim()
          if (!dataLine.startsWith("data: ")) continue
          let event: any
          try { event = JSON.parse(dataLine.slice(6)) } catch { continue }
          if (event.type === "result") {
            if (!event.success || !event.analysis) throw new Error("Invalid analysis result")
            result = event.analysis
          } else if (event.type === "error") {
            throw new Error(event.error || "Pipeline error")
          }
        }
        if (result) break
      }
      if (!result) throw new Error("Pipeline stream ended without a result")
      patchCase(testId, { status: "completed", pipelineResult: result })
      await gradeForTrio(testId, groundTruth, result)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchCase],
  )

  const runBaselineForTrio = useCallback(
    async (testId: string, evalCase: EvalCase, groundTruth: GroundTruth, model: "openai" | "claude"): Promise<void> => {
      patchCase(testId, {
        status: "running",
        pipelineResult: undefined,
        grading: undefined,
        gradingMetadata: undefined,
        pipelineError: undefined,
      })
      const response = await fetch("/api/admin/eval-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ppkt_id: evalCase.ppkt_id,
          caseDescription: evalCase.case_description,
          model,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `${model} ${response.status}`)
      }
      const data = await response.json()
      const sourceAgent = `${model}-baseline`
      const synth = synthesizeBaselineResult(
        data.diagnoses || [],
        sourceAgent,
        data.generationMetadata || { model, tokensUsed: 0, durationMs: 0 },
      )
      patchCase(testId, { status: "completed", pipelineResult: synth })
      await gradeForTrio(testId, groundTruth, synth)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchCase],
  )

  async function gradeForTrio(testId: string, groundTruth: GroundTruth, result: AnalysisResult): Promise<void> {
    const response = await fetch("/api/admin/grade-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groundTruth,
        differentialDiagnoses: result.differentialDiagnoses,
        pipelineMetadata: result.pipelineMetadata,
        familyEnrichments: result.familyEnrichments,
        difficulty: 3,
      }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || `grade-test ${response.status}`)
    }
    const data = await response.json()
    patchCase(testId, { status: "graded", grading: data.grading, gradingMetadata: data.gradingMetadata })
  }

  const handleTrioRun = async () => {
    setError(null)
    setTrioStopRequested(false)
    trioStopRequestedRef.current = false
    setTrioBatchProgress({ current: 1, total: count })
    setIsTrioRunning(true)
    try {
      const completeHints = getCompleteTrioHints(testCases)
      const exclude = [...completeHints].join(",")
      const url = `/api/admin/eval-case?count=${count}&exclude=${encodeURIComponent(exclude)}`
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Eval case fetch failed: ${res.statusText}`)
      }
      const data = await res.json()
      const cases = data.cases as EvalCase[]
      if (cases.length === 0) {
        setError("No eval cases returned")
        return
      }
      for (let i = 0; i < cases.length; i++) {
        if (trioStopRequestedRef.current) break
        setTrioBatchProgress({ current: i + 1, total: cases.length })
        const ec = cases[i]
        const patient = caseDescriptionToPatient(ec.case_description, ec.demographics)
        const groundTruth = buildGroundTruth(ec)
        const now = Date.now()
        const baseTC = {
          createdAt: new Date().toISOString(),
          difficulty: 3,
          categoryHint: ec.ppkt_id,
          testVersion: "Eval" as const,
          evalVersion: "v4" as const,
          status: "generated" as const,
          source: "generated" as const,
          groundTruth,
          generatedPatient: patient,
          generationMetadata: {
            model: "phenopacket2prompt",
            tokensUsed: 0,
            durationMs: 0,
            source: "generated" as const,
          },
        }
        const slTC: TestCase = { ...baseTC, id: `eval_${ec.ppkt_id}_secondlook_${now}`, evalRunMode: "secondlook" }
        const oaTC: TestCase = { ...baseTC, id: `eval_${ec.ppkt_id}_openai_${now}`, evalRunMode: "openai" }
        const clTC: TestCase = { ...baseTC, id: `eval_${ec.ppkt_id}_claude_${now}`, evalRunMode: "claude" }
        upsertCase(slTC)
        upsertCase(oaTC)
        upsertCase(clTC)
        setTrioCaseStatus({ ppkt_id: ec.ppkt_id, secondlook: "running", openai: "running", claude: "running" })

        const setModelStatus = (m: ModelTab, s: TrioModelStatus) =>
          setTrioCaseStatus((prev) => (prev ? { ...prev, [m]: s } : prev))

        const slP = runSecondLookForTrio(slTC.id, patient, groundTruth)
          .then(() => setModelStatus("secondlook", "done"))
          .catch((e) => { setModelStatus("secondlook", "error"); throw e })
        const oaP = runBaselineForTrio(oaTC.id, ec, groundTruth, "openai")
          .then(() => setModelStatus("openai", "done"))
          .catch((e) => { setModelStatus("openai", "error"); throw e })
        const clP = runBaselineForTrio(clTC.id, ec, groundTruth, "claude")
          .then(() => setModelStatus("claude", "done"))
          .catch((e) => { setModelStatus("claude", "error"); throw e })

        const results = await Promise.allSettled([slP, oaP, clP])
        const anyFailed = results.some((r) => r.status === "rejected")
        if (anyFailed) {
          // Skip whole case — clean up all three testCases. Awaiting the
          // save queue here makes the deletes guaranteed-persisted before
          // we move on, even if the user hits refresh right after; without
          // this the deletes can be lost in flight and the cases hang
          // around in storage as partial trios.
          removeCaseById(slTC.id)
          removeCaseById(oaTC.id)
          removeCaseById(clTC.id)
          await awaitTestCaseSaves()
          for (const r of results) {
            if (r.status === "rejected") console.error(`Trio case ${ec.ppkt_id} failed:`, r.reason)
          }
        } else {
          // Also wait for all three graded saves to land before moving on,
          // so the matched-trio comparison reflects this case immediately
          // and a mid-batch refresh never leaves a half-saved trio.
          await awaitTestCaseSaves()
        }
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsTrioRunning(false)
      setTrioBatchProgress(null)
      setTrioCaseStatus(null)
      setTrioStopRequested(false)
      trioStopRequestedRef.current = false
    }
  }

  const handleTrioStop = () => {
    setTrioStopRequested(true)
    trioStopRequestedRef.current = true
  }

  // Legacy per-tab handler — no longer wired to any UI button (run controls
  // moved to the Run Evals tab). Kept so TypeScript stays happy and any
  // future per-tab single-run needs can re-wire it without rewriting.
  const handleRun = async () => {
    if (activeTab === "runevals") return
    const tab = activeTab as ModelTab
    setError(null)
    setActiveTestId(null)
    setPipelineEvents([])
    setProgressPercent(0)
    setExtractionStatus(null)
    setStopRequested(false)
    stopRequestedRef.current = false
    setBatchProgress({ current: 1, total: count })
    try {
      const cases = await fetchEvalCases(count)
      if (cases.length === 0) {
        setError("No eval cases returned from server")
        return
      }
      for (let i = 0; i < cases.length; i++) {
        if (stopRequestedRef.current) break
        setBatchProgress({ current: i + 1, total: cases.length })
        if (i > 0) {
          setPipelineEvents([])
          setProgressPercent(0)
          setExtractionStatus(null)
        }
        const evalCase = cases[i]
        const patient = caseDescriptionToPatient(evalCase.case_description, evalCase.demographics)
        const groundTruth = buildGroundTruth(evalCase)
        const testCase: TestCase = {
          id: `eval_${evalCase.ppkt_id}_${tab}_${Date.now()}`,
          createdAt: new Date().toISOString(),
          difficulty: 3,
          categoryHint: evalCase.ppkt_id,
          testVersion: "Eval",
          evalVersion: "v4",
          evalRunMode: tab,
          status: "generated",
          source: "generated",
          groundTruth,
          generatedPatient: patient,
          generationMetadata: {
            model: "phenopacket2prompt",
            tokensUsed: 0,
            durationMs: 0,
            source: "generated",
          },
        }
        upsertCase(testCase)
        setActiveTestId(testCase.id)
        try {
          const result =
            tab === "secondlook"
              ? await runPipeline(testCase.id, patient)
              : await runBaseline(testCase.id, evalCase, tab)
          if (stopRequestedRef.current) break
          await gradeCase(testCase.id, groundTruth, result)
        } catch (err: any) {
          if (err instanceof DOMException && err.name === "AbortError") break
          console.error(`Eval case ${evalCase.ppkt_id} failed:`, err)
        }
      }
    } catch (err: any) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err.message)
      }
    } finally {
      setBatchProgress(null)
      setStopRequested(false)
      stopRequestedRef.current = false
    }
  }

  const handleStop = () => {
    setStopRequested(true)
    stopRequestedRef.current = true
    if (abortRef.current) abortRef.current.abort()
  }

  const handleDelete = (id: string) => {
    removeCaseById(id)
    if (activeTestId === id) setActiveTestId(null)
  }

  const currentActiveTest = testCases.find((tc) => tc.id === activeTestId) || null

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8b2500]" />
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="bg-white border border-[#d4c5b0] p-8 max-w-sm w-full">
          <h1 className="text-xl font-bold font-serif text-[#2a2a2a] mb-4">Eval Framework</h1>
          <p className="text-sm text-gray-600 mb-6">Enter the password to access the eval framework.</p>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 border border-gray-200 focus:ring-2 focus:ring-[#8b2500] focus:border-transparent text-sm"
              autoFocus
            />
            {authError && <p className="text-red-600 text-sm">{authError}</p>}
            <button
              type="submit"
              className="w-full bg-[#8b2500] text-white py-3 font-semibold text-sm hover:bg-[#6d1d00] transition-colors"
            >
              Access Eval
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-[#2a2a2a]">Clinical Eval Framework</h1>
          <p className="text-sm text-[#8b7355] mt-1">{TAB_SUBTITLE[activeTab]}</p>
        </div>

        {/* Tab switcher. Run Evals tab orchestrates the parallel trio
            runner; the three model tabs are read-only views of their own
            cohort. Always navigable — runs continue in the background. */}
        <div className="border-b border-[#d4c5b0] mb-6 flex flex-wrap gap-1">
          {(["runevals", ...MODEL_TABS] as EvalTab[]).map((tab) => {
            const isModelTab = tab !== "runevals"
            const isRunningHere = isTrioRunning && (isModelTab ? true : true)
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab)
                  setActiveTestId(null)
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? "border-[#8b2500] text-[#8b2500]"
                    : "border-transparent text-[#8b7355] hover:text-[#5a5a5a] hover:border-[#d4c5b0]"
                }`}
              >
                {TAB_LABEL[tab]}
                {isRunningHere && (
                  <span
                    title="A run is in progress"
                    className="ml-2 inline-block w-1.5 h-1.5 bg-[#8b2500] rounded-full animate-pulse align-middle"
                  />
                )}
                {isModelTab && (
                  <span className="ml-2 text-xs text-[#8b7355]">
                    ({evalCases.filter((tc) => tabOf(tc) === tab).length})
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {activeTab !== "runevals" && evalStats && <StatsBanner stats={evalStats} hideDifficultyBreakdown />}

        {saveError && (
          <div className="border border-red-300 bg-red-50 p-3 mb-6 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>
              <span className="font-semibold">Save failed.</span> Your in-memory runs are NOT being persisted to storage. {saveError}. Hard-refresh the page (Cmd+Shift+R) to reload the latest bundle.
            </span>
            <button onClick={() => setSaveError(null)} className="text-red-500 hover:text-red-700 text-xs flex-shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="border border-red-300 bg-red-50 p-3 mb-6 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-xs ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* Run controls — only visible on the Run Evals tab. */}
        {activeTab === "runevals" && (
          <>
            <ComparisonTable testCases={testCases} />
            <div className="border border-[#d4c5b0] bg-white p-4 sm:p-6 mb-6">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[200px]">
                  <label className="block text-xs text-[#8b7355] mb-1">Number of evals to run (randomized)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    disabled={isTrioRunning}
                    className="w-32 border border-[#d4c5b0] px-3 py-2 text-sm bg-white text-[#2a2a2a] focus:outline-none focus:border-[#8b2500] disabled:opacity-50"
                  />
                </div>
                {!isTrioRunning ? (
                  <button
                    onClick={handleTrioRun}
                    className="px-6 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Run {count} eval{count === 1 ? "" : "s"} on all three models
                  </button>
                ) : (
                  <button
                    onClick={handleTrioStop}
                    disabled={trioStopRequested}
                    className="px-6 py-2 bg-[#5a5a5a] text-white text-sm font-medium hover:bg-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {trioStopRequested ? "Stopping after current case..." : "Stop"}
                  </button>
                )}
                <div className="text-xs text-[#8b7355] flex items-center">
                  <span>Matched trios so far: {getTrioCohort(testCases).secondlook.length}</span>
                </div>
              </div>
            </div>
            {isTrioRunning && trioBatchProgress && (
              <div className="border border-[#d4c5b0] bg-white p-5 mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-medium text-[#2a2a2a]">
                    Eval {trioBatchProgress.current} of {trioBatchProgress.total}
                  </span>
                  <div className="flex-1 h-1.5 bg-[#e8ddd0] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#8b2500] rounded-full transition-all duration-300"
                      style={{
                        width: `${((trioBatchProgress.current - 1) / trioBatchProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-[#8b7355]">
                    {trioBatchProgress.current - 1}/{trioBatchProgress.total} done
                  </span>
                </div>
                {trioCaseStatus && (
                  <div className="space-y-2">
                    <div className="text-xs text-[#8b7355]">
                      Case: <span className="font-mono">{trioCaseStatus.ppkt_id}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {MODEL_TABS.map((m) => (
                        <TrioStatusChip key={m} label={MODEL_DISPLAY[m]} status={trioCaseStatus[m]} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <TrioDetailsTable testCases={testCases} />
          </>
        )}

        {/* Legacy inline progress for the per-tab handler (currently unused). */}
        {activeTab !== "runevals" && isAnyRunning && (
          <div className="border border-[#d4c5b0] bg-white p-5 mb-6">
            {batchProgress && batchProgress.total > 1 && (
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-medium text-[#2a2a2a]">
                  Eval {batchProgress.current} of {batchProgress.total}
                </span>
                <div className="flex-1 h-1.5 bg-[#e8ddd0] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#8b2500] rounded-full transition-all duration-300"
                    style={{ width: `${((batchProgress.current - 1) / batchProgress.total) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[#8b7355]">
                  {batchProgress.current - 1}/{batchProgress.total} done
                </span>
              </div>
            )}
            <div className="flex items-center gap-3 mb-4">
              <StepIndicator label="Fetch" status={getStepStatus("fetch")} />
              <div className="flex-1 h-px bg-[#e8ddd0]" />
              <StepIndicator
                label={
                  activeTab === "openai"
                    ? "OpenAI (o3)"
                    : activeTab === "claude"
                      ? "Claude (opus-4-7)"
                      : "Pipeline"
                }
                status={getStepStatus("pipeline")}
              />
              <div className="flex-1 h-px bg-[#e8ddd0]" />
              <StepIndicator label="Grade" status={getStepStatus("grade")} />
            </div>

            {isFetchingCases && (
              <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                Fetching cases from dataset...
              </div>
            )}
            {isRunning && extractionStatus && (
              <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                {extractionStatus}
              </div>
            )}
            {isRunning && !extractionStatus && (
              <PipelineProgressDisplay events={pipelineEvents} percent={progressPercent} />
            )}
            {isGrading && (
              <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                Grading results...
              </div>
            )}
          </div>
        )}

        {/* Active eval detail */}
        {activeTab !== "runevals" && currentActiveTest && (
          <div className="border border-[#d4c5b0] bg-white mb-6">
            <div className="px-4 py-3 border-b border-[#e8ddd0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <h2 className="text-base sm:text-lg font-serif font-bold text-[#2a2a2a] break-words">
                  {currentActiveTest.groundTruth.diagnosis}
                </h2>
                <div className="flex items-center gap-2">
                  <EvalVersionBadge version={currentActiveTest.evalVersion} />
                  <StatusBadge status={currentActiveTest.status} />
                  {currentActiveTest.grading && <GradeBadge grading={currentActiveTest.grading} />}
                </div>
              </div>
              <button
                onClick={() => handleDelete(currentActiveTest.id)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Delete
              </button>
            </div>

            <div className="p-4 space-y-4">
              <GroundTruthSection groundTruth={currentActiveTest.groundTruth} collapsed={false} />

              <div className="border border-[#d4c5b0] bg-[#faf7f3] p-3">
                <div className="text-xs font-semibold text-[#8b7355] uppercase tracking-wider mb-1">
                  Clinical Vignette ({currentActiveTest.categoryHint})
                </div>
                <div className="text-sm text-[#2a2a2a] whitespace-pre-wrap leading-relaxed">
                  {currentActiveTest.generatedPatient.narrative}
                </div>
              </div>

              {currentActiveTest.extractedSymptoms && currentActiveTest.extractedSymptoms.length > 0 && (
                <ExtractedSymptomsSection
                  symptoms={currentActiveTest.extractedSymptoms}
                  excludedFindings={currentActiveTest.extractedExcludedFindings}
                />
              )}

              {isRunning && activeTestId === currentActiveTest.id && (
                <div className="space-y-2">
                  {extractionStatus && (
                    <div className="border border-[#d4c5b0] bg-[#faf7f3] p-3">
                      <div className="text-xs font-semibold text-[#8b7355] uppercase tracking-wider mb-1">
                        Symptom Extraction
                      </div>
                      <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                        <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                        {extractionStatus}
                      </div>
                    </div>
                  )}
                  {!extractionStatus && <PipelineProgressDisplay events={pipelineEvents} percent={progressPercent} />}
                </div>
              )}

              {currentActiveTest.pipelineResult && (
                <PipelineResultsSection result={currentActiveTest.pipelineResult} />
              )}

              {isGrading && activeTestId === currentActiveTest.id && (
                <div className="border border-[#d4c5b0] bg-[#faf7f3] p-3">
                  <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                    Grading results...
                  </div>
                </div>
              )}

              {currentActiveTest.grading && (
                <GradingSection grading={currentActiveTest.grading} previousRun={currentActiveTest.previousRun} />
              )}

              {currentActiveTest.pipelineError && (
                <div className="border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  Pipeline error: {currentActiveTest.pipelineError}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Eval history list for the active model tab. Keyed on activeTab
            so React tears down + rebuilds on tab switch (defends against
            stale DOM reuse that previously leaked rows across tabs). */}
        {activeTab !== "runevals" && tabCases.length > 0 && (
          <div key={`history-${activeTab}`} className="border border-[#d4c5b0] bg-white">
            <div className="px-4 py-3 border-b border-[#e8ddd0]">
              <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">
                {TAB_LABEL[activeTab]} Eval History ({tabCases.length})
              </div>
            </div>
            <div>
              {tabCases.map((tc) => (
                <EvalHistoryRow
                  key={`${activeTab}-${tc.id}`}
                  tc={tc}
                  isActive={tc.id === activeTestId}
                  onClick={() => setActiveTestId(tc.id === activeTestId ? null : tc.id)}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab !== "runevals" && tabCases.length === 0 && !isAnyRunning && (
          <div className="text-center py-16 text-[#8b7355]">
            <div className="text-lg font-serif mb-2">No {TAB_LABEL[activeTab]} eval cases yet</div>
            <div className="text-sm">Switch to the Run Evals tab to start a batch.</div>
          </div>
        )}
      </div>
    </div>
  )
}

function TrioDetailsTable({ testCases }: { testCases: TestCase[] }) {
  const trios = getMatchedTrios(testCases)
  if (trios.length === 0) return null
  return (
    <div className="border border-[#d4c5b0] bg-white mb-6">
      <div className="px-4 py-3 border-b border-[#e8ddd0]">
        <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">
          Per-trio results ({trios.length})
        </div>
        <div className="text-xs text-[#8b7355] mt-1 italic">
          Grade and 0-100 score from each model on each shared case, newest first.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-[#e8ddd0] bg-[#faf7f2]">
              <th className="text-left py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">
                Disease (ground truth)
              </th>
              {MODEL_TABS.map((m) => (
                <th
                  key={m}
                  className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium whitespace-nowrap"
                >
                  {MODEL_DISPLAY[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trios.map((trio) => (
              <tr key={trio.ppkt_id} className="border-b border-[#e8ddd0] last:border-b-0 align-top">
                <td className="py-2.5 px-4 sm:px-5 text-[#2a2a2a] font-serif">
                  {trio.diagnosis}
                  <div className="text-[10px] text-[#8b7355] font-sans mt-0.5">{trio.ppkt_id}</div>
                </td>
                {MODEL_TABS.map((m) => {
                  const tc = trio[m]
                  const g = tc.grading
                  if (!g) return (
                    <td key={m} className="py-2.5 px-4 sm:px-5 text-right text-xs text-[#8b7355]">—</td>
                  )
                  return (
                    <td key={m} className="py-2.5 px-4 sm:px-5 text-right whitespace-nowrap">
                      <span className={`font-bold font-serif ${GRADE_COLOR[g.grade] || "text-gray-600"}`}>
                        {g.grade}
                      </span>
                      <span className="text-[#5a5a5a] tabular-nums ml-2">({g.score})</span>
                      {g.correctDiagnosisRank !== null && g.correctDiagnosisRank !== undefined && (
                        <div className="text-[10px] text-[#8b7355] mt-0.5">rank #{g.correctDiagnosisRank}</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const GRADE_COLOR: Record<string, string> = {
  "A+": "text-green-700",
  A: "text-green-700",
  "A-": "text-green-600",
  "B+": "text-blue-700",
  B: "text-blue-600",
  "B-": "text-blue-500",
  "C+": "text-yellow-700",
  C: "text-yellow-600",
  "C-": "text-yellow-500",
  D: "text-orange-600",
  F: "text-red-600",
}

function TrioStatusChip({ label, status }: { label: string; status: "pending" | "running" | "done" | "error" }) {
  const styles: Record<typeof status, string> = {
    pending: "bg-gray-50 text-gray-500 border-gray-200",
    running: "bg-blue-50 text-blue-700 border-blue-200",
    done: "bg-green-50 text-green-700 border-green-200",
    error: "bg-red-50 text-red-700 border-red-200",
  }
  const icon = status === "done" ? "✓" : status === "error" ? "✗" : status === "running" ? "…" : "•"
  return (
    <div className={`border px-3 py-2 text-xs font-medium flex items-center gap-2 ${styles[status]}`}>
      <span className="inline-block w-4 text-center">{icon}</span>
      <span>{label}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wider opacity-80">{status}</span>
    </div>
  )
}

function ComparisonTable({ testCases }: { testCases: TestCase[] }) {
  const trio = getTrioCohort(testCases)
  const n = trio.secondlook.length
  const rows = MODEL_TABS.map((mode) => ({ mode, stats: computeStats(trio[mode]) }))
  return (
    <div className="border border-[#d4c5b0] bg-white mb-6">
      <div className="px-4 py-3 border-b border-[#e8ddd0]">
        <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">
          Matched-trio comparison ({n} case{n === 1 ? "" : "s"} run on all three models)
        </div>
        <div className="text-xs text-[#8b7355] mt-1 italic">
          Same case denominator per row — only cases where SecondLook, OpenAI, and Claude all returned a graded result.
        </div>
      </div>
      {n === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-[#8b7355]">
          No matched trios yet. Run a batch below to populate this table.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[#e8ddd0] bg-[#faf7f2]">
                <th className="text-left py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Model</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">n</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Avg Score</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-1</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-3</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-5</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ mode, stats }) => (
                <tr key={mode} className="border-b border-[#e8ddd0] last:border-b-0">
                  <td className="py-2.5 px-4 sm:px-5 text-[#2a2a2a] font-medium">{MODEL_DISPLAY[mode]}</td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#5a5a5a] tabular-nums">{stats?.gradedTests ?? 0}</td>
                  <td className="py-2.5 px-4 sm:px-5 text-right font-medium text-[#2a2a2a] tabular-nums">
                    {stats ? stats.avgScore.toFixed(1) : "—"}
                  </td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">
                    {stats ? `${Math.round(stats.top1Rate * 100)}%` : "—"}
                  </td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">
                    {stats ? `${Math.round(stats.top3Rate * 100)}%` : "—"}
                  </td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">
                    {stats ? `${Math.round(stats.top5Rate * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EvalHistoryRow({
  tc,
  isActive,
  onClick,
}: {
  tc: TestCase
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-[#e8ddd0] last:border-b-0 transition-colors ${
        isActive ? "bg-[#faf7f3]" : "hover:bg-[#faf7f3]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <EvalVersionBadge version={tc.evalVersion} />
          <StatusBadge status={tc.status} />
          {tc.grading && <GradeBadge grading={tc.grading} />}
          <span className="text-sm text-[#2a2a2a] truncate font-medium">
            {tc.groundTruth.diagnosis}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#8b7355] flex-shrink-0">
          {tc.grading?.correctDiagnosisRank !== null && tc.grading?.correctDiagnosisRank !== undefined && (
            <span>rank #{tc.grading.correctDiagnosisRank}</span>
          )}
          <span>{new Date(tc.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </button>
  )
}
