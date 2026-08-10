"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface FeedbackSummary {
  id: string
  createdAt: string
  ip: string | null
  mode: "test" | "real" | "general"
  analysisRequestId: string | null
  payload: any
}

const PASSWORD_STORAGE_KEY = "adminRunsPassword"

export default function AdminFeedbackPage() {
  const [password, setPassword] = useState("")
  const [passwordInput, setPasswordInput] = useState("")
  const [authError, setAuthError] = useState("")
  const [authChecked, setAuthChecked] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [items, setItems] = useState<FeedbackSummary[]>([])
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
      const res = await fetch(`/api/admin/feedback?limit=200`, {
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
      setItems(data.items || [])
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
      const res = await fetch(`/api/admin/feedback?limit=200`, {
        headers: { "x-admin-password": pw },
      })
      if (res.status === 401 || res.status === 403) {
        setAuthError("Invalid password")
        return
      }
      const data = await res.json()
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPassword(pw)
      sessionStorage.setItem(PASSWORD_STORAGE_KEY, pw)
      setNeedsAuth(false)
    } catch (err: any) {
      setAuthError(err?.message || "Failed")
    }
  }

  // Aggregate stats
  const testItems = items.filter((i) => i.mode === "test")
  const realItems = items.filter((i) => i.mode === "real")
  const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length)
  const testValueAvg = avg(testItems.map((i) => i.payload?.valueRating).filter((n) => typeof n === "number"))
  const testUxAvg = avg(testItems.map((i) => i.payload?.uxRating).filter((n) => typeof n === "number"))
  const realUsefulnessAvg = avg(
    realItems.map((i) => i.payload?.usefulnessRating).filter((n) => typeof n === "number"),
  )
  const realLearnedYes = realItems.filter((i) => i.payload?.learnedSomething === "yes").length
  const realConfirmedYes = realItems.filter((i) => i.payload?.confirmedSomething === "yes").length

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>
    )
  }

  if (needsAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <form onSubmit={handlePasswordSubmit} className="bg-white border border-gray-200 p-8 max-w-md w-full">
          <h1 className="text-xl font-bold mb-4 text-gray-900">Admin · Feedback</h1>
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/admin" className="inline-block text-sm text-[#8b2500] hover:underline mb-4">
          ← Admin
        </Link>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
            <p className="text-sm text-gray-600 mt-1">
              {total} total responses · {testItems.length} test · {realItems.length} real ·{" "}
              {items.filter((i) => i.mode === "general").length} general
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
          <div className="bg-red-50 border border-red-200 text-red-900 p-3 mb-4 text-sm">{error}</div>
        )}

        {/* Aggregate stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <Stat label="Test value avg" value={testValueAvg !== null ? testValueAvg.toFixed(2) : "—"} />
          <Stat label="Test UX avg" value={testUxAvg !== null ? testUxAvg.toFixed(2) : "—"} />
          <Stat label="Real usefulness avg" value={realUsefulnessAvg !== null ? realUsefulnessAvg.toFixed(2) : "—"} />
          <Stat
            label="Real · learned new"
            value={realItems.length > 0 ? `${realLearnedYes}/${realItems.length}` : "—"}
          />
          <Stat
            label="Real · confirmed known"
            value={realItems.length > 0 ? `${realConfirmedYes}/${realItems.length}` : "—"}
          />
        </div>

        {/* Items */}
        <div className="space-y-3">
          {items.map((it) => (
            <FeedbackCard key={it.id} item={it} />
          ))}
          {items.length === 0 && !loading && (
            <div className="bg-white border border-gray-200 p-10 text-center text-gray-500">
              No feedback yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 p-3">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900 font-mono">{value}</div>
    </div>
  )
}

function FeedbackCard({ item }: { item: FeedbackSummary }) {
  const when = new Date(item.createdAt)
  const p = item.payload || {}
  return (
    <div className="bg-white border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span
            className={`px-2 py-0.5 font-semibold uppercase tracking-wide ${
              item.mode === "test"
                ? "bg-amber-50 text-amber-800 border border-amber-200"
                : item.mode === "real"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-sky-50 text-sky-800 border border-sky-200"
            }`}
          >
            {item.mode}
          </span>
          <span>{when.toLocaleString()}</span>
          {item.ip && <span className="font-mono">{item.ip}</span>}
          {item.analysisRequestId && (
            <Link
              href={`/admin/runs/${encodeURIComponent(item.analysisRequestId)}`}
              className="text-[#8b2500] underline"
            >
              run ↗
            </Link>
          )}
        </div>
      </div>
      <div className="space-y-2 text-sm">
        {item.mode === "test" ? (
          <>
            {typeof p.valueRating === "number" && (
              <Row label="Value to seekers">{ratingDisplay(p.valueRating)}</Row>
            )}
            {typeof p.uxRating === "number" && <Row label="UX">{ratingDisplay(p.uxRating)}</Row>}
            {p.expectedDiagnosis && <Row label="Expected">{p.expectedDiagnosis}</Row>}
            {p.actualTop1 && <Row label="Got">{p.actualTop1}</Row>}
            {p.comments && <Row label="Comments">{p.comments}</Row>}
            {p.email && (
              <Row label="Email">
                <a href={`mailto:${p.email}`} className="text-[#8b2500] underline">
                  {p.email}
                </a>
              </Row>
            )}
          </>
        ) : item.mode === "real" ? (
          <>
            {typeof p.usefulnessRating === "number" && (
              <Row label="Useful in journey">{ratingDisplay(p.usefulnessRating)}</Row>
            )}
            {p.learnedSomething && (
              <Row label="Learned new">
                {p.learnedSomething}
                {p.whatLearned && <span className="text-gray-600"> — {p.whatLearned}</span>}
              </Row>
            )}
            {p.confirmedSomething && (
              <Row label="Confirmed known">
                {p.confirmedSomething}
                {p.whatConfirmed && <span className="text-gray-600"> — {p.whatConfirmed}</span>}
              </Row>
            )}
            {p.comments && <Row label="Comments">{p.comments}</Row>}
            {p.email && (
              <Row label="Email">
                <a href={`mailto:${p.email}`} className="text-[#8b2500] underline">
                  {p.email}
                </a>
              </Row>
            )}
          </>
        ) : (
          // general mode
          <>
            {p.page && <Row label="Page">{p.page}</Row>}
            {p.email && (
              <Row label="Email">
                <a href={`mailto:${p.email}`} className="text-[#8b2500] underline">
                  {p.email}
                </a>
              </Row>
            )}
            {p.sessionId && (
              <Row label="Session">
                <span className="font-mono text-xs">{p.sessionId}</span>
              </Row>
            )}
            {p.message && (
              <Row label="Message">
                <span className="whitespace-pre-wrap">{p.message}</span>
              </Row>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 pt-0.5">
        {label}
      </div>
      <div className="text-gray-900">{children}</div>
    </div>
  )
}

function ratingDisplay(n: number): string {
  const emoji = ["😞", "🙁", "😐", "🙂", "😄"][Math.max(0, Math.min(4, n - 1))]
  return `${n}/5  ${emoji}`
}
