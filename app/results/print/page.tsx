"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  getWhereToGetIt,
  normalizeCategory,
  type TestCategory,
} from "@/lib/results/where-to-get-it"
import { startNewAnalysis } from "@/lib/results/start-new-analysis"

interface EvidenceItem {
  finding: string
  patientSymptom?: string
  strength?: "strong" | "moderate" | "weak"
  type?: "supporting" | "contradictory"
}

interface DiagnosisHypothesis {
  diagnosis: string
  confidenceScore?: number
  evidenceScore?: number
  icd10Code?: string
  omimId?: string
  orphanetId?: string
  rareDisease?: boolean
  prevalence?: string
  supportingEvidence?: EvidenceItem[]
  contradictoryEvidence?: EvidenceItem[]
  clinicalReasoning?: string
  typicalPresentation?: string
  specialistRequired?: string
  expansionSource?: "family" | "variant"
}

interface RecommendedTest {
  testType: string
  testName: string
  rationale: string
  urgency?: string
  targetDiagnoses?: string[]
}

interface DataGap {
  gapType?: string
  description?: string
  item?: string
  impact?: string
  suggestedAction?: string
  importance?: "high" | "medium" | "low"
}

interface StoredAnalysis {
  differentialDiagnoses?: DiagnosisHypothesis[]
  recommendedTesting?: RecommendedTest[]
  dataGaps?: DataGap[]
  nextSteps?: {
    immediateActions?: string[]
    specialistReferrals?: string[]
    followUpTiming?: string
    redFlags?: string[]
  }
  overallAssessment?: string
  patientHypothesisAnalysis?: {
    isLikely?: boolean | null
    reasoning?: string
  } | null
}

interface StoredMeta {
  timestamp?: string
  patientAge?: string
  patientSex?: string
  patientHypothesis?: string
}

function fmtScore(n?: number): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—"
  return `${Math.round(n)}%`
}

function pickPrimaryScore(d: DiagnosisHypothesis): number | undefined {
  if (typeof d.evidenceScore === "number") return d.evidenceScore
  return d.confidenceScore
}

