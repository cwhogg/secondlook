"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { STEP_LABELS, type SessionRecord, type StepIndex } from "@/lib/admin/sessions"
import { AlertCircle, CheckCircle, Trash2 } from "lucide-react"

const PASSWORD_STORAGE_KEY = "adminSessionsPassword"

/**
 * Sessions dashboard. Two panels stacked:
 *   1. Summary cards + dropoff funnel across all sessions in the page.
 *   2. Sortable table of individual sessions with IP, last step, patient
 *      info snapshot, symptoms, top-1 diagnosis + confidence, time on
 *      site, and a link to the analysis page when completed.
 *
 * Auth follows the same header-only pattern as /admin/runs.
 */
export default function AdminSessionsPage() {
  const [password, setPassword] = useState("")
  const [passwordInput, setPasswordInput] = useState("")
  const [needsAuth, setNeedsAuth] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [authError, setAuthError] = useState("")
  const [records, setRecords] = useState<SessionRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cached = sessionStorage.getItem(PASSWORD_STORAGE_KEY) || ""
    setPassword(cached)
    tryLoad(cached)
  }, [])

  async function tryLoad(pw: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/sessions?limit=300", {
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
      setRecords(Array.isArray(data.records) ? data.records : [])
      setTotal(typeof data.total === "number" ? data.total : 0)
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
      const res = await fetch("/api/admin/sessions?limit=300", {
        headers: { "x-admin-password": pw },
      })
      if (res.status === 401 || res.status === 403) {
        setAuthError("Invalid password")
        return
      }
      const data = await res.json()
      setRecords(data.records || [])
      setTotal(data.total || 0)
      setPassword(pw)
      setNeedsAuth(false)
      sessionStorage.setItem(PASSWORD_STORAGE_KEY, pw)
    } catch (err: any) {
      setAuthError(err?.message || "Failed")
    }
  }

  // Aggregates
  const stats = useMemo(() => computeStats(records), [records])

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
          <h1 className="text-xl font-bold mb-4 text-gray-900">
            Admin · Sessions
          </h1>
          <p className="text-sm text-gray-600 mb-4">Enter the admin password.</p>
          <input
            type="text"
            name="username"
            autoComplete="username"
            value="secondlook-admin"
            readOnly
            hidden
          />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 mb-2 text-sm"
            placeholder="Password"
          />
          {authError && <div className="text-red-600 text-sm mb-2">{authError}</div>}
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
        <div className="flex flex-wrap items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sessions &amp; Usage</h1>
            <p className="text-sm text-gray-600 mt-1">
              {total} total sessions · showing {records.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PurgeBotsButton password={password} onDone={() => tryLoad(password)} />
            <button
              onClick={() => tryLoad(password)}
              disabled={loading}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Summary cards */}
        <SummaryCards stats={stats} />

        {/* Funnel */}
        <FunnelChart stats={stats} />

        {/* Session table */}
        <SessionTable
          records={records}
          password={password}
          onDeleted={(id) => setRecords((prev) => prev.filter((r) => r.id !== id))}
        />
      </div>
    </div>
  )
}

// ================== purge control ==================

