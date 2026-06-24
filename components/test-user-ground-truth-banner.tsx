"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react"

interface GroundTruth {
  diagnosis: string
  icd10?: string | null
  prevalence?: string | null
  keyFindings?: string[]
  expectedBodySystems?: string[]
  expectedSpecialists?: string[]
  difficultyFactors?: string[]
  nearMisses?: Array<{ diagnosis: string; creditLevel?: string; reason?: string }>
}

/**
 * Sticky top banner that appears whenever the current session was started
 * via the "Create Test User" shortcut on step-1. Shows the synthetic
 * patient's known ground-truth diagnosis so the operator can verify the
 * pipeline output against the answer.
 *
 * Hidden in print via .no-print so the ground truth never leaks into the
 * downloadable Final Report PDF — that report should look identical to a
 * real patient's report.
 *
 * Reads from sessionStorage key `testUserGroundTruth`. When the user
 * starts a fresh analysis (handled in start-new-analysis.ts) the key is
 * cleared so the banner goes away.
 */
export function TestUserGroundTruthBanner() {
  const [groundTruth, setGroundTruth] = useState<GroundTruth | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("testUserGroundTruth")
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.diagnosis) setGroundTruth(parsed)
    } catch {
      // ignore corrupt save
    }
  }, [])

  if (!groundTruth) return null

  return (
    <div className="no-print sticky top-0 z-40 bg-amber-50 border-b-2 border-amber-300 px-3 py-2 text-amber-900 text-sm">
      <div className="max-w-5xl mx-auto flex items-start gap-3">
        <FlaskConical className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-700" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold uppercase tracking-wide text-[11px] text-amber-700">
              Test mode
            </span>
            <span>
              Expected:{" "}
              <span className="font-semibold text-amber-950">{groundTruth.diagnosis}</span>
              {groundTruth.icd10 && (
                <span className="ml-2 font-mono text-xs text-amber-800">
                  ICD-10 {groundTruth.icd10}
                </span>
              )}
            </span>
          </div>

          {expanded && (
            <div className="mt-2 space-y-1.5 text-xs text-amber-950">
              {groundTruth.keyFindings && groundTruth.keyFindings.length > 0 && (
                <Section label="Key findings">{groundTruth.keyFindings.join(" · ")}</Section>
              )}
              {groundTruth.expectedBodySystems && groundTruth.expectedBodySystems.length > 0 && (
                <Section label="Expected body systems">
                  {groundTruth.expectedBodySystems.join(", ")}
                </Section>
              )}
              {groundTruth.expectedSpecialists && groundTruth.expectedSpecialists.length > 0 && (
                <Section label="Expected specialists">
                  {groundTruth.expectedSpecialists.join(", ")}
                </Section>
              )}
              {groundTruth.difficultyFactors && groundTruth.difficultyFactors.length > 0 && (
                <Section label="Difficulty factors">
                  {groundTruth.difficultyFactors.join(" · ")}
                </Section>
              )}
              {groundTruth.nearMisses && groundTruth.nearMisses.length > 0 && (
                <Section label="Near misses (partial credit)">
                  {groundTruth.nearMisses.map((m) => m.diagnosis).join(" · ")}
                </Section>
              )}
              {groundTruth.prevalence && (
                <Section label="Prevalence">{groundTruth.prevalence}</Section>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-amber-800 hover:text-amber-950 font-medium whitespace-nowrap"
        >
          {expanded ? (
            <>
              Hide <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Details <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-semibold">{label}: </span>
      <span>{children}</span>
    </div>
  )
}
