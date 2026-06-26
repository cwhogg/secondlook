"use client"

import { useEffect, useRef, useState } from "react"
import { Brain, CheckCircle2, Loader2, Stethoscope, FlaskConical, Scale, FileText, Activity, Search, UsersRound } from "lucide-react"
import { BreadcrumbNav } from "./breadcrumb-nav"
import type { PipelineProgress } from "@/lib/types/pipeline"

interface AnalysisLoadingProps {
  progress: number
  pipelineEvents: PipelineProgress[]
  preTriageSymptoms?: Array<{
    originalPhrase: string
    medicalTerm: string
    code: string | null
    codeSystem: 'SNOMED' | 'UMLS CUI' | null
  }>
}

const STAGE_CONFIG: Record<string, { label: string; icon: typeof Brain; description: string }> = {
  extraction: {
    label: "Symptom Extraction",
    icon: Search,
    description: "Parsing your narrative and mapping to medical terminology",
  },
  triage: {
    label: "Triage",
    icon: Activity,
    description: "Classifying symptoms and ranking specialty relevance",
  },
  "specialist-selection": {
    label: "Specialist Selection",
    icon: UsersRound,
    description: "Choosing the specialists most relevant to this case",
  },
  specialists: {
    label: "Specialist Consultation",
    icon: Stethoscope,
    description: "Selected specialists analyzing your case in parallel",
  },
  evidence: {
    label: "Evidence Evaluation",
    icon: FlaskConical,
    description: "Scoring hypotheses against diagnostic criteria",
  },
  synthesis: {
    label: "Diagnostic Synthesis",
    icon: Scale,
    description: "Ranking diagnoses and assessing consensus",
  },
  report: {
    label: "Report Generation",
    icon: FileText,
    description: "Compiling your detailed diagnostic report",
  },
}

const ORDERED_STAGES = ["extraction", "triage", "specialist-selection", "specialists", "evidence", "synthesis", "report"] as const

function getStageStatus(
  stageKey: string,
  events: PipelineProgress[]
): "pending" | "active" | "complete" {
  const completeStages = new Set<string>()
  let latestActiveStage: string | null = null

  for (const event of events) {
    // Heartbeats + per-specialist progress events shouldn't set
    // latestActiveStage to their own raw stage name (which isn't a
    // member of ORDERED_STAGES). Map them back to the real stage via
    // stageNumber so the spinner stays on the right row.
    if (
      event.stage === "heartbeat" ||
      event.stage === "specialist-done" ||
      event.stage === "specialist-failed"
    ) {
      const mapped = ORDERED_STAGES[event.stageNumber]
      if (mapped) latestActiveStage = mapped
      continue
    }
    const key = event.stage.replace("-complete", "")
    if (event.stage.endsWith("-complete") || event.stage === "complete") {
      completeStages.add(key)
      if (event.stage === "complete") completeStages.add("report")
    } else {
      latestActiveStage = key
    }
  }

  if (events.some((e) => e.stage === "extraction-complete")) completeStages.add("extraction")
  if (events.some((e) => e.stage === "specialists-complete")) completeStages.add("specialists")
  if (events.some((e) => e.stage === "evidence-complete")) completeStages.add("evidence")
  if (events.some((e) => e.stage === "synthesis-complete")) completeStages.add("synthesis")

  if (completeStages.has(stageKey)) return "complete"
  if (latestActiveStage === stageKey) return "active"

  const stageIndex = ORDERED_STAGES.indexOf(stageKey as any)
  const latestIndex = latestActiveStage ? ORDERED_STAGES.indexOf(latestActiveStage as any) : -1
  if (stageIndex < latestIndex) return "complete"

  // If the immediately preceding stage just completed and there are no
  // events yet for this stage, optimistically show this stage as active
  // so the user can see the pipeline moving. Without this the UI sits
  // with no spinning row in the gap between an X-complete event and
  // the first event of stage X+1 — long enough on slow stages (triage
  // 5-15s, evidence 1-3 min) that it reads as "stuck."
  if (
    latestActiveStage !== null &&
    completeStages.has(latestActiveStage) &&
    stageIndex === latestIndex + 1
  ) {
    return "active"
  }

  return "pending"
}

