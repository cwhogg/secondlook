"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type {
  TestCase,
  TestCaseStatus,
  TestSuiteStats,
  GeneratedPatient,
  GroundTruth,
  TestGrading,
  GenerationMetadata,
  PreviousRunSnapshot,
  PatientArchetype,
} from "@/lib/types/admin"
import type { AnalysisResult, DiagnosisHypothesis, MappedSymptom } from "@/lib/types/index"
import type { PipelineProgress } from "@/lib/types/pipeline"
import { mapSingleSymptom } from "@/lib/symptom-parser"
import { cn } from "@/lib/utils"

// ===== CONSTANTS =====

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Easy",
  2: "Moderate",
  3: "Challenging",
  4: "Hard",
  5: "Expert",
}

const DIFFICULTY_COLORS: Record<number, string> = {
  1: "bg-green-100 text-green-800 border-green-300",
  2: "bg-blue-100 text-blue-800 border-blue-300",
  3: "bg-yellow-100 text-yellow-800 border-yellow-300",
  4: "bg-orange-100 text-orange-800 border-orange-300",
  5: "bg-red-100 text-red-800 border-red-300",
}

const GRADE_COLORS: Record<string, string> = {
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

const CATEGORY_OPTIONS = [
  "",
  "neurological",
  "rheumatological",
  "cardiovascular",
  "hematological",
  "endocrine",
  "gastrointestinal",
  "pulmonary",
  "dermatological",
  "immunological",
  "musculoskeletal",
  "renal",
  "psychiatric",
  "oncological",
]

const ARCHETYPE_LABELS: Record<PatientArchetype, string> = {
  'researcher': 'Researcher',
  'minimizer': 'Minimizer',
  'storyteller': 'Storyteller',
  'frustrated-chronic': 'Frustrated Chronic',
  'anxious': 'Anxious',
  'stoic': 'Stoic',
  'caregiver-proxy': 'Caregiver Proxy',
  'elderly-vague': 'Elderly Vague',
}

// ===== HELPERS =====

async function loadTestCases(): Promise<TestCase[]> {
  try {
    const res = await fetch("/api/admin/test-cases")
    if (!res.ok) return []
    const data = await res.json()
    return data.testCases ?? []
  } catch {
    return []
  }
}

function saveTestCases(cases: TestCase[]) {
  fetch("/api/admin/test-cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testCases: cases }),
  }).catch(() => {
    // Fire-and-forget — state is source of truth
  })
}

function computeStats(cases: TestCase[]): TestSuiteStats | null {
  const graded = cases.filter((c) => c.status === "graded" && c.grading)
  if (graded.length === 0) return null

  const scores = graded.map((c) => c.grading!.score)
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
  const top1 = graded.filter((c) => c.grading!.correctDiagnosisRank === 1).length
  const top3 = graded.filter((c) => c.grading!.inTop3).length
  const top5 = graded.filter((c) => c.grading!.inTop5).length

  const byDifficulty: TestSuiteStats["byDifficulty"] = {}
  for (const tc of graded) {
    const d = tc.difficulty
    if (!byDifficulty[d]) {
      byDifficulty[d] = { count: 0, avgScore: 0, top1Rate: 0, top3Rate: 0, top5Rate: 0 }
    }
    byDifficulty[d].count++
  }
  for (const [d, entry] of Object.entries(byDifficulty)) {
    const diff = parseInt(d)
    const diffCases = graded.filter((c) => c.difficulty === diff)
    entry.avgScore = diffCases.reduce((a, c) => a + c.grading!.score, 0) / diffCases.length
    entry.top1Rate = diffCases.filter((c) => c.grading!.correctDiagnosisRank === 1).length / diffCases.length
    entry.top3Rate = diffCases.filter((c) => c.grading!.inTop3).length / diffCases.length
    entry.top5Rate = diffCases.filter((c) => c.grading!.inTop5).length / diffCases.length
  }

  // By source (KB vs Non-KB) — fall back to isKnowledgeBaseDisease for older cases
  const bySource: TestSuiteStats["bySource"] = {}
  for (const tc of graded) {
    const src = tc.diseaseSource ?? (tc.generationMetadata?.isKnowledgeBaseDisease === false ? 'non-kb' : 'kb')
    if (!bySource[src]) {
      bySource[src] = { count: 0, avgScore: 0, top1Rate: 0, top3Rate: 0, top5Rate: 0 }
    }
    bySource[src].count++
  }
  for (const [src, entry] of Object.entries(bySource)) {
    const srcCases = graded.filter((c) => {
      const s = c.diseaseSource ?? (c.generationMetadata?.isKnowledgeBaseDisease === false ? 'non-kb' : 'kb')
      return s === src
    })
    entry.avgScore = srcCases.reduce((a, c) => a + c.grading!.score, 0) / srcCases.length
    entry.top1Rate = srcCases.filter((c) => c.grading!.correctDiagnosisRank === 1).length / srcCases.length
    entry.top3Rate = srcCases.filter((c) => c.grading!.inTop3).length / srcCases.length
    entry.top5Rate = srcCases.filter((c) => c.grading!.inTop5).length / srcCases.length
  }

  return {
    totalTests: cases.length,
    gradedTests: graded.length,
    avgScore,
    top1Rate: top1 / graded.length,
    top3Rate: top3 / graded.length,
    top5Rate: top5 / graded.length,
    byDifficulty,
    bySource,
  }
}

