"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface RunSummary {
  age: string | null
  sex: string | null
  symptomCount: number
  top1Diagnosis: string | null
  top1Confidence: number | null
  top1EvidenceScore: number | null
  top1EvaluationType: string | null
  diagnosisCount: number
  refined: boolean
}

interface RunRow {
  id: string
  createdAt: string
  ip: string | null
  summary: RunSummary
}

const PASSWORD_STORAGE_KEY = "adminRunsPassword"

export default function AdminRunsPage() {
  const [password, setPassword] = useState<string>("")
  const [passwordInput, setPasswordInput] = useState("")
  const [authError, setAuthError] = useState("")
  const [authChecked, setAuthChecked] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // On mount: load any cached password and try a list. If the server replies
  // 401/403, surface the password prompt. If it replies 200, render the
  // list (even if it's empty — empty != unauthorized). Server config decides
  // whether a password is required at all; when TESTING_PASSWORD is unset
  // on the server, the API just returns 200 with no auth check.
  useEffect(() => {
    const cached = sessionStorage.getItem(PASSWORD_STORAGE_KEY) || ""
    setPassword(cached)
    tryLoad(cached)
  }, [])

  async function tryLoad(pw: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/prod-runs?limit=100`, {
        headers: pw ? { "x-admin-password": pw } : {},
      })
      if (res.status === 401 || res.status === 403) {
        setNeedsAuth(true)
        setAuthChecked(true)
        sessionStorage.removeItem(PASSWORD_STORAGE_KEY)
        setPassword("")
        setLoading(false)
        return
      }
      if (!res.ok) {
        setError(`Server returned ${res.status}`)
        setLoading(false)
        setAuthChecked(true)
        return
      }
      const data = await res.json()
      setRuns(data.runs || [])
      setTotal(data.total || 0)
      setNeedsAuth(false)
      if (pw) sessionStorage.setItem(PASSWORD_STORAGE_KEY, pw)
      setAuthChecked(true)
    } catch (err: any) {
      setError(err?.message || "Failed to load")
      setAuthChecked(true)
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAuthError("")
    const pw = passwordInput.trim()
    if (!pw) return
    try {
      const res = await fetch(`/api/admin/prod-runs?limit=100`, {
        headers: { "x-admin-password": pw },
      })
      if (res.status === 401 || res.status === 403) {
        setAuthError("Invalid password")
        return
      }
      const data = await res.json()
      setRuns(data.runs || [])
      setTotal(data.total || 0)
      setPassword(pw)
      sessionStorage.setItem(PASSWORD_STORAGE_KEY, pw)
    } catch (err: any) {
      setAuthError(err?.message || "Failed")
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    )
  }

  if (needsAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <form
          onSubmit={handlePasswordSubmit}
          className="bg-white border border-gray-200 p-8 max-w-md w-full"
        >
          <h1 className="text-xl font-bold mb-4 text-gray-900">Admin · Production Runs</h1>
          <p className="text-sm text-gray-600 mb-4">
            Enter the admin password.
          </p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 mb-2 text-sm"
            placeholder="Password"
          />
          {authError && (
            <div className="text-red-600 text-sm mb-2">{authError}</div>
          )}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-[#8b2500] text-white text-sm font-semibold hover:bg-[#6d1d00]"
          >
            Sign in
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/admin" className="inline-block text-sm text-[#8b2500] hover:underline mb-4">
          ← Admin
        </Link>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Production Runs</h1>
            <p className="text-sm text-gray-600 mt-1">
              {total} total · showing newest {runs.length}
            </p>
          </div>
          <button
            onClick={() => tryLoad(password)}
            disabled={loading}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-900 p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">When</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">IP</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Patient</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Symptoms</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Top-1 Diagnosis</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700">Conf</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700">Score</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Type</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700">Dx</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Refined</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const when = new Date(r.createdAt)
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap" title={when.toISOString()}>
                      {when.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-gray-700 font-mono text-xs">
                      {r.ip || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {r.summary.age ? `${r.summary.age}y` : "—"}
                      {r.summary.sex ? ` ${r.summary.sex}` : ""}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-right">
                      {r.summary.symptomCount}
                    </td>
                    <td className="px-3 py-2 text-gray-900 font-medium max-w-md truncate" title={r.summary.top1Diagnosis || ""}>
                      {r.summary.top1Diagnosis || "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {typeof r.summary.top1Confidence === "number"
                        ? `${Math.round(r.summary.top1Confidence)}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {typeof r.summary.top1EvidenceScore === "number" && r.summary.top1EvidenceScore > 0
                        ? Math.round(r.summary.top1EvidenceScore)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={
                          r.summary.top1EvaluationType === "criteria-grounded"
                            ? "text-emerald-700"
                            : "text-gray-500"
                        }
                      >
                        {r.summary.top1EvaluationType === "criteria-grounded"
                          ? "KB"
                          : r.summary.top1EvaluationType === "reasoning-evaluated"
                            ? "RR"
                            : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {r.summary.diagnosisCount}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {r.summary.refined ? "yes" : ""}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/runs/${encodeURIComponent(r.id)}`}
                        className="text-[#8b2500] font-medium hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {runs.length === 0 && !loading && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-gray-500">
                    No runs captured yet. Run an analysis at <Link href="/" className="underline">/</Link> to populate this list.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
