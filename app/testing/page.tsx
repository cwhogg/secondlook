"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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

export default function AdminPage() {
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [passwordInput, setPasswordInput] = useState("")
  const [authError, setAuthError] = useState("")

  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [activeTestId, setActiveTestId] = useState<string | null>(null)
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
        setIsAuthorized(true)
      } else {
        setAuthError("Invalid password")
      }
    } catch {
      setAuthError("Failed to verify password")
    }
  }

  // Load from KV on mount
  useEffect(() => {
    loadTestCases().then(setTestCases)
  }, [])

  // Persist to KV on every change. Ship only the diff so we don't blow past
  // Vercel's request-body limit on the test-cases POST.
  const updateTestCases = useCallback((updater: (prev: TestCase[]) => TestCase[]) => {
    setTestCases((prev) => {
      const next = updater(prev)
      const prevById = new Map(prev.map((tc) => [tc.id, tc]))
      const nextIds = new Set(next.map((tc) => tc.id))
      const upserts = next.filter((tc) => prevById.get(tc.id) !== tc)
      const removedIds = prev.filter((tc) => !nextIds.has(tc.id)).map((tc) => tc.id)
      if (upserts.length > 0) upsertTestCases(upserts)
      if (removedIds.length > 0) deleteTestCases(removedIds)
      return next
    })
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
          excludeDiseases: testCases.map((tc) => tc.groundTruth.diagnosis),
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
        testVersion: 'v15' as const,
        status: "generated",
        source: "generated",
        groundTruth: data.groundTruth,
        generatedPatient: data.patient,
        generationMetadata: data.generationMetadata,
      }

      updateTestCases((prev) => [newCase, ...prev])
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

    updateTestCases((prev) =>
      prev.map((tc) => (tc.id === testId ? { ...tc, status: "running" as const, pipelineResult: undefined, grading: undefined, gradingMetadata: undefined, pipelineError: undefined } : tc))
    )

    try {
      setExtractionStatus("Starting symptom extraction...")
      const { patientCase, extractedSymptoms, extractedExcludedFindings } = await buildPatientCase(patient, (msg) => {
        setExtractionStatus(msg)
      })
      setExtractionStatus(null)

      updateTestCases((prev) =>
        prev.map((tc) =>
          tc.id === testId ? { ...tc, extractedSymptoms, extractedExcludedFindings } : tc,
        ),
      )

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

            updateTestCases((prev) =>
              prev.map((tc) =>
                tc.id === testId ? { ...tc, status: "completed" as const, pipelineResult: pipelineResult! } : tc
              )
            )
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
        updateTestCases((prev) =>
          prev.map((tc) =>
            tc.id === testId ? { ...tc, status: "error" as const, pipelineError: err.message } : tc
          )
        )
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

      updateTestCases((prev) =>
        prev.map((tc) =>
          tc.id === testId
            ? { ...tc, status: "graded" as const, grading: data.grading, gradingMetadata: data.gradingMetadata }
            : tc
        )
      )
    } finally {
      setIsGrading(false)
    }
  }

  // ===== HANDLERS =====

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
      updateTestCases((prev) =>
        prev.map((c) => (c.id === tc.id ? { ...c, previousRun: snapshot, pipelineResult: undefined, grading: undefined, gradingMetadata: undefined, pipelineError: undefined } : c))
      )
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
    updateTestCases((prev) => prev.filter((tc) => tc.id !== id))
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
                  {currentActiveTest.groundTruth.diagnosis}
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

        {/* Test History */}
        {testCases.length > 0 && (
          <div className="border border-[#d4c5b0] bg-white">
            <div className="px-4 py-3 border-b border-[#e8ddd0]">
              <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">
                Test History ({testCases.length})
              </div>
            </div>
            <div>
              {testCases.map((tc) => (
                <TestHistoryRow
                  key={tc.id}
                  tc={tc}
                  isActive={tc.id === activeTestId}
                  onClick={() => setActiveTestId(tc.id === activeTestId ? null : tc.id)}
                />
              ))}
            </div>
          </div>
        )}

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
