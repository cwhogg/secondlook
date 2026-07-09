"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
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

export default function IntegrativePrintPage() {
  const [analysis, setAnalysis] = useState<IntegrativeAnalysisResult | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("integrativeAnalysis")
      if (raw) setAnalysis(JSON.parse(raw))
    } catch (err) {
      console.error("[print-integrative] failed to load sessionStorage payload", err)
    }
  }, [])

  if (!analysis) {
    return (
      <div className="p-6 text-slate-500 text-sm">Preparing integrative report…</div>
    )
  }

  const ordered = SPECIALTY_ORDER
    .map((s) => analysis.perSpecialist.find((p) => p.specialty === s))
    .filter((p): p is IntegrativeSpecialistOutput => Boolean(p))

  return (
    <div className="print-integrative">
      <style jsx global>{`
        @page {
          size: letter;
          margin: 0.55in;
        }
        @media print {
          html, body { background: white !important; }
          .print-integrative {
            font-family: Georgia, "Times New Roman", serif;
            color: #1e293b;
            font-size: 10.5pt;
            line-height: 1.5;
          }
          .print-integrative h1 { font-size: 20pt; margin: 0 0 6pt; }
          .print-integrative h2 { font-size: 14pt; margin: 14pt 0 6pt; break-after: avoid; }
          .print-integrative .header { border-bottom: 2px solid #334155; padding-bottom: 8pt; margin-bottom: 12pt; }
          .print-integrative .subtag { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; color: #92400e; margin-bottom: 4pt; }
          .print-integrative .disclaimer { background: #fef3c7; border: 1px solid #fcd34d; padding: 8pt 10pt; margin: 10pt 0; font-size: 9.5pt; break-inside: avoid; }
          .print-integrative .card { border: 1px solid #cbd5e1; padding: 10pt; margin-bottom: 8pt; break-inside: avoid; }
          .print-integrative .card .label { font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
          .print-integrative .card .title { font-weight: 600; font-size: 11pt; margin: 2pt 0; }
          .print-integrative .card .rationale { color: #334155; margin-top: 3pt; }
          .print-integrative .card .meta { color: #64748b; font-size: 9pt; margin-top: 4pt; }
          .print-integrative .footer { border-top: 1px solid #cbd5e1; margin-top: 20pt; padding-top: 8pt; font-size: 9pt; color: #64748b; }
          .print-integrative section { margin-bottom: 12pt; }
          .print-integrative ul { padding-left: 14pt; margin: 4pt 0; }
          .print-integrative li { margin: 2pt 0; break-inside: avoid; }
        }
      `}</style>

      <div className="header">
        <div className="subtag">Complementary perspective — not a diagnosis</div>
        <h1>Integrative Medicine Perspective</h1>
        <div style={{ fontSize: "9.5pt", color: "#64748b" }}>
          Generated {new Date(analysis.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      <div className="disclaimer">
        <strong>Please read:</strong> This is a complementary view, not a diagnosis and not medical advice. Bring the clinical differential (from your regular SecondLook report) to your primary care physician first. Discuss any tests or interventions below with a licensed practitioner in the relevant tradition — and with your doctor — before acting on them. <strong>Do not delay, avoid, or stop conventional medical care based on this report.</strong> Botanicals and supplements can interact with prescription medications; disclose everything to your prescriber.
      </div>

      <section>
        <h2>Panel consensus</h2>
        <div style={{ fontSize: "11.5pt", marginBottom: "6pt" }}>{analysis.consensusRootCause}</div>
        {analysis.overallReasoning && (
          <div style={{ fontSize: "10pt", color: "#475569" }}>{analysis.overallReasoning}</div>
        )}
      </section>

      <section>
        <h2>Tests to discuss with a practitioner</h2>
        <div className="disclaimer">
          Many of these are ordered outside standard-of-care and may be self-pay. Ask a licensed practitioner in the relevant tradition to interpret results.
        </div>
        {analysis.mergedTests.map((t, i) => (
          <div key={i} className="card">
            <div className="title">{t.name}</div>
            {t.rationale && <div className="rationale">{t.rationale}</div>}
            {t.practitionerType && <div className="meta">Typically ordered by: {t.practitionerType}</div>}
          </div>
        ))}
      </section>

      <section>
        <h2>Interventions to explore</h2>
        <div className="disclaimer">
          These are things to explore with a licensed practitioner. Nothing here should be started without discussing with your physician — especially if you take prescription medications.
        </div>
        {analysis.mergedInterventions.map((v, i) => (
          <div key={i} className="card">
            <div className="label">{CATEGORY_LABELS[v.category] || v.category}</div>
            <div className="title">{v.name}</div>
            {v.rationale && <div className="rationale">{v.rationale}</div>}
            {v.toDiscussWith && <div className="meta">Discuss with: {v.toDiscussWith}</div>}
          </div>
        ))}
      </section>

      <section>
        <h2>Individual practitioner perspectives</h2>
        {ordered.map((s) => (
          <div key={s.specialty} className="card">
            <div className="label">{s.displayName}</div>
            <div className="title" style={{ fontSize: "11.5pt", margin: "3pt 0 4pt" }}>{s.rootCauseHypothesis}</div>
            {s.reasoning && (
              <div style={{ fontSize: "10pt", color: "#334155", marginBottom: "4pt" }}>{s.reasoning}</div>
            )}
            {s.recommendedTests.length > 0 && (
              <>
                <div className="label" style={{ marginTop: "4pt" }}>Tests to consider</div>
                <ul>
                  {s.recommendedTests.map((t, i) => (
                    <li key={i}>{t.name}{t.rationale ? ` — ${t.rationale}` : ""}</li>
                  ))}
                </ul>
              </>
            )}
            {s.interventions.length > 0 && (
              <>
                <div className="label">Interventions to explore</div>
                <ul>
                  {s.interventions.map((v, i) => (
                    <li key={i}>[{CATEGORY_LABELS[v.category] || v.category}] {v.name}{v.rationale ? ` — ${v.rationale}` : ""}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </section>

      <div className="footer">
        <strong>Reminder:</strong> the report above is a complementary integrative perspective on your case. It is not a substitute for evaluation by a licensed physician, and it is not a diagnosis. Bring your clinical results to your PCP first, and consult a licensed practitioner in the relevant tradition before pursuing any of these tests or interventions.
      </div>
    </div>
  )
}
