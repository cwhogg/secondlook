"use client"

import { useState } from "react"
import type {
  TestCase,
  TestCaseStatus,
  TestSuiteStats,
  GeneratedPatient,
  GroundTruth,
  TestGrading,
  PreviousRunSnapshot,
  NearMiss,
} from "@/lib/types/admin"
import type { AnalysisResult, MappedSymptom } from "@/lib/types/index"
import type { PipelineProgress } from "@/lib/types/pipeline"
import { mapSingleSymptom } from "@/lib/symptom-parser"
import { qualitativeLabel } from "@/lib/pipeline/score-labels"
import { cn } from "@/lib/utils"

// ===== CONSTANTS =====

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Easy",
  2: "Moderate",
  3: "Challenging",
  4: "Hard",
  5: "Expert",
}

export const DIFFICULTY_COLORS: Record<number, string> = {
  1: "bg-green-100 text-green-800 border-green-300",
  2: "bg-blue-100 text-blue-800 border-blue-300",
  3: "bg-yellow-100 text-yellow-800 border-yellow-300",
  4: "bg-orange-100 text-orange-800 border-orange-300",
  5: "bg-red-100 text-red-800 border-red-300",
}

export const GRADE_COLORS: Record<string, string> = {
  "A+": "text-green-700",
  A: "text-green-700",
  "A-": "text-green-600",
  "B+": "text-blue-700",
  B: "text-blue-600",
  "B-": "text-blue-500",
  "C+": "text-yellow-700",
  C: "text-yellow-600",
  "C-": "text-yellow-500",
  D: "text-orange-600",
  F: "text-red-600",
}

export const VERSION_LABELS: Record<string, string> = {
  v1: "v1", v2: "v2", v3: "v3", v4: "v4", v7: "v7", v8: "v8",
  v13: "v13", v14: "v14", v15: "v15", Eval: "Eval",
}
export const VERSION_COLORS: Record<string, string> = {
  v1: "bg-gray-50 text-gray-700 border-gray-300",
  v2: "bg-blue-50 text-blue-800 border-blue-300",
  v3: "bg-emerald-50 text-emerald-800 border-emerald-300",
  v4: "bg-purple-50 text-purple-800 border-purple-300",
  v7: "bg-cyan-50 text-cyan-800 border-cyan-300",
  v8: "bg-teal-50 text-teal-800 border-teal-300",
  v13: "bg-orange-50 text-orange-800 border-orange-300",
  v14: "bg-rose-50 text-rose-800 border-rose-300",
  v15: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300",
  Eval: "bg-amber-50 text-amber-800 border-amber-300",
}

// ===== HELPERS =====

export interface LoadTestCasesResult {
  cases: TestCase[]
  total: number
  offset: number
  returned: number
}

// Default initial page. Corpus is multi-MB; full-load exceeds Vercel's response
// cap once we cross ~2,500 cases. Caller uses LoadTestCasesResult to drive
// "Load more" UI.
export async function loadTestCases(
  offset = 0,
  limit = 300,
): Promise<LoadTestCasesResult> {
  try {
    const res = await fetch(`/api/admin/test-cases?offset=${offset}&limit=${limit}`)
    if (!res.ok) return { cases: [], total: 0, offset, returned: 0 }
    const data = await res.json()
    const cases: TestCase[] = data.testCases ?? []
    const pagination = data.pagination ?? {}
    return {
      cases,
      total: typeof pagination.total === "number" ? pagination.total : cases.length,
      offset: typeof pagination.offset === "number" ? pagination.offset : offset,
      returned: cases.length,
    }
  } catch {
    return { cases: [], total: 0, offset, returned: 0 }
  }
}

// Serialized upsert coordinator. Each call to upsertTestCases / deleteTestCases
// merges its payload into a single in-flight POST against the upsert endpoint
// so we never blow past Vercel's ~4.5MB request body limit by shipping the
// entire ~28MB testCases array (every save would silently 413 and the catch
// here would swallow it). The server merges by id; we only send what changed.
interface PendingDelta {
  upsert: Map<string, TestCase>
  deleteIds: Set<string>
}
let saveInFlight: Promise<void> | null = null
let pendingDelta: PendingDelta = { upsert: new Map(), deleteIds: new Set() }

function hasPending(d: PendingDelta): boolean {
  return d.upsert.size > 0 || d.deleteIds.size > 0
}

// Listeners notified whenever a save fails so the UI can surface a banner
// instead of silently swallowing 413 / 500 / network errors.
type SaveErrorListener = (msg: string) => void
const saveErrorListeners = new Set<SaveErrorListener>()
export function subscribeToTestCaseSaveErrors(fn: SaveErrorListener): () => void {
  saveErrorListeners.add(fn)
  return () => saveErrorListeners.delete(fn)
}
function emitSaveError(msg: string): void {
  console.error("[saveTestCases]", msg)
  for (const fn of saveErrorListeners) {
    try { fn(msg) } catch {}
  }
}

