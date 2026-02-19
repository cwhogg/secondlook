"use client"

import { useEffect, useRef } from "react"
import { Brain, CheckCircle2, Loader2, Stethoscope, FlaskConical, Scale, FileText, Activity } from "lucide-react"
import { BreadcrumbNav } from "./breadcrumb-nav"
import type { PipelineProgress } from "@/lib/types/pipeline"

interface AnalysisLoadingProps {
  progress: number
  pipelineEvents: PipelineProgress[]
}

// Map stage names to display info
const STAGE_CONFIG: Record<string, { label: string; icon: typeof Brain; description: string }> = {
  triage: {
    label: "Triage",
    icon: Activity,
    description: "Classifying symptoms and identifying candidate conditions",
  },
  specialists: {
    label: "Specialist Consultation",
    icon: Stethoscope,
    description: "Domain specialists analyzing your case in parallel",
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

const ORDERED_STAGES = ["triage", "specialists", "evidence", "synthesis", "report"] as const

function getStageStatus(
  stageKey: string,
  events: PipelineProgress[]
): "pending" | "active" | "complete" {
  const completeStages = new Set<string>()
  let latestActiveStage: string | null = null

  for (const event of events) {
    // Map event stage names to our stage keys
    const key = event.stage.replace("-complete", "")
    if (event.stage.endsWith("-complete") || event.stage === "complete") {
      completeStages.add(key)
      // 'complete' event means report is done
      if (event.stage === "complete") completeStages.add("report")
    } else {
      latestActiveStage = key
    }
  }

  // Special: specialists-complete means specialists is done
  if (events.some((e) => e.stage === "specialists-complete")) completeStages.add("specialists")
  if (events.some((e) => e.stage === "evidence-complete")) completeStages.add("evidence")
  if (events.some((e) => e.stage === "synthesis-complete")) completeStages.add("synthesis")

  if (completeStages.has(stageKey)) return "complete"
  if (latestActiveStage === stageKey) return "active"

  // If a later stage is active/complete, this one must be complete
  const stageIndex = ORDERED_STAGES.indexOf(stageKey as any)
  const latestIndex = latestActiveStage ? ORDERED_STAGES.indexOf(latestActiveStage as any) : -1
  if (stageIndex < latestIndex) return "complete"

  return "pending"
}

// Get the latest relevant data for a given stage from the event stream
function getStageData(stageKey: string, events: PipelineProgress[]) {
  // Find the most relevant event for this stage
  const completeEvent = events.find(
    (e) =>
      e.stage === `${stageKey}-complete` ||
      (stageKey === "triage" && e.stage === "triage") ||
      (stageKey === "report" && e.stage === "complete")
  )
  const startEvent = events.find((e) => e.stage === stageKey)
  return completeEvent || startEvent || null
}

function formatSpecialtyName(name: string): string {
  return name
    .replace(/-agent$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ===== STAGE DATA RENDERERS =====

function TriageData({ event }: { event: PipelineProgress & { stage: "triage" } }) {
  const { bodySystems, acuityLevel, specialties, candidateCount } = event.data
  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {bodySystems.map((system) => (
          <span
            key={system}
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-[#faf6f0] text-[#8b2500] border border-[#d4c5b0]"
          >
            {system}
          </span>
        ))}
        <span
          className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border ${
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
      <div className="text-xs text-gray-500">
        {candidateCount} candidate diseases from knowledge base
      </div>
      <div className="text-xs text-gray-500">
        Consulting: {specialties.map(formatSpecialtyName).join(", ")}
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
    <div className="mt-3 space-y-3">
      {results.map((specialist) => (
        <div key={specialist.agentName} className="border border-[#d4c5b0] bg-white p-3">
          <div className="text-xs font-semibold text-gray-700 mb-2">
            {formatSpecialtyName(specialist.agentName)}
          </div>
          <div className="space-y-1.5">
            {specialist.hypotheses.slice(0, 3).map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-700 truncate">{h.diagnosis}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="w-16 h-1.5 bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-[#8b2500] transition-all duration-500"
                      style={{ width: `${Math.min(h.confidenceScore, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 w-7 text-right tabular-nums">
                    {h.confidenceScore}%
                  </span>
                </div>
              </div>
            ))}
            {specialist.hypotheses.length > 3 && (
              <div className="text-[10px] text-gray-400">
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
  return (
    <div className="mt-3 text-xs text-gray-600 space-y-1">
      <div>{evaluatedCount} hypotheses evaluated</div>
      <div className="flex gap-3">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 bg-[#8b2500] inline-block" />
          {kbMatchedCount} criteria-grounded
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 bg-gray-400 inline-block" />
          {reasoningEvaluatedCount} reasoning-evaluated
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
  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium border ${
            consensusLevel === "strong"
              ? "bg-green-50 text-green-700 border-green-200"
              : consensusLevel === "moderate"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {consensusLevel} consensus
        </span>
      </div>
      <div className="space-y-2">
        {topDiagnoses.slice(0, 5).map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400 w-4 tabular-nums">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-700 truncate">{d.diagnosis}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-20 h-2 bg-gray-100 overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(d.probabilityScore, 100)}%`,
                    backgroundColor: i === 0 ? "#8b2500" : i < 3 ? "#b8623b" : "#d4a574",
                  }}
                />
              </div>
              <span className="text-[10px] font-medium text-gray-600 w-7 text-right tabular-nums">
                {d.probabilityScore}%
              </span>
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
}: {
  stageKey: string
  status: "pending" | "active" | "complete"
  event: PipelineProgress | null
  isLast: boolean
}) {
  const config = STAGE_CONFIG[stageKey]
  if (!config) return null
  const Icon = config.icon

  const renderStageData = () => {
    if (!event) return null

    switch (event.stage) {
      case "triage":
        return <TriageData event={event as PipelineProgress & { stage: "triage" }} />
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
    <div className="relative flex gap-4">
      {/* Vertical line */}
      {!isLast && (
        <div
          className={`absolute left-[17px] top-10 bottom-0 w-px ${
            status === "complete" ? "bg-green-300" : "bg-gray-200"
          }`}
        />
      )}

      {/* Stage indicator circle */}
      <div className="relative flex-shrink-0">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center ${
            status === "complete"
              ? "bg-green-500"
              : status === "active"
                ? "bg-[#8b2500]"
                : "bg-gray-200"
          }`}
        >
          {status === "complete" ? (
            <CheckCircle2 className="w-4.5 h-4.5 text-white" />
          ) : status === "active" ? (
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          ) : (
            <Icon className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Stage content */}
      <div className={`flex-1 pb-6 ${isLast ? "pb-0" : ""}`}>
        <div className="flex items-center gap-2">
          <h3
            className={`text-sm font-semibold ${
              status === "complete"
                ? "text-green-700"
                : status === "active"
                  ? "text-[#8b2500]"
                  : "text-gray-400"
            }`}
          >
            {config.label}
          </h3>
        </div>
        <p
          className={`text-xs mt-0.5 ${
            status === "pending" ? "text-gray-300" : "text-gray-500"
          }`}
        >
          {status === "active" || status === "complete"
            ? event?.detail || config.description
            : config.description}
        </p>

        {/* Stage-specific data (expanded when complete or when we have data) */}
        {status !== "pending" && renderStageData()}
      </div>
    </div>
  )
}

// ===== MAIN COMPONENT =====

export function AnalysisLoading({ progress, pipelineEvents }: AnalysisLoadingProps) {
  const timelineEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest event
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [pipelineEvents])

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
        {/* Breadcrumb Navigation */}
        <BreadcrumbNav
          items={[
            { label: "Home" },
            { label: "Symptoms" },
            { label: "Medical History" },
            { label: "Family History" },
            { label: "Analysis", current: true },
          ]}
        />

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-[#8b2500] rounded-full mb-5 animate-pulse">
            <Brain className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Analyzing Your Health Information
          </h1>
          <p className="text-sm text-gray-500">
            Multi-specialist diagnostic pipeline in progress
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-medium text-gray-500">
              {progress < 100
                ? `Stage ${Math.max(1, pipelineEvents.length > 0 ? pipelineEvents[pipelineEvents.length - 1].stageNumber : 1)} of 5`
                : "Complete"}
            </span>
            <span className="text-xs font-bold text-[#8b2500] tabular-nums">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 h-2 overflow-hidden">
            <div
              className="h-full bg-[#8b2500] transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Timeline Feed */}
        <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
          <div className="space-y-0">
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
                />
              )
            })}
          </div>
          <div ref={timelineEndRef} />
        </div>

        {/* Educational footer */}
        {progress < 100 && (
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              Our multi-agent pipeline consults domain specialists in parallel, then evaluates
              hypotheses against structured diagnostic criteria from a curated knowledge base of
              rare diseases.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
