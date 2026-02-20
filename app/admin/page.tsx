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
} from "@/lib/types/admin"
import type { AnalysisResult, DiagnosisHypothesis, MappedSymptom } from "@/lib/types/index"
import type { PipelineProgress } from "@/lib/types/pipeline"

// ===== CONSTANTS =====

const STORAGE_KEY = "adminTestCases"

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

// ===== HELPERS =====

function loadTestCases(): TestCase[] {
  if (typeof window === "undefined") return []
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveTestCases(cases: TestCase[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases))
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

async function searchUMLS(searchTerm: string): Promise<{ concepts: any[]; confidence: number; error?: boolean }> {
  try {
    const response = await fetch("/api/umls-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchTerm }),
    })
    if (!response.ok) return { concepts: [], confidence: 0, error: true }
    const data = await response.json()
    return { concepts: data.concepts || [], confidence: data.confidence || 0, error: !!data.error }
  } catch {
    return { concepts: [], confidence: 0, error: true }
  }
}

async function mapSingleSymptom(symptom: any): Promise<MappedSymptom> {
  const primaryTerm = symptom.medicalTerm || symptom.originalPhrase
  const alternativeTerms: string[] = symptom.alternativeSearchTerms || []
  const originalPhrase = symptom.originalPhrase || symptom.text || "Unknown"

  const makeResult = (concepts: any[], confidence: number, searchTermUsed: string, error: boolean): MappedSymptom => ({
    originalPhrase,
    medicalTerm: symptom.medicalTerm || originalPhrase,
    alternativeSearchTerms: alternativeTerms,
    category: symptom.category,
    severity: symptom.severity,
    duration: symptom.duration,
    bodyPart: symptom.bodyPart,
    umlsConcepts: concepts,
    selectedConcept: concepts[0] || null,
    confidence,
    confirmed: false,
    mappingError: error,
    feedbackStatus: "none" as const,
    searchTermUsed,
  })

  if (!primaryTerm) return makeResult([], 0, "", true)

  // 1. Try primary medicalTerm
  let result = await searchUMLS(primaryTerm)
  if (result.concepts.length > 0 && !result.error) {
    return makeResult(result.concepts, result.confidence, primaryTerm, false)
  }

  // 2. Try each alternativeSearchTerm
  for (const altTerm of alternativeTerms) {
    result = await searchUMLS(altTerm)
    if (result.concepts.length > 0 && !result.error) {
      return makeResult(result.concepts, result.confidence, altTerm, false)
    }
  }

  // 3. Try originalPhrase as last resort
  if (originalPhrase !== primaryTerm) {
    result = await searchUMLS(originalPhrase)
    if (result.concepts.length > 0 && !result.error) {
      return makeResult(result.concepts, result.confidence, originalPhrase, false)
    }
  }

  // 4. Word-reduction fallback
  const words = primaryTerm.split(/\s+/)
  if (words.length >= 3) {
    for (let drop = 1; drop < words.length - 1; drop++) {
      const reduced = words.slice(drop).join(" ")
      result = await searchUMLS(reduced)
      if (result.concepts.length > 0 && !result.error) {
        return makeResult(result.concepts, Math.max(0.5, result.confidence - 0.1), reduced, false)
      }
    }
  }

  // All attempts failed
  return makeResult([], 0, primaryTerm, true)
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
      chiefComplaint: {
        description: patient.chiefComplaint,
        bodyRegions: [],
        severity: 5,
      },
      symptoms: mappedSymptoms,
      symptomPatterns: null,
      patientHypothesis: null,
      medicalHistory: {
        currentMedications: patient.medicalHistory.currentMedications?.map((m) => ({ name: m })) || [],
        pastMedicalHistory: patient.medicalHistory.pastMedicalHistory || [],
        familyHistory: patient.medicalHistory.familyHistory || [],
        recentTests: patient.medicalHistory.recentTests || [],
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
  return (
    <div className="border border-[#d4c5b0] bg-white p-4 sm:p-6 mb-6">
      <div className="flex flex-wrap gap-6 sm:gap-10 items-center">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#8b7355] mb-1">Avg Score</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{stats.avgScore.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-[#8b7355] mb-1">Top-1</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{pct(stats.top1Rate)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-[#8b7355] mb-1">Top-3</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{pct(stats.top3Rate)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-[#8b7355] mb-1">Top-5</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">{pct(stats.top5Rate)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-[#8b7355] mb-1">Tests</div>
          <div className="text-2xl font-bold font-serif text-[#2a2a2a]">
            {stats.gradedTests}/{stats.totalTests}
          </div>
        </div>
      </div>

      {Object.keys(stats.byDifficulty).length > 1 && (
        <div className="mt-4 pt-4 border-t border-[#e8ddd0]">
          <div className="text-xs uppercase tracking-wider text-[#8b7355] mb-2">By Difficulty</div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.byDifficulty)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([d, entry]) => (
                <div key={d} className="text-sm">
                  <span className={`inline-block px-2 py-0.5 border text-xs mr-1 ${DIFFICULTY_COLORS[parseInt(d)]}`}>
                    {DIFFICULTY_LABELS[parseInt(d)]}
                  </span>
                  <span className="text-[#5a5a5a]">
                    {entry.avgScore.toFixed(0)}avg &middot; {pct(entry.top1Rate)} top-1 &middot; n={entry.count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DifficultyBadge({ difficulty }: { difficulty: number }) {
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

function PatientSection({ patient }: { patient: GeneratedPatient }) {
  return (
    <div className="border border-[#d4c5b0] bg-white p-4 space-y-3">
      <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider">Patient Presentation</div>

      <div className="text-sm text-[#5a5a5a]">
        <span className="font-semibold">Demographics:</span> {patient.demographics.age}yo {patient.demographics.sex}
      </div>

      <div className="bg-[#faf7f3] border border-[#e8ddd0] p-3 text-sm text-[#2a2a2a] italic font-serif leading-relaxed">
        &ldquo;{patient.narrative}&rdquo;
      </div>

      <div className="text-sm text-[#5a5a5a]">
        <span className="font-semibold">Chief Complaint:</span> {patient.chiefComplaint}
      </div>

      <div>
        <div className="text-sm font-semibold text-[#5a5a5a] mb-1">Symptoms ({patient.symptoms.length}):</div>
        <div className="space-y-1">
          {patient.symptoms.map((s, i) => (
            <div key={i} className="text-sm flex items-start gap-2">
              <span className="text-[#8b7355] font-mono text-xs mt-0.5">{i + 1}.</span>
              <div>
                <span className="text-[#2a2a2a]">&ldquo;{s.originalPhrase}&rdquo;</span>
                <span className="text-[#8b7355]"> &rarr; </span>
                <span className="font-medium text-[#5a5a5a]">{s.medicalTerm}</span>
                <span className="text-xs text-[#8b7355] ml-1">({s.bodySystem}, {s.severity}, {s.duration})</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(patient.medicalHistory.pastMedicalHistory?.length > 0 ||
        patient.medicalHistory.familyHistory?.length > 0 ||
        patient.medicalHistory.currentMedications?.length > 0) && (
        <div className="text-sm space-y-1 text-[#5a5a5a]">
          {patient.medicalHistory.pastMedicalHistory?.length > 0 && (
            <div>
              <span className="font-semibold">PMH:</span> {patient.medicalHistory.pastMedicalHistory.join(", ")}
            </div>
          )}
          {patient.medicalHistory.familyHistory?.length > 0 && (
            <div>
              <span className="font-semibold">FHx:</span> {patient.medicalHistory.familyHistory.join(", ")}
            </div>
          )}
          {patient.medicalHistory.currentMedications?.length > 0 && (
            <div>
              <span className="font-semibold">Meds:</span> {patient.medicalHistory.currentMedications.join(", ")}
            </div>
          )}
        </div>
      )}
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

function GradingSection({ grading }: { grading: TestGrading }) {
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
      className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-[#e8ddd0] hover:bg-[#faf7f3] transition-colors ${
        isActive ? "bg-[#faf7f3] border-l-2 border-l-[#8b2500]" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-serif text-[#2a2a2a] truncate">{tc.groundTruth.diagnosis}</div>
        <div className="text-xs text-[#8b7355]">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      <DifficultyBadge difficulty={tc.difficulty} />
      <StatusBadge status={tc.status} />
      {tc.grading && <GradeBadge grading={tc.grading} />}
    </button>
  )
}

// ===== MAIN PAGE =====

export default function AdminPage() {
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [activeTestId, setActiveTestId] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState(2)
  const [categoryHint, setCategoryHint] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isGrading, setIsGrading] = useState(false)
  const [pipelineEvents, setPipelineEvents] = useState<PipelineProgress[]>([])
  const [progressPercent, setProgressPercent] = useState(0)
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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

  // ===== GENERATE =====
  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

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
        groundTruth: data.groundTruth,
        generatedPatient: data.patient,
        generationMetadata: data.generationMetadata,
      }

      updateTestCases((prev) => [newCase, ...prev])
      setActiveTestId(newCase.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  // ===== RUN PIPELINE =====
  const handleRunPipeline = async () => {
    if (!activeTest) return
    setIsRunning(true)
    setError(null)
    setPipelineEvents([])
    setProgressPercent(0)

    updateTestCases((prev) =>
      prev.map((tc) => (tc.id === activeTest.id ? { ...tc, status: "running" as const, pipelineError: undefined } : tc))
    )

    try {
      setExtractionStatus("Starting symptom extraction...")
      const { patientCase, extractedSymptoms } = await buildPatientCase(activeTest.generatedPatient, (msg) => {
        setExtractionStatus(msg)
      })
      setExtractionStatus(null)

      // Store extracted symptoms on the test case
      updateTestCases((prev) =>
        prev.map((tc) => (tc.id === activeTest.id ? { ...tc, extractedSymptoms } : tc))
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

            const result: AnalysisResult = event.analysis

            updateTestCases((prev) =>
              prev.map((tc) =>
                tc.id === activeTest.id ? { ...tc, status: "completed" as const, pipelineResult: result } : tc
              )
            )
            return
          } else if (event.type === "error") {
            throw new Error(event.error || "Pipeline error")
          }
        }
      }

      throw new Error("Pipeline stream ended without a result")
    } catch (err: any) {
      if (err instanceof DOMException && err.name === "AbortError") return

      setError(err.message)
      updateTestCases((prev) =>
        prev.map((tc) =>
          tc.id === activeTest.id ? { ...tc, status: "error" as const, pipelineError: err.message } : tc
        )
      )
    } finally {
      setIsRunning(false)
      abortRef.current = null
    }
  }

  // ===== GRADE =====
  const handleGrade = async () => {
    if (!activeTest?.pipelineResult?.differentialDiagnoses?.length) {
      setError("No pipeline results to grade — try re-running the pipeline")
      return
    }
    setIsGrading(true)
    setError(null)

    try {
      const response = await fetch("/api/admin/grade-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groundTruth: activeTest.groundTruth,
          differentialDiagnoses: activeTest.pipelineResult.differentialDiagnoses,
          pipelineMetadata: activeTest.pipelineResult.pipelineMetadata,
          difficulty: activeTest.difficulty,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Grading failed: ${response.statusText}`)
      }

      const data = await response.json()

      updateTestCases((prev) =>
        prev.map((tc) =>
          tc.id === activeTest.id
            ? { ...tc, status: "graded" as const, grading: data.grading, gradingMetadata: data.gradingMetadata }
            : tc
        )
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsGrading(false)
    }
  }

  // ===== DELETE =====
  const handleDelete = (id: string) => {
    updateTestCases((prev) => prev.filter((tc) => tc.id !== id))
    if (activeTestId === id) setActiveTestId(null)
  }

  // Re-read active test from updated state
  const currentActiveTest = testCases.find((tc) => tc.id === activeTestId) || null

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-serif text-[#2a2a2a]">Clinical Testing Framework</h1>
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
          <div className="text-sm font-semibold text-[#8b7355] uppercase tracking-wider mb-4">
            Generate Test Case
          </div>

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
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-6 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? "Generating..." : "Generate Patient"}
            </button>
          </div>
        </div>

        {/* Active Test Detail */}
        {currentActiveTest && (
          <div className="border border-[#d4c5b0] bg-white mb-6">
            <div className="px-4 py-3 border-b border-[#e8ddd0] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-serif font-bold text-[#2a2a2a]">
                  {currentActiveTest.groundTruth.diagnosis}
                </h2>
                <DifficultyBadge difficulty={currentActiveTest.difficulty} />
                <StatusBadge status={currentActiveTest.status} />
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
              <PatientSection patient={currentActiveTest.generatedPatient} />

              {/* Extracted Symptoms (after pipeline has run extraction) */}
              {currentActiveTest.extractedSymptoms && currentActiveTest.extractedSymptoms.length > 0 && (
                <ExtractedSymptomsSection symptoms={currentActiveTest.extractedSymptoms} />
              )}

              {/* Pipeline Controls — show for generated, error, or completed-without-results */}
              {(currentActiveTest.status === "generated" ||
                currentActiveTest.status === "error" ||
                (currentActiveTest.status === "completed" && !currentActiveTest.pipelineResult?.differentialDiagnoses?.length)) && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRunPipeline}
                    disabled={isRunning}
                    className="px-6 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isRunning ? "Running Pipeline..." : "Run Pipeline"}
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

              {/* Grading Controls — show whenever results exist and not yet graded */}
              {(currentActiveTest.pipelineResult?.differentialDiagnoses?.length ?? 0) > 0 && !currentActiveTest.grading && (
                <button
                  onClick={handleGrade}
                  disabled={isGrading}
                  className="px-6 py-2 bg-[#8b2500] text-white text-sm font-medium hover:bg-[#6d1d00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGrading ? "Grading..." : "Grade Results"}
                </button>
              )}

              {/* Grading Results */}
              {currentActiveTest.grading && <GradingSection grading={currentActiveTest.grading} />}

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
            <div className="text-sm">Generate a patient above to get started</div>
          </div>
        )}
      </div>
    </div>
  )
}
