"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, ArrowRight, Loader2, CheckCircle } from "lucide-react"

interface Props {
  clinicalRequestId: string
  /**
   * True when the user opted into the integrative panel earlier (the review-
   * step order bump). When set, the panel auto-runs in the background once
   * the clinical results are on screen — the clinical differential stays the
   * primary answer; the integrative report surfaces here when ready.
   */
  optedIn?: boolean
}

type RunState = "idle" | "running" | "ready" | "error"

export function IntegrativeCTACard({ clinicalRequestId, optedIn = false }: Props) {
  const router = useRouter()
  const [state, setState] = useState<RunState>("idle")
  const [integrativeId, setIntegrativeId] = useState("")
  const startedRef = useRef(false)

  // Auto-run for opted-in users. Dedup per clinical run via sessionStorage so
  // a results-page reload doesn't kick a duplicate (and paid) run.
  useEffect(() => {
    if (!optedIn || !clinicalRequestId || startedRef.current) return
    startedRef.current = true

    const cacheKey = `integrativeRunFor:${clinicalRequestId}`
    try {
      const prior = sessionStorage.getItem(cacheKey)
      if (prior) {
        setIntegrativeId(prior)
        setState("ready")
        return
      }
    } catch {
      /* sessionStorage unavailable — proceed to run */
    }

    let cancelled = false
    setState("running")
    ;(async () => {
      try {
        const res = await fetch("/api/analyze-integrative-v1", {
          method: "POST",
          headers: { "Content-Type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({ clinicalRequestId }),
        })
        if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`)
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
            try {
              msg = JSON.parse(line.slice(6))
            } catch {
              continue
            }
            if (msg.type === "result" && msg.requestId) {
              try {
                sessionStorage.setItem(cacheKey, msg.requestId)
              } catch {
                /* ignore */
              }
              if (!cancelled) {
                setIntegrativeId(msg.requestId)
                setState("ready")
              }
              return
            }
            if (msg.type === "error") throw new Error(msg.error || "Pipeline error")
          }
        }
      } catch {
        if (!cancelled) setState("error")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [optedIn, clinicalRequestId])

  if (!clinicalRequestId) return null

  const runManually = () => {
    router.push(`/analysis-integrative?clinicalRequestId=${encodeURIComponent(clinicalRequestId)}`)
  }
  const openReport = () => {
    router.push(`/results/integrative/${integrativeId}`)
  }

  // Header copy shifts depending on whether they asked for this earlier.
  const heading =
    optedIn && state !== "error"
      ? "Your integrative-medicine perspective"
      : "Want an integrative-medicine perspective on your case?"

  return (
    <div className="mt-12 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800 shrink-0">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-amber-800 mb-2">
            Complementary perspective
          </div>
          <h3 className="text-xl sm:text-2xl font-serif text-slate-900 mb-2">{heading}</h3>
          <p className="text-sm text-slate-700 mb-5 leading-relaxed">
            A separate panel of five practitioners — Functional Medicine, Naturopath,
            Acupuncturist (TCM), Ayurvedic, and mind-body/somatic — will review your case in
            their own frameworks and produce root-cause hypotheses, functional tests to
            consider, and interventions to explore with a licensed practitioner. This is a
            complementary view of your case, not a diagnosis.
          </p>

          {state === "running" && (
            <div className="inline-flex items-center gap-2 rounded-md bg-amber-100 px-5 py-2.5 text-sm font-medium text-amber-900">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing your integrative perspective… (~60–90 seconds)
            </div>
          )}

          {state === "ready" && (
            <button
              onClick={openReport}
              className="inline-flex items-center gap-2 rounded-md bg-amber-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
              <CheckCircle className="h-4 w-4" />
              Your integrative report is ready — view it
            </button>
          )}

          {(state === "idle" || state === "error") && (
            <>
              {state === "error" && (
                <div className="mb-3 text-sm text-amber-900">
                  We couldn&rsquo;t start the integrative panel automatically. You can run it now:
                </div>
              )}
              <button
                onClick={runManually}
                className="inline-flex items-center gap-2 rounded-md bg-amber-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                Run integrative panel
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}

          <div className="mt-4 text-xs text-slate-600 leading-relaxed">
            The clinical differential above remains the primary answer. This integrative report
            is separate and should be discussed with your primary care physician before acting
            on anything.
          </div>
        </div>
      </div>
    </div>
  )
}
