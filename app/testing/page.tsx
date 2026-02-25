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
import { searchUMLSWithFallbacks } from "@/lib/umls-search"
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

function loadTestCases(): TestCase[] {
  try {
    const data = localStorage.getItem("testCases")
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveTestCases(cases: TestCase[]) {
  try {
    localStorage.setItem("testCases", JSON.stringify(cases))
  } catch {
    // localStorage full or unavailable — state is source of truth
  }
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

  return {
    totalTests: cases.length,
    gradedTests: graded.length,
    avgScore,
    top1Rate: top1 / graded.length,
    top3Rate: top3 / graded.length,
    top5Rate: top5 / graded.length,
    byDifficulty,
  }
}

async function mapSingleSymptom(symptom: any): Promise<MappedSymptom> {
  const primaryTerm = symptom.medicalTerm || symptom.originalPhrase
  const alternativeTerms: string[] = symptom.alternativeSearchTerms || []
  const originalPhrase = symptom.originalPhrase || symptom.text || "Unknown"

  const result = await searchUMLSWithFallbacks(primaryTerm || "", alternativeTerms, originalPhrase)

  return {
    originalPhrase,
    medicalTerm: symptom.medicalTerm || originalPhrase,
    alternativeSearchTerms: alternativeTerms,
    category: symptom.category,
    severity: symptom.severity,
    duration: symptom.duration,
    bodyPart: symptom.bodyPart,
    umlsConcepts: result.concepts,
    selectedConcept: result.concepts[0] || null,
    confidence: result.confidence,
    confirmed: false,
    mappingError: result.error,
    feedbackStatus: "none" as const,
    searchTermUsed: result.searchTermUsed,
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

function StatsBanner({ stats }: { stats: TestSuiteStats }) {
  const difficultyEntries = Object.entries(stats.byDifficulty)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))

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

function PatientSection({ patient, archetype, source }: { patient: GeneratedPatient; archetype?: PatientArchetype; source?: string }) {
  return (
    <div className="border border-[#d4c5b0] bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">Patient Presentation</div>
        {archetype && (
          <span className="inline-block px-2 py-0.5 border border-purple-300 bg-purple-50 text-purple-700 text-xs font-medium">
            {ARCHETYPE_LABELS[archetype] || archetype}
          </span>
        )}
        {source === 'reddit-import' && (
          <span className="inline-block px-2 py-0.5 border border-orange-300 bg-orange-50 text-orange-700 text-xs font-medium">
            Reddit
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
          {tc.source === 'reddit-import' && (
            <span className="inline-block w-4 h-4 shrink-0 text-orange-500" title="Reddit import">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
            </span>
          )}
          {tc.groundTruth.diagnosis}
        </div>
        <div className="text-xs text-[#8b7355]">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
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
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isGrading, setIsGrading] = useState(false)
  const [isRerunning, setIsRerunning] = useState(false)
  const [pipelineEvents, setPipelineEvents] = useState<PipelineProgress[]>([])
  const [progressPercent, setProgressPercent] = useState(0)
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Reddit import state
  const [testMode, setTestMode] = useState<'generate' | 'reddit'>('generate')
  const [redditUrl, setRedditUrl] = useState("")
  const [isFetchingReddit, setIsFetchingReddit] = useState(false)
  const [redditPreview, setRedditPreview] = useState<any | null>(null)
  const [showPasteFallback, setShowPasteFallback] = useState(false)
  const [pasteTitle, setPasteTitle] = useState("")
  const [pasteText, setPasteText] = useState("")
  const [redditGroundTruth, setRedditGroundTruth] = useState({
    diagnosis: "",
    keyFindings: "",
    expectedBodySystems: "",
    expectedSpecialists: "",
  })

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

  // Load from localStorage on mount
  useEffect(() => {
    setTestCases(loadTestCases())
  }, [])

  // Persist to localStorage on every change
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

  const isAnyRunning = isGenerating || isRunning || isGrading || isFetchingReddit

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
    setError(null)
    setActiveTestId(null)
    setPipelineEvents([])
    setProgressPercent(0)
    setExtractionStatus(null)
    try {
      const newCase = await doGenerate()
      const result = await doRunPipeline(newCase.id, newCase.generatedPatient)
      await doGrade(newCase.id, newCase.groundTruth, result, newCase.difficulty)
    } catch (err: any) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err.message)
      }
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

  // ===== REDDIT IMPORT =====
  const handleFetchReddit = async () => {
    if (!redditUrl.trim()) return
    setError(null)
    setIsFetchingReddit(true)
    setRedditPreview(null)
    setShowPasteFallback(false)
    try {
      const response = await fetch("/api/admin/import-reddit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "url", url: redditUrl }),
      })
      if (!response.ok) {
        const err = await response.json()
        // Show paste fallback on fetch failure (Reddit blocks cloud IPs)
        setShowPasteFallback(true)
        throw new Error(err.error || `Fetch failed: ${response.statusText}`)
      }
      const data = await response.json()
      setRedditPreview(data)
      if (data.processed?.diagnosisInfo?.diagnosis) {
        setRedditGroundTruth((prev) => ({
          ...prev,
          diagnosis: data.processed.diagnosisInfo.diagnosis || "",
        }))
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsFetchingReddit(false)
    }
  }

  const handlePasteSubmit = async () => {
    if (!pasteText.trim() || !pasteTitle.trim()) return
    setError(null)
    setIsFetchingReddit(true)
    setRedditPreview(null)
    try {
      const response = await fetch("/api/admin/import-reddit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "paste",
          title: pasteTitle,
          selftext: pasteText,
          subreddit: redditUrl.match(/\/r\/(\w+)/)?.[1] || "unknown",
          url: redditUrl,
        }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Analysis failed: ${response.statusText}`)
      }
      const data = await response.json()
      setRedditPreview(data)
      setShowPasteFallback(false)
      if (data.processed?.diagnosisInfo?.diagnosis) {
        setRedditGroundTruth((prev) => ({
          ...prev,
          diagnosis: data.processed.diagnosisInfo.diagnosis || "",
        }))
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsFetchingReddit(false)
    }
  }

  const handleImportAndRun = async () => {
    if (!redditPreview?.processed) return
    if (!redditGroundTruth.diagnosis.trim()) {
      setError("Diagnosis is required for ground truth")
      return
    }
    setError(null)
    setActiveTestId(null)
    setPipelineEvents([])
    setProgressPercent(0)
    setExtractionStatus(null)

    const processed = redditPreview.processed
    const rawPost = redditPreview.rawPost

    const newCase: TestCase = {
      id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: new Date().toISOString(),
      difficulty: 0,
      status: "generated",
      source: "reddit-import",
      groundTruth: {
        diagnosis: redditGroundTruth.diagnosis.trim(),
        keyFindings: redditGroundTruth.keyFindings
          ? redditGroundTruth.keyFindings.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
        expectedBodySystems: redditGroundTruth.expectedBodySystems
          ? redditGroundTruth.expectedBodySystems.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
        expectedSpecialists: redditGroundTruth.expectedSpecialists
          ? redditGroundTruth.expectedSpecialists.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
      },
      generatedPatient: {
        narrative: processed.narrative,
        demographics: {
          age: processed.demographics?.age || "unknown",
          sex: processed.demographics?.sex === "male" || processed.demographics?.sex === "female"
            ? processed.demographics.sex
            : "other",
        },
        chiefComplaint: processed.chiefComplaint || "",
        symptoms: [],
        medicalHistory: {
          pastMedicalHistory: [],
          familyHistory: [],
          currentMedications: [],
          recentTests: [],
        },
      },
      generationMetadata: {
        model: "reddit-import",
        tokensUsed: 0,
        durationMs: 0,
        source: "reddit-import",
        redditUrl: rawPost.url,
      },
    }

    updateTestCases((prev) => [newCase, ...prev])
    setActiveTestId(newCase.id)

    // Clear the Reddit form
    setRedditPreview(null)
    setRedditUrl("")
    setRedditGroundTruth({ diagnosis: "", keyFindings: "", expectedBodySystems: "", expectedSpecialists: "" })

    // Chain to pipeline and grading
    try {
      const result = await doRunPipeline(newCase.id, newCase.generatedPatient)
      await doGrade(newCase.id, newCase.groundTruth, result, newCase.difficulty)
    } catch (err: any) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err.message)
      }
    }
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
          {/* Mode Toggle */}
          <div className="flex items-center gap-0 mb-4">
            <button
              onClick={() => setTestMode('generate')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium border transition-colors",
                testMode === 'generate'
                  ? "bg-[#8b2500] text-white border-[#8b2500]"
                  : "bg-white text-[#8b7355] border-[#d4c5b0] hover:bg-[#faf7f3]"
              )}
            >
              Generate Case
            </button>
            <button
              onClick={() => setTestMode('reddit')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium border border-l-0 transition-colors",
                testMode === 'reddit'
                  ? "bg-[#8b2500] text-white border-[#8b2500]"
                  : "bg-white text-[#8b7355] border-[#d4c5b0] hover:bg-[#faf7f3]"
              )}
            >
              Import from Reddit
            </button>
          </div>

          {/* Generate Mode */}
          {testMode === 'generate' && (
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

              <button
                onClick={handleRunNewTest}
                disabled={isAnyRunning}
                className="px-6 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? "Generating Patient..." : isRunning ? "Running Pipeline..." : isGrading ? "Grading..." : "Run New Test"}
              </button>
            </div>
          )}

          {/* Reddit Import Mode */}
          {testMode === 'reddit' && (
            <div className="space-y-4">
              {/* URL input */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-[#8b7355] mb-1">Reddit Post URL</label>
                  <input
                    type="text"
                    value={redditUrl}
                    onChange={(e) => setRedditUrl(e.target.value)}
                    placeholder="https://www.reddit.com/r/rarediseases/comments/..."
                    className="w-full border border-[#d4c5b0] px-3 py-2 text-sm bg-white text-[#2a2a2a] focus:outline-none focus:border-[#8b2500]"
                  />
                </div>
                <button
                  onClick={handleFetchReddit}
                  disabled={isAnyRunning || !redditUrl.trim()}
                  className="px-5 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {isFetchingReddit ? "Fetching..." : "Fetch & Preview"}
                </button>
              </div>

              {/* Paste fallback when URL fetch fails */}
              {showPasteFallback && (
                <div className="border border-[#d4c5b0] bg-[#faf7f3] p-4 space-y-3">
                  <p className="text-xs text-[#8b7355]">
                    Reddit blocked the server request. Copy the post title and text from Reddit and paste below.
                  </p>
                  <div>
                    <label className="block text-xs text-[#8b7355] mb-1">Post Title</label>
                    <input
                      type="text"
                      value={pasteTitle}
                      onChange={(e) => setPasteTitle(e.target.value)}
                      placeholder="Paste the Reddit post title..."
                      className="w-full border border-[#d4c5b0] px-3 py-2 text-sm bg-white text-[#2a2a2a] focus:outline-none focus:border-[#8b2500]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b7355] mb-1">Post Text</label>
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="Paste the full Reddit post text..."
                      rows={6}
                      className="w-full border border-[#d4c5b0] px-3 py-2 text-sm bg-white text-[#2a2a2a] focus:outline-none focus:border-[#8b2500] resize-none"
                    />
                  </div>
                  <button
                    onClick={handlePasteSubmit}
                    disabled={isAnyRunning || !pasteText.trim() || !pasteTitle.trim()}
                    className="px-5 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isFetchingReddit ? "Analyzing..." : "Analyze Post"}
                  </button>
                </div>
              )}

              {/* Reddit Preview */}
              {redditPreview && (
                <div className="border border-[#d4c5b0] bg-[#faf7f3] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">Preview</div>
                    {!redditPreview.processed?.isPatientNarrative && (
                      <span className="inline-block px-2 py-0.5 border border-red-300 bg-red-50 text-red-600 text-xs font-medium">
                        Not a patient narrative
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-[#8b7355]">
                    r/{redditPreview.rawPost?.subreddit} &middot; u/{redditPreview.rawPost?.author}
                  </div>
                  <div className="text-sm font-medium text-[#2a2a2a]">{redditPreview.rawPost?.title}</div>

                  {redditPreview.processed?.narrative && (
                    <div className="bg-white border border-[#e8ddd0] p-3 text-sm text-[#2a2a2a] italic font-serif leading-relaxed max-h-48 overflow-y-auto">
                      &ldquo;{redditPreview.processed.narrative}&rdquo;
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 text-xs text-[#5a5a5a]">
                    {redditPreview.processed?.demographics && (
                      <span>
                        Demographics: {redditPreview.processed.demographics.age}, {redditPreview.processed.demographics.sex}
                      </span>
                    )}
                    {redditPreview.processed?.diagnosisInfo && (
                      <span>
                        Diagnosis: {redditPreview.processed.diagnosisInfo.diagnosis || "unknown"}
                        {" "}({redditPreview.processed.diagnosisInfo.status}, {redditPreview.processed.diagnosisInfo.confidence} confidence)
                      </span>
                    )}
                  </div>

                  {redditPreview.processed?.warnings?.length > 0 && (
                    <div className="space-y-1">
                      {redditPreview.processed.warnings.map((w: string, i: number) => (
                        <div key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1">
                          {w}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ground Truth Fields */}
                  {redditPreview.processed?.isPatientNarrative && (
                    <div className="border-t border-[#d4c5b0] pt-3 space-y-3">
                      <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">Ground Truth</div>

                      <div>
                        <label className="block text-xs text-[#8b7355] mb-1">Diagnosis (required)</label>
                        <input
                          type="text"
                          value={redditGroundTruth.diagnosis}
                          onChange={(e) => setRedditGroundTruth((prev) => ({ ...prev, diagnosis: e.target.value }))}
                          placeholder="e.g., Ehlers-Danlos Syndrome"
                          className="w-full border border-[#d4c5b0] px-3 py-2 text-sm bg-white text-[#2a2a2a] focus:outline-none focus:border-[#8b2500]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-[#8b7355] mb-1">Key Findings (comma-separated)</label>
                        <input
                          type="text"
                          value={redditGroundTruth.keyFindings}
                          onChange={(e) => setRedditGroundTruth((prev) => ({ ...prev, keyFindings: e.target.value }))}
                          placeholder="e.g., joint hypermobility, skin fragility, easy bruising"
                          className="w-full border border-[#d4c5b0] px-3 py-2 text-sm bg-white text-[#2a2a2a] focus:outline-none focus:border-[#8b2500]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-[#8b7355] mb-1">Expected Body Systems (comma-separated)</label>
                          <input
                            type="text"
                            value={redditGroundTruth.expectedBodySystems}
                            onChange={(e) => setRedditGroundTruth((prev) => ({ ...prev, expectedBodySystems: e.target.value }))}
                            placeholder="e.g., musculoskeletal, dermatological"
                            className="w-full border border-[#d4c5b0] px-3 py-2 text-sm bg-white text-[#2a2a2a] focus:outline-none focus:border-[#8b2500]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#8b7355] mb-1">Expected Specialists (comma-separated)</label>
                          <input
                            type="text"
                            value={redditGroundTruth.expectedSpecialists}
                            onChange={(e) => setRedditGroundTruth((prev) => ({ ...prev, expectedSpecialists: e.target.value }))}
                            placeholder="e.g., rheumatologist, geneticist"
                            className="w-full border border-[#d4c5b0] px-3 py-2 text-sm bg-white text-[#2a2a2a] focus:outline-none focus:border-[#8b2500]"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleImportAndRun}
                        disabled={isAnyRunning || !redditGroundTruth.diagnosis.trim()}
                        className="px-6 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isRunning ? "Running Pipeline..." : isGrading ? "Grading..." : "Import & Run Pipeline"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Inline progress when running */}
        {isAnyRunning && (
          <div className="border border-[#d4c5b0] bg-white p-5 mb-6">
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
                source={currentActiveTest.source}
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
