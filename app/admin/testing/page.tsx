"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import type {
  TestCase,
  TestSuiteStats,
  GeneratedPatient,
  GroundTruth,
  PatientArchetype,
  PreviousRunSnapshot,
} from "@/lib/types/admin"
import type { AnalysisResult } from "@/lib/types/index"
import type { PipelineProgress } from "@/lib/types/pipeline"
import {
  loadTestCases,
  upsertTestCases,
  deleteTestCases,
  computeStats,
  buildPatientCase,
  StatsBanner,
  DifficultyBadge,
  StatusBadge,
  GroundTruthSection,
  ExtractedSymptomsSection,
  PipelineProgressDisplay,
  StepIndicator,
  PipelineResultsSection,
  GradingSection,
  TestHistoryRow,
  DIFFICULTY_LABELS,
} from "@/components/testing-shared"

// ===== CONSTANTS =====

const CATEGORY_OPTIONS = [
  "",
  "neurological",
  "rheumatological",
  "cardiovascular",
  "hematological",
  "endocrine",
  "gastrointestinal",
  "pulmonary",
  "dermatological",
  "immunological",
  "musculoskeletal",
  "renal",
  "psychiatric",
  "oncological",
]

const ARCHETYPE_LABELS: Record<PatientArchetype, string> = {
  'researcher': 'Researcher',
  'minimizer': 'Minimizer',
  'storyteller': 'Storyteller',
  'frustrated-chronic': 'Frustrated Chronic',
  'anxious': 'Anxious',
  'stoic': 'Stoic',
  'caregiver-proxy': 'Caregiver Proxy',
  'elderly-vague': 'Elderly Vague',
}



function PatientSection({ patient, archetype }: { patient: GeneratedPatient; archetype?: PatientArchetype }) {
  return (
    <div className="border border-[#d4c5b0] bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">Patient Presentation</div>
        {archetype && (
          <span className="inline-block px-2 py-0.5 border border-purple-300 bg-purple-50 text-purple-700 text-xs font-medium">
            {ARCHETYPE_LABELS[archetype] || archetype}
          </span>
        )}
      </div>

      <div className="text-sm text-[#5a5a5a]">
        <span className="font-semibold">Demographics:</span> {patient.demographics.age}yo {patient.demographics.sex}
      </div>

      <div className="bg-[#faf7f3] border border-[#e8ddd0] p-3 text-sm text-[#2a2a2a] italic font-serif leading-relaxed">
        &ldquo;{patient.narrative}&rdquo;
      </div>
    </div>
  )
}

// ===== MAIN PAGE =====

interface RunNewTestCardProps {
  difficulty: number
  setDifficulty: (d: number) => void
  categoryHint: string
  setCategoryHint: (c: string) => void
  testCount: number
  setTestCount: (updater: (c: number) => number) => void
  isAnyRunning: boolean
  isGenerating: boolean
  isRunning: boolean
  isGrading: boolean
  batchProgress: { current: number; total: number } | null
  onRun: () => void
}