async function dispatchDelta(delta: PendingDelta): Promise<void> {
  const upsertArr = Array.from(delta.upsert.values())
  const deleteIdsArr = Array.from(delta.deleteIds)
  const body = JSON.stringify({ upsert: upsertArr, deleteIds: deleteIdsArr })
  // POST to /api/admin/test-cases requires the admin password header. Read
  // it from sessionStorage where the testing/eval login flow persists it.
  // If unset (open dev mode), the server treats requireAdmin() as a no-op.
  const adminPw =
    typeof window !== "undefined"
      ? window.sessionStorage.getItem("adminTestingPassword") || ""
      : ""
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (adminPw) headers["x-admin-password"] = adminPw
  try {
    const res = await fetch("/api/admin/test-cases", {
      method: "POST",
      headers,
      body,
    })
    if (!res.ok) {
      // fetch() does NOT throw on HTTP error responses, so we have to read
      // the status explicitly. Include the payload count + size so the
      // diagnosis is immediate instead of guessed.
      const mb = (body.length / 1024 / 1024).toFixed(2)
      emitSaveError(
        `Save failed: HTTP ${res.status} ${res.statusText} ` +
          `(payload: ${upsertArr.length} upserts, ${deleteIdsArr.length} deletes, ${mb}MB)`,
      )
    }
  } catch (err: any) {
    emitSaveError(`Save failed: ${err?.message || "network error"}`)
  }
  if (hasPending(pendingDelta)) {
    const next = pendingDelta
    pendingDelta = { upsert: new Map(), deleteIds: new Set() }
    saveInFlight = dispatchDelta(next)
    return saveInFlight
  }
  saveInFlight = null
}

function flush(): void {
  if (saveInFlight) return
  if (!hasPending(pendingDelta)) return
  const next = pendingDelta
  pendingDelta = { upsert: new Map(), deleteIds: new Set() }
  saveInFlight = dispatchDelta(next)
}

export function upsertTestCases(cases: TestCase[]): void {
  for (const tc of cases) {
    if (!tc || typeof tc.id !== "string") continue
    pendingDelta.upsert.set(tc.id, tc)
    pendingDelta.deleteIds.delete(tc.id)
  }
  flush()
}

export function deleteTestCases(ids: string[]): void {
  for (const id of ids) {
    if (typeof id !== "string") continue
    pendingDelta.deleteIds.add(id)
    pendingDelta.upsert.delete(id)
  }
  flush()
}

// Resolves when the save queue is fully drained (no in-flight POST, no
// pending delta). Callers that need a guaranteed-persisted state — e.g.
// the trio runner's failure cleanup before it moves to the next case —
// should await this instead of returning while saves are still queued.
export async function awaitTestCaseSaves(): Promise<void> {
  // Drain whatever is queued already.
  if (!hasPending(pendingDelta) && !saveInFlight) return
  while (saveInFlight || hasPending(pendingDelta)) {
    if (saveInFlight) {
      try { await saveInFlight } catch {}
    }
    // After the in-flight POST resolves, dispatchDelta will have either
    // queued the next batch or set saveInFlight=null. Loop again to be
    // sure both are empty before returning.
  }
}


// v3 tiered-grader stats on a set of testCases. Returns null when no case has
// tieredGrading attached so callers can render "—" without diluting v2 counts.
//
// `n` = how many of the input cases have a v3 tieredGrading object (denominator
// for the rates). Cases without tieredGrading drop from this n; they remain in
// the v2 computeStats denominator separately. This matches how /eval's
// matched-trio panel handles partial grader coverage during rollout.
export interface V3Stats {
  n: number;
  variantT1: number;      // rankAtVariant === 1 (v3's isTop1, EXACT+VARIANT @ rank 1)
  variantT3: number;      // rankAtVariant ≤ 3
  variantT5: number;      // rankAtVariant ≤ 5
  variantT10: number;     // rankAtVariant ≤ 10
  familyT1: number;       // rankAtFamily === 1 (EXACT+VARIANT+FAMILY @ rank 1)
}

export function computeV3Stats(cases: TestCase[]): V3Stats | null {
  const withV3 = cases.filter((c) => c.tieredGrading);
  if (withV3.length === 0) return null;
  const atOrBefore = (rank: number | null | undefined, k: number) =>
    typeof rank === "number" && rank <= k;
  let variantT1 = 0, variantT3 = 0, variantT5 = 0, variantT10 = 0;
  let familyT1 = 0;
  for (const c of withV3) {
    const g = c.tieredGrading!;
    if (atOrBefore(g.rankAtVariant, 1)) variantT1++;
    if (atOrBefore(g.rankAtVariant, 3)) variantT3++;
    if (atOrBefore(g.rankAtVariant, 5)) variantT5++;
    if (atOrBefore(g.rankAtVariant, 10)) variantT10++;
    if (atOrBefore(g.rankAtFamily, 1)) familyT1++;
  }
  return { n: withV3.length, variantT1, variantT3, variantT5, variantT10, familyT1 };
}