export default function PrintReportPage() {
  const router = useRouter()
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null)
  const [meta, setMeta] = useState<StoredMeta | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const a = sessionStorage.getItem("analysisResults")
      const m = sessionStorage.getItem("analysisMetadata")
      if (a) setAnalysis(JSON.parse(a))
      if (m) setMeta(JSON.parse(m))
    } catch (err) {
      console.error("Print report: failed to read storage", err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // Auto-trigger the print dialog once content is rendered.
    if (loading || !analysis) return
    const originalTitle = document.title
    const date = new Date().toISOString().split("T")[0]
    document.title = `secondlook-report-${date}`
    const restore = () => {
      document.title = originalTitle
      window.removeEventListener("afterprint", restore)
    }
    window.addEventListener("afterprint", restore)
    const t = setTimeout(() => {
      window.print()
    }, 400)
    return () => {
      clearTimeout(t)
      window.removeEventListener("afterprint", restore)
      document.title = originalTitle
    }
  }, [loading, analysis])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#8b2500] mx-auto" />
          <p className="mt-4 text-gray-600">Preparing report…</p>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold mb-2">No analysis available</h1>
          <p className="text-gray-600 mb-4">
            Run an analysis first, then return here to download a report.
          </p>
          <button
            onClick={() => startNewAnalysis(router)}
            className="px-4 py-2 bg-[#8b2500] text-white"
          >
            Start a new analysis
          </button>
        </div>
      </div>
    )
  }

  const diagnoses = (analysis.differentialDiagnoses || []).slice(0, 5)
  const tests = analysis.recommendedTesting || []
  const grouped: Record<TestCategory, RecommendedTest[]> = {
    laboratory: [],
    genetic_testing: [],
    imaging: [],
    electrodiagnostic: [],
    specialist_evaluate: [],
    other: [],
  }
  for (const t of tests) grouped[normalizeCategory(t.testType, t.testName)].push(t)

  const next = analysis.nextSteps || {}
  const redFlags = next.redFlags || []
  const immediateActions = next.immediateActions || []
  const specialistReferrals = next.specialistReferrals || []
  const dataGaps = analysis.dataGaps || []
  const generatedAt = meta?.timestamp || new Date().toLocaleString()

  return (
    <div className="bg-white text-gray-900 print-root">
      {/* Print-only stylesheet */}
      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 0.6in;
          }
          .no-print {
            display: none !important;
          }
          .print-root {
            background: white !important;
            color: #1a1a1a !important;
          }
          .page-break {
            page-break-before: always;
          }
          .avoid-break {
            page-break-inside: avoid;
          }
          body,
          html {
            background: white !important;
          }
          a {
            color: inherit;
            text-decoration: none;
          }
          /* Preserve our brand color on the headings/markers */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* On-screen toolbar (hidden in print) */}
      <div className="no-print sticky top-0 z-10 bg-[#faf6f0] border-b border-[#d4c5b0] px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-[#6d1d00]">
          Print preview — your browser's print dialog should open automatically. Choose <span className="font-semibold">Save as PDF</span> as the destination.
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00]"
          >
            Open print dialog
          </button>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-white border border-[#d4c5b0] text-[#6d1d00] text-sm font-medium hover:bg-[#faf6f0]"
          >
            Close
          </button>
        </div>
      </div>

      <div className="max-w-[7.5in] mx-auto px-6 sm:px-10 py-8 sm:py-10">
        {/* Report header */}
        <header className="border-b-2 border-[#8b2500] pb-4 mb-6 avoid-break">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-widest text-[#8b2500] font-semibold mb-1">
                SecondLook
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
                Diagnostic Analysis Report
              </h1>
            </div>
            <div className="text-right text-xs text-gray-600">
              <div>Generated {generatedAt}</div>
              {(meta?.patientAge || meta?.patientSex) && (
                <div>
                  Patient: {meta?.patientAge ? `${meta.patientAge}y` : ""}
                  {meta?.patientAge && meta?.patientSex ? " " : ""}
                  {meta?.patientSex || ""}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Clinical summary */}
        {analysis.overallAssessment && (
          <section className="avoid-break mb-6">
            <h2 className="text-base font-bold text-[#8b2500] uppercase tracking-wide mb-2 border-b border-gray-300 pb-1">
              Clinical summary
            </h2>
            <p className="text-sm leading-relaxed">{analysis.overallAssessment}</p>
          </section>
        )}

        {/* Differential diagnoses */}
        {diagnoses.length > 0 && (
          <section className="mb-6">
            <h2 className="text-base font-bold text-[#8b2500] uppercase tracking-wide mb-3 border-b border-gray-300 pb-1">
              Top differential diagnoses
            </h2>
            <div className="space-y-4">
              {diagnoses.map((d, i) => {
                const score = pickPrimaryScore(d)
                const evidence = (d.supportingEvidence || []).slice(0, 6)
                const contradictory = (d.contradictoryEvidence || []).slice(0, 4)
                return (
                  <article key={i} className="avoid-break border border-gray-200 p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 font-semibold">#{i + 1}</div>
                        <h3 className="font-bold text-gray-900 text-base sm:text-lg leading-snug">
                          {d.diagnosis}
                        </h3>
                        <div className="text-xs text-gray-600 mt-0.5 flex flex-wrap gap-x-3">
                          {d.icd10Code && <span>ICD-10: {d.icd10Code}</span>}
                          {d.omimId && <span>OMIM: {d.omimId}</span>}
                          {d.orphanetId && <span>Orphanet: {d.orphanetId}</span>}
                          {d.rareDisease && <span className="font-medium">Rare disease</span>}
                          {d.prevalence && <span>Prevalence: {d.prevalence}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-bold text-[#8b2500] leading-none">
                          {fmtScore(score)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">
                          confidence
                        </div>
                      </div>
                    </div>

                    {d.clinicalReasoning && (
                      <p className="text-sm text-gray-800 leading-relaxed mb-2">
                        {d.clinicalReasoning}
                      </p>
                    )}

                    {evidence.length > 0 && (
                      <div className="mb-2">
                        <div className="text-xs font-semibold text-gray-700 mb-1">
                          Supporting evidence
                        </div>
                        <ul className="text-xs text-gray-800 space-y-0.5">
                          {evidence.map((e, j) => (
                            <li key={j} className="flex gap-2">
                              <span className="text-[#8b2500]">•</span>
                              <span>
                                {e.finding}
                                {e.patientSymptom && e.patientSymptom !== e.finding && (
                                  <span className="text-gray-500"> ({e.patientSymptom})</span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {contradictory.length > 0 && (
                      <div className="mb-2">
                        <div className="text-xs font-semibold text-gray-700 mb-1">
                          Findings that argue against
                        </div>
                        <ul className="text-xs text-gray-800 space-y-0.5">
                          {contradictory.map((e, j) => (
                            <li key={j} className="flex gap-2">
                              <span className="text-gray-500">•</span>
                              <span>{e.finding}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {d.specialistRequired && (
                      <div className="text-xs text-gray-700">
                        <span className="font-semibold">Specialist to consult: </span>
                        {d.specialistRequired}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {/* Recommended tests with where-to-get */}
        {tests.length > 0 && (
          <section className="page-break mb-6">
            <h2 className="text-base font-bold text-[#8b2500] uppercase tracking-wide mb-3 border-b border-gray-300 pb-1">
              Recommended tests
            </h2>
            <p className="text-xs text-gray-600 mb-3">
              Each test below includes what it will tell you and where to get it, including direct-to-consumer options where they exist.
            </p>
            <div className="space-y-3">
              {CATEGORY_ORDER.flatMap((cat) =>
                grouped[cat].map((test, idx) => {
                  const where = getWhereToGetIt(normalizeCategory(test.testType, test.testName), test.testName)
                  return (
                    <article
                      key={`${cat}-${idx}`}
                      className="avoid-break border border-gray-200 p-3"
                    >
                      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
                          {CATEGORY_LABELS[cat]}
                        </span>
                        {test.urgency && (
                          <span
                            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 border ${
                              test.urgency === "urgent"
                                ? "border-red-400 text-red-700 bg-red-50"
                                : test.urgency === "when_available"
                                  ? "border-gray-300 text-gray-600 bg-gray-50"
                                  : "border-[#d4c5b0] text-[#6d1d00] bg-[#faf6f0]"
                            }`}
                          >
                            {test.urgency === "when_available" ? "When you can" : test.urgency}
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-gray-900 text-sm leading-snug mb-1">
                        {test.testName}
                      </h3>
                      <div className="text-xs text-gray-800 leading-relaxed mb-2">
                        <span className="font-semibold">What it tells you: </span>
                        {test.rationale}
                      </div>
                      {test.targetDiagnoses && test.targetDiagnoses.length > 0 && (
                        <div className="text-xs text-gray-700 mb-2">
                          <span className="font-semibold">Helps confirm or rule out: </span>
                          {test.targetDiagnoses.join(", ")}
                        </div>
                      )}
                      <div className="bg-[#faf6f0] border border-[#d4c5b0] p-2 text-xs">
                        <div className="font-semibold text-[#8b2500] uppercase text-[10px] tracking-wide mb-1">
                          How to get it
                        </div>
                        <div className="text-gray-800 leading-relaxed">{where.process}</div>
                        <div className="mt-1">
                          <span className="font-semibold">Order: </span>
                          {where.doctorOrder}
                        </div>
                        {where.inPersonExamples.length > 0 && (
                          <div className="mt-1">
                            <span className="font-semibold">In person: </span>
                            {where.inPersonExamples.join(", ")}
                          </div>
                        )}
                        {where.online.available && where.online.note && (
                          <div className="mt-1">
                            <span className="font-semibold">Online option: </span>
                            {where.online.note}
                          </div>
                        )}
                      </div>
                    </article>
                  )
                }),
              )}
            </div>
          </section>
        )}

        {/* Action items + specialists */}
        {(immediateActions.length > 0 || specialistReferrals.length > 0) && (
          <section className="avoid-break mb-6">
            <h2 className="text-base font-bold text-[#8b2500] uppercase tracking-wide mb-3 border-b border-gray-300 pb-1">
              Action items
            </h2>
            {immediateActions.length > 0 && (
              <div className="mb-3">
                <div className="text-sm font-semibold mb-1">Things to do now</div>
                <ul className="text-sm space-y-1">
                  {immediateActions.map((a, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[#8b2500]">•</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {specialistReferrals.length > 0 && (
              <div className="mb-3">
                <div className="text-sm font-semibold mb-1">Specialists to see</div>
                <ul className="text-sm space-y-1">
                  {specialistReferrals.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[#8b2500]">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {next.followUpTiming && (
              <div className="text-sm">
                <span className="font-semibold">Follow-up timing: </span>
                {next.followUpTiming}
              </div>
            )}
          </section>
        )}

        {/* Information gaps */}
        {dataGaps.length > 0 && (
          <section className="avoid-break mb-6">
            <h2 className="text-base font-bold text-[#8b2500] uppercase tracking-wide mb-3 border-b border-gray-300 pb-1">
              Information gaps
            </h2>
            <p className="text-xs text-gray-600 mb-2">
              These pieces of information weren't available during analysis and could meaningfully change the diagnostic picture.
            </p>
            <ul className="text-sm space-y-2">
              {dataGaps.map((g, i) => {
                const title = g.description || g.item || g.gapType || "Information gap"
                const impact = g.impact || g.suggestedAction
                return (
                  <li key={i} className="border border-gray-200 p-2">
                    <div className="font-semibold text-gray-900">{title}</div>
                    {impact && <div className="text-xs text-gray-700 mt-0.5">{impact}</div>}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Warning signs */}
        {redFlags.length > 0 && (
          <section className="avoid-break mb-6">
            <h2 className="text-base font-bold text-red-700 uppercase tracking-wide mb-2 border-b border-red-300 pb-1">
              Get urgent care if you experience any of these
            </h2>
            <ul className="text-sm space-y-1">
              {redFlags.map((f, i) => (
                <li key={i} className="flex gap-2 text-red-900">
                  <span className="text-red-600">●</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer disclaimer */}
        <footer className="mt-8 pt-4 border-t border-gray-300 text-xs text-gray-600 leading-relaxed avoid-break">
          <p className="mb-1">
            <span className="font-semibold">About this report.</span> SecondLook is an AI-powered decision-support tool. It is not a substitute for evaluation by a licensed clinician. Diagnostic confidence scores reflect pattern-matching against a curated knowledge base of approximately 9,000 rare diseases; they are not probabilities in the statistical sense.
          </p>
          <p>
            Take this report with you to your next appointment, but do not begin or change any medication, treatment, or workup based solely on what you read here.
          </p>
        </footer>
      </div>
    </div>
  )
}
