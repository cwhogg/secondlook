"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { RefineLoading } from "@/components/refine-loading"
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"

interface ClarifyingQuestion {
  id: string
  question: string
  questionType: "symptom" | "prior_dx" | "family_history" | "lab_result"
  rationale?: string
  affectsDiagnoses: Array<{
    diagnosisName: string
    ifYes: "rules-in" | "supports" | "weakens" | "rules-out" | "neutral"
    ifNo: "rules-in" | "supports" | "weakens" | "rules-out" | "neutral"
  }>
}

interface DiagnosisLike {
  diagnosis: string
  confidenceScore?: number
  evidenceScore?: number
  icd10Code?: string
  clinicalReasoning?: string
}

interface RefinementDelta {
  diagnosisName: string
  oldRank: number | null
  newRank: number | null
  oldScore: number | null
  newScore: number | null
}

interface StoredAnalysis {
  differentialDiagnoses?: DiagnosisLike[]
  clarifyingQuestions?: ClarifyingQuestion[]
  refinement?: {
    answers: Array<{ questionId: string; answer: "yes" | "no" | "dont_know" }>
    deltas: RefinementDelta[]
    refinedAt: string
  }
  [k: string]: unknown
}

type AnswerValue = "yes" | "no" | "dont_know"

const QUESTION_TYPE_LABEL: Record<ClarifyingQuestion["questionType"], string> = {
  symptom: "Symptom",
  prior_dx: "Prior diagnosis",
  family_history: "Family history",
  lab_result: "Lab result",
}

function pickScore(d: DiagnosisLike): number {
  if (typeof d.evidenceScore === "number" && d.evidenceScore > 0) return d.evidenceScore
  if (typeof d.confidenceScore === "number") return d.confidenceScore
  return 0
}

function fmtRankChange(oldRank: number | null, newRank: number | null) {
  if (oldRank == null && newRank != null) return { label: `New: #${newRank}`, tone: "promoted" as const }
  if (newRank == null && oldRank != null) return { label: `Dropped from #${oldRank}`, tone: "removed" as const }
  if (oldRank == null || newRank == null) return null
  if (oldRank === newRank) return { label: `#${newRank}`, tone: "unchanged" as const }
  if (newRank < oldRank) return { label: `#${oldRank} → #${newRank}`, tone: "promoted" as const }
  return { label: `#${oldRank} → #${newRank}`, tone: "demoted" as const }
}

function fmtScoreChange(oldScore: number | null, newScore: number | null) {
  if (oldScore == null || newScore == null) return null
  const delta = Math.round(newScore - oldScore)
  if (delta === 0) return { label: `${Math.round(newScore)}%`, sign: 0 as const }
  const sign = delta > 0 ? 1 : -1
  return { label: `${Math.round(oldScore)}% → ${Math.round(newScore)}% (${delta > 0 ? "+" : ""}${delta})`, sign }
}

