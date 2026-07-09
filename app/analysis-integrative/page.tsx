"use client"

export const dynamic = "force-dynamic"

import { Suspense, useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Layout } from "@/components/layout"

interface SpecialistProgress {
  specialty: string
  displayName: string
  done: boolean
}

const SPECIALIST_ORDER = [
  { specialty: "functional-medicine", displayName: "Functional Medicine physician" },
  { specialty: "naturopath", displayName: "Naturopathic doctor" },
  { specialty: "tcm-acupuncture", displayName: "Acupuncturist (TCM)" },
  { specialty: "ayurveda", displayName: "Ayurvedic practitioner" },
  { specialty: "mind-body-somatic", displayName: "Mind-body / somatic practitioner" },
]

function AnalysisIntegrativeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clinicalRequestId = searchParams?.get("clinicalRequestId") || ""

  const [phase, setPhase] = useState<"idle" | "specialists" | "synthesis" | "complete" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [doneSpecialties, setDoneSpecialties] = useState<Set<string>>(new Set())
  const startedRef = useRef(false)

  useEffect(() => {
    if (!clinicalRequestId) {
      setPhase("error")
      setErrorMessage("Missing clinical run ID. Return to your results and click the integrative-perspective button again.")
      return
    }
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        setPhase("specialists")
        const res = await fetch("/api/analyze-integrative-v1", {
          method: "POST",
          headers: { "Content-Type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({ clinicalRequestId }),
        })
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "")
          throw new Error(`Request failed (${res.status}). ${detail.slice(0, 200)}`)
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        while (!cancelled) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split("\n\n")
          buffer = events.pop() || ""
          for (const raw of events) {
            const line = raw.split("\n").find((l) => l.startsWith("data: "))
            if (!line) continue
            let msg: any
            try { msg = JSON.parse(line.slice(6)) } catch { continue }
            if (msg.type === "progress" && msg.stage === "specialist-done" && msg.specialty) {
              setDoneSpecialties((prev) => {
                const next = new Set(prev); next.add(msg.specialty); return next
              })
            }
            if (msg.type === "progress" && msg.stage === "synthesis") setPhase("synthesis")
            if (msg.type === "result" && msg.requestId) {
              setPhase("complete")
              router.push(`/results/integrative/${msg.requestId}`)
              return
            }
            if (msg.type === "error") {
              throw new Error(msg.error || "Integrative pipeline error")
            }
          }
        }
      } catch (err: any) {
        if (cancelled) return
        setPhase("error")
        setErrorMessage(err?.message || "Unexpected error running the integrative panel.")
        try {
          const Sentry = await import("@sentry/nextjs")
          Sentry.captureException(err, { tags: { surface: "analysis-integrative-page" } })
        } catch { /* Sentry optional */ }
      }
    })()

    return () => { cancelled = true }
  }, [clinicalRequestId, router])

  const specialists: SpecialistProgress[] = SPECIALIST_ORDER.map((s) => ({
    ...s,
    done: doneSpecialties.has(s.specialty),
  }))

  return (
    <Layout title="Integrative panel">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-serif mb-2 text-slate-900">Consulting the integrative panel</h1>
        <p className="text-slate-700 mb-8">
          Five practitioners in different traditions are reviewing your case. This typically takes 60–90 seconds.
        </p>

        {phase === "error" ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="font-semibold text-red-900 mb-1">Something went wrong.</div>
            <div className="text-red-800 text-sm">{errorMessage}</div>
            <button
              onClick={() => router.back()}
              className="mt-4 text-sm underline text-red-900"
            >
              ← Return to your clinical results
            </button>
          </div>
        ) : (
          <>
            <ul className="space-y-3 mb-8">
              {specialists.map((s) => (
                <li key={s.specialty} className="flex items-center gap-3">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${s.done ? "bg-green-600" : "bg-amber-400 animate-pulse"}`}
                  />
                  <span className={s.done ? "text-slate-600" : "text-slate-900 font-medium"}>
                    {s.displayName}
                    {s.done && <span className="ml-2 text-xs text-green-700">done</span>}
                  </span>
                </li>
              ))}
            </ul>

            {phase === "synthesis" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-semibold text-amber-900 mb-1">
                  Consolidating the panel's perspective…
                </div>
                <div className="text-sm text-amber-800">
                  Merging the five practitioners' hypotheses into a single integrative view.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}

export default function AnalysisIntegrativePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>}>
      <AnalysisIntegrativeInner />
    </Suspense>
  )
}
