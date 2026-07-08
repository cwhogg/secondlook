"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, X } from "lucide-react"
import { usePathname } from "next/navigation"

/**
 * Live upstream-status banner. Polls /api/health-check on mount + every
 * 3 minutes, and renders a top-of-viewport banner when OpenAI or
 * Anthropic reports degraded / major / critical status on their public
 * status page.
 *
 * Dismissable per-session — sessionStorage flag so the user only sees
 * it once per browsing session. Hidden entirely on admin routes and
 * during an active analysis (where the pipeline itself will surface any
 * real-time failure).
 */

interface ProbeResult {
  status: "ok" | "degraded" | "major" | "critical" | "unknown"
  description: string | null
}

interface HealthCheck {
  openai: ProbeResult
  anthropic: ProbeResult
  anyDegraded: boolean
  checkedAt: string
}

const DISMISSED_KEY = "sl_upstream_banner_dismissed"
const POLL_INTERVAL_MS = 3 * 60 * 1000
const HIDE_ON_PATHS = ["/admin", "/analysis", "/results", "/testing", "/eval"]

function severityLabel(s: ProbeResult["status"]): string {
  switch (s) {
    case "degraded":
      return "reporting minor issues"
    case "major":
      return "reporting a significant outage"
    case "critical":
      return "reporting a full outage"
    default:
      return "reporting an issue"
  }
}

export function UpstreamStatusBanner() {
  const pathname = usePathname()
  const [check, setCheck] = useState<HealthCheck | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    setDismissed(window.sessionStorage.getItem(DISMISSED_KEY) === "1")
  }, [])

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch("/api/health-check", { cache: "no-store" })
        if (!res.ok || cancelled) return
        const data: HealthCheck = await res.json()
        if (!cancelled) setCheck(data)
      } catch {
        // Silent failure — banner just stays hidden.
      }
    }
    void poll()
    const t = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  const shouldHide =
    dismissed ||
    !check?.anyDegraded ||
    HIDE_ON_PATHS.some((p) => pathname?.startsWith(p))
  if (shouldHide) return null

  const offenders: { name: string; probe: ProbeResult }[] = []
  if (check.openai.status !== "ok" && check.openai.status !== "unknown") {
    offenders.push({ name: "OpenAI", probe: check.openai })
  }
  if (check.anthropic.status !== "ok" && check.anthropic.status !== "unknown") {
    offenders.push({ name: "Anthropic", probe: check.anthropic })
  }
  if (offenders.length === 0) return null

  return (
    <div
      role="status"
      className="w-full bg-amber-50 border-b border-amber-200 text-amber-900"
    >
      <div className="max-w-[1140px] mx-auto px-4 sm:px-8 py-2 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-700" />
        <div className="flex-1 text-[13px] leading-snug">
          <span className="font-semibold">Heads up: </span>
          {offenders.map((o, i) => (
            <span key={o.name}>
              {o.name} is {severityLabel(o.probe.status)}
              {o.probe.description ? ` (${o.probe.description})` : ""}
              {i < offenders.length - 1 ? "; " : "."}
            </span>
          ))}{" "}
          Analyses may fail or run slow until this clears.
        </div>
        <button
          type="button"
          onClick={() => {
            window.sessionStorage.setItem(DISMISSED_KEY, "1")
            setDismissed(true)
          }}
          className="text-amber-700 hover:text-amber-900 flex-shrink-0 mt-0.5"
          aria-label="Dismiss for this session"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