export default function RefinePage() {
  const router = useRouter()
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null)
  const [patientCase, setPatientCase] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [refining, setRefining] = useState(false)
  const [refineStartedAt, setRefineStartedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refined, setRefined] = useState<StoredAnalysis | null>(null)

  useEffect(() => {
    try {
      const a = sessionStorage.getItem("analysisResults")
      const p = sessionStorage.getItem("analysisPatientCase")
      if (a) setAnalysis(JSON.parse(a))
      if (p) setPatientCase(JSON.parse(p))
    } catch (err) {
      console.error("Refine page: failed to read storage", err)
    }
    setLoading(false)
  }, [])

  const questions: ClarifyingQuestion[] = useMemo(() => {
    return analysis?.clarifyingQuestions || []
  }, [analysis])

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id])
  const anyAnswered = Object.values(answers).some((v) => v === "yes" || v === "no")

  const handleSubmit = async () => {
    if (!analysis || !patientCase) return
    setError(null)
    setRefining(true)
    setRefineStartedAt(Date.now())

    const payloadAnswers = Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer,
    }))

    try {
      const res = await fetch("/api/refine-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalAnalysis: analysis,
          answers: payloadAnswers,
          patientCase,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.detail || `Refine failed (${res.status})`)
      }

      const refinedAnalysis: StoredAnalysis = data.refinedAnalysis
      setRefined(refinedAnalysis)

      // Persist refined results so /results/next-steps + /results/print use them.
      // Preserve the pre-refinement snapshot once (don't overwrite if user
      // refines twice — the original from before any refinement is what we
      // want to compare against).
      if (!sessionStorage.getItem("originalAnalysisResults")) {
        sessionStorage.setItem("originalAnalysisResults", JSON.stringify(analysis))
      }
      sessionStorage.setItem("analysisResults", JSON.stringify(refinedAnalysis))
    } catch (err: any) {
      setError(err?.message || "Refinement failed")
    } finally {
      setRefining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#8b2500] mx-auto" />
          <p className="mt-4 text-gray-600">Loading…</p>
        </div>
      </div>
    )
  }

  if (!analysis || questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">No questions to refine</h1>
          <p className="text-gray-700 mb-4 text-sm">
            {analysis
              ? "This analysis doesn't have any clarifying questions to refine against."
              : "We couldn't find your analysis. Start a new one to use the refine feature."}
          </p>
          <button
            onClick={() => router.push(analysis ? "/results/analysis" : "/step-1")}
            className="px-4 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00]"
          >
            {analysis ? "Back to analysis" : "Start new analysis"}
          </button>
        </div>
      </div>
    )
  }

  // Renders the question form OR the refined results, based on whether we
  // have a refined result back from the API.
  const inResultsView = !!refined

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10 pb-28 sm:pb-32 space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="bg-[#8b2500] text-white p-5 sm:p-8">
          <div className="mb-2">
            <Link href="/" className="text-white/80 hover:text-white text-sm font-medium">
              SecondLook
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-3">
            <Sparkles className="h-6 w-6 sm:h-7 sm:w-7" />
            {inResultsView ? "Refined Differential" : "Refine Your Results"}
          </h1>
          <p className="text-[#f0d9c3] text-sm sm:text-base">
            {inResultsView
              ? "Here's how your answers shifted the ranking. Items that moved are highlighted."
              : "Answer a few targeted questions. Your answers will re-run the diagnostic synthesizer to produce a sharper differential."}
          </p>
        </div>

        {!inResultsView && refining && refineStartedAt && (
          <RefineLoading startedAt={refineStartedAt} done={false} />
        )}

        {!inResultsView && !refining && (
          <>
            <section className="space-y-4">
              {questions.map((q, idx) => {
                const value = answers[q.id]
                return (
                  <article
                    key={q.id}
                    className="bg-white border border-[#d4c5b0] p-4 sm:p-5"
                  >
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-xs font-semibold text-[#8b2500] uppercase tracking-wide">
                        Question {idx + 1} of {questions.length}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
                        {QUESTION_TYPE_LABEL[q.questionType]}
                      </span>
                    </div>
                    <p className="text-base sm:text-lg font-semibold text-gray-900 leading-snug mb-3">
                      {q.question}
                    </p>
                    {q.rationale && (
                      <p className="text-xs text-gray-500 mb-3 italic">
                        Why we're asking: {q.rationale}
                      </p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {([
                        { v: "yes" as const, label: "Yes" },
                        { v: "no" as const, label: "No" },
                        { v: "dont_know" as const, label: "Don't know" },
                      ]).map((opt) => {
                        const active = value === opt.v
                        return (
                          <button
                            key={opt.v}
                            onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.v }))}
                            className={`px-4 py-2 text-sm font-medium border-2 transition-colors ${
                              active
                                ? "bg-[#8b2500] text-white border-[#8b2500]"
                                : "bg-white text-gray-700 border-gray-300 hover:border-[#8b2500] hover:text-[#8b2500]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </article>
                )
              })}
            </section>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 text-sm text-red-800">
                <span className="font-semibold">Error:</span> {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <button
                onClick={() => router.push("/results/next-steps")}
                disabled={refining}
                className="px-5 py-3 bg-white border-2 border-gray-300 text-gray-700 font-medium hover:border-gray-400 transition-all"
              >
                Skip and see recommendations
              </button>
              <button
                onClick={handleSubmit}
                disabled={refining || !anyAnswered}
                className="px-6 py-3 bg-[#8b2500] text-white font-semibold hover:bg-[#6d1d00] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {refining ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Refining…
                  </>
                ) : (
                  <>
                    {allAnswered ? "Refine my results" : "Refine with what I've answered"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {inResultsView && refined && (
          <RefinedDiagnosesView analysis={refined} />
        )}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 p-3 sm:p-4">
        <div className="max-w-3xl mx-auto flex justify-between items-center gap-3">
          <button
            onClick={() => router.push("/results/analysis")}
            className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium text-sm sm:text-base"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Back to analysis</span>
            <span className="sm:hidden">Back</span>
          </button>

          <button
            onClick={() => router.push("/results/print")}
            title="Download PDF report"
            aria-label="Download PDF report"
            className="flex items-center justify-center p-2 sm:p-3 border-2 border-gray-300 text-gray-700 hover:border-[#8b2500] hover:text-[#8b2500] transition-all duration-200"
          >
            <Download className="h-5 w-5" />
          </button>

          <button
            onClick={() => router.push("/results/next-steps")}
            disabled={!inResultsView}
            className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-[#8b2500] text-white hover:bg-[#6d1d00] transition-all duration-200 font-medium text-sm sm:text-base disabled:opacity-40"
          >
            <span className="hidden sm:inline">{inResultsView ? "See refined recommendations" : "See recommendations"}</span>
            <span className="sm:hidden">Next</span>
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function RefinedDiagnosesView({ analysis }: { analysis: StoredAnalysis }) {
  const refined = analysis.differentialDiagnoses || []
  const deltas = analysis.refinement?.deltas || []
  const top = refined.slice(0, 10)

  const deltaByName = new Map(
    deltas.map((d) => [d.diagnosisName.toLowerCase().trim().replace(/\s+/g, " "), d]),
  )

  return (
    <section className="space-y-4">
      <div className="bg-[#faf6f0] border border-[#d4c5b0] p-4 text-sm text-[#6d1d00]">
        Your answers have been folded back into the evidence pool and the Claude evaluator + synthesizer have re-ranked the differential. Items with arrows below moved meaningfully.
      </div>

      <div className="space-y-3">
        {top.map((d, i) => {
          const key = d.diagnosis.toLowerCase().trim().replace(/\s+/g, " ")
          const delta = deltaByName.get(key)
          const rankChange = delta ? fmtRankChange(delta.oldRank, delta.newRank) : null
          const scoreChange = delta ? fmtScoreChange(delta.oldScore, delta.newScore) : null
          return (
            <article
              key={`${d.diagnosis}-${i}`}
              className="bg-white border border-[#d4c5b0] p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 font-semibold mb-0.5">#{i + 1}</div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
                    {d.diagnosis}
                  </h3>
                  {d.icd10Code && (
                    <div className="text-xs text-gray-500 mt-0.5">ICD-10: {d.icd10Code}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold text-[#8b2500] leading-none">
                    {Math.round(pickScore(d))}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    confidence
                  </div>
                </div>
              </div>

              {(rankChange || scoreChange) && (
                <div className="flex flex-wrap items-center gap-2 mt-2 mb-2">
                  {rankChange && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 border ${
                        rankChange.tone === "promoted"
                          ? "bg-green-50 text-green-800 border-green-300"
                          : rankChange.tone === "demoted"
                            ? "bg-amber-50 text-amber-800 border-amber-300"
                            : rankChange.tone === "removed"
                              ? "bg-red-50 text-red-800 border-red-300"
                              : "bg-gray-50 text-gray-600 border-gray-300"
                      }`}
                    >
                      {rankChange.tone === "promoted" && <TrendingUp className="h-3.5 w-3.5" />}
                      {rankChange.tone === "demoted" && <TrendingDown className="h-3.5 w-3.5" />}
                      {rankChange.tone === "removed" && <TrendingDown className="h-3.5 w-3.5" />}
                      {rankChange.tone === "unchanged" && <Minus className="h-3.5 w-3.5" />}
                      {rankChange.label}
                    </span>
                  )}
                  {scoreChange && scoreChange.sign !== 0 && (
                    <span
                      className={`inline-flex items-center text-xs font-medium px-2 py-1 border ${
                        scoreChange.sign > 0
                          ? "bg-green-50 text-green-800 border-green-300"
                          : "bg-amber-50 text-amber-800 border-amber-300"
                      }`}
                    >
                      {scoreChange.label}
                    </span>
                  )}
                </div>
              )}

              {d.clinicalReasoning && (
                <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
                  {d.clinicalReasoning}
                </p>
              )}
            </article>
          )
        })}
      </div>

      {/* Diagnoses that were demoted out of the top-10 */}
      {(() => {
        const droppedOut = deltas.filter(
          (d) => d.oldRank != null && d.oldRank <= 10 && (d.newRank == null || d.newRank > 10),
        )
        if (droppedOut.length === 0) return null
        return (
          <div className="bg-white border border-[#d4c5b0] p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-amber-600" />
              Dropped out of the top 10
            </h3>
            <ul className="space-y-1 text-sm text-gray-700">
              {droppedOut.map((d, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-500 font-medium">
                    was #{d.oldRank}
                  </span>
                  <span>{d.diagnosisName}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })()}

      <div className="bg-green-50 border-l-4 border-green-500 p-4 flex items-start gap-3">
        <CheckCircle className="h-5 w-5 text-green-700 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-green-900">
          <span className="font-semibold">Refinement complete.</span> The refined ranking is now the active analysis. Recommendations and the PDF report will reflect these new rankings.
        </div>
      </div>
    </section>
  )
}