function RunNewTestCard(props: RunNewTestCardProps) {
  const {
    difficulty,
    setDifficulty,
    categoryHint,
    setCategoryHint,
    testCount,
    setTestCount,
    isAnyRunning,
    isGenerating,
    isRunning,
    isGrading,
    batchProgress,
    onRun,
  } = props
  const runLabel = isGenerating
    ? batchProgress && batchProgress.total > 1
      ? `Test ${batchProgress.current}/${batchProgress.total}: Generating...`
      : "Generating Patient..."
    : isRunning
      ? batchProgress && batchProgress.total > 1
        ? `Test ${batchProgress.current}/${batchProgress.total}: Pipeline...`
        : "Running Pipeline..."
      : isGrading
        ? batchProgress && batchProgress.total > 1
          ? `Test ${batchProgress.current}/${batchProgress.total}: Grading...`
          : "Grading..."
        : testCount === 1
          ? "Run New Test"
          : `Run ${testCount} New Tests`
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs text-[#8b7355] mb-1">
          Difficulty: {DIFFICULTY_LABELS[difficulty]} ({difficulty})
        </label>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={difficulty}
          onChange={(e) => setDifficulty(parseInt(e.target.value))}
          className="w-full accent-[#8b2500]"
        />
        <div className="flex justify-between text-xs text-[#8b7355] mt-0.5">
          <span>Easy</span>
          <span>Expert</span>
        </div>
      </div>

      <div className="min-w-[160px]">
        <label className="block text-xs text-[#8b7355] mb-1">Category (optional)</label>
        <select
          value={categoryHint}
          onChange={(e) => setCategoryHint(e.target.value)}
          className="w-full border border-[#d4c5b0] px-3 py-2 text-sm bg-white text-[#2a2a2a] focus:outline-none focus:border-[#8b2500]"
        >
          <option value="">Any</option>
          {CATEGORY_OPTIONS.filter(Boolean).map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center">
        <button
          onClick={() => setTestCount((c) => Math.max(1, c - 1))}
          disabled={isAnyRunning || testCount <= 1}
          className="px-2.5 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-r border-[#6d1d00]"
          aria-label="Decrease test count"
        >
          −
        </button>
        <button
          onClick={onRun}
          disabled={isAnyRunning}
          className="px-6 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {runLabel}
        </button>
        <button
          onClick={() => setTestCount((c) => Math.min(10, c + 1))}
          disabled={isAnyRunning || testCount >= 10}
          className="px-2.5 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-l border-[#6d1d00]"
          aria-label="Increase test count"
        >
          +
        </button>
      </div>
    </div>
  )
}

// v29 trio mode helpers. After the SL pipeline + grade complete on a
// generated patient, we also send the same patient narrative VERBATIM
// to OpenAI o3 and Claude Opus 4.7 as single-shot baselines. The
// baselines produce their own ranked differentials which we persist as
// sibling TestCase records (testVersion: 'v29-oai-baseline' / 'v29-claude-baseline')
// linked to the parent SL test via baselineOf. Same grader runs against
// each so the trio comparison shows up in the test-history table.
function synthesizeBaselineResult(
  diagnoses: Array<{ diagnosis: string; reasoning?: string }>,
  sourceAgent: string,
  generationMeta: { model: string; tokensUsed: number; durationMs: number },
): AnalysisResult {
  const hypotheses = diagnoses.slice(0, 5).map((d, i) => ({
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
    evaluationType: "reasoning-evaluated" as const,
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
          inputSummary: "Verbatim generated patient narrative",
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

export default function AdminPage() {
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [passwordInput, setPasswordInput] = useState("")
  const [authError, setAuthError] = useState("")

  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [activeTestId, setActiveTestId] = useState<string | null>(null)
  // Which version groups in Test History are expanded. Empty = "use default"
  // (newest group expanded, all others collapsed). User clicks transition this
  // out of the default state into an explicit selection.
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set())
  // v29 trio history grader view: 'v3' = LLM tier grader (correctDiagnosisRank
  // + score), 'v4' = Mondo paper-faithful grader (v4Grading.firstCorrectRank +
  // top1/3/10). Toggle persists for the session only.
  const [gradeView, setGradeView] = useState<"v3" | "v4">("v3")
  const [difficulty, setDifficulty] = useState(2)
  const [categoryHint, setCategoryHint] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isGrading, setIsGrading] = useState(false)
  const [isRerunning, setIsRerunning] = useState(false)
  const [pipelineEvents, setPipelineEvents] = useState<PipelineProgress[]>([])
  const [progressPercent, setProgressPercent] = useState(0)
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testCount, setTestCount] = useState(1)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)


  // Check auth on mount
  useEffect(() => {
    const authorized = sessionStorage.getItem("testingAuthorized")
    if (authorized === "true") {
      setIsAuthorized(true)
      setAuthChecked(true)
    } else {
      // Check if password is even required
      fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "" }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.authorized) {
            // No password configured
            setIsAuthorized(true)
            sessionStorage.setItem("testingAuthorized", "true")
          }
          setAuthChecked(true)
        })
        .catch(() => {
          setAuthChecked(true)
        })
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
        // Persist the password so subsequent mutation calls (eg. test-cases
        // POST via testing-shared) can send the x-admin-password header.
        sessionStorage.setItem("adminTestingPassword", passwordInput)
        setIsAuthorized(true)
      } else {
        setAuthError("Invalid password")
      }
    } catch {
      setAuthError("Failed to verify password")
    }
  }

  // Synchronous mirror of testCases. React 18+ defers setState updaters to
  // the next render commit, so any value computed inside an updater
  // function is unavailable on the immediately-following line — which is
  // why the previous patchCase implementation silently dropped every save
  // after the initial upsertCase. Read and write through the ref instead.
  const testCasesRef = useRef<TestCase[]>([])

  useEffect(() => {
    loadTestCases(0, 300).then((res) => {
      testCasesRef.current = res.cases
      setTestCases(res.cases)
    })
  }, [])

  // EXPLICIT save helpers — each computes the next array from the ref,
  // writes the ref synchronously, calls setTestCases for the display, then
  // dispatches upsertTestCases / deleteTestCases with the concrete value.
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

  const activeTest = testCases.find((tc) => tc.id === activeTestId) || null
  const stats = computeStats(testCases)

  const getStepStatus = (step: "generate" | "pipeline" | "grade"): "pending" | "active" | "done" => {
    if (step === "generate") {
      if (isGenerating) return "active"
      if (isRunning || isGrading) return "done"
      return "pending"
    }
    if (step === "pipeline") {
      if (isRunning) return "active"
      if (isGrading) return "done"
      return "pending"
    }
    // grade
    if (isGrading) return "active"
    return "pending"
  }

  const isAnyRunning = isGenerating || isRunning || isGrading

  // ===== CORE HELPERS =====

  const doGenerate = async (): Promise<TestCase> => {
    setIsGenerating(true)
    try {
      const response = await fetch("/api/admin/generate-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          difficulty,
          categoryHint: categoryHint || undefined,
          excludeDiseases: testCases.map((tc) => tc.groundTruth?.diagnosis).filter((d): d is string => typeof d === "string"),
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Generation failed: ${response.statusText}`)
      }

      const data = await response.json()

      const newCase: TestCase = {
        id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        createdAt: new Date().toISOString(),
        difficulty,
        categoryHint: categoryHint || undefined,
        testVersion: 'v29' as const,
        status: "generated",
        source: "generated",
        groundTruth: data.groundTruth,
        generatedPatient: data.patient,
        generationMetadata: data.generationMetadata,
      }

      upsertCase(newCase)
      setActiveTestId(newCase.id)
      return newCase
    } finally {
      setIsGenerating(false)
    }
  }

  const doRunPipeline = async (testId: string, patient: GeneratedPatient): Promise<AnalysisResult> => {
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
      setExtractionStatus("Starting symptom extraction...")
      const { patientCase, extractedSymptoms, extractedExcludedFindings } = await buildPatientCase(patient, (msg) => {
        setExtractionStatus(msg)
      })
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
            if (!event.success || !event.analysis) {
              throw new Error("Invalid analysis result from pipeline")
            }

            pipelineResult = event.analysis

            patchCase(testId, { status: "completed", pipelineResult: pipelineResult! })
          } else if (event.type === "error") {
            throw new Error(event.error || "Pipeline error")
          }
        }
        if (pipelineResult) break
      }

      if (!pipelineResult) {
        throw new Error("Pipeline stream ended without a result")
      }

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

  const doGrade = async (
    testId: string,
    groundTruth: GroundTruth,
    pipelineResult: AnalysisResult,
    testDifficulty: number
  ): Promise<void> => {
    setIsGrading(true)
    try {
      const response = await fetch("/api/admin/grade-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groundTruth,
          differentialDiagnoses: pipelineResult.differentialDiagnoses,
          pipelineMetadata: pipelineResult.pipelineMetadata,
          familyEnrichments: pipelineResult.familyEnrichments,
          difficulty: testDifficulty,
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

  // ===== HANDLERS =====

  // v29 trio: after the SL pipeline + grade complete on a generated
  // patient, hit /api/admin/eval-baseline twice (OpenAI o3 single-shot,
  // Claude Opus single-shot) with the same VERBATIM patient narrative,
  // synthesize the responses as AnalysisResult shapes, persist sibling
  // TestCase records, and grade each so the test-history table shows
  // SL / OAI / Claude side-by-side on identical input. Fail-soft: any
  // baseline error gets logged into pipelineError on the sibling
  // record but never interrupts the SL test.
  const runBaselineSibling = async (
    parentCase: TestCase,
    model: "openai" | "claude",
  ): Promise<void> => {
    const sourceAgent = `${model}-baseline`
    const versionTag = (model === "openai" ? "v29-oai-baseline" : "v29-claude-baseline") as TestCase["testVersion"]
    const siblingId = `test_${Date.now()}_${model}_${Math.random().toString(36).substr(2, 6)}`
    const siblingCase: TestCase = {
      id: siblingId,
      createdAt: new Date().toISOString(),
      difficulty: parentCase.difficulty,
      categoryHint: parentCase.categoryHint,
      testVersion: versionTag,
      status: "running",
      source: "generated",
      groundTruth: parentCase.groundTruth,
      generatedPatient: parentCase.generatedPatient,
      baselineOf: parentCase.id,
    } as TestCase
    upsertCase(siblingCase)

    try {
      const res = await fetch("/api/admin/eval-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ppkt_id: siblingId,
          caseDescription: parentCase.generatedPatient.narrative,
          model,
        }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(`${model} baseline ${res.status}: ${txt.slice(0, 200)}`)
      }
      const data = await res.json()
      const synth = synthesizeBaselineResult(
        data.diagnoses || [],
        sourceAgent,
        data.generationMetadata || { model, tokensUsed: 0, durationMs: 0 },
      )
      patchCase(siblingId, { status: "completed", pipelineResult: synth })
      // Grade via the same /api/admin/grade-test endpoint the SL test
      // uses so scores are directly comparable.
      const gradeRes = await fetch("/api/admin/grade-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groundTruth: parentCase.groundTruth,
          differentialDiagnoses: synth.differentialDiagnoses,
          pipelineMetadata: synth.pipelineMetadata,
          familyEnrichments: synth.familyEnrichments,
          difficulty: parentCase.difficulty,
        }),
      })
      if (!gradeRes.ok) {
        const body = await gradeRes.json().catch(() => ({}))
        throw new Error(body.error || `grade-test ${gradeRes.status}`)
      }
      const graded = await gradeRes.json()
      patchCase(siblingId, {
        status: "graded",
        grading: graded.grading,
        gradingMetadata: graded.gradingMetadata,
      })
    } catch (err: any) {
      patchCase(siblingId, { status: "error", pipelineError: err?.message || "unknown" })
    }
  }

  const handleRunNewTest = async () => {
    const total = testCount
    setError(null)
    setActiveTestId(null)
    setPipelineEvents([])
    setProgressPercent(0)
    setExtractionStatus(null)
    if (total > 1) setBatchProgress({ current: 1, total })
    try {
      for (let i = 0; i < total; i++) {
        if (i > 0) {
          setPipelineEvents([])
          setProgressPercent(0)
          setExtractionStatus(null)
        }
        if (total > 1) setBatchProgress({ current: i + 1, total })
        const newCase = await doGenerate()
        const result = await doRunPipeline(newCase.id, newCase.generatedPatient)
        await doGrade(newCase.id, newCase.groundTruth, result, newCase.difficulty)
        // v29 trio: run baselines in parallel after SL completes. Don't
        // await — let them grade in the background while the next SL
        // generation kicks off. Errors are caught and persisted to the
        // sibling testCase row, never bubbled to interrupt the SL loop.
        const parentForBaselines = testCasesRef.current.find((tc) => tc.id === newCase.id) || newCase
        runBaselineSibling(parentForBaselines, "openai").catch(() => {})
        runBaselineSibling(parentForBaselines, "claude").catch(() => {})
      }
    } catch (err: any) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err.message)
      }
    } finally {
      setBatchProgress(null)
    }
  }

  const snapshotPreviousRun = (tc: TestCase) => {
    if (tc.grading) {
      const snapshot: PreviousRunSnapshot = {
        score: tc.grading.score,
        grade: tc.grading.grade,
        correctDiagnosisRank: tc.grading.correctDiagnosisRank,
        inTop3: tc.grading.inTop3,
        inTop5: tc.grading.inTop5,
        ranAt: new Date().toISOString(),
        gradingVersion: tc.grading.gradingVersion,
      }
      patchCase(tc.id, {
        previousRun: snapshot,
        pipelineResult: undefined,
        grading: undefined,
        gradingMetadata: undefined,
        pipelineError: undefined,
      })
    }
  }

  const handleRerun = async () => {
    if (!activeTest) return
    setError(null)
    setIsRerunning(true)
    setPipelineEvents([])
    setProgressPercent(0)
    setExtractionStatus(null)
    try {
      snapshotPreviousRun(activeTest)
      const result = await doRunPipeline(activeTest.id, activeTest.generatedPatient)
      await doGrade(activeTest.id, activeTest.groundTruth, result, activeTest.difficulty)
    } catch (err: any) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err.message)
      }
    } finally {
      setIsRerunning(false)
    }
  }

  const handleRegrade = async () => {
    if (!activeTest?.pipelineResult?.differentialDiagnoses?.length) {
      setError("No pipeline results to grade")
      return
    }
    setError(null)
    try {
      await doGrade(activeTest.id, activeTest.groundTruth, activeTest.pipelineResult, activeTest.difficulty)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // ===== DELETE =====
  const handleDelete = (id: string) => {
    removeCaseById(id)
    if (activeTestId === id) setActiveTestId(null)
  }

  // Re-read active test from updated state
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
          <h1 className="text-xl font-bold font-serif text-[#2a2a2a] mb-4">Testing Framework</h1>
          <p className="text-sm text-gray-600 mb-6">Enter the password to access the testing framework.</p>
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
              Access Testing
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/admin" className="inline-block text-sm text-[#8b2500] hover:underline mb-4">
          ← Admin
        </Link>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-[#2a2a2a]">Clinical Testing Framework</h1>
          <p className="text-sm text-[#8b7355] mt-1">
            Generate synthetic patients, run the diagnostic pipeline, and grade accuracy
          </p>
        </div>

        {/* Stats Banner — Run New Test card sits inside it, between the
            top metric row and the difficulty-vs-version breakdown table */}
        {stats ? (
          <StatsBanner
            stats={stats}
            slotBetween={
              <div className="p-4 sm:p-6">
                <RunNewTestCard
                  difficulty={difficulty}
                  setDifficulty={setDifficulty}
                  categoryHint={categoryHint}
                  setCategoryHint={setCategoryHint}
                  testCount={testCount}
                  setTestCount={setTestCount}
                  isAnyRunning={isAnyRunning}
                  isGenerating={isGenerating}
                  isRunning={isRunning}
                  isGrading={isGrading}
                  batchProgress={batchProgress}
                  onRun={handleRunNewTest}
                />
              </div>
            }
          />
        ) : (
          <div className="border border-[#d4c5b0] bg-white p-4 sm:p-6 mb-6">
            <RunNewTestCard
              difficulty={difficulty}
              setDifficulty={setDifficulty}
              categoryHint={categoryHint}
              setCategoryHint={setCategoryHint}
              testCount={testCount}
              setTestCount={setTestCount}
              isAnyRunning={isAnyRunning}
              isGenerating={isGenerating}
              isRunning={isRunning}
              isGrading={isGrading}
              batchProgress={batchProgress}
              onRun={handleRunNewTest}
            />
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="border border-red-300 bg-red-50 p-3 mb-6 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-xs ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* Inline progress when running */}
        {isAnyRunning && (
          <div className="border border-[#d4c5b0] bg-white p-5 mb-6">
            {/* Batch progress */}
            {batchProgress && batchProgress.total > 1 && (
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-medium text-[#2a2a2a]">
                  Test {batchProgress.current} of {batchProgress.total}
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
            {/* Step indicators */}
            <div className="flex items-center gap-3 mb-4">
              {!isRerunning && (
                <>
                  <StepIndicator label="Generate" status={getStepStatus("generate")} />
                  <div className="flex-1 h-px bg-[#e8ddd0]" />
                </>
              )}
              <StepIndicator label="Pipeline" status={getStepStatus("pipeline")} />
              <div className="flex-1 h-px bg-[#e8ddd0]" />
              <StepIndicator label="Grade" status={getStepStatus("grade")} />
            </div>

            {/* Detail area */}
            {isGenerating && (
              <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                Generating patient case...
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

        {/* Active Test Detail */}
        {currentActiveTest && (
          <div className="border border-[#d4c5b0] bg-white mb-6">
            <div className="px-4 py-3 border-b border-[#e8ddd0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <h2 className="text-base sm:text-lg font-serif font-bold text-[#2a2a2a] break-words">
                  {currentActiveTest.groundTruth?.diagnosis ?? "(no ground truth)"}
                </h2>
                <div className="flex items-center gap-2">
                  <DifficultyBadge difficulty={currentActiveTest.difficulty} />
                  <StatusBadge status={currentActiveTest.status} />
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
              {/* Ground Truth */}
              <GroundTruthSection groundTruth={currentActiveTest.groundTruth} collapsed={false} />

              {/* Patient Presentation */}
              <PatientSection
                patient={currentActiveTest.generatedPatient}
                archetype={currentActiveTest.generationMetadata?.archetype}
              />

              {/* Extracted Symptoms (after pipeline has run extraction) */}
              {currentActiveTest.extractedSymptoms && currentActiveTest.extractedSymptoms.length > 0 && (
                <ExtractedSymptomsSection
                  symptoms={currentActiveTest.extractedSymptoms}
                  excludedFindings={currentActiveTest.extractedExcludedFindings}
                />
              )}

              {/* Rerun — for completed, graded, or error states */}
              {(currentActiveTest.status === "completed" || currentActiveTest.status === "graded" || currentActiveTest.status === "error") && !isAnyRunning && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRerun}
                    disabled={isAnyRunning}
                    className="px-6 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Rerun
                  </button>
                  {currentActiveTest.pipelineError && (
                    <span className="text-sm text-red-600">Error: {currentActiveTest.pipelineError}</span>
                  )}
                </div>
              )}

              {/* Extraction + Pipeline Progress (while running) */}
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

              {/* Pipeline Results */}
              {currentActiveTest.pipelineResult && (
                <PipelineResultsSection result={currentActiveTest.pipelineResult} />
              )}

              {/* Grading progress indicator */}
              {isGrading && activeTestId === currentActiveTest.id && (
                <div className="border border-[#d4c5b0] bg-[#faf7f3] p-3">
                  <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                    Grading results...
                  </div>
                </div>
              )}

              {/* Grading Results */}
              {currentActiveTest.grading && <GradingSection grading={currentActiveTest.grading} previousRun={currentActiveTest.previousRun} />}

              {/* Re-grade button — for already graded tests or completed tests that failed grading */}
              {currentActiveTest.pipelineResult?.differentialDiagnoses?.length && !isGrading && !isRunning && !isGenerating && (
                <button
                  onClick={handleRegrade}
                  className="px-4 py-1.5 border border-[#d4c5b0] text-[#8b7355] text-xs font-medium hover:bg-[#faf7f3] transition-colors"
                >
                  {currentActiveTest.grading ? "Re-grade" : "Grade Results"}
                </button>
              )}

              {/* Metadata footer */}
              <div className="text-xs text-[#8b7355] pt-2 border-t border-[#e8ddd0] flex flex-wrap gap-4">
                <span>
                  Generated: {currentActiveTest.generationMetadata.model} &middot;{" "}
                  {currentActiveTest.generationMetadata.tokensUsed} tokens &middot;{" "}
                  {(currentActiveTest.generationMetadata.durationMs / 1000).toFixed(1)}s
                </span>
                {currentActiveTest.gradingMetadata && (
                  <span>
                    Graded: {currentActiveTest.gradingMetadata.model} &middot;{" "}
                    {currentActiveTest.gradingMetadata.tokensUsed} tokens &middot;{" "}
                    {(currentActiveTest.gradingMetadata.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Test History — grouped by testVersion, collapsible per group.
            Newest version auto-expands on first render; older groups stay
            collapsed by default. Click any group header to toggle. */}
        {testCases.length > 0 && (() => {
          // Group testCases by testVersion (treat undefined as "v1" to match
          // the historical default used by TestHistoryRow).
          const byVersion = new Map<string, TestCase[]>()
          for (const tc of testCases) {
            const v = tc.testVersion ?? "v1"
            if (!byVersion.has(v)) byVersion.set(v, [])
            byVersion.get(v)!.push(tc)
          }

          // v29 cutoff: pre-v29 rows are aggregated to summary stats only.
          // Per-case rows are hidden so the test history is focused on the
          // current architecture's results. The summary table below the
          // header surfaces the historical aggregates so prior versions are
          // still visible for trend comparison.
          const isV29Plus = (v: string) => v === "v29" || v.startsWith("v29-")
          // Newest-first version order. Parser handles "v1".."v23", "v23.1",
          // and falls back to lexical compare for anything non-numeric (e.g.,
          // "Eval", which we want to bucket separately at the end).
          const parseVer = (k: string): { ver: number; sub: number } => {
            const m = k.match(/^v(\d+)(?:\.(\d+))?$/i)
            if (!m) return { ver: -1, sub: 0 }
            return { ver: parseInt(m[1], 10), sub: m[2] ? parseInt(m[2], 10) : 0 }
          }
          const versions = Array.from(byVersion.keys()).sort((a, b) => {
            const pa = parseVer(a)
            const pb = parseVer(b)
            if (pb.ver !== pa.ver) return pb.ver - pa.ver
            return pb.sub - pa.sub
          })
          // Pre-v29 summary table data — aggregate stats per version, no
          // individual rows.
          const preV29Versions = versions.filter((v) => !isV29Plus(v))
          const v29PlusVersions = versions.filter(isV29Plus)
          const versionAggregate = (cs: TestCase[]) => {
            const graded = cs.filter((c) => c.status === "graded" && c.grading)
            if (graded.length === 0) return null
            const top1 = graded.filter((c) => c.grading!.correctDiagnosisRank === 1).length
            const top3 = graded.filter((c) => c.grading!.inTop3).length
            const top5 = graded.filter((c) => c.grading!.inTop5).length
            const top10 = graded.filter((c) => {
              const r = c.grading!.correctDiagnosisRank
              return typeof r === "number" && r <= 10
            }).length
            const avgScore =
              graded.reduce((a, c) => a + c.grading!.score, 0) / graded.length
            return {
              count: cs.length,
              graded: graded.length,
              avgScore,
              top1Rate: top1 / graded.length,
              top3Rate: top3 / graded.length,
              top5Rate: top5 / graded.length,
              top10Rate: top10 / graded.length,
            }
          }

          return (
            <div className="space-y-4">
              {/* Pre-v29 summary table — aggregate stats only, no per-case
                  detail. Architecture before v29 differed enough that
                  individual results are no longer apples-to-apples; the
                  aggregates remain useful for trend tracking. */}
              {preV29Versions.length > 0 && (
                <div className="border border-[#d4c5b0] bg-white">
                  <div className="px-4 py-3 border-b border-[#e8ddd0]">
                    <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">
                      Pre-v29 Versions — Summary Stats
                    </div>
                    <p className="text-[11px] text-[#8b7355] mt-0.5">
                      Per-case detail hidden. Individual results from architectures before v29 are not directly comparable to current runs.
                    </p>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-[#faf7f3] text-[10px] uppercase tracking-wider text-[#8b7355]">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold">Version</th>
                        <th className="text-right px-3 py-2 font-semibold">n graded</th>
                        <th className="text-right px-3 py-2 font-semibold">Top-1</th>
                        <th className="text-right px-3 py-2 font-semibold">Top-3</th>
                        <th className="text-right px-3 py-2 font-semibold">Top-5</th>
                        <th className="text-right px-3 py-2 font-semibold">Top-10</th>
                        <th className="text-right px-3 py-2 font-semibold">Avg score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preV29Versions.map((v) => {
                        const agg = versionAggregate(byVersion.get(v)!)
                        if (!agg) return null
                        return (
                          <tr key={v} className="border-t border-[#e8ddd0] text-[#2a2a2a]">
                            <td className="px-4 py-2 font-mono font-semibold">{v}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{agg.graded}/{agg.count}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{Math.round(agg.top1Rate * 100)}%</td>
                            <td className="px-3 py-2 text-right tabular-nums">{Math.round(agg.top3Rate * 100)}%</td>
                            <td className="px-3 py-2 text-right tabular-nums">{Math.round(agg.top5Rate * 100)}%</td>
                            <td className="px-3 py-2 text-right tabular-nums">{Math.round(agg.top10Rate * 100)}%</td>
                            <td className="px-3 py-2 text-right tabular-nums">{agg.avgScore.toFixed(1)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* v29 trio-mode history: group SL + OAI + Claude rows by
                  parent (baselineOf back-pointer). One row per "trio
                  test" instead of three separate version sections.
                  Comparative stats panel above the table aggregates
                  Top-N per model so SL vs OAI vs Claude is one glance. */}
              {(() => {
                const v29All = v29PlusVersions.flatMap((v) => byVersion.get(v)!)
                if (v29All.length === 0) {
                  return (
                    <div className="border border-[#d4c5b0] bg-white">
                      <div className="px-4 py-3 border-b border-[#e8ddd0]">
                        <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">
                          v29 Trio History
                        </div>
                      </div>
                      <div className="px-4 py-6 text-center text-sm text-[#8b7355]">
                        No v29 tests yet — click <strong>Run New Test</strong> above to generate the first trio.
                      </div>
                    </div>
                  )
                }

                const slCases = v29All.filter((tc) => tc.testVersion === "v29")
                const oaiCases = v29All.filter((tc) => tc.testVersion === "v29-oai-baseline")
                const claudeCases = v29All.filter((tc) => tc.testVersion === "v29-claude-baseline")
                const modelStats = (cs: TestCase[]) => {
                  if (gradeView === "v3") {
                    const graded = cs.filter((c) => c.status === "graded" && c.grading)
                    if (graded.length === 0) return null
                    return {
                      count: cs.length,
                      graded: graded.length,
                      top1: graded.filter((c) => c.grading!.correctDiagnosisRank === 1).length / graded.length,
                      top3: graded.filter((c) => c.grading!.inTop3).length / graded.length,
                      top5: graded.filter((c) => c.grading!.inTop5).length / graded.length,
                      top10: graded.filter((c) => {
                        const r = c.grading!.correctDiagnosisRank
                        return typeof r === "number" && r <= 10
                      }).length / graded.length,
                      avgScore: graded.reduce((a, c) => a + c.grading!.score, 0) / graded.length,
                    }
                  }
                  // v4 view — Mondo paper-faithful grader.
                  const graded = cs.filter((c) => c.v4Grading)
                  if (graded.length === 0) return null
                  return {
                    count: cs.length,
                    graded: graded.length,
                    top1: graded.filter((c) => c.v4Grading!.top1).length / graded.length,
                    top3: graded.filter((c) => c.v4Grading!.top3).length / graded.length,
                    // v4 has no Top-5; show Full Top-1 in its place so the column
                    // still carries information.
                    top5: graded.filter((c) => c.v4Grading!.top1Full).length / graded.length,
                    top10: graded.filter((c) => c.v4Grading!.top10).length / graded.length,
                    avgScore:
                      // For v4 there's no single 0-100 score; show the grounding
                      // rate (groundedCount / totalCount averaged) in the Avg
                      // column. Useful diagnostic when fuzzy stage missed a lot.
                      graded.reduce(
                        (a, c) => a + (c.v4Grading!.totalCount > 0 ? c.v4Grading!.groundedCount / c.v4Grading!.totalCount : 0),
                        0,
                      ) / graded.length * 100,
                  }
                }
                const stats = {
                  sl: modelStats(slCases),
                  oai: modelStats(oaiCases),
                  claude: modelStats(claudeCases),
                }

                // Group by trio parent. SL records are the parent
                // (baselineOf undefined, id === parentId). OAI/Claude
                // siblings point at the SL parent via baselineOf.
                type Trio = { sl?: TestCase; oai?: TestCase; claude?: TestCase; parentId: string; createdAt: string }
                const trioMap = new Map<string, Trio>()
                for (const tc of v29All) {
                  const parentId = tc.baselineOf || tc.id
                  if (!trioMap.has(parentId)) {
                    trioMap.set(parentId, { parentId, createdAt: tc.createdAt })
                  }
                  const t = trioMap.get(parentId)!
                  if (tc.testVersion === "v29") {
                    t.sl = tc
                    t.createdAt = tc.createdAt
                  } else if (tc.testVersion === "v29-oai-baseline") t.oai = tc
                  else if (tc.testVersion === "v29-claude-baseline") t.claude = tc
                }
                const trios = Array.from(trioMap.values()).sort((a, b) =>
                  b.createdAt.localeCompare(a.createdAt),
                )

                const gradeCell = (tc?: TestCase) => {
                  if (!tc) return <span className="text-[#c4b89f]">—</span>
                  if (tc.status === "running") return <span className="text-[#8b7355]">…</span>
                  if (tc.status === "error") return <span className="text-red-600">err</span>
                  if (gradeView === "v3") {
                    if (!tc.grading) return <span className="text-[#c4b89f]">·</span>
                    const r = tc.grading.correctDiagnosisRank
                    const rankText = r === null || r === undefined ? "miss" : `#${r}`
                    const color =
                      r === 1
                        ? "text-emerald-700"
                        : typeof r === "number" && r <= 5
                          ? "text-amber-700"
                          : "text-red-600"
                    return (
                      <span className={`${color} font-mono text-xs`}>
                        {rankText} <span className="text-[#8b7355]">·</span> {tc.grading.score.toFixed(0)}
                      </span>
                    )
                  }
                  // v4 view
                  if (!tc.v4Grading) return <span className="text-[#c4b89f]" title="v4 grader not yet run on this case">·</span>
                  const r = tc.v4Grading.firstCorrectRank
                  const isFull = typeof r === "number" && tc.v4Grading.firstFullCreditRank === r
                  const rankText = r === null || r === undefined ? "miss" : `#${r}`
                  const color =
                    r === 1
                      ? "text-emerald-700"
                      : typeof r === "number" && r <= 3
                        ? "text-amber-700"
                        : typeof r === "number" && r <= 10
                          ? "text-amber-600"
                          : "text-red-600"
                  const fullBadge = isFull ? (
                    <span className="text-emerald-600 ml-1" title="FULL credit (exact OMIM match)">●</span>
                  ) : null
                  return (
                    <span className={`${color} font-mono text-xs`} title="v4 / Mondo grader">
                      {rankText}
                      {fullBadge}
                    </span>
                  )
                }

                return (
                  <div className="space-y-4">
                    {/* Grader toggle — switches the comparative stats + trio
                        history cells between v3 (LLM grader) and v4 (Mondo
                        paper-faithful grader). v4 requires offline run of
                        scripts/grade-eval-v4.ts --source admin-testing
                        --persist before cells populate. */}
                    <div className="flex items-center gap-3 text-xs text-[#8b7355]">
                      <span className="font-semibold uppercase tracking-wider">Grader view:</span>
                      <div className="inline-flex border border-[#d4c5b0]">
                        {(["v3", "v4"] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => setGradeView(v)}
                            className={`px-3 py-1 font-mono text-xs transition-colors ${
                              gradeView === v
                                ? "bg-[#8b2500] text-white"
                                : "bg-white text-[#8b7355] hover:bg-[#faf7f3]"
                            }`}
                          >
                            {v === "v3" ? "v3 LLM" : "v4 Mondo"}
                          </button>
                        ))}
                      </div>
                      {gradeView === "v4" && (
                        <span className="italic">
                          v4 cells empty until you run{" "}
                          <code className="text-[10px] bg-[#faf7f3] px-1 py-0.5 border border-[#e8ddd0]">
                            npx tsx scripts/grade-eval-v4.ts --source admin-testing --persist
                          </code>
                        </span>
                      )}
                    </div>

                    {/* Comparative stats — SL vs OAI vs Claude across all
                        graded v29 trios. */}
                    <div className="border border-[#d4c5b0] bg-white">
                      <div className="px-4 py-3 border-b border-[#e8ddd0]">
                        <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">
                          v29 Comparative Stats — SL vs OAI vs Claude · {gradeView === "v3" ? "v3 LLM grader" : "v4 Mondo grader"}
                        </div>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-[#faf7f3] text-[10px] uppercase tracking-wider text-[#8b7355]">
                          <tr>
                            <th className="text-left px-4 py-2 font-semibold">Model</th>
                            <th className="text-right px-3 py-2 font-semibold">n graded</th>
                            <th className="text-right px-3 py-2 font-semibold">Top-1</th>
                            <th className="text-right px-3 py-2 font-semibold">Top-3</th>
                            <th className="text-right px-3 py-2 font-semibold">{gradeView === "v3" ? "Top-5" : "FULL Top-1"}</th>
                            <th className="text-right px-3 py-2 font-semibold">Top-10</th>
                            <th className="text-right px-3 py-2 font-semibold">{gradeView === "v3" ? "Avg score" : "Grounding %"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(["sl", "oai", "claude"] as const).map((model) => {
                            const s = stats[model]
                            const label = model === "sl" ? "SecondLook" : model === "oai" ? "OpenAI o3" : "Claude Opus"
                            const accent = model === "sl" ? "text-[#8b2500] font-bold" : ""
                            if (!s) {
                              return (
                                <tr key={model} className="border-t border-[#e8ddd0] text-[#8b7355]">
                                  <td className={`px-4 py-2 ${accent}`}>{label}</td>
                                  <td colSpan={6} className="px-3 py-2 text-center italic">no graded tests yet</td>
                                </tr>
                              )
                            }
                            return (
                              <tr key={model} className="border-t border-[#e8ddd0] text-[#2a2a2a]">
                                <td className={`px-4 py-2 ${accent}`}>{label}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{s.graded}/{s.count}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{Math.round(s.top1 * 100)}%</td>
                                <td className="px-3 py-2 text-right tabular-nums">{Math.round(s.top3 * 100)}%</td>
                                <td className="px-3 py-2 text-right tabular-nums">{Math.round(s.top5 * 100)}%</td>
                                <td className="px-3 py-2 text-right tabular-nums">{Math.round(s.top10 * 100)}%</td>
                                <td className="px-3 py-2 text-right tabular-nums">{s.avgScore.toFixed(1)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Trio history — one row per parent SL run, with
                        SL / OAI / Claude grade cells side-by-side.
                        Clicking a cell selects that specific testCase
                        for the detail panel above. */}
                    <div className="border border-[#d4c5b0] bg-white">
                      <div className="px-4 py-3 border-b border-[#e8ddd0]">
                        <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">
                          v29 Trio History ({trios.length} {trios.length === 1 ? "trio" : "trios"})
                        </div>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-[#faf7f3] text-[10px] uppercase tracking-wider text-[#8b7355]">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">When</th>
                            <th className="text-left px-3 py-2 font-semibold">Difficulty</th>
                            <th className="text-left px-3 py-2 font-semibold">Ground Truth</th>
                            <th className="text-left px-3 py-2 font-semibold">SecondLook</th>
                            <th className="text-left px-3 py-2 font-semibold">OpenAI o3</th>
                            <th className="text-left px-3 py-2 font-semibold">Claude Opus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trios.map((t) => {
                            const dx = t.sl?.groundTruth?.diagnosis || t.oai?.groundTruth?.diagnosis || t.claude?.groundTruth?.diagnosis || "—"
                            const when = new Date(t.createdAt)
                            const diff = t.sl?.difficulty || t.oai?.difficulty || t.claude?.difficulty
                            const onClickRow = (tc?: TestCase) => () => {
                              if (!tc) return
                              setActiveTestId(tc.id === activeTestId ? null : tc.id)
                            }
                            const isAnyActive =
                              activeTestId === t.sl?.id ||
                              activeTestId === t.oai?.id ||
                              activeTestId === t.claude?.id
                            return (
                              <tr
                                key={t.parentId}
                                className={`border-t border-[#e8ddd0] ${isAnyActive ? "bg-[#faf7f3]" : "hover:bg-[#fbf8f3]"}`}
                              >
                                <td className="px-3 py-2 text-[#5a5a5a] whitespace-nowrap text-xs" title={when.toISOString()}>
                                  {when.toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-[#5a5a5a]">
                                  {diff !== undefined && (
                                    <DifficultyBadge difficulty={diff} />
                                  )}
                                </td>
                                <td className="px-3 py-2 text-[#2a2a2a] max-w-xs truncate" title={dx}>
                                  {dx}
                                </td>
                                <td className="px-3 py-2 cursor-pointer" onClick={onClickRow(t.sl)}>
                                  {gradeCell(t.sl)}
                                </td>
                                <td className="px-3 py-2 cursor-pointer" onClick={onClickRow(t.oai)}>
                                  {gradeCell(t.oai)}
                                </td>
                                <td className="px-3 py-2 cursor-pointer" onClick={onClickRow(t.claude)}>
                                  {gradeCell(t.claude)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })()}

        {testCases.length === 0 && !isGenerating && (
          <div className="text-center py-16 text-[#8b7355]">
            <div className="text-lg font-serif mb-2">No test cases yet</div>
            <div className="text-sm">Run a new test above to get started</div>
          </div>
        )}
      </div>
    </div>
  )
}
