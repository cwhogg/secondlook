"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, Sparkles, FlaskConical, Scale } from "lucide-react"

// The refine API is a non-streaming POST that runs three sequential steps:
//   1. Apply patient answers to the hypothesis pool (synchronous, ~instant)
//   2. Claude Evaluator re-scores the augmented pool (~15-30s)
//   3. Claude Synthesizer re-ranks (o3-high, ~30-60s)
// There's no triage, no specialist selection, no parallel consultation, no
// report generation. We show only the stages that actually run.
//
// Because the endpoint isn't SSE, we drive the visual stage progression from
// elapsed wall time (with conservative midpoints) rather than real progress
// events. When the API resolves, all stages snap to complete.

const REFINE_STAGES = [
  {
    key: "apply",
    label: "Applying your answers",
    icon: Sparkles,
    description: "Augmenting the hypothesis pool with your refinement answers",
    // Stage transitions are wall-time approximations since the API doesn't stream.
    activeFromMs: 0,
    completeAfterMs: 1500,
    durationHint: "Instant.",
  },
  {
    key: "evaluate",
    label: "Evidence Re-Evaluation",
    icon: FlaskConical,
    description: "Re-scoring hypotheses against diagnostic criteria with your new evidence",
    activeFromMs: 1500,
    completeAfterMs: 22000,
    durationHint: "Typically 15–30 seconds.",
  },
  {
    key: "synthesize",
    label: "Diagnostic Re-Synthesis",
    icon: Scale,
    description: "Re-ranking diagnoses and assessing how the differential shifted",
    activeFromMs: 22000,
    completeAfterMs: Infinity,
    durationHint: "Typically 2–3 mins.",
  },
] as const

function getStageStatus(
  stageKey: string,
  elapsedMs: number,
  done: boolean,
): "pending" | "active" | "complete" {
  if (done) return "complete"
  const stage = REFINE_STAGES.find((s) => s.key === stageKey)
  if (!stage) return "pending"
  if (elapsedMs >= stage.completeAfterMs) return "complete"
  if (elapsedMs >= stage.activeFromMs) return "active"
  return "pending"
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min === 0) return `${sec}s`
  return `${min}m ${sec.toString().padStart(2, "0")}s`
}

export function RefineLoading({
  startedAt,
  done,
}: {
  startedAt: number
  done: boolean
}) {
  const [tickNow, setTickNow] = useState<number>(() => Date.now())

  // Tick the timer once per second while refinement is in flight.
  useEffect(() => {
    if (done) return
    const t = setInterval(() => setTickNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [done])

  const elapsedMs = Math.max(0, tickNow - startedAt)
  const activeStage = REFINE_STAGES.find(
    (s) => getStageStatus(s.key, elapsedMs, done) === "active",
  )

  // Progress: fraction of stages complete + half-credit for active.
  const stagesComplete = REFINE_STAGES.filter(
    (s) => getStageStatus(s.key, elapsedMs, done) === "complete",
  ).length
  const hasActive = REFINE_STAGES.some(
    (s) => getStageStatus(s.key, elapsedMs, done) === "active",
  )
  const progress = done
    ? 100
    : Math.round(((stagesComplete + (hasActive ? 0.5 : 0)) / REFINE_STAGES.length) * 100)

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6 sm:mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-[#8b2500] rounded-full mb-4 animate-pulse">
          <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">
          Refining Your Analysis
        </h2>
        <p className="text-[11px] sm:text-xs text-gray-400">
          Re-evaluating evidence with your refinement answers
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-gray-400">
            {done
              ? "Complete"
              : `Step ${Math.min(REFINE_STAGES.length, stagesComplete + 1)} of ${REFINE_STAGES.length}`}
          </span>
          <span className="text-[11px] font-bold text-[#8b2500] tabular-nums">
            {progress}%
          </span>
        </div>
        <div className="w-full bg-[#e8ddd0] h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#8b2500] rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-[#d4c5b0] rounded-sm p-4 sm:p-5">
        {REFINE_STAGES.map((stage, idx) => {
          const status = getStageStatus(stage.key, elapsedMs, done)
          const Icon = stage.icon
          const isLast = idx === REFINE_STAGES.length - 1
          const showDurationHint =
            status === "active" && activeStage?.key === stage.key && elapsedMs > 15_000

          return (
            <div key={stage.key} className="relative flex gap-3 sm:gap-4">
              {/* Vertical connector */}
              {!isLast && (
                <div
                  className={`absolute left-[13px] sm:left-[15px] top-8 bottom-0 w-px ${
                    status === "complete" ? "bg-green-300" : "bg-[#e8ddd0]"
                  }`}
                />
              )}

              {/* Indicator */}
              <div className="relative flex-shrink-0">
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${
                    status === "complete"
                      ? "bg-green-500"
                      : status === "active"
                        ? "bg-[#8b2500]"
                        : "bg-[#e8ddd0]"
                  }`}
                >
                  {status === "complete" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                  ) : status === "active" ? (
                    <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white animate-spin" />
                  ) : (
                    <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Content */}
              <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-5 sm:pb-6"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3
                    className={`text-[13px] sm:text-sm font-semibold leading-7 sm:leading-8 ${
                      status === "complete"
                        ? "text-green-700"
                        : status === "active"
                          ? "text-[#8b2500]"
                          : "text-gray-400"
                    }`}
                  >
                    {stage.label}
                  </h3>
                  {status === "active" && (
                    <span className="text-[11px] sm:text-xs font-medium text-[#8b2500] tabular-nums">
                      {formatElapsed(elapsedMs)}
                    </span>
                  )}
                </div>
                <p
                  className={`text-[11px] sm:text-xs leading-relaxed ${
                    status === "pending" ? "text-gray-300" : "text-gray-500"
                  }`}
                >
                  {stage.description}
                </p>
                {showDurationHint && (
                  <p className="text-[10px] sm:text-[11px] text-gray-400 mt-1 italic">
                    {stage.durationHint}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {!done && (
        <p className="mt-5 text-center text-[10px] text-gray-400 max-w-sm mx-auto leading-relaxed">
          Re-running the evidence and synthesis stages with your additional clarifications.
        </p>
      )}
    </div>
  )
}