export function computeStats(cases: TestCase[]): TestSuiteStats | null {
  const graded = cases.filter((c) => c.status === "graded" && c.grading)
  if (graded.length === 0) return null

  const scores = graded.map((c) => c.grading!.score)
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
  const top1 = graded.filter((c) => c.grading!.correctDiagnosisRank === 1).length
  const top3 = graded.filter((c) => c.grading!.inTop3).length
  const top5 = graded.filter((c) => c.grading!.inTop5).length
  // Grader processes top 10; any non-null correctDiagnosisRank is therefore
  // a Top-10 hit by construction. Baselines that emitted only 5 diagnoses
  // get Top-10 = Top-5 automatically (no extra rows to fill in).
  const top10 = graded.filter((c) => {
    const r = c.grading!.correctDiagnosisRank
    return typeof r === "number" && r <= 10
  }).length

  const exactOrVariantTiers = new Set(['exact-top1', 'exact-top3', 'exact-top5', 'variant-top3', 'variant-top5'])
  const clinicalTop5 = graded.filter((c) => {
    const tier = c.grading!.tierMatch?.tier
    return tier && exactOrVariantTiers.has(tier)
  }).length

  const familyTiers = new Set([...exactOrVariantTiers, 'family-top3', 'family-top5'])
  const familyTop5 = graded.filter((c) => {
    const tier = c.grading!.tierMatch?.tier
    return tier && familyTiers.has(tier)
  }).length

  const getVersion = (tc: TestCase) => tc.testVersion ?? 'v1'

  const byDifficultySource: TestSuiteStats["byDifficultySource"] = {}
  for (const tc of graded) {
    const key = `${tc.difficulty}-${getVersion(tc)}`
    if (!byDifficultySource[key]) {
      byDifficultySource[key] = { difficulty: tc.difficulty, version: getVersion(tc), count: 0, avgScore: 0, top1Rate: 0, top3Rate: 0, top5Rate: 0 }
    }
    byDifficultySource[key].count++
  }
  for (const entry of Object.values(byDifficultySource)) {
    const bucket = graded.filter((c) => c.difficulty === entry.difficulty && getVersion(c) === entry.version)
    entry.avgScore = bucket.reduce((a, c) => a + c.grading!.score, 0) / bucket.length
    entry.top1Rate = bucket.filter((c) => c.grading!.correctDiagnosisRank === 1).length / bucket.length
    entry.top3Rate = bucket.filter((c) => c.grading!.inTop3).length / bucket.length
    entry.top5Rate = bucket.filter((c) => c.grading!.inTop5).length / bucket.length
  }

  const byVersion: TestSuiteStats["byVersion"] = {}
  for (const tc of graded) {
    const ver = getVersion(tc)
    if (!byVersion[ver]) {
      byVersion[ver] = { version: ver, count: 0, avgScore: 0, top1Rate: 0, top3Rate: 0, top5Rate: 0 }
    }
    byVersion[ver].count++
  }
  for (const entry of Object.values(byVersion)) {
    const bucket = graded.filter((c) => getVersion(c) === entry.version)
    entry.avgScore = bucket.reduce((a, c) => a + c.grading!.score, 0) / bucket.length
    entry.top1Rate = bucket.filter((c) => c.grading!.correctDiagnosisRank === 1).length / bucket.length
    entry.top3Rate = bucket.filter((c) => c.grading!.inTop3).length / bucket.length
    entry.top5Rate = bucket.filter((c) => c.grading!.inTop5).length / bucket.length
  }

  return {
    totalTests: cases.length,
    gradedTests: graded.length,
    avgScore,
    top1Rate: top1 / graded.length,
    top3Rate: top3 / graded.length,
    top5Rate: top5 / graded.length,
    top10Rate: top10 / graded.length,
    clinicalTop5Rate: clinicalTop5 / graded.length,
    familyTop5Rate: familyTop5 / graded.length,
    byDifficultySource,
    byVersion,
  }
}

export async function buildPatientCase(
  patient: GeneratedPatient,
  onProgress?: (msg: string) => void
): Promise<{ patientCase: any; extractedSymptoms: MappedSymptom[]; extractedExcludedFindings: MappedSymptom[] }> {
  onProgress?.("Parsing symptoms from narrative...")
  const parseResponse = await fetch("/api/parse-symptoms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: patient.narrative,
      patientAge: patient.demographics.age,
      patientSex: patient.demographics.sex,
    }),
  })

  const parsed = await parseResponse.json().catch(() => null)

  if (!parseResponse.ok) {
    const detail = parsed?.error || parseResponse.statusText || `HTTP ${parseResponse.status}`
    throw new Error(`Symptom parsing failed: ${detail}`)
  }

  const parsedSymptoms: any[] = parsed?.symptoms || []
  // Excluded findings now arrive as full objects (same shape as symptoms,
  // minus severity/duration). Tolerate legacy responses that returned plain
  // strings by promoting them to objects with just originalPhrase + medicalTerm.
  const parsedExcluded: any[] = Array.isArray(parsed?.excludedFindings)
    ? parsed.excludedFindings
        .map((entry: unknown) => {
          if (typeof entry === "string") {
            const trimmed = entry.trim()
            return trimmed
              ? { originalPhrase: trimmed, medicalTerm: trimmed, alternativeSearchTerms: [] }
              : null
          }
          if (entry && typeof entry === "object") return entry
          return null
        })
        .filter((e: any) => e && (e.medicalTerm || e.originalPhrase))
    : []

  if (parsedSymptoms.length === 0) {
    throw new Error("Symptom parsing returned no symptoms from narrative")
  }

  onProgress?.(`Parsed ${parsedSymptoms.length} symptoms${parsedExcluded.length > 0 ? ` (${parsedExcluded.length} excluded findings)` : ''}, mapping to UMLS...`)

  const mappedSymptoms: MappedSymptom[] = []
  for (let i = 0; i < parsedSymptoms.length; i++) {
    onProgress?.(`Mapping symptom ${i + 1}/${parsedSymptoms.length}: ${parsedSymptoms[i].medicalTerm || parsedSymptoms[i].originalPhrase}`)
    const mapped = await mapSingleSymptom(parsedSymptoms[i])
    mappedSymptoms.push(mapped)
  }

  const mappedExcluded: MappedSymptom[] = []
  for (let i = 0; i < parsedExcluded.length; i++) {
    onProgress?.(`Mapping excluded finding ${i + 1}/${parsedExcluded.length}: ${parsedExcluded[i].medicalTerm || parsedExcluded[i].originalPhrase}`)
    const mapped = await mapSingleSymptom(parsedExcluded[i])
    mappedExcluded.push(mapped)
  }

  const successCount = mappedSymptoms.filter((s) => !s.mappingError).length
  const excludedSuccess = mappedExcluded.filter((s) => !s.mappingError).length
  onProgress?.(`UMLS mapping complete: ${successCount}/${mappedSymptoms.length} symptoms${mappedExcluded.length > 0 ? `, ${excludedSuccess}/${mappedExcluded.length} excluded` : ''} mapped successfully`)

  // Pipeline consumes the term names of excluded findings; UI displays the
  // full MappedSymptom rows.
  const excludedFindings: string[] = mappedExcluded
    .map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase)
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)

  return {
    extractedSymptoms: mappedSymptoms,
    extractedExcludedFindings: mappedExcluded,
    patientCase: {
      demographics: patient.demographics,
      symptoms: mappedSymptoms,
      excludedFindings,
      symptomPatterns: null,
      patientHypothesis: null,
      medicalHistory: {
        currentMedications: patient.medicalHistory?.currentMedications || [],
        pastMedicalHistory: patient.medicalHistory?.pastMedicalHistory || [],
        familyHistory: patient.medicalHistory?.familyHistory || [],
        recentTests: patient.medicalHistory?.recentTests || [],
        medicalCare: "",
        testingHistory: [],
      },
    },
  }
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

