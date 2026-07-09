"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Download, ExternalLink, Info } from "lucide-react"
import { Layout } from "@/components/layout"
import type { IntegrativeAnalysisResult, IntegrativeSpecialistOutput } from "@/lib/types/integrative"

const SPECIALTY_ORDER = [
  "functional-medicine",
  "naturopath",
  "tcm-acupuncture",
  "ayurveda",
  "mind-body-somatic",
] as const

const CATEGORY_LABELS: Record<string, string> = {
  supplement: "Supplement",
  lifestyle: "Lifestyle",
  therapy: "Therapy",
  diet: "Diet",
  movement: "Movement",
  mindset: "Mindset",
  other: "Other",
}

export default function IntegrativeResultsPage({ params }: { params: { requestId: string } }) {
  const router = useRouter()
  const [analysis, setAnalysis] = useState<IntegrativeAnalysisResult | null>(null)
  const [loadError, setLoadError] = useState<string>("")
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/get-integrative/${encodeURIComponent(params.requestId)}`, { cache: "no-store" })
        if (!res.ok) {
          setLoadError(res.status === 404 ? "This integrative report is no longer available." : `Failed to load (${res.status}).`)
          return
        }
        const body = await res.json()
        if (!cancelled) setAnalysis(body.run)
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || "Failed to load report")
      }
    })()
    return () => { cancelled = true }
  }, [params.requestId])

  const handleDownloadPdf = async () => {
    if (!analysis || pdfLoading) return
    setPdfLoading(true)
    try {
      const res = await fetch("/api/generate-integrative-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: params.requestId }),
      })
      if (!res.ok) throw new Error(`PDF generation failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `secondlook-integrative-${params.requestId}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`Could not generate PDF: ${err?.message || "unknown error"}`)
    } finally {
      setPdfLoading(false)
    }
  }

  if (loadError) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
            <div className="font-semibold text-amber-900 mb-2">Report unavailable</div>
            <div className="text-sm text-amber-800">{loadError}</div>
          </div>
        </div>
      </Layout>
    )
  }

  if (!analysis) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="text-slate-600">Loading integrative report…</div>
        </div>
      </Layout>
    )
  }

  const orderedSpecialists = SPECIALTY_ORDER
    .map((s) => analysis.perSpecialist.find((p) => p.specialty === s))
    .filter((p): p is IntegrativeSpecialistOutput => Boolean(p))

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

        {/* Top nav */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            href={`/results/analysis?requestId=${encodeURIComponent(analysis.clinicalRequestId)}`}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Return to clinical results
          </Link>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {pdfLoading ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 mb-3">
            <Info className="h-3.5 w-3.5" />
            Complementary perspective — not a diagnosis
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif text-slate-900 mb-3">
            Integrative Medicine Perspective
          </h1>
          <p className="text-slate-700">
            Five practitioners in different traditions reviewed your case. This report sits alongside — never replaces — your clinical differential.
          </p>
        </div>

        {/* Top disclaimer */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 mb-10">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-800 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 leading-relaxed">
              <strong>Please read before continuing:</strong> This is a <em>complementary view</em>, not a diagnosis and not medical advice. Bring the clinical differential (from your regular SecondLook report) to your primary care physician first. Discuss any tests or interventions below with a licensed practitioner in the relevant tradition — and with your doctor — before acting on them. <strong>Do not delay, avoid, or stop conventional medical care based on this report.</strong> Botanicals and supplements can interact with prescription medications; disclose everything to your prescriber.
            </div>
          </div>
        </div>

        {/* Consensus */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-3">Panel consensus</h2>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="text-slate-900 text-lg leading-relaxed mb-4">
              {analysis.consensusRootCause}
            </div>
            {analysis.overallReasoning && (
              <div className="text-slate-600 text-sm leading-relaxed border-t border-slate-100 pt-4">
                {analysis.overallReasoning}
              </div>
            )}
          </div>
        </section>

        {/* Merged tests */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-3">Tests to discuss with a practitioner</h2>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-sm text-amber-900">
            Many of these are ordered outside standard-of-care and may be self-pay. Ask a licensed practitioner in the relevant tradition to interpret results — findings out of context are hard to act on.
          </div>
          <ul className="space-y-3">
            {analysis.mergedTests.map((t, i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="font-semibold text-slate-900">{t.name}</div>
                {t.rationale && (
                  <div className="text-sm text-slate-700 mt-1">{t.rationale}</div>
                )}
                {t.practitionerType && (
                  <div className="text-xs text-slate-500 mt-2">
                    Typically ordered by: {t.practitionerType}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Merged interventions */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-3">Interventions to explore</h2>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-sm text-amber-900">
            These are things to explore with a licensed practitioner. Nothing here should be started without discussing with your physician — especially if you take prescription medications, as many botanicals and supplements have interaction risks.
          </div>
          <ul className="space-y-3">
            {analysis.mergedInterventions.map((v, i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-slate-900">{v.name}</div>
                  <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 shrink-0">
                    {CATEGORY_LABELS[v.category] || v.category}
                  </span>
                </div>
                {v.rationale && (
                  <div className="text-sm text-slate-700 mt-1">{v.rationale}</div>
                )}
                {v.toDiscussWith && (
                  <div className="text-xs text-slate-500 mt-2">
                    Discuss with: {v.toDiscussWith}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Per-specialist breakdown */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-3">Individual practitioner perspectives</h2>
          <p className="text-sm text-slate-600 mb-6">
            Each practitioner reviewed the same case independently. Their unique frameworks and vocabularies are preserved below.
          </p>
          <div className="space-y-6">
            {orderedSpecialists.map((s) => (
              <div key={s.specialty} className="rounded-lg border border-slate-200 bg-white p-6">
                <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  {s.displayName}
                </div>
                <div className="text-slate-900 text-lg font-medium mb-3">
                  {s.rootCauseHypothesis}
                </div>
                {s.reasoning && (
                  <div className="text-sm text-slate-700 leading-relaxed mb-4">
                    {s.reasoning}
                  </div>
                )}
                {s.recommendedTests.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Tests they would consider
                    </div>
                    <ul className="text-sm text-slate-700 space-y-1">
                      {s.recommendedTests.map((t, i) => (
                        <li key={i}>• {t.name}{t.rationale ? ` — ${t.rationale}` : ""}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.interventions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Interventions they suggest exploring
                    </div>
                    <ul className="text-sm text-slate-700 space-y-1">
                      {s.interventions.map((v, i) => (
                        <li key={i}>• [{CATEGORY_LABELS[v.category] || v.category}] {v.name}{v.rationale ? ` — ${v.rationale}` : ""}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Final reminder */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 mb-10 text-sm text-slate-700 leading-relaxed">
          <strong>One more time, because it matters:</strong> the report above is a complementary integrative perspective on your case. It is not a substitute for evaluation by a licensed physician, and it is not a diagnosis. Bring your clinical results to your PCP first, and consult a licensed practitioner in the relevant tradition before pursuing any of these tests or interventions.
        </div>

        {/* Bottom nav */}
        <div className="text-center">
          <Link
            href={`/results/analysis?requestId=${encodeURIComponent(analysis.clinicalRequestId)}`}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Return to clinical results
          </Link>
        </div>
      </div>
    </Layout>
  )
}