function PurgeBotsButton({
  password,
  onDone,
}: {
  password: string
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const purge = async (opts: { botsOnly?: boolean; ips?: string[] }) => {
    if (busy) return
    // eslint-disable-next-line no-alert
    const promptedIps =
      !opts.ips && !opts.botsOnly
        ? window.prompt(
            "Comma-separated IPs to purge (leave blank to cancel):",
            "",
          ) || ""
        : ""
    const ips = opts.ips ?? (promptedIps ? promptedIps.split(",").map((s) => s.trim()).filter(Boolean) : [])
    if (!opts.botsOnly && ips.length === 0) return
    const label = opts.botsOnly ? "known bot IP ranges" : `${ips.length} IP(s)`
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Purge sessions from ${label}?`)) return
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(password ? { "x-admin-password": password } : {}),
        },
        body: JSON.stringify({ botsOnly: opts.botsOnly === true, ips }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setNote(`Purged ${data?.deleted ?? 0} sessions.`)
      onDone()
    } catch (err: any) {
      setNote(`Failed: ${err?.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => purge({ botsOnly: true })}
          disabled={busy}
          className="px-4 py-2 bg-white border border-red-300 text-red-800 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
          title="Delete sessions whose IP matches known Vercel monitor or search-crawler ranges"
        >
          {busy ? "Purging…" : "Purge bots"}
        </button>
        <button
          onClick={() => purge({})}
          disabled={busy}
          className="px-4 py-2 bg-white border border-red-300 text-red-800 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
          title="Delete every session with a specific client IP"
        >
          Purge IP…
        </button>
      </div>
      {note && (
        <div className="absolute right-0 top-full mt-1 text-xs text-gray-700 bg-white border border-gray-200 px-2 py-1 whitespace-nowrap">
          {note}
        </div>
      )}
    </div>
  )
}

// ================== summary card row ==================

interface Stats {
  total: number
  completedAnalysis: number
  completionRate: number // 0-100
  avgTimeMs: number
  medianTimeMs: number
  stepCounts: Array<{ step: StepIndex; entered: number; completed: number }>
}

function computeStats(records: SessionRecord[]): Stats {
  const total = records.length
  const completed = records.filter((r) => r.furthestStep >= 8).length
  const completionRate = total === 0 ? 0 : (completed / total) * 100
  const times = records.map((r) => r.totalTimeMs).sort((a, b) => a - b)
  const avg = times.length === 0 ? 0 : times.reduce((s, x) => s + x, 0) / times.length
  const median = times.length === 0 ? 0 : times[Math.floor(times.length / 2)]

  // Per-step "how many sessions reached this step" and "how many
  // completed it (moved beyond)". Steps 1..6 are the intake screens;
  // step 0 is the homepage, step 7 is analysis-running, step 8 is
  // report-delivered.
  const steps: StepIndex[] = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  const stepCounts = steps.map((step) => {
    const entered = records.filter((r) => r.furthestStep >= step).length
    const completed = records.filter((r) => r.furthestStep > step).length
    return { step, entered, completed }
  })

  return { total, completedAnalysis: completed, completionRate, avgTimeMs: avg, medianTimeMs: median, stepCounts }
}

function SummaryCards({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <MetricCard label="Total sessions" value={stats.total.toString()} />
      <MetricCard
        label="Completed analyses"
        value={`${stats.completedAnalysis} · ${stats.completionRate.toFixed(1)}%`}
      />
      <MetricCard label="Median time on site" value={formatDuration(stats.medianTimeMs)} />
      <MetricCard label="Average time on site" value={formatDuration(stats.avgTimeMs)} />
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 px-4 py-3">
      <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-gray-900 tabular-nums">{value}</div>
    </div>
  )
}

// ================== funnel visualization ==================

function FunnelChart({ stats }: { stats: Stats }) {
  const top = stats.stepCounts[0]?.entered || 1
  return (
    <div className="bg-white border border-gray-200 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-gray-900">Dropoff by step</div>
        <div className="text-xs text-gray-500">
          Bar length = sessions that reached that step. Number below = dropoff at that step.
        </div>
      </div>
      <div className="space-y-2">
        {stats.stepCounts.map((sc, i) => {
          const pct = top === 0 ? 0 : (sc.entered / top) * 100
          const nextStep = stats.stepCounts[i + 1]
          const dropAtStep = nextStep ? sc.entered - nextStep.entered : 0
          const dropPct = sc.entered === 0 ? 0 : (dropAtStep / sc.entered) * 100
          return (
            <div key={sc.step} className="flex items-center gap-3">
              <div className="text-xs text-gray-700 w-40 flex-shrink-0">
                {STEP_LABELS[sc.step]}
              </div>
              <div className="flex-1 h-6 bg-gray-100 relative">
                <div
                  className="h-full bg-[#8b2500]"
                  style={{ width: `${pct.toFixed(1)}%` }}
                />
                <div className="absolute inset-0 flex items-center px-2 text-xs text-gray-800 font-medium">
                  {sc.entered} ({pct.toFixed(0)}%)
                </div>
              </div>
              <div className="text-xs text-gray-500 w-24 text-right tabular-nums">
                {nextStep ? (
                  dropAtStep > 0 ? (
                    <span className="text-red-700">−{dropAtStep} ({dropPct.toFixed(0)}%)</span>
                  ) : (
                    <span className="text-emerald-700">0 dropoff</span>
                  )
                ) : (
                  ""
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ================== per-session table ==================

function SessionTable({
  records,
  password,
  onDeleted,
}: {
  records: SessionRecord[]
  password: string
  onDeleted: (id: string) => void
}) {
  if (records.length === 0) {
    return (
      <div className="bg-white border border-gray-200 p-8 text-center text-sm text-gray-500">
        No sessions yet. Once patients start visiting the site, they'll show up here.
      </div>
    )
  }
  return (
    <div className="bg-white border border-gray-200 overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr className="text-left text-gray-700">
            <Th>Started</Th>
            <Th>IP</Th>
            <Th>Furthest step</Th>
            <Th>Age / Sex</Th>
            <Th>Symptoms</Th>
            <Th>Top-1 diagnosis</Th>
            <Th>Conf.</Th>
            <Th>Time</Th>
            <Th>Report</Th>
            <Th>Del</Th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <SessionRow
              key={r.id}
              record={r}
              password={password}
              onDeleted={onDeleted}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-2 sm:px-3 py-2 font-semibold text-[11px] uppercase tracking-wider text-gray-600">
      {children}
    </th>
  )
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 sm:px-3 py-2 align-top ${className}`}>{children}</td>
}

function SessionRow({
  record,
  password,
  onDeleted,
}: {
  record: SessionRecord
  password: string
  onDeleted: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const started = new Date(record.createdAt)
  const isCompleted = record.furthestStep >= 8
  const top1 = record.analysis?.top1Diagnosis
  const top1Conf = record.analysis?.top1Confidence
  const requestId = record.analysis?.requestId
  const symptoms = record.form?.symptoms || []

  const handleDelete = async () => {
    if (deleting) return
    // Quick sanity confirm — irreversible operation, tied to a specific
    // session id. Show enough context ('this session from IP X started at Y')
    // that a mis-click is obvious.
    const stamp = `${started.toLocaleDateString()} ${started.toLocaleTimeString()}`
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete session ${record.id.slice(0, 8)}… (IP ${record.ip || '?'}, started ${stamp})?`)) {
      return
    }
    setDeleting(true)
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(password ? { "x-admin-password": password } : {}),
        },
        body: JSON.stringify({ ids: [record.id] }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      onDeleted(record.id)
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      window.alert(`Delete failed: ${err?.message || err}`)
      setDeleting(false)
    }
  }
  const symptomText =
    symptoms.length === 0
      ? "—"
      : symptoms
          .slice(0, 3)
          .map((s) => s.medicalTerm || s.originalPhrase)
          .join(", ") + (symptoms.length > 3 ? ` (+${symptoms.length - 3})` : "")

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <Td>
        <div>{started.toLocaleDateString()}</div>
        <div className="text-[10px] text-gray-500">{started.toLocaleTimeString()}</div>
      </Td>
      <Td>
        <div className="font-mono text-[11px] text-gray-700">{record.ip || "—"}</div>
      </Td>
      <Td>
        <div className="flex items-center gap-1.5">
          {isCompleted && <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />}
          <span className={isCompleted ? "text-emerald-800" : "text-gray-800"}>
            {STEP_LABELS[record.furthestStep as StepIndex]}
          </span>
        </div>
      </Td>
      <Td>
        {record.form?.age || record.form?.sex ? (
          <div className="text-gray-800">
            {record.form?.age || "?"} / {record.form?.sex || "?"}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </Td>
      <Td className="max-w-[260px]">
        <div className="text-gray-800 truncate" title={symptoms.map((s) => s.medicalTerm || s.originalPhrase).join(", ")}>
          {symptomText}
        </div>
      </Td>
      <Td className="max-w-[220px]">
        {top1 ? <span className="text-gray-800 truncate block">{top1}</span> : <span className="text-gray-400">—</span>}
      </Td>
      <Td>
        {typeof top1Conf === "number" ? (
          <span className="tabular-nums text-gray-700">{top1Conf.toFixed(0)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </Td>
      <Td>
        <span className="tabular-nums text-gray-700">{formatDuration(record.totalTimeMs)}</span>
      </Td>
      <Td>
        {isCompleted && requestId ? (
          <Link
            href={`/admin/runs/${requestId}`}
            className="text-[#8b2500] hover:underline text-xs font-semibold"
          >
            Open →
          </Link>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        )}
      </Td>
      <Td>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          title={`Delete this session (${record.id})`}
          className="text-gray-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Delete session"
        >
          {deleting ? (
            <span className="text-[10px] tracking-wider">…</span>
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </Td>
    </tr>
  )
}

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return "—"
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}h ${mm}m`
}