// ===== COMPONENTS =====

export function StatsBanner({
  stats,
  hideDifficultyBreakdown,
  slotBetween,
}: {
  stats: TestSuiteStats
  hideDifficultyBreakdown?: boolean
  // Optional content rendered between the top metric row and the breakdown
  // tables — used by /testing and /eval to sandwich the Run controls card
  // inside the aggregated-results area.
  slotBetween?: React.ReactNode
}) {
  const breakdownEntries = hideDifficultyBreakdown
    ? []
    : Object.values(stats.byDifficultySource)
        .sort((a, b) => {
          if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty
          const numA = parseInt(a.version.replace(/\D/g, ''), 10) || 0
          const numB = parseInt(b.version.replace(/\D/g, ''), 10) || 0
          return numA - numB || a.version.localeCompare(b.version)
        })
  const versionEntries = Object.values(stats.byVersion)
    .sort((a, b) => {
      const numA = parseInt(a.version.replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b.version.replace(/\D/g, ''), 10) || 0
      return numA - numB || a.version.localeCompare(b.version)
    })

  return (
    <div className="border border-[#d4c5b0] bg-white mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-7 divide-x divide-[#e8ddd0]">
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-wider text-[#8b7355] mb-1.5">Tests</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">
            {stats.gradedTests}<span className="text-base font-normal text-[#8b7355]">/{stats.totalTests}</span>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-wider text-[#8b7355] mb-1.5">Avg Score</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{stats.avgScore.toFixed(1)}</div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-wider text-[#8b7355] mb-1.5">Top-1</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{pct(stats.top1Rate)}</div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-wider text-[#8b7355] mb-1.5">Top-3</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{pct(stats.top3Rate)}</div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-wider text-[#8b7355] mb-1.5">Top-5</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{pct(stats.top5Rate)}</div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-wider text-[#8b7355] mb-1.5">Clin Top-5</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{pct(stats.clinicalTop5Rate)}</div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-wider text-[#8b7355] mb-1.5">Fam Top-5</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{pct(stats.familyTop5Rate)}</div>
        </div>
      </div>

      {slotBetween && (
        <div className="border-t border-[#d4c5b0]">{slotBetween}</div>
      )}

      {versionEntries.length > 0 && (
        <div className="border-t border-[#d4c5b0] overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[#e8ddd0] bg-[#faf7f2]">
                <th className="text-left py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium" colSpan={2}>Version Summary</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">n</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Avg Score</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-1</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-3</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-5</th>
              </tr>
            </thead>
            <tbody>
              {versionEntries.map((entry) => (
                <tr key={entry.version} className="border-b border-[#e8ddd0] last:border-b-0">
                  <td className="py-2.5 px-4 sm:px-5" colSpan={2}>
                    <span className={`inline-block px-2 py-0.5 border text-xs font-medium ${VERSION_COLORS[entry.version] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
                      {VERSION_LABELS[entry.version] || entry.version}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#5a5a5a] tabular-nums">{entry.count}</td>
                  <td className="py-2.5 px-4 sm:px-5 text-right font-medium text-[#2a2a2a] tabular-nums">{entry.avgScore.toFixed(1)}</td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">{pct(entry.top1Rate)}</td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">{pct(entry.top3Rate)}</td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">{pct(entry.top5Rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {breakdownEntries.length > 0 && (
        <div className="border-t border-[#d4c5b0] overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[#e8ddd0] bg-[#faf7f2]">
                <th className="text-left py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Difficulty</th>
                <th className="text-left py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Version</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">n</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Avg Score</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-1</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-3</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-5</th>
              </tr>
            </thead>
            <tbody>
              {breakdownEntries.map((entry) => (
                <tr key={`${entry.difficulty}-${entry.version}`} className="border-b border-[#e8ddd0] last:border-b-0">
                  <td className="py-2.5 px-4 sm:px-5">
                    <span className={`inline-block px-2 py-0.5 border text-xs font-medium ${DIFFICULTY_COLORS[entry.difficulty]}`}>
                      {DIFFICULTY_LABELS[entry.difficulty]}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 sm:px-5">
                    <span className={`inline-block px-2 py-0.5 border text-xs font-medium ${VERSION_COLORS[entry.version] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
                      {VERSION_LABELS[entry.version] || entry.version}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#5a5a5a] tabular-nums">{entry.count}</td>
                  <td className="py-2.5 px-4 sm:px-5 text-right font-medium text-[#2a2a2a] tabular-nums">{entry.avgScore.toFixed(1)}</td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">{pct(entry.top1Rate)}</td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">{pct(entry.top3Rate)}</td>
                  <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">{pct(entry.top5Rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function DifficultyBadge({ difficulty }: { difficulty: number }) {
  if (difficulty === 0) {
    return (
      <span className="inline-block px-2 py-0.5 border text-xs font-medium bg-gray-100 text-gray-600 border-gray-300">
        N/A
      </span>
    )
  }
  return (
    <span className={`inline-block px-2 py-0.5 border text-xs font-medium ${DIFFICULTY_COLORS[difficulty]}`}>
      {DIFFICULTY_LABELS[difficulty]} ({difficulty})
    </span>
  )
}

export function StatusBadge({ status }: { status: TestCaseStatus }) {
  const styles: Record<TestCaseStatus, string> = {
    generated: "bg-gray-100 text-gray-700 border-gray-300",
    running: "bg-blue-100 text-blue-700 border-blue-300",
    completed: "bg-indigo-100 text-indigo-700 border-indigo-300",
    graded: "bg-green-100 text-green-700 border-green-300",
    error: "bg-red-100 text-red-700 border-red-300",
  }
  return (
    <span className={`inline-block px-2 py-0.5 border text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

export function GradeBadge({ grading }: { grading: TestGrading }) {
  return (
    <span className={`text-lg font-bold font-serif ${GRADE_COLORS[grading.grade] || "text-gray-600"}`}>
      {grading.grade} ({grading.score})
    </span>
  )
}

export function GroundTruthSection({ groundTruth, collapsed }: { groundTruth: GroundTruth; collapsed: boolean }) {
  const [open, setOpen] = useState(!collapsed)
  return (
    <div className="border border-[#d4c5b0] bg-[#faf7f3]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-[#f0ebe4] transition-colors"
      >
        <span className="text-sm font-semibold text-[#8b2500] uppercase tracking-wider">
          Ground Truth (Answer Key)
        </span>
        <span className="text-[#8b7355] text-sm">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 text-sm">
          <div>
            <span className="font-semibold text-[#5a5a5a]">Diagnosis:</span>{" "}
            <span className="text-[#2a2a2a] font-serif">{groundTruth.diagnosis}</span>
          </div>
          {groundTruth.icd10 && (
            <div>
              <span className="font-semibold text-[#5a5a5a]">ICD-10:</span> {groundTruth.icd10}
            </div>
          )}
          {groundTruth.prevalence && (
            <div>
              <span className="font-semibold text-[#5a5a5a]">Prevalence:</span> {groundTruth.prevalence}
            </div>
          )}
          <div>
            <span className="font-semibold text-[#5a5a5a]">Key Findings:</span>
            <ul className="list-disc list-inside ml-2 mt-1 text-[#5a5a5a]">
              {groundTruth.keyFindings.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
          {groundTruth.difficultyFactors && groundTruth.difficultyFactors.length > 0 && (
            <div>
              <span className="font-semibold text-[#5a5a5a]">Difficulty Factors:</span>
              <ul className="list-disc list-inside ml-2 mt-1 text-[#5a5a5a]">
                {groundTruth.difficultyFactors.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {groundTruth.nearMisses && groundTruth.nearMisses.length > 0 && (
            <div>
              <span className="font-semibold text-[#5a5a5a]">Near Misses:</span>
              <div className="ml-2 mt-1 space-y-1">
                {groundTruth.nearMisses.map((nm: NearMiss, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[#5a5a5a]">
                    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium border ${
                      nm.creditLevel === 'variant'
                        ? 'bg-violet-50 text-violet-700 border-violet-300'
                        : 'bg-teal-50 text-teal-700 border-teal-300'
                    }`}>
                      {nm.creditLevel}
                    </span>
                    <span>{nm.diagnosis}</span>
                    {nm.reason && <span className="text-xs text-[#8b7355]">({nm.reason})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <span className="font-semibold text-[#5a5a5a]">Expected Systems:</span>{" "}
            {groundTruth.expectedBodySystems.join(", ")}
          </div>
          <div>
            <span className="font-semibold text-[#5a5a5a]">Expected Specialists:</span>{" "}
            {groundTruth.expectedSpecialists.join(", ")}
          </div>
        </div>
      )}
    </div>
  )
}

function isMappedSymptomLike(v: unknown): v is MappedSymptom {
  return !!v && typeof v === "object" && "originalPhrase" in (v as any)
}

export function ExtractedSymptomsSection({
  symptoms,
  excludedFindings,
}: {
  symptoms: MappedSymptom[]
  // Legacy callers passed string[]; new callers pass MappedSymptom[]. Render both.
  excludedFindings?: MappedSymptom[] | string[]
}) {
  const mapped = symptoms.filter((s) => !s.mappingError)
  const failed = symptoms.filter((s) => s.mappingError)
  const excluded: MappedSymptom[] = (excludedFindings || [])
    .map((entry: unknown): MappedSymptom | null => {
      if (isMappedSymptomLike(entry)) return entry
      if (typeof entry === "string" && entry.trim().length > 0) {
        return {
          originalPhrase: entry,
          medicalTerm: entry,
          umlsConcepts: [],
          selectedConcept: null,
          confidence: 0,
          confirmed: false,
          mappingError: true,
          feedbackStatus: "none",
        } as MappedSymptom
      }
      return null
    })
    .filter((e): e is MappedSymptom => e !== null)
  const excludedMapped = excluded.filter((s) => !s.mappingError).length

  return (
    <div className="border border-[#d4c5b0] bg-white p-4 space-y-3">
      <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">
        Extracted Symptoms ({mapped.length}/{symptoms.length} mapped)
      </div>
      <div className="space-y-1.5">
        {symptoms.map((s, i) => (
          <div key={i} className="text-sm flex items-start gap-2">
            <span className={`font-mono text-xs mt-0.5 ${s.mappingError ? "text-red-400" : "text-[#8b7355]"}`}>
              {i + 1}.
            </span>
            <div className="flex-1">
              <div>
                <span className="text-[#2a2a2a]">&ldquo;{s.originalPhrase}&rdquo;</span>
                <span className="text-[#8b7355]"> &rarr; </span>
                <span className="font-medium text-[#5a5a5a]">{s.medicalTerm}</span>
              </div>
              {s.selectedConcept && (
                <div className="text-xs text-[#8b7355]">
                  UMLS: {s.selectedConcept.name}
                  {s.selectedConcept.cui && ` (${s.selectedConcept.cui})`}
                  {s.searchTermUsed && s.searchTermUsed !== s.medicalTerm && (
                    <span> &middot; matched via &ldquo;{s.searchTermUsed}&rdquo;</span>
                  )}
                  <span> &middot; conf: {(s.confidence * 100).toFixed(0)}%</span>
                </div>
              )}
              {s.mappingError && (
                <div className="text-xs text-red-500">UMLS mapping failed</div>
              )}
              {(s.severity || s.duration || s.bodyPart) && (
                <div className="text-xs text-[#8b7355]">
                  {[s.severity, s.duration, s.bodyPart].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {failed.length > 0 && (
        <div className="text-xs text-red-500">
          {failed.length} symptom{failed.length > 1 ? "s" : ""} failed UMLS mapping
        </div>
      )}
      {excluded.length > 0 && (
        <div className="pt-3 border-t border-[#e8ddd0] space-y-2">
          <div className="text-xs font-semibold text-[#8b7355] uppercase tracking-wider">
            Excluded Findings ({excludedMapped}/{excluded.length} mapped)
          </div>
          <div className="text-xs text-[#8b7355] italic mb-1">
            Findings the patient or source explicitly ruled out / denied. Used as negative evidence by retrieval and the specialist + evidence-evaluator agents.
          </div>
          <div className="space-y-1.5">
            {excluded.map((s, i) => (
              <div key={i} className="text-sm flex items-start gap-2">
                <span className={`font-mono text-xs mt-0.5 ${s.mappingError ? "text-red-400" : "text-[#8b7355]"}`}>
                  {i + 1}.
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-[#e8ddd0] text-[#8b2500] border border-[#d4c5b0]">
                      Excluded
                    </span>
                    <span className="text-[#2a2a2a]">&ldquo;{s.originalPhrase}&rdquo;</span>
                    <span className="text-[#8b7355]">&rarr;</span>
                    <span className="font-medium text-[#5a5a5a]">{s.medicalTerm}</span>
                  </div>
                  {s.selectedConcept && (
                    <div className="text-xs text-[#8b7355]">
                      UMLS: {s.selectedConcept.name}
                      {s.selectedConcept.cui && ` (${s.selectedConcept.cui})`}
                      {s.searchTermUsed && s.searchTermUsed !== s.medicalTerm && (
                        <span> &middot; matched via &ldquo;{s.searchTermUsed}&rdquo;</span>
                      )}
                      <span> &middot; conf: {(s.confidence * 100).toFixed(0)}%</span>
                    </div>
                  )}
                  {s.mappingError && (
                    <div className="text-xs text-red-500">UMLS mapping failed</div>
                  )}
                  {(s.bodyPart || s.category) && (
                    <div className="text-xs text-[#8b7355]">
                      {[s.bodyPart, s.category].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function PipelineProgressDisplay({ events, percent }: { events: PipelineProgress[]; percent: number }) {
  const stageNames: Record<string, string> = {
    triage: "Triage",
    specialists: "Specialists",
    "specialists-complete": "Specialists Done",
    evidence: "Evidence Eval",
    "evidence-complete": "Evidence Done",
    synthesis: "Synthesis",
    "synthesis-complete": "Synthesis Done",
    report: "Report",
    complete: "Complete",
  }

  function renderEventDetail(e: PipelineProgress) {
    switch (e.stage) {
      case "triage":
        return (
          <div className="ml-4 mt-0.5 space-y-0.5">
            <div className="text-xs text-[#5a5a5a]">
              <span className="font-medium">Body systems:</span> {e.data.bodySystems.join(", ")}
            </div>
            <div className="text-xs text-[#5a5a5a]">
              <span className="font-medium">Specialists:</span> {e.data.specialties.join(", ")}
            </div>
            <div className="text-xs text-[#5a5a5a]">
              <span className="font-medium">Acuity:</span> {e.data.acuityLevel} &middot;{" "}
              {e.data.candidateCount} KB candidates
            </div>
          </div>
        )
      case "specialists-complete":
        return (
          <div className="ml-4 mt-0.5 space-y-1">
            {e.data.results.map((r, j) => (
              <div key={j} className="text-xs">
                <span className="font-medium text-[#5a5a5a]">{r.agentName}</span>
                <span className="text-[#8b7355]"> ({r.specialty})</span>
                <div className="ml-3 text-[#5a5a5a]">
                  {r.hypotheses.map((h, k) => (
                    <div key={k}>
                      {k + 1}. {h.diagnosis}
                      <span className="text-[#8b7355] ml-1">({h.confidenceScore})</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      case "evidence-complete":
        return (
          <div className="ml-4 mt-0.5 text-xs text-[#5a5a5a]">
            {e.data.evaluatedCount} evaluated &middot; {e.data.kbMatchedCount} KB-matched &middot;{" "}
            {e.data.reasoningEvaluatedCount} reasoning-only
          </div>
        )
      case "synthesis-complete":
        return (
          <div className="ml-4 mt-0.5 space-y-0.5">
            <div className="text-xs text-[#5a5a5a]">
              <span className="font-medium">Consensus:</span> {e.data.consensusLevel}
            </div>
            {e.data.topDiagnoses.slice(0, 5).map((d, j) => (
              <div key={j} className="text-xs text-[#5a5a5a] ml-3">
                {j + 1}. {d.diagnosis}
                <span className="text-[#8b7355] ml-1">({d.probabilityScore})</span>
              </div>
            ))}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-2">
      <div className="h-2 bg-[#e8ddd0] w-full">
        <div
          className="h-2 bg-[#8b2500] transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-xs text-[#8b7355]">{percent}% complete</div>
      {events.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-1.5">
          {events.map((e, i) => (
            <div key={i}>
              <div className="text-xs text-[#5a5a5a]">
                <span className="font-medium">{stageNames[e.stage] || e.stage}</span>
                <span className="ml-1 text-[#8b7355]">&mdash; {e.detail}</span>
              </div>
              {renderEventDetail(e)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function StepIndicator({ label, status }: { label: string; status: "pending" | "active" | "done" }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
        status === "done" && "bg-[#8b2500] text-white",
        status === "active" && "bg-[#8b2500] text-white animate-pulse",
        status === "pending" && "bg-[#e8ddd0] text-[#8b7355]",
      )}>
        {status === "done" ? "✓" : status === "active" ? "•" : ""}
      </div>
      <span className={cn(
        "text-xs font-medium",
        status === "active" ? "text-[#8b2500]" : "text-[#8b7355]",
      )}>
        {label}
      </span>
    </div>
  )
}

export function PipelineResultsSection({ result }: { result: AnalysisResult }) {
  const meta = result.pipelineMetadata
  const topDx = result.differentialDiagnoses.slice(0, 5)

  return (
    <div className="border border-[#d4c5b0] bg-white p-4 space-y-3">
      <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">Pipeline Results</div>

      {meta && (
        <div className="text-xs text-[#8b7355] flex flex-wrap gap-3">
          <span>{(meta.totalDurationMs / 1000).toFixed(1)}s</span>
          <span>{meta.totalTokensUsed.toLocaleString()} tokens</span>
          <span>${meta.totalCostEstimate.toFixed(3)}</span>
          <span>{meta.stages?.length ?? 0} stages</span>
          <span>{meta.diseasesConsidered} diseases considered</span>
        </div>
      )}

      {meta?.stages && meta.stages.length > 0 && (
        <div className="text-xs space-y-0.5">
          <div className="font-semibold text-[#5a5a5a]">Stages:</div>
          {meta.stages.map((s, i) => (
            <div key={i} className="text-[#5a5a5a]">
              {s.agentName || s.stageName} &mdash; {(s.durationMs / 1000).toFixed(1)}s, {s.tokensUsed} tokens
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="text-sm font-semibold text-[#5a5a5a] mb-2">Top 5 Differential:</div>
        <div className="space-y-2">
          {topDx.map((dx, i) => (
            <div key={i} className="border border-[#e8ddd0] p-3 bg-[#faf7f3]">
              <div className="flex items-start justify-between gap-2">
                <div className="font-serif text-[#2a2a2a]">
                  <span className="text-[#8b2500] font-bold mr-1">#{i + 1}</span>
                  {dx.diagnosis}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-[#8b2500]">{dx.evidenceScore}</div>
                  <div className="text-[10px] text-[#8b7355]">{qualitativeLabel(dx.evidenceScore).label}</div>
                  {typeof dx.confidenceScore === "number" && dx.confidenceScore !== dx.evidenceScore && (
                    <div className="text-[10px] text-[#8b7355] mt-0.5">LLM conf: {dx.confidenceScore}</div>
                  )}
                </div>
              </div>
              <div className="text-xs text-[#8b7355] mt-1">
                {dx.sourceAgent} &middot; {dx.evaluationType} &middot;{" "}
                {dx.knowledgeBaseMatch ? "KB match" : "no KB match"}
                {dx.icd10Code && ` · ${dx.icd10Code}`}
              </div>
              <div className="text-xs text-[#5a5a5a] mt-1 line-clamp-2">{dx.clinicalReasoning}</div>
              {dx.supportingEvidence && dx.supportingEvidence.length > 0 && (
                <div className="text-xs text-[#8b7355] mt-1">
                  Evidence: {dx.supportingEvidence.slice(0, 3).map((e) => e.finding).join("; ")}
                  {dx.supportingEvidence.length > 3 && ` (+${dx.supportingEvidence.length - 3} more)`}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {result.familyEnrichments && result.familyEnrichments.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-[#5a5a5a] mb-2">Family Enrichment:</div>
          <div className="space-y-2">
            {result.familyEnrichments.map((fe, i) => (
              <div key={i} className="border border-purple-200 bg-purple-50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">Family</span>
                  <span className="text-sm font-serif text-[#2a2a2a]">&ldquo;{fe.familyName}&rdquo;</span>
                  <span className="text-xs text-[#8b7355]">({fe.totalSubtypes} subtypes in KB)</span>
                </div>
                <div className="text-xs text-[#5a5a5a]">
                  Triggered by: {fe.topDiagnosisInFamily}
                </div>
                {fe.differentiatingTest ? (
                  <div className="text-xs text-[#5a5a5a] mt-1">
                    <span className="font-medium">Differentiating test:</span> {fe.differentiatingTest.modalityLabel}
                    <span className="text-[#8b7355]"> (convergence: {Math.round(fe.differentiatingTest.convergenceRatio * 100)}%)</span>
                    <div className="mt-1 ml-2 space-y-0.5">
                      {fe.differentiatingTest.perSubtype
                        .filter(s => s.uniqueFindings.length > 0)
                        .slice(0, 4)
                        .map((s, j) => (
                          <div key={j} className="text-[#5a5a5a]">
                            &bull; {s.diseaseName}: {s.uniqueFindings.slice(0, 2).join("; ")}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#8b7355] mt-1">No single differentiating test (mixed modalities)</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.overallAssessment && (
        <div className="text-sm text-[#5a5a5a]">
          <span className="font-semibold">Assessment:</span> {result.overallAssessment}
        </div>
      )}
    </div>
  )
}

export function ScoreDelta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-xs text-[#8b7355]">(no change)</span>
  const color = delta > 0 ? "text-green-600" : "text-red-600"
  const sign = delta > 0 ? "+" : ""
  return <span className={`text-xs font-bold ${color}`}>{sign}{delta}</span>
}

export function GradingSection({ grading, previousRun }: { grading: TestGrading; previousRun?: PreviousRunSnapshot }) {
  return (
    <div className="border border-[#d4c5b0] bg-white p-4 space-y-3">
      <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">Grading</div>

      <div className="flex items-center gap-4">
        <div className={`text-4xl font-bold font-serif ${GRADE_COLORS[grading.grade] || "text-gray-600"}`}>
          {grading.grade}
        </div>
        <div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{grading.score}/100</div>
          <div className="text-xs text-[#8b7355]">
            Correct diagnosis rank: {grading.correctDiagnosisRank ?? "not found"}
            {grading.inTop3 && " (top 3)"}
            {grading.inTop5 && !grading.inTop3 && " (top 5)"}
          </div>
          {grading.tierMatch && (
            <div className="text-xs text-[#8b7355] mt-0.5">
              Tier: <span className="font-medium text-[#5a5a5a]">{grading.tierMatch.tier}</span>
              {grading.tierMatch.matchedDiagnosis && (
                <span> &middot; matched &ldquo;{grading.tierMatch.matchedDiagnosis}&rdquo; at #{grading.tierMatch.matchedRank}</span>
              )}
              <span> &middot; range [{grading.tierMatch.scoreRange[0]}-{grading.tierMatch.scoreRange[1]}]</span>
            </div>
          )}
          {grading.nearMissMatch && (
            <div className="text-xs text-violet-600 mt-0.5">
              Near-miss: {grading.nearMissMatch}
            </div>
          )}
        </div>
      </div>

      {previousRun && (
        <div className="bg-[#faf7f3] border border-[#e8ddd0] px-3 py-2 text-sm text-[#5a5a5a]">
          Previous: <span className={`font-medium ${GRADE_COLORS[previousRun.grade] || "text-gray-600"}`}>{previousRun.grade}</span>{" "}
          ({previousRun.score}) &rarr; Current: <span className={`font-medium ${GRADE_COLORS[grading.grade] || "text-gray-600"}`}>{grading.grade}</span>{" "}
          ({grading.score}) <ScoreDelta delta={grading.score - previousRun.score} />
        </div>
      )}

      <div className="text-sm text-[#2a2a2a] font-serif italic">{grading.feedback}</div>

      {grading.partialCreditReason && (
        <div className="border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Partial Credit</div>
          <div className="text-sm text-amber-900">{grading.partialCreditReason}</div>
        </div>
      )}

      {grading.strengths && grading.strengths.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Strengths</div>
          <ul className="list-disc list-inside text-sm text-[#5a5a5a] space-y-0.5">
            {grading.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {grading.weaknesses && grading.weaknesses.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-orange-700 uppercase tracking-wider mb-1">Weaknesses</div>
          <ul className="list-disc list-inside text-sm text-[#5a5a5a] space-y-0.5">
            {grading.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {grading.missedFindings && grading.missedFindings.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-1">Missed Findings</div>
          <ul className="list-disc list-inside text-sm text-[#5a5a5a] space-y-0.5">
            {grading.missedFindings.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {grading.falseLeads && grading.falseLeads.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">False Leads</div>
          <ul className="list-disc list-inside text-sm text-[#5a5a5a] space-y-0.5">
            {grading.falseLeads.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function TestHistoryRow({
  tc,
  isActive,
  onClick,
}: {
  tc: TestCase
  isActive: boolean
  onClick: () => void
}) {
  const date = new Date(tc.createdAt)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 sm:px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 border-b border-[#e8ddd0] hover:bg-[#faf7f3] transition-colors ${
        isActive ? "bg-[#faf7f3] border-l-2 border-l-[#8b2500]" : ""
      }`}
    >
      <div className="flex-1 min-w-0 w-full sm:w-auto">
        <div className="text-sm font-serif text-[#2a2a2a] truncate flex items-center gap-1.5">
          {tc.groundTruth?.diagnosis ?? "(no ground truth)"}
        </div>
        <div className="text-xs text-[#8b7355]">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
          (tc.testVersion ?? 'v1') === 'v2'
            ? "bg-blue-50 text-blue-700 border border-blue-200"
            : "bg-gray-50 text-gray-500 border border-gray-200"
        }`}>
          {tc.testVersion ?? 'v1'}
        </span>
        <DifficultyBadge difficulty={tc.difficulty} />
        <StatusBadge status={tc.status} />
        {tc.grading && (
          <span className="flex items-center gap-1.5">
            <GradeBadge grading={tc.grading} />
            {tc.previousRun && <ScoreDelta delta={tc.grading.score - tc.previousRun.score} />}
          </span>
        )}
      </div>
    </button>
  )
}