// Track per-specialist completion progress so we can render a running tally
// on the specialists stage row.
function getSpecialistTally(events: PipelineProgress[]): {
  done: number
  failed: number
  total: number
  lastDetail: string | null
} {
  let done = 0
  let failed = 0
  let total = 0
  let lastDetail: string | null = null
  for (const event of events) {
    if (event.stage === "specialists") {
      const specialties = (event as any).data?.specialties
      if (Array.isArray(specialties)) total = specialties.length
    } else if (event.stage === "specialist-done") {
      done += 1
      lastDetail = event.detail
    } else if (event.stage === "specialist-failed") {
      failed += 1
      lastDetail = event.detail
    }
  }
  return { done, failed, total, lastDetail }
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

// Stage-specific reassurance shown when the active stage has been running
// for more than ~15s — manages expectations on the slow stages.
const STAGE_DURATION_HINT: Record<string, string> = {
  extraction: "Typically a few seconds.",
  triage: "Typically 5–15 seconds.",
  "specialist-selection": "Instant — deterministic selection from the triage ranking.",
  specialists: "Typically 1–3 minutes — selected specialists reasoning in parallel.",
  evidence: "Typically 1–3 min.",
  synthesis: "Typically 2–3 min.",
  report: "Typically 30–60 sec.",
}

function getStageData(stageKey: string, events: PipelineProgress[]) {
  const completeEvent = events.find(
    (e) =>
      e.stage === `${stageKey}-complete` ||
      (stageKey === "triage" && e.stage === "triage") ||
      (stageKey === "report" && e.stage === "complete")
  )
  const startEvent = events.find((e) => e.stage === stageKey)
  // For extraction, prefer the complete event to show final symptom count
  if (stageKey === "extraction") {
    return completeEvent || startEvent || null
  }
  return completeEvent || startEvent || null
}

function formatSpecialtyName(name: string): string {
  return name
    .replace(/^specialist-v\d+-/, "")
    .replace(/-agent$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ===== CONFIDENCE BAR (reusable) =====

function ConfidenceBar({
  score,
  color = "#8b2500",
  height = "h-1.5",
}: {
  score: number
  color?: string
  height?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${height} bg-gray-100 rounded-sm overflow-hidden`}>
        <div
          className={`${height} rounded-sm transition-all duration-500`}
          style={{ width: `${Math.min(score, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-medium text-gray-500 tabular-nums w-8 text-right flex-shrink-0">
        {score}%
      </span>
    </div>
  )
}

// ===== STAGE DATA RENDERERS =====

function TriageData({ event }: { event: PipelineProgress & { stage: "triage" } }) {
  const { bodySystems, acuityLevel, candidateCount } = event.data
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {bodySystems.map((system) => (
          <span
            key={system}
            className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium bg-[#faf6f0] text-[#6d4c30] border border-[#d4c5b0] rounded-sm"
          >
            {system}
          </span>
        ))}
        <span
          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-sm border ${
            acuityLevel === "emergent"
              ? "bg-red-50 text-red-700 border-red-200"
              : acuityLevel === "urgent"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-green-50 text-green-700 border-green-200"
          }`}
        >
          {acuityLevel}
        </span>
      </div>
      <div className="text-[11px] text-gray-500">
        {candidateCount} candidates from KB
      </div>
    </div>
  )
}

function SpecialistSelectionData({
  event,
}: {
  event: PipelineProgress & { stage: "specialist-selection" }
}) {
  const { selectedSpecialties, totalSpecialistCount } = event.data
  return (
    <div className="mt-3 space-y-2">
      <div className="text-[11px] text-gray-500">
        {selectedSpecialties.length} of {totalSpecialistCount} specialists selected
      </div>
      <div className="flex flex-wrap gap-1.5">
        {selectedSpecialties.map((sp) => (
          <span
            key={sp}
            className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium bg-[#faf6f0] text-[#6d4c30] border border-[#d4c5b0] rounded-sm"
          >
            {formatSpecialtyName(sp)}
          </span>
        ))}
      </div>
    </div>
  )
}

function SpecialistsData({
  event,
}: {
  event: PipelineProgress & { stage: "specialists-complete" }
}) {
  const { results } = event.data
  return (
    <div className="mt-3 space-y-2.5">
      {results.map((specialist) => (
        <div
          key={specialist.agentName}
          className="border border-[#e8ddd0] bg-[#fdfcfa] rounded-sm p-2.5 sm:p-3 overflow-hidden"
        >
          <div className="text-[11px] font-semibold text-[#6d4c30] uppercase tracking-wider mb-2">
            {formatSpecialtyName(specialist.agentName)}
          </div>
          <div className="space-y-2">
            {specialist.hypotheses.slice(0, 3).map((h, i) => (
              <div key={i}>
                <div className="text-xs text-gray-700 mb-1 leading-snug line-clamp-2">
                  {h.diagnosis}
                </div>
                <ConfidenceBar score={h.confidenceScore} />
              </div>
            ))}
            {specialist.hypotheses.length > 3 && (
              <div className="text-[10px] text-gray-400 pt-0.5">
                +{specialist.hypotheses.length - 3} more
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function EvidenceData({
  event,
}: {
  event: PipelineProgress & { stage: "evidence-complete" }
}) {
  const { evaluatedCount, kbMatchedCount, reasoningEvaluatedCount } = event.data
  const kbPercent = evaluatedCount > 0 ? Math.round((kbMatchedCount / evaluatedCount) * 100) : 0
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1 h-2.5 rounded-sm overflow-hidden bg-gray-100">
        <div
          className="h-full bg-[#8b2500] rounded-l-sm transition-all duration-500"
          style={{ width: `${kbPercent}%` }}
        />
        <div
          className="h-full bg-gray-300 rounded-r-sm transition-all duration-500"
          style={{ width: `${100 - kbPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-[#8b2500] rounded-sm inline-block" />
          {kbMatchedCount} criteria-grounded (from KB)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-gray-300 rounded-sm inline-block" />
          {reasoningEvaluatedCount} reasoning-evaluated (LLM-generated)
        </span>
      </div>
    </div>
  )
}

function SynthesisData({
  event,
}: {
  event: PipelineProgress & { stage: "synthesis-complete" }
}) {
  const { topDiagnoses, consensusLevel } = event.data
  const colorScale = ["#8b2500", "#a3472a", "#b8623b", "#c9855e", "#d4a574"]
  return (
    <div className="mt-3 space-y-3">
      <span
        className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-sm border ${
          consensusLevel === "strong"
            ? "bg-green-50 text-green-700 border-green-200"
            : consensusLevel === "moderate"
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-red-50 text-red-700 border-red-200"
        }`}
      >
        {consensusLevel} consensus
      </span>
      <div className="space-y-2.5">
        {topDiagnoses.slice(0, 5).map((d, i) => (
          <div key={i}>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-[11px] font-bold text-gray-400 tabular-nums flex-shrink-0">
                {i + 1}.
              </span>
              <span className="text-xs text-gray-700 leading-snug line-clamp-2">
                {d.diagnosis}
              </span>
            </div>
            <div className="pl-4">
              <ConfidenceBar
                score={d.probabilityScore}
                color={colorScale[i] || "#d4a574"}
                height="h-2"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===== TIMELINE STAGE ROW =====

function TimelineStage({
  stageKey,
  status,
  event,
  isLast,
  preTriageSymptoms,
  elapsedMs,
  specialistTally,
}: {
  stageKey: string
  status: "pending" | "active" | "complete"
  event: PipelineProgress | null
  isLast: boolean
  preTriageSymptoms?: Array<{
    originalPhrase: string
    medicalTerm: string
    code: string | null
    codeSystem: 'SNOMED' | 'UMLS CUI' | null
  }>
  elapsedMs?: number
  specialistTally?: { done: number; failed: number; total: number; lastDetail: string | null }
}) {
  const config = STAGE_CONFIG[stageKey]
  if (!config) return null
  const Icon = config.icon

  const renderStageData = () => {
    if (!event) return null

    switch (event.stage) {
      case "extraction-complete": {
        const symptoms = preTriageSymptoms && preTriageSymptoms.length > 0
          ? preTriageSymptoms
          : (event as any).data?.symptoms || []
        if (symptoms.length === 0) return null
        return (
          <div className="mt-3 space-y-2">
            {symptoms.map((symptom: any, idx: number) => (
              <div key={`${symptom.medicalTerm}-${idx}`} className="border border-[#e8ddd0] bg-[#fdfcfa] rounded-sm p-2.5">
                <div className="text-xs font-medium text-gray-800">{symptom.medicalTerm}</div>
                <div className="text-[11px] text-gray-500">From: &ldquo;{symptom.originalPhrase}&rdquo;</div>
                <div className="text-[11px] text-[#6d4c30] mt-1">
                  {symptom.code && symptom.codeSystem ? `${symptom.codeSystem}: ${symptom.code}` : 'Code: not mapped'}
                </div>
              </div>
            ))}
          </div>
        )
      }
      case "triage":
        return <TriageData event={event as PipelineProgress & { stage: "triage" }} />
      case "specialist-selection":
        return (
          <SpecialistSelectionData
            event={event as PipelineProgress & { stage: "specialist-selection" }}
          />
        )
      case "specialists-complete":
        return (
          <SpecialistsData
            event={event as PipelineProgress & { stage: "specialists-complete" }}
          />
        )
      case "evidence-complete":
        return (
          <EvidenceData
            event={event as PipelineProgress & { stage: "evidence-complete" }}
          />
        )
      case "synthesis-complete":
        return (
          <SynthesisData
            event={event as PipelineProgress & { stage: "synthesis-complete" }}
          />
        )
      case "complete":
        return (
          <div className="mt-2 text-xs text-green-700 font-medium">
            Analysis complete — loading results...
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="relative flex gap-3 sm:gap-4">
      {/* Vertical line */}
      {!isLast && (
        <div
          className={`absolute left-[13px] sm:left-[15px] top-8 bottom-0 w-px ${
            status === "complete" ? "bg-green-300" : "bg-[#e8ddd0]"
          }`}
        />
      )}

      {/* Stage indicator */}
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

      {/* Stage content */}
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
            {config.label}
          </h3>
          {status === "active" && typeof elapsedMs === "number" && (
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
          {status === "active" || status === "complete"
            ? (specialistTally && stageKey === "specialists" && status === "active" && specialistTally.total > 0
                ? `${specialistTally.done + specialistTally.failed} of ${specialistTally.total} specialists complete${specialistTally.failed > 0 ? ` (${specialistTally.failed} failed)` : ""}${specialistTally.lastDetail ? ` — ${specialistTally.lastDetail}` : ""}`
                : event?.detail || config.description)
            : config.description}
        </p>

        {status === "active" && elapsedMs !== undefined && elapsedMs > 15_000 && STAGE_DURATION_HINT[stageKey] && (
          <p className="text-[10px] sm:text-[11px] text-gray-400 mt-1 italic">
            {STAGE_DURATION_HINT[stageKey]}
          </p>
        )}

        {status !== "pending" && renderStageData()}
      </div>
    </div>
  )
}

// ===== MAIN COMPONENT =====

export function AnalysisLoading({ progress, pipelineEvents, preTriageSymptoms }: AnalysisLoadingProps) {
  const timelineEndRef = useRef<HTMLDivElement>(null)

  // Track which stage is currently active so we can show a live mm:ss timer
  // that proves the page isn't frozen even when no new SSE events arrive.
  const [activeStageStartedAt, setActiveStageStartedAt] = useState<number | null>(null)
  const [activeStageKey, setActiveStageKey] = useState<string | null>(null)
  const [tickNow, setTickNow] = useState<number>(() => Date.now())

  // Re-evaluate the active stage on every event update.
  useEffect(() => {
    let liveStage: string | null = null
    for (const stageKey of ORDERED_STAGES) {
      const status = getStageStatus(stageKey, pipelineEvents)
      if (status === "active") liveStage = stageKey
    }
    if (liveStage !== activeStageKey) {
      setActiveStageKey(liveStage)
      setActiveStageStartedAt(liveStage ? Date.now() : null)
    }
  }, [pipelineEvents, activeStageKey])

  // Tick the timer once per second while a stage is active.
  useEffect(() => {
    if (!activeStageKey || activeStageStartedAt == null) return
    const t = setInterval(() => setTickNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [activeStageKey, activeStageStartedAt])

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [pipelineEvents])

  const elapsedMs =
    activeStageStartedAt != null ? Math.max(0, tickNow - activeStageStartedAt) : 0
  const specialistTally = getSpecialistTally(pipelineEvents)

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
        <BreadcrumbNav
          items={[
            { label: "Home" },
            { label: "Analysis", current: true },
          ]}
        />

        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-[#8b2500] rounded-full mb-4 animate-pulse">
            <Brain className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">
            Analyzing Your Case
          </h1>
          <p className="text-[11px] sm:text-xs text-gray-400">
            Multi-specialist diagnostic pipeline
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-gray-400">
              {progress < 100
                ? `Stage ${Math.max(1, pipelineEvents.length > 0 ? pipelineEvents[pipelineEvents.length - 1].stageNumber + 1 : 1)} of 7`
                : "Complete"}
            </span>
            <span className="text-[11px] font-bold text-[#8b2500] tabular-nums">{progress}%</span>
          </div>
          <div className="w-full bg-[#e8ddd0] h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#8b2500] rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Timeline Feed */}
        <div className="bg-white border border-[#d4c5b0] rounded-sm p-4 sm:p-5">
          {ORDERED_STAGES.map((stageKey, index) => {
            const status = getStageStatus(stageKey, pipelineEvents)
            const event = getStageData(stageKey, pipelineEvents)

            return (
              <TimelineStage
                key={stageKey}
                stageKey={stageKey}
                status={status}
                event={event}
                isLast={index === ORDERED_STAGES.length - 1}
                preTriageSymptoms={stageKey === "extraction" ? preTriageSymptoms : undefined}
                elapsedMs={status === "active" ? elapsedMs : undefined}
                specialistTally={stageKey === "specialists" ? specialistTally : undefined}
              />
            )
          })}
          <div ref={timelineEndRef} />
        </div>

        {/* Footer */}
        {progress < 100 && (
          <p className="mt-5 text-center text-[10px] text-gray-400 max-w-sm mx-auto leading-relaxed">
            Consulting domain specialists in parallel, then evaluating hypotheses against
            diagnostic criteria from a curated rare disease knowledge base.
          </p>
        )}
      </div>
    </div>
  )
}
