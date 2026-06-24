"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

const PASSWORD_STORAGE_KEY = "adminRunsPassword"

interface ProdRunRecord {
  id: string
  createdAt: string
  ip: string | null
  userAgent: string | null
  durationMs: number
  patientCase: any
  analysisResult: any
  summary: any
}

export default function AdminRunDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ? decodeURIComponent(params.id as string) : ""
  const router = useRouter()
  const [run, setRun] = useState<ProdRunRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showJson, setShowJson] = useState(false)

  useEffect(() => {
    const pw = sessionStorage.getItem(PASSWORD_STORAGE_KEY) || ""
    fetch(`/api/admin/prod-runs/${encodeURIComponent(id)}`, {
      headers: pw ? { "x-admin-password": pw } : {},
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.push("/admin/runs")
          return
        }
        if (res.status === 404) {
          setError("Not found")
          return
        }
        if (!res.ok) {
          setError(`Server returned ${res.status}`)
          return
        }
        const data = await res.json()
        setRun(data.run)
      })
      .catch((err) => setError(err?.message || "Failed"))
      .finally(() => setLoading(false))
  }, [id, router])

  // Open the persisted analysis in the same /results/print viewer used for
  // live reports. The viewer pulls from sessionStorage, so we populate the
  // same keys the live flow uses, then open the report page in a new tab.
  function openAsReport() {
    if (!run) return
    try {
      sessionStorage.setItem("analysisResult", JSON.stringify(run.analysisResult))
      sessionStorage.setItem("analysisPatientCase", JSON.stringify(run.patientCase))
      sessionStorage.setItem(
        "analysisMetadata",
        JSON.stringify({
          timestamp: run.createdAt,
          patientAge: run.patientCase?.demographics?.age,
          patientSex: run.patientCase?.demographics?.sex,
          patientHypothesis: run.patientCase?.patientHypothesis,
        }),
      )
      window.open("/results/print", "_blank")
    } catch (err: any) {
      alert(`Failed to open report: ${err?.message || "unknown"}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-3xl mx-auto bg-white border border-red-200 p-6">
          <h1 className="text-lg font-bold text-red-900 mb-2">Error</h1>
          <p className="text-sm text-red-800 mb-4">{error}</p>
          <Link href="/admin/runs" className="text-[#8b2500] underline">
            ← Back to list
          </Link>
        </div>
      </div>
    )
  }

  if (!run) return null

  const top = run.analysisResult?.differentialDiagnoses?.[0]
  const stages: any[] = run.analysisResult?.pipelineMetadata?.stages || []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-sm text-gray-500 hover:text-[#8b2500] hover:underline">
              Admin
            </Link>
            <span className="text-gray-300">/</span>
            <Link href="/admin/runs" className="text-sm text-[#8b2500] hover:underline">
              ← Back to list
            </Link>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openAsReport}
              className="px-4 py-2 bg-[#8b2500] text-white text-sm font-semibold hover:bg-[#6d1d00]"
            >
              Open as report ↗
            </button>
            <button
              onClick={() => setShowJson((v) => !v)}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              {showJson ? "Hide JSON" : "Show JSON"}
            </button>
          </div>
        </div>

        {/* Run metadata */}
        <div className="bg-white border border-gray-200 p-5">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {top?.diagnosis || "(no top diagnosis)"}
          </h1>
          <div className="text-sm text-gray-600 mb-4">
            Confidence{" "}
            <span className="font-semibold text-gray-900">
              {typeof top?.confidenceScore === "number" ? `${Math.round(top.confidenceScore)}%` : "—"}
            </span>{" "}
            · Type{" "}
            <span className="font-semibold text-gray-900">
              {top?.evaluationType === "criteria-grounded" ? "KB" : "RR"}
            </span>{" "}
            · {run.analysisResult?.differentialDiagnoses?.length || 0} hypotheses total
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
            <Field label="Request ID" value={run.id} mono />
            <Field label="Captured" value={new Date(run.createdAt).toLocaleString()} />
            <Field label="Pipeline duration" value={`${(run.durationMs / 1000).toFixed(1)}s`} />
            <Field label="Patient" value={`${run.patientCase?.demographics?.age || "—"}y ${run.patientCase?.demographics?.sex || ""}`.trim()} />
            <Field label="IP" value={run.ip || "—"} mono />
            <Field label="User agent" value={run.userAgent || "—"} truncate />
            <Field label="Symptoms" value={String(run.patientCase?.symptoms?.length || 0)} />
            <Field label="Refined" value={run.summary?.refined ? "yes" : "no"} />
          </dl>
        </div>

        {/* Chief complaint */}
        {run.patientCase?.chiefComplaint?.description && (
          <div className="bg-white border border-gray-200 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Chief complaint
            </h2>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {run.patientCase.chiefComplaint.description}
            </p>
          </div>
        )}

        {/* Top-10 ranking summary */}
        {run.analysisResult?.differentialDiagnoses && (
          <div className="bg-white border border-gray-200 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Top-10 ranking
            </h2>
            <ol className="space-y-1.5 text-sm">
              {run.analysisResult.differentialDiagnoses.slice(0, 10).map((d: any, i: number) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-gray-400 w-6">#{i + 1}</span>
                  <span className="flex-1 text-gray-900">{d.diagnosis}</span>
                  <span className="text-xs text-gray-500">
                    {d.evaluationType === "criteria-grounded" ? "KB" : "RR"}
                  </span>
                  <span className="text-xs text-gray-600 font-mono w-12 text-right">
                    {typeof d.confidenceScore === "number" ? `${Math.round(d.confidenceScore)}%` : "—"}
                  </span>
                  <span className="text-xs text-gray-500 w-32 text-right truncate" title={d.sourceAgent}>
                    {d.sourceAgent || ""}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Pipeline stages */}
        {stages.length > 0 && (
          <div className="bg-white border border-gray-200 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Pipeline stages
            </h2>
            <table className="w-full text-xs">
              <thead className="border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="py-1.5 pr-3 font-semibold">Stage</th>
                  <th className="py-1.5 pr-3 font-semibold">Agent</th>
                  <th className="py-1.5 pr-3 font-semibold">Model</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Dur</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Tokens</th>
                  <th className="py-1.5 font-semibold">Output</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s: any, i: number) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 text-gray-700 font-medium">{s.stageName}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{s.agentName}</td>
                    <td className="py-1.5 pr-3 text-gray-600 font-mono">{s.model}</td>
                    <td className="py-1.5 pr-3 text-gray-600 text-right">
                      {typeof s.durationMs === "number" ? `${(s.durationMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-600 text-right">
                      {typeof s.tokensUsed === "number" ? s.tokensUsed.toLocaleString() : "—"}
                    </td>
                    <td className="py-1.5 text-gray-700">{s.outputSummary || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showJson && (
          <div className="bg-white border border-gray-200 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Raw record
            </h2>
            <pre className="text-[10px] font-mono whitespace-pre-wrap break-all overflow-x-auto bg-gray-50 p-3 border border-gray-200 max-h-[600px] overflow-y-auto">
              {JSON.stringify(run, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  mono,
  truncate,
}: {
  label: string
  value: string
  mono?: boolean
  truncate?: boolean
}) {
  return (
    <div>
      <dt className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">{label}</dt>
      <dd className={`text-gray-900 ${mono ? "font-mono" : ""} ${truncate ? "truncate" : ""}`}>
        {value}
      </dd>
    </div>
  )
}
