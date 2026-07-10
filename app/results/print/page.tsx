"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  getWhereToGetIt,
  normalizeCategory,
  urgencyRank,
  type TestCategory,
} from "@/lib/results/where-to-get-it"
import { startNewAnalysis } from "@/lib/results/start-new-analysis"
import { FeedbackModal } from "@/components/feedback-modal"

interface EvidenceItem {
  finding: string
  patientSymptom?: string
  strength?: "strong" | "moderate" | "weak"
  type?: "supporting" | "contradictory"
}

interface DiagnosisHypothesis {
  diagnosis: string
  displayName?: string
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
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  // Feedback modal: triggered 5s after landing on the report so the
  // reader has time to skim before the prompt appears. One-shot per
  // session — once dismissed or submitted, we don't re-pop. Mode flips
  // between "test" and "real" depending on whether the session came in
  // through the "Create Test User" shortcut.
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackMode, setFeedbackMode] = useState<"test" | "real">("real")

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

  // Feedback modal trigger: fire 5 seconds after the user lands on the
  // report so they have time to skim it first. Mode is decided by
  // whether the session was started via the "Create Test User"
  // shortcut (testUserGroundTruth in sessionStorage). One-shot per
  // session — sessionStorage.feedbackShown prevents re-prompts on
  // refresh or back-nav. Don't fire on the Puppeteer-driven PDF render
  // (it has user-agent "HeadlessChrome").
  useEffect(() => {
    if (loading || !analysis) return
    if (typeof window === "undefined") return
    if (sessionStorage.getItem("feedbackShown") === "1") return
    if (/HeadlessChrome|Puppeteer/i.test(navigator.userAgent || "")) return

    const groundTruthRaw = sessionStorage.getItem("testUserGroundTruth")
    setFeedbackMode(groundTruthRaw ? "test" : "real")

    const timer = window.setTimeout(() => {
      setShowFeedback(true)
      sessionStorage.setItem("feedbackShown", "1")
    }, 5000)
    return () => window.clearTimeout(timer)
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
  // Order by urgency tier (urgent -> routine -> when_available). The report
  // mirrors the next-steps page so the patient and their clinician read the
  // time-sensitive tests first.
  const sortedTests = [...tests].sort(
    (a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency),
  )

  const next = analysis.nextSteps || {}
  const redFlags = next.redFlags || []
  const immediateActions = next.immediateActions || []
  const specialistReferrals = next.specialistReferrals || []
  const dataGaps = analysis.dataGaps || []
  const generatedAt = meta?.timestamp || new Date().toLocaleString()

  // Server-side PDF: POST the sessionStorage payload to /api/generate-pdf
  // and stream the resulting blob to a download. Works identically across
  // mobile (where window.print is unreliable / blocked in in-app
  // browsers), desktop browsers (where print dialogs vary), and PWAs.
  const downloadPdf = async () => {
    if (pdfGenerating) return
    setPdfError(null)
    setPdfGenerating(true)
    try {
      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisResult: analysis,
          patientCase: patientCase,
          metadata: meta,
        }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(txt.slice(0, 200) || `Server returned ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `secondlook-report-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Give the browser a tick to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err: any) {
      setPdfError(err?.message || "PDF generation failed")
    } finally {
      setPdfGenerating(false)
    }
  }

  return (
    <div className="bg-white text-gray-900 print-root">
      {showFeedback && (
        <FeedbackModal
          mode={feedbackMode}
          analysisRequestId={(analysis as any)?.pipelineMetadata?.requestId || null}
          expectedDiagnosis={(() => {
            try {
              const raw = sessionStorage.getItem("testUserGroundTruth")
              if (!raw) return undefined
              return JSON.parse(raw)?.diagnosis
            } catch {
              return undefined
            }
          })()}
          actualTop1={diagnoses[0]?.diagnosis}
          onClose={() => setShowFeedback(false)}
          // The modal handles its own thank-you screen post-submit; this
          // callback fires when the user clicks Close on that screen.
          onSubmitted={() => setShowFeedback(false)}
        />
      )}
      {/* Print-only stylesheet */}
      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 0.55in;
          }
          .no-print {
            display: none !important;
          }
          .print-root {
            background: white !important;
            color: #1a1a1a !important;
          }
          /* Avoid-break is now reserved for truly atomic units (single
             differential rows, the cover header, the methodology footer).
             Individual test cards are slim enough after the legend fix
             that we let them split if needed — keeping them whole is what
             forced 2-tests-per-page in prior versions. */
          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          /* Keep section titles with their first child paragraph/article. */
          .print-root h2,
          .print-root h3 {
            break-after: avoid;
            page-break-after: avoid;
          }
          /* widows/orphans: 2 lets paragraphs split across pages with just
             2 lines stranded instead of 3, which lets the Clinical Summary
             share page 1 with Clinical Presentation instead of being forced
             onto a near-empty page 2. */
          .print-root p,
          .print-root li {
            widows: 2;
            orphans: 2;
          }
          /* Tighten section gaps in print so we don't waste 40% of every
             page on whitespace. */
          .print-root section {
            margin-bottom: 0.85rem !important;
          }
          /* Tighten the outer container padding for print — screen padding
             is fine but in print it pushes the cover header down ~80px and
             eats into the first page. */
          .print-root .print-container {
            padding-top: 0.25in !important;
            padding-bottom: 0.25in !important;
          }
          /* Cover header bottom margin: 8 = 2rem on screen is generous;
             1rem in print is plenty given the brand bar separator. */
          .print-root .print-cover-header {
            margin-bottom: 1rem !important;
          }
          /* Let the Recommended Next Steps section flow naturally instead
             of forcing a fresh page. The earlier break-before: page solved
             a specific stranded-header bug on a 6-page case, but on
             content-heavy 7+ page reports it wasted ~40% of the page
             below the legend by pushing the section to a fresh page
             before the prior page had filled. The break-after: avoid on
             h2 already keeps the section title with its first child
             (the intro paragraph + legend block). */
          .print-root .print-tests-section {
            break-before: auto;
            page-break-before: auto;
          }
          /* Diagnosis cards (#1 hero + ranks 2-N) need stronger widow
             control than paragraphs. Without this, supporting-evidence
             lists can split with just 1-2 bullets stranded at the top of
             the next page next to a SPECIALIST TO CONSULT line — ugly.
             widows: 5 forces the card to either keep 5+ bullets together
             at the bottom of a page or push the whole tail block to the
             next page. Bumped from 4 -> 5 when we started rendering
             evidence lists on every ranked diagnosis, not just #1. */
          .print-root .print-diagnosis-card,
          .print-root .print-diagnosis-card ul,
          .print-root .print-diagnosis-card li {
            widows: 5;
            orphans: 4;
          }
          /* Keep the header row (rank + diagnosis name + confidence)
             attached to the reasoning that follows — a page break here
             would strand the score column with no context. */
          .print-root .print-diagnosis-card > div:first-child {
            break-after: avoid;
            page-break-after: avoid;
          }
          /* Evidence grid + specialist line should stay together — that
             tail block always shares an interpretation logic and reads
             wrong if 'Findings against' ends up on one page and
             'Specialist to consult' on the next. */
          .print-root .print-diagnosis-card .grid,
          .print-root .print-diagnosis-card > div:last-child {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          /* Every section heading pairs with its first sibling: the
             heading should never sit alone at the bottom of a page. */
          .print-root section > h2 + * {
            break-before: avoid;
            page-break-before: avoid;
          }
          /* And the first paragraph inside a section (usually the intro
             line right after the h2) has to pair with what follows it,
             so a section can't start as "header + intro" stranded at the
             bottom of a page with the real content pushed alone to the
             next page. Screen-cap 1 of the user's report: Recommended
             Next Steps h2 + 'Each test below tells you...' intro landed
             at page top with ~500px whitespace, then legend + tests on
             next page. */
          .print-root section > h2 + p,
          .print-root section > h2 ~ p:first-of-type {
            break-after: avoid;
            page-break-after: avoid;
          }
          /* Clinical Presentation's Reported Findings — the header +
             2-col bullet grid was being split so 2 items sat on one
             page and the remaining 23 with ~600px whitespace on the
             next. Wrapped in a keep-together block so it either fits
             at bottom-of-page or moves whole to the next page. */
          .print-root .print-findings-block {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          /* Paragraphs inside a diagnosis card need stronger widow /
             orphan control than the site-wide default of 2. The #1
             hero card's clinicalReasoning paragraph was splitting at
             line 4 of 8 — 4 lines stranded on prior page, 4 on next,
             with ~200px whitespace between. widows/orphans of 3 forces
             a cleaner split. */
          .print-root .print-diagnosis-card p {
            widows: 3;
            orphans: 3;
          }
          /* The Recommended Next Steps intro block (h2 + explainer +
             legend) has to stick together. Marking the wrapper as
             avoid-break-inside so the browser treats them as one unit
             when deciding where to break. */
          .print-root .print-tests-intro {
            break-inside: avoid;
            page-break-inside: avoid;
            break-after: avoid;
            page-break-after: avoid;
          }
          /* Compact legend padding — recovers ~30px of vertical real
             estate on every legend without losing the visual block
             treatment. */
          .print-root .print-tests-legend {
            padding: 0.5rem !important;
          }
          .print-root .print-tests-legend dl > div {
            margin-bottom: 0.35rem !important;
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
            {pdfError ? (
              <span className="text-red-600">{pdfError}</span>
            ) : (
              "Download a portable PDF — same on mobile and desktop."
            )}
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
            onClick={downloadPdf}
            disabled={pdfGenerating}
            className="px-4 py-2 bg-[#8b2500] text-white text-sm font-semibold hover:bg-[#6d1d00] transition-colors disabled:opacity-70 disabled:cursor-wait flex items-center gap-2"
          >
            {pdfGenerating ? (
              <>
                <span className="inline-block h-3.5 w-3.5 border-2 border-white border-r-transparent rounded-full animate-spin" />
                Generating PDF…
              </>
            ) : (
              "Download PDF"
            )}
          </button>
        </div>
      </div>

      <div className="print-container max-w-[7.5in] mx-auto px-6 sm:px-10 py-8 sm:py-10 font-serif text-[#1a1a1a]">
        {/* Cover header — branded, professional, with AI-generated badge */}
        <header className="print-cover-header avoid-break mb-8">
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
        <section className="mb-6">
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
              <div className="print-findings-block mb-3">
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
          <section className="mb-6">
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
            <section className="mb-6">
              <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
                Most Likely Diagnosis
              </h2>
              <article className="print-diagnosis-card bg-[#faf6f0] border border-[#d4c5b0] border-l-4 border-l-[#8b2500] p-4 sm:p-5">
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
                      {top.displayName || top.diagnosis}
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
          <section className="mb-6">
            <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
              Additional Differential
            </h2>
            <div className="space-y-2.5">
              {diagnoses.slice(1).map((d, i) => {
                const score = pickPrimaryScore(d)
                const rank = i + 2
                const support = (d.supportingEvidence || []).slice(0, 6)
                const against = (d.contradictoryEvidence || []).slice(0, 3)
                return (
                  <article
                    key={i}
                    className="print-diagnosis-card border border-gray-200 p-3 sm:p-4"
                  >
                    {/* Header row: rank + diagnosis title + confidence */}
                    <div className="flex items-start gap-3 sm:gap-4">
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
                          {d.displayName || d.diagnosis}
                        </h3>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-600 font-sans mt-0.5 mb-1">
                          {d.icd10Code && <span>ICD-10 {d.icd10Code}</span>}
                          {d.omimId && <span>OMIM {d.omimId}</span>}
                          {d.rareDisease && <span className="font-medium">Rare</span>}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-xl font-bold text-[#8b2500] leading-none tabular-nums">
                          {fmtScore(score)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-sans">
                          conf
                        </div>
                      </div>
                    </div>

                    {/* Clinical reasoning — indented under the header row to
                        keep visual alignment with the evidence lists below. */}
                    {d.clinicalReasoning && (
                      <p className="text-[12px] text-gray-700 leading-snug mt-2 sm:ml-[3.25rem]">
                        {d.clinicalReasoning}
                      </p>
                    )}

                    {/* Supporting evidence + findings against — mirrors the
                        #1 hero card structure, so every ranked diagnosis has
                        the same evidence transparency. */}
                    {(support.length > 0 || against.length > 0) && (
                      <div className="mt-3 sm:ml-[3.25rem] grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                        {support.length > 0 && (
                          <div>
                            <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                              Supporting evidence
                            </div>
                            <ul className="text-[11.5px] text-gray-800 space-y-0.5">
                              {support.map((e, j) => (
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
                        {against.length > 0 && (
                          <div>
                            <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                              Findings against
                            </div>
                            <ul className="text-[11.5px] text-gray-800 space-y-0.5">
                              {against.map((e, j) => (
                                <li key={j} className="flex gap-2 leading-snug">
                                  <span className="text-gray-500 flex-shrink-0">•</span>
                                  <span>{e.finding}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Specialist to consult — same treatment as the #1
                        hero card, dimmer border since this is secondary. */}
                    {d.specialistRequired && (
                      <div className="mt-2.5 pt-2 sm:ml-[3.25rem] border-t border-gray-200 text-[11.5px] text-gray-700">
                        <span className="font-semibold font-sans text-[10px] uppercase tracking-wider text-gray-500">
                          Specialist to consult:
                        </span>{" "}
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
        {tests.length > 0 && (() => {
          // Compute the set of categories actually used by the recommended
          // tests so the "How to obtain these tests" legend only shows the
          // rows the patient will use. CATEGORY_ORDER imposes a stable
          // ordering. specialist_evaluate is intentionally excluded from the
          // shared legend because its `online.note` varies by specialty —
          // those telehealth pointers stay on the per-test card.
          const usedCategories = new Set<TestCategory>(
            sortedTests.map((t) => normalizeCategory(t.testType, t.testName)),
          )
          const legendCategories = CATEGORY_ORDER.filter(
            (c) => usedCategories.has(c) && c !== "specialist_evaluate",
          )
          return (
            <section className="print-tests-section mb-6">
              {/* Intro block: h2 + explainer + legend wrapped so the page
                  break never strands the header at the bottom of a page
                  with content pushed alone to the next. */}
              <div className="print-tests-intro">
                <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
                  Recommended Next Steps — Testing
                </h2>
                <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
                  Each test below tells you what it will reveal and which diagnoses it helps confirm or rule out. See the legend for how to obtain each type.
                </p>

              {/* Shared "how to obtain" legend — populated only with the test
                  categories that appear in this report. Replaces the
                  duplicated HOW TO GET IT box that previously printed
                  verbatim on every test card. */}
              {legendCategories.length > 0 && (
                <div className="print-tests-legend avoid-break border border-[#d4c5b0] bg-[#faf6f0] p-3 mb-4">
                  <div className="font-sans text-[10px] font-semibold uppercase tracking-wide text-[#8b2500] mb-2">
                    How to obtain these tests
                  </div>
                  <dl className="space-y-2 text-[11px] leading-relaxed">
                    {legendCategories.map((cat) => {
                      const where = getWhereToGetIt(cat, "")
                      return (
                        <div key={cat} className="grid grid-cols-[120px_1fr] gap-x-3">
                          <dt className="font-semibold text-gray-900 text-[11px]">
                            {CATEGORY_LABELS[cat]}
                          </dt>
                          <dd className="text-gray-800">
                            <div>{where.process}</div>
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
                                <span className="font-semibold">Online: </span>
                                {where.online.note}
                              </div>
                            )}
                          </dd>
                        </div>
                      )
                    })}
                  </dl>
                </div>
              )}
              </div>

              {/* 2-column grid — each test card is slim (3-4 lines) after
                  hoisting the boilerplate into the legend, so two fit
                  side-by-side comfortably at letter width. avoid-break on
                  each card keeps the title with its body. */}
              <div className="grid grid-cols-2 gap-2">
                {sortedTests.map((test, idx) => {
                  const cat = normalizeCategory(test.testType, test.testName)
                  // specialist_evaluate isn't in the shared legend (note
                  // varies by specialty); show the per-specialty telehealth
                  // note on the card itself. Other categories: legend covers
                  // it, card stays slim.
                  const specialistWhere =
                    cat === "specialist_evaluate" ? getWhereToGetIt(cat, test.testName) : null
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
                      <div className="text-xs text-gray-800 leading-relaxed mb-1">
                        <span className="font-semibold">What it tells you: </span>
                        {test.rationale}
                      </div>
                      {test.targetDiagnoses && test.targetDiagnoses.length > 0 && (
                        <div className="text-xs text-gray-700">
                          <span className="font-semibold">Helps confirm or rule out: </span>
                          {test.targetDiagnoses.join(", ")}
                        </div>
                      )}
                      {specialistWhere && (
                        <div className="text-xs text-gray-700 mt-1">
                          <span className="font-semibold">How to obtain: </span>
                          {specialistWhere.process}
                          {specialistWhere.online.available && specialistWhere.online.note && (
                            <> {specialistWhere.online.note}</>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })()}

        {/* Action items + specialists */}
        {(immediateActions.length > 0 || specialistReferrals.length > 0) && (
          <section className="mb-6">
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
          <section className="mb-6">
            <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b2500] mb-3 pb-1.5 border-b border-[#d4c5b0]">
              Information Gaps
            </h2>
            <p className="text-xs text-gray-600 mb-2">
              These pieces of information weren't available during analysis and could meaningfully change the diagnostic picture.
            </p>
            {/* 2-column compact list. The prior version put each gap in its
                own bordered card with vertical padding, which inflated the
                section to a full page for 13 items. The grid + tight
                leading lets a typical 10-15 gap list fit in ~half a
                page. */}
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {dataGaps.map((g, i) => {
                const title = g.description || g.item || g.gapType || "Information gap"
                const impact = g.impact || g.suggestedAction
                return (
                  <li key={i} className="flex gap-2 leading-snug">
                    <span className="text-[#8b2500] flex-shrink-0">•</span>
                    <div>
                      <span className="font-semibold text-gray-900">{title}</span>
                      {impact && <span className="text-gray-600"> — {impact}</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Warning signs */}
        {redFlags.length > 0 && (
          <section className="avoid-break mb-6">
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
