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
  refinement?: {
    answers?: Array<{ questionId: string; answer: string }>
    refinedAt?: string
  } | null
}

interface StoredMeta {
  timestamp?: string
  patientAge?: string
  patientSex?: string
  patientHypothesis?: string
}

interface PatientCaseSymptom {
  originalPhrase?: string
  medicalTerm?: string
  selectedConcept?: { name?: string } | null
}

interface StoredPatientCase {
  demographics?: { age?: string; sex?: string }
  chiefComplaint?: { description?: string } | null
  symptoms?: PatientCaseSymptom[]
  excludedFindings?: string[]
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
  const [patientCase, setPatientCase] = useState<StoredPatientCase | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const a = sessionStorage.getItem("analysisResults")
      const m = sessionStorage.getItem("analysisMetadata")
      const p = sessionStorage.getItem("analysisPatientCase")
      if (a) setAnalysis(JSON.parse(a))
      if (m) setMeta(JSON.parse(m))
      if (p) setPatientCase(JSON.parse(p))
    } catch (err) {
      console.error("Print report: failed to read storage", err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // Set a clean filename for "Save as PDF" — do NOT auto-trigger the dialog
    // anymore. Users see the formatted report first, then explicitly click
    // "Print / Save as PDF" when ready.
    if (loading || !analysis) return
    const date = new Date().toISOString().split("T")[0]
    const originalTitle = document.title
    document.title = `secondlook-report-${date}`
    return () => {
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
      <div className="no-print sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="px-3 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            ← Back
          </button>
          <div className="hidden sm:block text-xs text-gray-500">
            Choose <span className="font-semibold text-gray-700">Save as PDF</span> as the print destination to download.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => startNewAnalysis(router)}
            className="px-3 sm:px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 hover:border-[#8b2500] hover:text-[#8b2500] transition-colors"
          >
            Start new analysis
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-[#8b2500] text-white text-sm font-semibold hover:bg-[#6d1d00] transition-colors"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="max-w-[7.5in] mx-auto px-6 sm:px-10 py-8 sm:py-10 font-serif text-[#1a1a1a]">
        {/* Cover header — branded, professional, with AI-generated badge */}
        <header className="avoid-break mb-8">
          <div className="flex items-end justify-between gap-4 flex-wrap pb-4 border-b-2 border-[#8b2500]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#8b2500] font-semibold font-sans mb-1">
                SecondLook
              </div>
              <h1 className="text-2xl sm:text-[1.8rem] font-bold leading-tight text-[#1a1a1a]">
                Diagnostic Analysis Report
              </h1>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider font-sans px-2 py-0.5 bg-[#8b2500] text-white">
                  AI-Generated
                </span>
                <span className="text-xs text-gray-500 font-sans">
                  Rare-disease differential, ranked by an AI specialist pipeline
                </span>
              </div>
            </div>
            <div className="text-right text-[11px] text-gray-600 font-sans space-y-0.5">
              <div>
                <span className="text-gray-500">Generated:</span>{" "}
                <span className="text-gray-800">{generatedAt}</span>
              </div>
              {(meta?.patientAge || meta?.patientSex) && (
                <div>
                  <span className="text-gray-500">Patient:</span>{" "}
                  <span className="text-gray-800">
                    {meta?.patientAge ? `${meta.patientAge}y` : ""}
                    {meta?.patientAge && meta?.patientSex ? " " : ""}
                    {meta?.patientSex || ""}
                  </span>
                </div>
              )}
              {analysis.refinement && (
                <div>
                  <span className="text-gray-500">Status:</span>{" "}
                  <span className="text-[#8b2500] font-semibold">Refined with patient answers</span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Clinical presentation — patient-side context */}
        <section className="avoid-break mb-7">
          <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
            Clinical Presentation
          </h2>
          {patientCase?.chiefComplaint?.description && (
            <div className="mb-3">
              <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Chief complaint
              </div>
              <p className="text-sm leading-relaxed">&ldquo;{patientCase.chiefComplaint.description}&rdquo;</p>
            </div>
          )}
          {(() => {
            const symptoms = (patientCase?.symptoms || [])
              .map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase)
              .filter((v): v is string => !!v)
            if (symptoms.length === 0) return null
            return (
              <div className="mb-3">
                <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Reported findings ({symptoms.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
                  {symptoms.slice(0, 20).map((s, i) => (
                    <div key={i} className="flex gap-2 leading-snug">
                      <span className="text-[#8b2500]">•</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
          {patientCase?.excludedFindings && patientCase.excludedFindings.length > 0 && (
            <div className="mb-2">
              <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Explicitly excluded ({patientCase.excludedFindings.length})
              </div>
              <p className="text-[12px] italic text-gray-600 leading-relaxed">
                {patientCase.excludedFindings.join(" · ")}
              </p>
            </div>
          )}
          {meta?.patientHypothesis && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Patient&rsquo;s suspected diagnosis
              </div>
              <p className="text-[13px] italic">&ldquo;{meta.patientHypothesis}&rdquo;</p>
            </div>
          )}
        </section>

        {/* Clinical summary — the synth&rsquo;s overall assessment */}
        {analysis.overallAssessment && (
          <section className="avoid-break mb-7">
            <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
              Clinical Summary
            </h2>
            <p className="text-sm leading-relaxed text-gray-800">{analysis.overallAssessment}</p>
          </section>
        )}

        {/* MOST LIKELY DIAGNOSIS — hero treatment for #1 */}
        {diagnoses.length > 0 && (() => {
          const top = diagnoses[0]
          const score = pickPrimaryScore(top)
          const evidence = (top.supportingEvidence || []).slice(0, 6)
          const contradictory = (top.contradictoryEvidence || []).slice(0, 3)
          return (
            <section className="avoid-break mb-7">
              <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
                Most Likely Diagnosis
              </h2>
              <article className="bg-[#faf6f0] border border-[#d4c5b0] border-l-4 border-l-[#8b2500] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                      <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500]">
                        Rank #1
                      </span>
                      {top.icd10Code && (
                        <span className="font-sans text-[10px] text-gray-600">
                          ICD-10 {top.icd10Code}
                        </span>
                      )}
                      {top.omimId && (
                        <span className="font-sans text-[10px] text-gray-600">
                          OMIM {top.omimId}
                        </span>
                      )}
                      {top.rareDisease && (
                        <span className="font-sans text-[10px] text-[#8b2500] font-semibold">
                          Rare disease
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-[#1a1a1a] text-xl sm:text-[1.4rem] leading-tight">
                      {top.diagnosis}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[2.4rem] font-bold text-[#8b2500] leading-none tabular-nums">
                      {fmtScore(score)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-sans">
                      confidence
                    </div>
                  </div>
                </div>

                {top.clinicalReasoning && (
                  <p className="text-[13px] sm:text-sm text-gray-800 leading-relaxed mb-3">
                    {top.clinicalReasoning}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  {evidence.length > 0 && (
                    <div>
                      <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                        Supporting evidence
                      </div>
                      <ul className="text-[12px] text-gray-800 space-y-1">
                        {evidence.map((e, j) => (
                          <li key={j} className="flex gap-2 leading-snug">
                            <span className="text-[#8b2500] flex-shrink-0">•</span>
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
                    <div>
                      <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                        Findings against
                      </div>
                      <ul className="text-[12px] text-gray-800 space-y-1">
                        {contradictory.map((e, j) => (
                          <li key={j} className="flex gap-2 leading-snug">
                            <span className="text-gray-500 flex-shrink-0">•</span>
                            <span>{e.finding}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {top.specialistRequired && (
                  <div className="mt-3 pt-3 border-t border-[#d4c5b0] text-[12px] text-gray-700">
                    <span className="font-semibold font-sans text-[10px] uppercase tracking-wider text-gray-500">
                      Specialist to consult:
                    </span>{" "}
                    {top.specialistRequired}
                  </div>
                )}
              </article>
            </section>
          )
        })()}

        {/* ADDITIONAL DIFFERENTIAL — compact rows for #2..#5 */}
        {diagnoses.length > 1 && (
          <section className="mb-7">
            <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
              Additional Differential
            </h2>
            <div className="space-y-2.5">
              {diagnoses.slice(1).map((d, i) => {
                const score = pickPrimaryScore(d)
                const rank = i + 2
                return (
                  <article
                    key={i}
                    className="avoid-break border border-gray-200 p-3 sm:p-4 flex items-start gap-3 sm:gap-4"
                  >
                    <div className="flex-shrink-0 w-10 text-center pt-0.5">
                      <div className="font-sans text-[10px] uppercase tracking-wider text-gray-500">
                        Rank
                      </div>
                      <div className="font-serif text-lg font-bold text-[#8b2500] leading-none">
                        #{rank}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-[#1a1a1a] text-[15px] sm:text-base leading-snug">
                        {d.diagnosis}
                      </h3>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-600 font-sans mt-0.5 mb-1">
                        {d.icd10Code && <span>ICD-10 {d.icd10Code}</span>}
                        {d.omimId && <span>OMIM {d.omimId}</span>}
                        {d.rareDisease && <span className="font-medium">Rare</span>}
                      </div>
                      {d.clinicalReasoning && (
                        <p className="text-[12px] text-gray-700 leading-snug">
                          {d.clinicalReasoning.length > 240
                            ? `${d.clinicalReasoning.slice(0, 240).trim()}…`
                            : d.clinicalReasoning}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xl font-bold text-[#8b2500] leading-none tabular-nums">
                        {fmtScore(score)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-sans">
                        conf
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {/* Recommended tests with where-to-get */}
        {tests.length > 0 && (
          <section className="page-break mb-7">
            <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
              Recommended Next Steps — Testing
            </h2>
            <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
              Each test includes what it will tell you, whether a doctor order is required, and where to get it.
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
          <section className="avoid-break mb-7">
            <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
              Action Items &amp; Specialists
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
          <section className="avoid-break mb-7">
            <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
              Information Gaps
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
          <section className="avoid-break mb-7">
            <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700 mb-2 pb-1.5 border-b border-red-300">
              Seek Urgent Care If…
            </h2>
            <div className="bg-red-50 border border-red-200 p-3">
              <ul className="text-[13px] space-y-1">
                {redFlags.map((f, i) => (
                  <li key={i} className="flex gap-2 text-red-900 leading-snug">
                    <span className="text-red-600 flex-shrink-0">●</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Methodology + Footer disclaimer */}
        <footer className="mt-8 pt-5 border-t-2 border-[#8b2500] avoid-break">
          <div className="mb-4">
            <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-2">
              Methodology
            </h2>
            <p className="text-[11px] text-gray-700 leading-relaxed">
              SecondLook is a multi-stage AI diagnostic pipeline. Your symptoms were mapped to candidate diseases in a curated ~9,000-condition rare-disease knowledge base, then five domain-specialist AI agents (geneticist + general-internist anchors plus three specialty-relevant agents) generated and ranked hypotheses in parallel. Evidence was scored against published diagnostic criteria where available, and the final ranking was synthesized by a senior-clinician AI agent. Confidence reflects pattern-match strength against the knowledge base; it is not a statistical probability.
            </p>
          </div>
          <div className="bg-[#faf6f0] border border-[#d4c5b0] p-3">
            <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500] mb-1">
              Important — AI-generated; not medical advice
            </div>
            <p className="text-[11px] text-gray-700 leading-relaxed">
              This report is generated by an AI system and is intended to support, not replace, evaluation by a licensed clinician. Bring this report to your next appointment to discuss with your healthcare provider. <strong className="text-gray-900">Do not begin, stop, or change any medication, treatment, or workup based solely on what you read here.</strong>
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500 font-sans">
            <span>
              <span className="font-semibold text-[#8b2500]">SecondLook</span> · Beta
            </span>
            <span>Generated {generatedAt}</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