async function buildPatientCase(
  patient: GeneratedPatient,
  onProgress?: (msg: string) => void
): Promise<{ patientCase: any; extractedSymptoms: MappedSymptom[] }> {
  // Step 1: Parse symptoms from narrative using the real extraction pipeline
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

  if (!parseResponse.ok) {
    throw new Error(`Symptom parsing failed: ${parseResponse.statusText}`)
  }

  const parsed = await parseResponse.json()
  const parsedSymptoms: any[] = parsed.symptoms || []

  if (parsedSymptoms.length === 0) {
    throw new Error("Symptom parsing returned no symptoms from narrative")
  }

  onProgress?.(`Parsed ${parsedSymptoms.length} symptoms, mapping to UMLS...`)

  // Step 2: Map each symptom through UMLS (same logic as symptom-mapping-section)
  const mappedSymptoms: MappedSymptom[] = []
  for (let i = 0; i < parsedSymptoms.length; i++) {
    onProgress?.(`Mapping symptom ${i + 1}/${parsedSymptoms.length}: ${parsedSymptoms[i].medicalTerm || parsedSymptoms[i].originalPhrase}`)
    const mapped = await mapSingleSymptom(parsedSymptoms[i])
    mappedSymptoms.push(mapped)
  }

  const successCount = mappedSymptoms.filter((s) => !s.mappingError).length
  onProgress?.(`UMLS mapping complete: ${successCount}/${mappedSymptoms.length} mapped successfully`)

  return {
    extractedSymptoms: mappedSymptoms,
    patientCase: {
      demographics: patient.demographics,
      symptoms: mappedSymptoms,
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

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

// ===== COMPONENTS =====

const SOURCE_LABELS: Record<string, string> = { kb: "KB", "non-kb": "Non-KB" }
const SOURCE_COLORS: Record<string, string> = {
  kb: "bg-blue-50 text-blue-800 border-blue-300",
  "non-kb": "bg-amber-50 text-amber-800 border-amber-300",
}

function StatsBanner({ stats }: { stats: TestSuiteStats }) {
  const difficultyEntries = Object.entries(stats.byDifficulty)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
  const sourceEntries = Object.entries(stats.bySource)
    .sort(([a], [b]) => (a === "kb" ? -1 : b === "kb" ? 1 : 0))

  return (
    <div className="border border-[#d4c5b0] bg-white mb-6">
      {/* Overall metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-[#e8ddd0]">
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
      </div>

      {/* By-difficulty breakdown table */}
      {difficultyEntries.length > 0 && (
        <div className="border-t border-[#d4c5b0] overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[#e8ddd0] bg-[#faf7f2]">
                <th className="text-left py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Difficulty</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">n</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Avg Score</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-1</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-3</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-5</th>
              </tr>
            </thead>
            <tbody>
              {difficultyEntries.map(([d, entry]) => {
                const diff = parseInt(d)
                return (
                  <tr key={d} className="border-b border-[#e8ddd0] last:border-b-0">
                    <td className="py-2.5 px-4 sm:px-5">
                      <span className={`inline-block px-2 py-0.5 border text-xs font-medium ${DIFFICULTY_COLORS[diff]}`}>
                        {DIFFICULTY_LABELS[diff]}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 sm:px-5 text-right text-[#5a5a5a] tabular-nums">{entry.count}</td>
                    <td className="py-2.5 px-4 sm:px-5 text-right font-medium text-[#2a2a2a] tabular-nums">{entry.avgScore.toFixed(1)}</td>
                    <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">{pct(entry.top1Rate)}</td>
                    <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">{pct(entry.top3Rate)}</td>
                    <td className="py-2.5 px-4 sm:px-5 text-right text-[#2a2a2a] tabular-nums">{pct(entry.top5Rate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* By-source breakdown table */}
      {sourceEntries.length > 1 && (
        <div className="border-t border-[#d4c5b0] overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[#e8ddd0] bg-[#faf7f2]">
                <th className="text-left py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Source</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">n</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Avg Score</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-1</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-3</th>
                <th className="text-right py-2 px-4 sm:px-5 text-[10px] uppercase tracking-wider text-[#8b7355] font-medium">Top-5</th>
              </tr>
            </thead>
            <tbody>
              {sourceEntries.map(([src, entry]) => (
                <tr key={src} className="border-b border-[#e8ddd0] last:border-b-0">
                  <td className="py-2.5 px-4 sm:px-5">
                    <span className={`inline-block px-2 py-0.5 border text-xs font-medium ${SOURCE_COLORS[src] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
                      {SOURCE_LABELS[src] || src}
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

function DifficultyBadge({ difficulty }: { difficulty: number }) {
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

function StatusBadge({ status }: { status: TestCaseStatus }) {
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

function GradeBadge({ grading }: { grading: TestGrading }) {
  return (
    <span className={`text-lg font-bold font-serif ${GRADE_COLORS[grading.grade] || "text-gray-600"}`}>
      {grading.grade} ({grading.score})
    </span>
  )
}

function GroundTruthSection({ groundTruth, collapsed }: { groundTruth: GroundTruth; collapsed: boolean }) {
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

function PatientSection({ patient, archetype }: { patient: GeneratedPatient; archetype?: PatientArchetype }) {
  return (
    <div className="border border-[#d4c5b0] bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">Patient Presentation</div>
        {archetype && (
          <span className="inline-block px-2 py-0.5 border border-purple-300 bg-purple-50 text-purple-700 text-xs font-medium">
            {ARCHETYPE_LABELS[archetype] || archetype}
          </span>
        )}
      </div>

      <div className="text-sm text-[#5a5a5a]">
        <span className="font-semibold">Demographics:</span> {patient.demographics.age}yo {patient.demographics.sex}
      </div>

      <div className="bg-[#faf7f3] border border-[#e8ddd0] p-3 text-sm text-[#2a2a2a] italic font-serif leading-relaxed">
        &ldquo;{patient.narrative}&rdquo;
      </div>
    </div>
  )
}

function ExtractedSymptomsSection({ symptoms }: { symptoms: MappedSymptom[] }) {
  const mapped = symptoms.filter((s) => !s.mappingError)
  const failed = symptoms.filter((s) => s.mappingError)

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
    </div>
  )
}

function PipelineProgressDisplay({ events, percent }: { events: PipelineProgress[]; percent: number }) {
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

function StepIndicator({ label, status }: { label: string; status: "pending" | "active" | "done" }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
        status === "done" && "bg-[#8b2500] text-white",
        status === "active" && "bg-[#8b2500] text-white animate-pulse",
        status === "pending" && "bg-[#e8ddd0] text-[#8b7355]",
      )}>
        {status === "done" ? "\u2713" : status === "active" ? "\u2022" : ""}
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

function PipelineResultsSection({ result }: { result: AnalysisResult }) {
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
          <span>{meta.stages.length} stages</span>
          <span>{meta.diseasesConsidered} diseases considered</span>
        </div>
      )}

      {meta?.stages && (
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
                  <div className="text-xs text-[#8b7355]">evidence</div>
                </div>
              </div>
              <div className="text-xs text-[#8b7355] mt-1">
                {dx.sourceAgent} &middot; {dx.evaluationType} &middot;{" "}
                {dx.knowledgeBaseMatch ? "KB match" : "no KB match"}
                {dx.icd10Code && ` · ${dx.icd10Code}`}
              </div>
              <div className="text-xs text-[#5a5a5a] mt-1 line-clamp-2">{dx.clinicalReasoning}</div>
              {dx.supportingEvidence.length > 0 && (
                <div className="text-xs text-[#8b7355] mt-1">
                  Evidence: {dx.supportingEvidence.slice(0, 3).map((e) => e.finding).join("; ")}
                  {dx.supportingEvidence.length > 3 && ` (+${dx.supportingEvidence.length - 3} more)`}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {result.overallAssessment && (
        <div className="text-sm text-[#5a5a5a]">
          <span className="font-semibold">Assessment:</span> {result.overallAssessment}
        </div>
      )}
    </div>
  )
}

function ScoreDelta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-xs text-[#8b7355]">(no change)</span>
  const color = delta > 0 ? "text-green-600" : "text-red-600"
  const sign = delta > 0 ? "+" : ""
  return <span className={`text-xs font-bold ${color}`}>{sign}{delta}</span>
}

function GradingSection({ grading, previousRun }: { grading: TestGrading; previousRun?: PreviousRunSnapshot }) {
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

      {grading.strengths.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Strengths</div>
          <ul className="list-disc list-inside text-sm text-[#5a5a5a] space-y-0.5">
            {grading.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {grading.weaknesses.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-orange-700 uppercase tracking-wider mb-1">Weaknesses</div>
          <ul className="list-disc list-inside text-sm text-[#5a5a5a] space-y-0.5">
            {grading.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {grading.missedFindings.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-1">Missed Findings</div>
          <ul className="list-disc list-inside text-sm text-[#5a5a5a] space-y-0.5">
            {grading.missedFindings.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {grading.falseLeads.length > 0 && (
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

function TestHistoryRow({
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
          {tc.groundTruth.diagnosis}
        </div>
        <div className="text-xs text-[#8b7355]">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {tc.generationMetadata?.isKnowledgeBaseDisease != null && (
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            tc.generationMetadata.isKnowledgeBaseDisease
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-gray-50 text-gray-500 border border-gray-200"
          }`}>
            {tc.generationMetadata.isKnowledgeBaseDisease ? "KB" : "Non-KB"}
          </span>
        )}
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

// ===== MAIN PAGE =====

export default function AdminPage() {
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [passwordInput, setPasswordInput] = useState("")
  const [authError, setAuthError] = useState("")

  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [activeTestId, setActiveTestId] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState(2)
  const [categoryHint, setCategoryHint] = useState("")
  const [diseaseSource, setDiseaseSource] = useState<'kb' | 'non-kb'>('kb')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isGrading, setIsGrading] = useState(false)
  const [isRerunning, setIsRerunning] = useState(false)
  const [pipelineEvents, setPipelineEvents] = useState<PipelineProgress[]>([])
  const [progressPercent, setProgressPercent] = useState(0)
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testCount, setTestCount] = useState(1)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)


  // Check auth on mount
  useEffect(() => {
    const authorized = sessionStorage.getItem("testingAuthorized")
    if (authorized === "true") {
      setIsAuthorized(true)
      setAuthChecked(true)
    } else {
      // Check if password is even required
      fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "" }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.authorized) {
            // No password configured
            setIsAuthorized(true)
            sessionStorage.setItem("testingAuthorized", "true")
          }
          setAuthChecked(true)
        })
        .catch(() => {
          setAuthChecked(true)
        })
    }
  }, [])

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError("")

    try {
      const res = await fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      })

      const data = await res.json()

      if (data.authorized) {
        sessionStorage.setItem("testingAuthorized", "true")
        setIsAuthorized(true)
      } else {
        setAuthError("Invalid password")
      }
    } catch {
      setAuthError("Failed to verify password")
    }
  }

  // Load from KV on mount
  useEffect(() => {
    loadTestCases().then(setTestCases)
  }, [])

  // Persist to KV on every change
  const updateTestCases = useCallback((updater: (prev: TestCase[]) => TestCase[]) => {
    setTestCases((prev) => {
      const next = updater(prev)
      saveTestCases(next)
      return next
    })
  }, [])

  const activeTest = testCases.find((tc) => tc.id === activeTestId) || null
  const stats = computeStats(testCases)

  const getStepStatus = (step: "generate" | "pipeline" | "grade"): "pending" | "active" | "done" => {
    if (step === "generate") {
      if (isGenerating) return "active"
      if (isRunning || isGrading) return "done"
      return "pending"
    }
    if (step === "pipeline") {
      if (isRunning) return "active"
      if (isGrading) return "done"
      return "pending"
    }
    // grade
    if (isGrading) return "active"
    return "pending"
  }

  const isAnyRunning = isGenerating || isRunning || isGrading

  // ===== CORE HELPERS =====

  const doGenerate = async (): Promise<TestCase> => {
    setIsGenerating(true)
    try {
      const response = await fetch("/api/admin/generate-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          difficulty,
          categoryHint: categoryHint || undefined,
          excludeDiseases: testCases.map((tc) => tc.groundTruth.diagnosis),
          source: diseaseSource,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Generation failed: ${response.statusText}`)
      }

      const data = await response.json()

      const newCase: TestCase = {
        id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        createdAt: new Date().toISOString(),
        difficulty,
        categoryHint: categoryHint || undefined,
        diseaseSource,
        status: "generated",
        source: "generated",
        groundTruth: data.groundTruth,
        generatedPatient: data.patient,
        generationMetadata: data.generationMetadata,
      }

      updateTestCases((prev) => [newCase, ...prev])
      setActiveTestId(newCase.id)
      return newCase
    } finally {
      setIsGenerating(false)
    }
  }

  const doRunPipeline = async (testId: string, patient: GeneratedPatient): Promise<AnalysisResult> => {
    setIsRunning(true)
    setPipelineEvents([])
    setProgressPercent(0)

    updateTestCases((prev) =>
      prev.map((tc) => (tc.id === testId ? { ...tc, status: "running" as const, pipelineResult: undefined, grading: undefined, gradingMetadata: undefined, pipelineError: undefined } : tc))
    )

    try {
      setExtractionStatus("Starting symptom extraction...")
      const { patientCase, extractedSymptoms } = await buildPatientCase(patient, (msg) => {
        setExtractionStatus(msg)
      })
      setExtractionStatus(null)

      updateTestCases((prev) =>
        prev.map((tc) => (tc.id === testId ? { ...tc, extractedSymptoms } : tc))
      )

      const abortController = new AbortController()
      abortRef.current = abortController

      const response = await fetch("/api/analyze-patient-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientCase),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errorBody = await response.text()
        let errorMessage = `Pipeline failed: ${response.statusText}`
        try {
          const parsed = JSON.parse(errorBody)
          if (parsed.error) errorMessage = parsed.error
        } catch {}
        throw new Error(errorMessage)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let pipelineResult: AnalysisResult | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || ""

        for (const chunk of lines) {
          const dataLine = chunk.trim()
          if (!dataLine.startsWith("data: ")) continue

          const jsonStr = dataLine.slice(6)
          let event: any
          try {
            event = JSON.parse(jsonStr)
          } catch {
            continue
          }

          if (event.type === "progress") {
            const progressEvent: PipelineProgress = {
              stage: event.stage,
              stageNumber: event.stageNumber,
              totalStages: event.totalStages,
              percentage: event.percentage,
              detail: event.detail,
              data: event.data,
            } as PipelineProgress

            setPipelineEvents((prev) => [...prev, progressEvent])
            setProgressPercent(event.percentage)
          } else if (event.type === "result") {
            if (!event.success || !event.analysis) {
              throw new Error("Invalid analysis result from pipeline")
            }

            pipelineResult = event.analysis

            updateTestCases((prev) =>
              prev.map((tc) =>
                tc.id === testId ? { ...tc, status: "completed" as const, pipelineResult: pipelineResult! } : tc
              )
            )
          } else if (event.type === "error") {
            throw new Error(event.error || "Pipeline error")
          }
        }
        if (pipelineResult) break
      }

      if (!pipelineResult) {
        throw new Error("Pipeline stream ended without a result")
      }

      return pipelineResult
    } catch (err: any) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        updateTestCases((prev) =>
          prev.map((tc) =>
            tc.id === testId ? { ...tc, status: "error" as const, pipelineError: err.message } : tc
          )
        )
      }
      throw err
    } finally {
      setIsRunning(false)
      abortRef.current = null
    }
  }

  const doGrade = async (
    testId: string,
    groundTruth: GroundTruth,
    pipelineResult: AnalysisResult,
    testDifficulty: number
  ): Promise<void> => {
    setIsGrading(true)
    try {
      const response = await fetch("/api/admin/grade-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groundTruth,
          differentialDiagnoses: pipelineResult.differentialDiagnoses,
          pipelineMetadata: pipelineResult.pipelineMetadata,
          difficulty: testDifficulty,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Grading failed: ${response.statusText}`)
      }

      const data = await response.json()

      updateTestCases((prev) =>
        prev.map((tc) =>
          tc.id === testId
            ? { ...tc, status: "graded" as const, grading: data.grading, gradingMetadata: data.gradingMetadata }
            : tc
        )
      )
    } finally {
      setIsGrading(false)
    }
  }

  // ===== HANDLERS =====

  const handleRunNewTest = async () => {
    const total = testCount
    setError(null)
    setActiveTestId(null)
    setPipelineEvents([])
    setProgressPercent(0)
    setExtractionStatus(null)
    if (total > 1) setBatchProgress({ current: 1, total })
    try {
      for (let i = 0; i < total; i++) {
        if (i > 0) {
          setPipelineEvents([])
          setProgressPercent(0)
          setExtractionStatus(null)
        }
        if (total > 1) setBatchProgress({ current: i + 1, total })
        const newCase = await doGenerate()
        const result = await doRunPipeline(newCase.id, newCase.generatedPatient)
        await doGrade(newCase.id, newCase.groundTruth, result, newCase.difficulty)
      }
    } catch (err: any) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err.message)
      }
    } finally {
      setBatchProgress(null)
    }
  }

  const snapshotPreviousRun = (tc: TestCase) => {
    if (tc.grading) {
      const snapshot: PreviousRunSnapshot = {
        score: tc.grading.score,
        grade: tc.grading.grade,
        correctDiagnosisRank: tc.grading.correctDiagnosisRank,
        inTop3: tc.grading.inTop3,
        inTop5: tc.grading.inTop5,
        ranAt: new Date().toISOString(),
      }
      updateTestCases((prev) =>
        prev.map((c) => (c.id === tc.id ? { ...c, previousRun: snapshot, pipelineResult: undefined, grading: undefined, gradingMetadata: undefined, pipelineError: undefined } : c))
      )
    }
  }

  const handleRerun = async () => {
    if (!activeTest) return
    setError(null)
    setIsRerunning(true)
    setPipelineEvents([])
    setProgressPercent(0)
    setExtractionStatus(null)
    try {
      snapshotPreviousRun(activeTest)
      const result = await doRunPipeline(activeTest.id, activeTest.generatedPatient)
      await doGrade(activeTest.id, activeTest.groundTruth, result, activeTest.difficulty)
    } catch (err: any) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err.message)
      }
    } finally {
      setIsRerunning(false)
    }
  }

  const handleRegrade = async () => {
    if (!activeTest?.pipelineResult?.differentialDiagnoses?.length) {
      setError("No pipeline results to grade")
      return
    }
    setError(null)
    try {
      await doGrade(activeTest.id, activeTest.groundTruth, activeTest.pipelineResult, activeTest.difficulty)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // ===== DELETE =====
  const handleDelete = (id: string) => {
    updateTestCases((prev) => prev.filter((tc) => tc.id !== id))
    if (activeTestId === id) setActiveTestId(null)
  }

  // Re-read active test from updated state
  const currentActiveTest = testCases.find((tc) => tc.id === activeTestId) || null

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8b2500]" />
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="bg-white border border-[#d4c5b0] p-8 max-w-sm w-full">
          <h1 className="text-xl font-bold font-serif text-[#2a2a2a] mb-4">Testing Framework</h1>
          <p className="text-sm text-gray-600 mb-6">Enter the password to access the testing framework.</p>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 border border-gray-200 focus:ring-2 focus:ring-[#8b2500] focus:border-transparent text-sm"
              autoFocus
            />
            {authError && <p className="text-red-600 text-sm">{authError}</p>}
            <button
              type="submit"
              className="w-full bg-[#8b2500] text-white py-3 font-semibold text-sm hover:bg-[#6d1d00] transition-colors"
            >
              Access Testing
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-[#2a2a2a]">Clinical Testing Framework</h1>
          <p className="text-sm text-[#8b7355] mt-1">
            Generate synthetic patients, run the diagnostic pipeline, and grade accuracy
          </p>
        </div>

        {/* Stats Banner */}
        {stats && <StatsBanner stats={stats} />}

        {/* Error Banner */}
        {error && (
          <div className="border border-red-300 bg-red-50 p-3 mb-6 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-xs ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* Generation Controls */}
        <div className="border border-[#d4c5b0] bg-white p-4 sm:p-6 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-[#8b7355] mb-1">
                Difficulty: {DIFFICULTY_LABELS[difficulty]} ({difficulty})
              </label>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={difficulty}
                onChange={(e) => setDifficulty(parseInt(e.target.value))}
                className="w-full accent-[#8b2500]"
              />
              <div className="flex justify-between text-xs text-[#8b7355] mt-0.5">
                <span>Easy</span>
                <span>Expert</span>
              </div>
            </div>

            <div className="min-w-[160px]">
              <label className="block text-xs text-[#8b7355] mb-1">Category (optional)</label>
              <select
                value={categoryHint}
                onChange={(e) => setCategoryHint(e.target.value)}
                className="w-full border border-[#d4c5b0] px-3 py-2 text-sm bg-white text-[#2a2a2a] focus:outline-none focus:border-[#8b2500]"
              >
                <option value="">Any</option>
                {CATEGORY_OPTIONS.filter(Boolean).map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#8b7355] mb-1">Disease source</label>
              <div className="flex border border-[#d4c5b0]">
                <button
                  onClick={() => setDiseaseSource('kb')}
                  disabled={isAnyRunning}
                  className={cn(
                    "px-3 py-2 text-sm font-medium transition-colors",
                    diseaseSource === 'kb'
                      ? "bg-[#8b2500] text-white"
                      : "bg-white text-[#2a2a2a] hover:bg-[#f5f0e8]",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  KB
                </button>
                <button
                  onClick={() => setDiseaseSource('non-kb')}
                  disabled={isAnyRunning}
                  className={cn(
                    "px-3 py-2 text-sm font-medium transition-colors border-l border-[#d4c5b0]",
                    diseaseSource === 'non-kb'
                      ? "bg-[#8b2500] text-white"
                      : "bg-white text-[#2a2a2a] hover:bg-[#f5f0e8]",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  Non-KB
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <button
                onClick={() => setTestCount((c) => Math.max(1, c - 1))}
                disabled={isAnyRunning || testCount <= 1}
                className="px-2.5 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-r border-[#6d1d00]"
                aria-label="Decrease test count"
              >
                −
              </button>
              <button
                onClick={handleRunNewTest}
                disabled={isAnyRunning}
                className="px-6 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating
                  ? batchProgress && batchProgress.total > 1
                    ? `Test ${batchProgress.current}/${batchProgress.total}: Generating...`
                    : "Generating Patient..."
                  : isRunning
                    ? batchProgress && batchProgress.total > 1
                      ? `Test ${batchProgress.current}/${batchProgress.total}: Pipeline...`
                      : "Running Pipeline..."
                    : isGrading
                      ? batchProgress && batchProgress.total > 1
                        ? `Test ${batchProgress.current}/${batchProgress.total}: Grading...`
                        : "Grading..."
                      : testCount === 1
                        ? "Run New Test"
                        : `Run ${testCount} New Tests`}
              </button>
              <button
                onClick={() => setTestCount((c) => Math.min(10, c + 1))}
                disabled={isAnyRunning || testCount >= 10}
                className="px-2.5 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-l border-[#6d1d00]"
                aria-label="Increase test count"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Inline progress when running */}
        {isAnyRunning && (
          <div className="border border-[#d4c5b0] bg-white p-5 mb-6">
            {/* Batch progress */}
            {batchProgress && batchProgress.total > 1 && (
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-medium text-[#2a2a2a]">
                  Test {batchProgress.current} of {batchProgress.total}
                </span>
                <div className="flex-1 h-1.5 bg-[#e8ddd0] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#8b2500] rounded-full transition-all duration-300"
                    style={{ width: `${((batchProgress.current - 1) / batchProgress.total) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[#8b7355]">
                  {batchProgress.current - 1}/{batchProgress.total} done
                </span>
              </div>
            )}
            {/* Step indicators */}
            <div className="flex items-center gap-3 mb-4">
              {!isRerunning && (
                <>
                  <StepIndicator label="Generate" status={getStepStatus("generate")} />
                  <div className="flex-1 h-px bg-[#e8ddd0]" />
                </>
              )}
              <StepIndicator label="Pipeline" status={getStepStatus("pipeline")} />
              <div className="flex-1 h-px bg-[#e8ddd0]" />
              <StepIndicator label="Grade" status={getStepStatus("grade")} />
            </div>

            {/* Detail area */}
            {isGenerating && (
              <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                Generating patient case...
              </div>
            )}

            {isRunning && extractionStatus && (
              <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                {extractionStatus}
              </div>
            )}

            {isRunning && !extractionStatus && (
              <PipelineProgressDisplay events={pipelineEvents} percent={progressPercent} />
            )}

            {isGrading && (
              <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                Grading results...
              </div>
            )}
          </div>
        )}

        {/* Active Test Detail */}
        {currentActiveTest && (
          <div className="border border-[#d4c5b0] bg-white mb-6">
            <div className="px-4 py-3 border-b border-[#e8ddd0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <h2 className="text-base sm:text-lg font-serif font-bold text-[#2a2a2a] break-words">
                  {currentActiveTest.groundTruth.diagnosis}
                </h2>
                <div className="flex items-center gap-2">
                  <DifficultyBadge difficulty={currentActiveTest.difficulty} />
                  <StatusBadge status={currentActiveTest.status} />
                </div>
              </div>
              <button
                onClick={() => handleDelete(currentActiveTest.id)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Delete
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Ground Truth */}
              <GroundTruthSection groundTruth={currentActiveTest.groundTruth} collapsed={false} />

              {/* Patient Presentation */}
              <PatientSection
                patient={currentActiveTest.generatedPatient}
                archetype={currentActiveTest.generationMetadata?.archetype}
              />

              {/* Extracted Symptoms (after pipeline has run extraction) */}
              {currentActiveTest.extractedSymptoms && currentActiveTest.extractedSymptoms.length > 0 && (
                <ExtractedSymptomsSection symptoms={currentActiveTest.extractedSymptoms} />
              )}

              {/* Rerun — for completed, graded, or error states */}
              {(currentActiveTest.status === "completed" || currentActiveTest.status === "graded" || currentActiveTest.status === "error") && !isAnyRunning && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRerun}
                    disabled={isAnyRunning}
                    className="px-6 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Rerun
                  </button>
                  {currentActiveTest.pipelineError && (
                    <span className="text-sm text-red-600">Error: {currentActiveTest.pipelineError}</span>
                  )}
                </div>
              )}

              {/* Extraction + Pipeline Progress (while running) */}
              {isRunning && activeTestId === currentActiveTest.id && (
                <div className="space-y-2">
                  {extractionStatus && (
                    <div className="border border-[#d4c5b0] bg-[#faf7f3] p-3">
                      <div className="text-xs font-semibold text-[#8b7355] uppercase tracking-wider mb-1">
                        Symptom Extraction
                      </div>
                      <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                        <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                        {extractionStatus}
                      </div>
                    </div>
                  )}
                  {!extractionStatus && <PipelineProgressDisplay events={pipelineEvents} percent={progressPercent} />}
                </div>
              )}

              {/* Pipeline Results */}
              {currentActiveTest.pipelineResult && (
                <PipelineResultsSection result={currentActiveTest.pipelineResult} />
              )}

              {/* Grading progress indicator */}
              {isGrading && activeTestId === currentActiveTest.id && (
                <div className="border border-[#d4c5b0] bg-[#faf7f3] p-3">
                  <div className="text-sm text-[#5a5a5a] flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-[#8b2500] rounded-full animate-pulse" />
                    Grading results...
                  </div>
                </div>
              )}

              {/* Grading Results */}
              {currentActiveTest.grading && <GradingSection grading={currentActiveTest.grading} previousRun={currentActiveTest.previousRun} />}

              {/* Re-grade button — for already graded tests or completed tests that failed grading */}
              {currentActiveTest.pipelineResult?.differentialDiagnoses?.length && !isGrading && !isRunning && !isGenerating && (
                <button
                  onClick={handleRegrade}
                  className="px-4 py-1.5 border border-[#d4c5b0] text-[#8b7355] text-xs font-medium hover:bg-[#faf7f3] transition-colors"
                >
                  {currentActiveTest.grading ? "Re-grade" : "Grade Results"}
                </button>
              )}

              {/* Metadata footer */}
              <div className="text-xs text-[#8b7355] pt-2 border-t border-[#e8ddd0] flex flex-wrap gap-4">
                <span>
                  Generated: {currentActiveTest.generationMetadata.model} &middot;{" "}
                  {currentActiveTest.generationMetadata.tokensUsed} tokens &middot;{" "}
                  {(currentActiveTest.generationMetadata.durationMs / 1000).toFixed(1)}s
                </span>
                {currentActiveTest.gradingMetadata && (
                  <span>
                    Graded: {currentActiveTest.gradingMetadata.model} &middot;{" "}
                    {currentActiveTest.gradingMetadata.tokensUsed} tokens &middot;{" "}
                    {(currentActiveTest.gradingMetadata.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Test History */}
        {testCases.length > 0 && (
          <div className="border border-[#d4c5b0] bg-white">
            <div className="px-4 py-3 border-b border-[#e8ddd0]">
              <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">
                Test History ({testCases.length})
              </div>
            </div>
            <div>
              {testCases.map((tc) => (
                <TestHistoryRow
                  key={tc.id}
                  tc={tc}
                  isActive={tc.id === activeTestId}
                  onClick={() => setActiveTestId(tc.id === activeTestId ? null : tc.id)}
                />
              ))}
            </div>
          </div>
        )}

        {testCases.length === 0 && !isGenerating && (
          <div className="text-center py-16 text-[#8b7355]">
            <div className="text-lg font-serif mb-2">No test cases yet</div>
            <div className="text-sm">Run a new test above to get started</div>
          </div>
        )}
      </div>
    </div>
  )
}
