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
          /* Belt + suspenders: hide any fixed floating UI (feedback pill,
             toasts, overlays) that might survive into the print DOM. */
          body [class*="fixed bottom"],
          body [class*="fixed top"],
          body [role="dialog"] { display: none !important; }

          .print-integrative {
            font-family: Georgia, "Times New Roman", serif;
            color: #1e293b;
            font-size: 10.5pt;
            line-height: 1.55;
          }
          .print-integrative h1 { font-size: 22pt; margin: 0 0 6pt; letter-spacing: -0.01em; }
          .print-integrative h2 { font-size: 15pt; margin: 0 0 10pt; break-after: avoid; letter-spacing: -0.005em; color: #0f172a; }
          .print-integrative .header { border-bottom: 2px solid #334155; padding-bottom: 10pt; margin-bottom: 14pt; }
          .print-integrative .subtag { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; color: #92400e; margin-bottom: 5pt; font-weight: 600; }
          .print-integrative .disclaimer { background: #fef3c7; border: 1px solid #fcd34d; padding: 10pt 12pt; margin: 10pt 0 14pt; font-size: 9.5pt; break-inside: avoid; }
          .print-integrative .footer { border-top: 1px solid #cbd5e1; margin-top: 20pt; padding-top: 10pt; font-size: 9pt; color: #64748b; break-inside: avoid; }

          /* Each MAJOR section starts on a fresh page except the first (which
             sits on page 1 under the header + disclaimer). */
          .print-integrative section { margin: 0; }
          .print-integrative section + section { break-before: page; page-break-before: always; }

          /* Merged-list item cards (Tests + Interventions on the main sheet) */
          .print-integrative .list-item {
            break-inside: avoid;
            padding: 8pt 10pt 8pt 12pt;
            border-left: 3pt solid #cbd5e1;
            margin-bottom: 8pt;
            background: #f8fafc;
          }
          .print-integrative .list-item .item-head { display: flex; align-items: baseline; gap: 6pt; margin-bottom: 2pt; }
          .print-integrative .list-item .item-title { font-weight: 700; font-size: 11pt; color: #0f172a; }
          .print-integrative .list-item .item-rationale { font-size: 10pt; color: #334155; margin-top: 3pt; }
          .print-integrative .list-item .item-meta { font-size: 9pt; color: #64748b; margin-top: 4pt; font-style: italic; }
          .print-integrative .chip {
            display: inline-block;
            background: #dbeafe;
            color: #1e40af;
            font-size: 8pt;
            font-weight: 700;
            padding: 1pt 6pt;
            border-radius: 8pt;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            vertical-align: middle;
          }

          /* Practitioner cards — each on its own page for readability. */
          .print-integrative .practitioner-card {
            padding: 12pt;
            border: 1pt solid #cbd5e1;
            border-left: 4pt solid #8b7355;
            background: #fafaf7;
            break-inside: avoid;
          }
          .print-integrative section .practitioner-card + .practitioner-card { break-before: page; page-break-before: always; }
          .print-integrative .practitioner-card .prac-header { font-size: 10pt; color: #78716c; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin-bottom: 6pt; }
          .print-integrative .practitioner-card .prac-hypothesis { font-weight: 600; font-size: 12pt; color: #0f172a; margin-bottom: 6pt; line-height: 1.4; }
          .print-integrative .practitioner-card .prac-reasoning { font-size: 10pt; color: #334155; margin-bottom: 10pt; }
          .print-integrative .practitioner-card .sub-label { font-size: 9pt; color: #57534e; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin: 8pt 0 5pt; break-after: avoid; }
          .print-integrative .practitioner-card .sub-item { padding: 5pt 0 5pt 10pt; border-left: 2pt solid #d6d3d1; margin-bottom: 4pt; break-inside: avoid; }
          .print-integrative .practitioner-card .sub-item-title { font-weight: 600; font-size: 10pt; color: #1c1917; }
          .print-integrative .practitioner-card .sub-item-rationale { font-size: 9.5pt; color: #57534e; margin-top: 2pt; }
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
          <div key={i} className="list-item">
            <div className="item-head">
              <span className="item-title">{t.name}</span>
            </div>
            {t.rationale && <div className="item-rationale">{t.rationale}</div>}
            {t.practitionerType && <div className="item-meta">Typically ordered by: {t.practitionerType}</div>}
          </div>
        ))}
      </section>

      <section>
        <h2>Interventions to explore</h2>
        <div className="disclaimer">
          These are things to explore with a licensed practitioner. Nothing here should be started without discussing with your physician — especially if you take prescription medications.
        </div>
        {analysis.mergedInterventions.map((v, i) => (
          <div key={i} className="list-item">
            <div className="item-head">
              <span className="chip">{CATEGORY_LABELS[v.category] || v.category}</span>
              <span className="item-title">{v.name}</span>
            </div>
            {v.rationale && <div className="item-rationale">{v.rationale}</div>}
            {v.toDiscussWith && <div className="item-meta">Discuss with: {v.toDiscussWith}</div>}
          </div>
        ))}
      </section>

      <section>
        <h2>Individual practitioner perspectives</h2>
        {ordered.map((s) => (
          <div key={s.specialty} className="practitioner-card">
            <div className="prac-header">{s.displayName}</div>
            <div className="prac-hypothesis">{s.rootCauseHypothesis}</div>
            {s.reasoning && <div className="prac-reasoning">{s.reasoning}</div>}
            {s.recommendedTests.length > 0 && (
              <>
                <div className="sub-label">Tests to consider</div>
                {s.recommendedTests.map((t, i) => (
                  <div key={i} className="sub-item">
                    <div className="sub-item-title">{t.name}</div>
                    {t.rationale && <div className="sub-item-rationale">{t.rationale}</div>}
                  </div>
                ))}
              </>
            )}
            {s.interventions.length > 0 && (
              <>
                <div className="sub-label">Interventions to explore</div>
                {s.interventions.map((v, i) => (
                  <div key={i} className="sub-item">
                    <div className="sub-item-title">
                      <span className="chip" style={{ marginRight: "6pt" }}>{CATEGORY_LABELS[v.category] || v.category}</span>
                      {v.name}
                    </div>
                    {v.rationale && <div className="sub-item-rationale">{v.rationale}</div>}
                  </div>
                ))}
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
