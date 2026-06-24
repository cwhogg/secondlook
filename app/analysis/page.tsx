"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { AnalysisLoading } from "@/components/analysis-loading"
import { TestUserGroundTruthBanner } from "@/components/test-user-ground-truth-banner"
import { mapSingleSymptom } from "@/lib/symptom-parser"
import type { PipelineProgress } from "@/lib/types/pipeline"

interface Step1Data {
  age: string
  biologicalSex: string
}

interface Step2Data {
  primaryConcern: string
  patientHypothesis?: string
  noIdea?: boolean
  labResults?: any[]
}

interface Step3Data {
  mainSymptomStart?: string
  severity?: number
}

interface Step4Data {}

/**
 * Common success handler. Used by both the SSE 'result' event and the
 * resume-from-KV path so they produce identical sessionStorage + nav.
 */
function handleAnalysisResult(
  analysis: any,
  startTime: number,
  parsedStep1: Step1Data,
  parsedStep2: Step2Data,
  analysisPayload: any,
  router: ReturnType<typeof useRouter>,
) {
  const processingTime = Date.now() - startTime
  const analysisResults = {
    differentialDiagnoses: analysis.differentialDiagnoses || [],
    differentialClusters: analysis.differentialClusters || [],
    familyEnrichments: analysis.familyEnrichments || undefined,
    excludedCommonDiagnoses: analysis.excludedCommonDiagnoses || [],
    dataGaps: analysis.dataGaps || [],
    recommendedTesting: analysis.recommendedTesting || [],
    nextSteps: analysis.nextSteps || {},
    overallAssessment: analysis.overallAssessment || "",
    patientHypothesisAnalysis: analysis.patientHypothesisAnalysis || null,
    pipelineMetadata: analysis.pipelineMetadata || null,
    clarifyingQuestions: analysis.clarifyingQuestions || undefined,
    lowConfidenceWarning: analysis.lowConfidenceWarning || undefined,
  }
  const analysisMetadata = {
    timestamp: new Date().toLocaleString(),
    processingTime,
    patientAge: parsedStep1.age,
    patientSex: parsedStep1.biologicalSex,
    patientHypothesis: parsedStep2.patientHypothesis,
  }
  sessionStorage.setItem("analysisResults", JSON.stringify(analysisResults))
  sessionStorage.setItem("analysisMetadata", JSON.stringify(analysisMetadata))
  sessionStorage.setItem("analysisPatientCase", JSON.stringify(analysisPayload))
  // Pending-request markers no longer needed once delivery succeeds.
  sessionStorage.removeItem("pendingAnalysisRequestId")
  sessionStorage.removeItem("pendingAnalysisStartedAt")
  router.push("/results/analysis")
}

/**
 * Resume polling for the persisted analysisResult by requestId. Polls
 * every 5s for up to 12 min from startedAt (pipeline is ~7-8 min typical
 * + buffer). Aborts on AbortController signal. Returns the run record
 * on success, null on timeout / aborted / repeated failures.
 */
async function tryResumeFromKv(
  requestId: string,
  startedAt: number,
  abortRef: React.RefObject<AbortController | null>,
): Promise<{ analysisResult: any } | null> {
  const MAX_AGE_MS = 12 * 60 * 1000
  const POLL_MS = 5000
  while (Date.now() - startedAt < MAX_AGE_MS) {
    if (abortRef.current?.signal.aborted) return null
    try {
      const res = await fetch(`/api/get-analysis/${encodeURIComponent(requestId)}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.status === "complete" && data?.analysisResult) {
          return { analysisResult: data.analysisResult }
        }
      }
      // 404 / pending -> keep polling
    } catch {
      // network blip, keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  return null
}

export default function AnalysisPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [pipelineEvents, setPipelineEvents] = useState<PipelineProgress[]>([])
  const [preTriageSymptoms, setPreTriageSymptoms] = useState<Array<{
    originalPhrase: string
    medicalTerm: string
    code: string | null
    codeSystem: 'SNOMED' | 'UMLS CUI' | null
  }>>([])
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const hasStartedRef = useRef(false)

  useEffect(() => {
    const startAnalysis = async () => {
      if (hasStartedRef.current) return
      hasStartedRef.current = true

      const step1Data = localStorage.getItem("step1Data")
      const step2Data = localStorage.getItem("step2Data")
      const step3Data = localStorage.getItem("step3Data")
      const step4Data = localStorage.getItem("step4Data")

      if (!step1Data || !step2Data || !step3Data || !step4Data) {
        router.push("/step-1")
        return
      }

      try {
        const parsedStep1: Step1Data = JSON.parse(step1Data)
        const parsedStep2: Step2Data = JSON.parse(step2Data)
        const parsedStep3: Step3Data = JSON.parse(step3Data)
        JSON.parse(step4Data) // validate step4 is present

        // ===== STAGE 0: SYMPTOM EXTRACTION =====
        setPipelineEvents([{
          stage: 'extraction',
          stageNumber: 0,
          totalStages: 7,
          percentage: 2,
          detail: 'Parsing symptoms from your narrative...',
          data: { symptomCount: 0, symptoms: [] },
        } as PipelineProgress])
        setProgress(2)

        // Call parse-symptoms API
        const parseResponse = await fetch("/api/parse-symptoms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: parsedStep2.primaryConcern,
            patientAge: parsedStep1.age,
            patientSex: parsedStep1.biologicalSex,
          }),
        })

        const parseData = await parseResponse.json().catch(() => null)

        if (!parseResponse.ok) {
          const detail = parseData?.error || parseResponse.statusText || `HTTP ${parseResponse.status}`
          throw new Error(`Symptom parsing failed: ${detail}`)
        }

        if (!parseData || parseData.error || !parseData.symptoms?.length) {
          throw new Error(parseData?.error || "No symptoms could be extracted from your description.")
        }

        // Map each parsed symptom to UMLS concepts
        setProgress(5)
        const mappedResults = await Promise.all(
          parseData.symptoms.map((symptom: any) => mapSingleSymptom(symptom))
        )

        // Build pre-triage display data
        const preExtracted = mappedResults.map((s) => {
          const concept = s.selectedConcept || null
          const code = concept?.cui || null
          const codeSystem: 'SNOMED' | 'UMLS CUI' | null = concept?.cui ? 'UMLS CUI' : null
          return {
            originalPhrase: s.originalPhrase,
            medicalTerm: s.medicalTerm,
            code,
            codeSystem,
          }
        }).filter((s) => s.medicalTerm)

        setPreTriageSymptoms(preExtracted)

        // Store mapped symptoms in localStorage for consistency
        localStorage.setItem("mappedSymptoms", JSON.stringify(mappedResults))

        // Emit extraction-complete event
        setPipelineEvents([{
          stage: 'extraction-complete',
          stageNumber: 0,
          totalStages: 7,
          percentage: 10,
          detail: `Extracted ${preExtracted.length} symptoms with UMLS mappings`,
          data: { symptomCount: preExtracted.length, symptoms: preExtracted },
        } as PipelineProgress])
        setProgress(10)

        // Build symptoms array for pipeline payload
        const symptoms = mappedResults.map((s) => ({
          originalPhrase: s.originalPhrase,
          originalText: s.originalPhrase,
          text: s.originalPhrase,
          medicalTerm: s.medicalTerm,
          selectedConcept: s.selectedConcept,
          category: s.category,
          bodyPart: s.bodyPart,
          severity: s.severity,
        }))

        const analysisPayload = {
          demographics: {
            age: parsedStep1.age,
            sex: parsedStep1.biologicalSex,
          },
          chiefComplaint: {
            description: parsedStep2.primaryConcern,
            duration: parsedStep3.mainSymptomStart || undefined,
            bodyRegions: [],
            severity: parsedStep3.severity || 5,
          },
          symptoms,
          // parse-symptoms now returns excludedFindings as full objects; map
          // each to a clinical term string for the pipeline. Tolerate legacy
          // string entries for backward compatibility.
          excludedFindings: Array.isArray(parseData.excludedFindings)
            ? parseData.excludedFindings
                .map((e: any) => {
                  if (typeof e === "string") return e.trim()
                  if (e && typeof e === "object") return (e.medicalTerm || e.originalPhrase || "").toString().trim()
                  return ""
                })
                .filter((s: string) => s.length > 0)
            : [],
          labResults: Array.isArray(parsedStep2.labResults) ? parsedStep2.labResults : [],
          patientHypothesis: parsedStep2.noIdea ? null : parsedStep2.patientHypothesis || null,
          medicalHistory: {
            currentMedications: [],
            pastMedicalHistory: [],
            familyHistory: [],
            recentTests: [],
            medicalCare: "",
            testingHistory: [],
          },
          familyHistory: [],
          symptomPatterns: null,
        }

        const startTime = Date.now()

        // Persist the patient case upfront so the resume-from-KV path
        // can reuse it if the SSE connection dies (e.g., mobile suspend).
        // The analysisRequestId + startedAt are saved as soon as the first
        // SSE event arrives (every event carries the requestId).
        sessionStorage.setItem("analysisPatientCase", JSON.stringify(analysisPayload))
        sessionStorage.setItem("pendingAnalysisStartedAt", String(startTime))

        // BEFORE making the request — check if we have a recent pending
        // analysis from a prior tab visit that died mid-flight (mobile
        // suspended, user closed and reopened, etc.). If so, try the
        // resume path instead of starting a duplicate analysis.
        const priorRequestId = sessionStorage.getItem("pendingAnalysisRequestId")
        const priorStartedAt = parseInt(
          sessionStorage.getItem("pendingAnalysisStartedAt") || "0",
          10,
        )
        if (priorRequestId && priorStartedAt && Date.now() - priorStartedAt < 12 * 60 * 1000) {
          const resumed = await tryResumeFromKv(priorRequestId, priorStartedAt, abortControllerRef)
          if (resumed && !abortControllerRef.current?.signal.aborted) {
            handleAnalysisResult(
              resumed.analysisResult,
              priorStartedAt,
              parsedStep1,
              parsedStep2,
              analysisPayload,
              router,
            )
            return
          }
          // Resume failed or timed out — fall through to a fresh analysis.
          // Clear stale markers so the next run starts clean.
          sessionStorage.removeItem("pendingAnalysisRequestId")
        }

        const abortController = new AbortController()
        abortControllerRef.current = abortController

        const response = await fetch("/api/analyze-patient-v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(analysisPayload),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorBody = await response.text()
          let errorMessage = `Analysis failed: ${response.statusText}`
          try {
            const parsed = JSON.parse(errorBody)
            if (parsed.error) errorMessage = parsed.error
            if (parsed.retryAfter) errorMessage += ` (retry in ${parsed.retryAfter}s)`
          } catch {
            // keep default
          }
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

            // Every SSE event carries the requestId — capture and persist
            // it the first time we see it so the resume-from-KV path can
            // poll for the result if the connection later dies.
            if (event.requestId && !sessionStorage.getItem("pendingAnalysisRequestId")) {
              sessionStorage.setItem("pendingAnalysisRequestId", event.requestId)
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
              setProgress(event.percentage)
            } else if (event.type === "result") {
              if (!event.success || !event.analysis) {
                throw new Error("Invalid analysis result from pipeline")
              }
              handleAnalysisResult(
                event.analysis,
                startTime,
                parsedStep1,
                parsedStep2,
                analysisPayload,
                router,
              )
              return
            } else if (event.type === "error") {
              throw new Error(event.error || "Pipeline error")
            }
          }
        }

        throw new Error("Analysis stream ended without a result")
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return

        // Before showing "Analysis failed" — the SSE may have died
        // because mobile suspended the tab while the pipeline kept
        // running server-side. Check whether KV has the result.
        const pendingId = sessionStorage.getItem("pendingAnalysisRequestId")
        const pendingAt = parseInt(
          sessionStorage.getItem("pendingAnalysisStartedAt") || "0",
          10,
        )
        if (pendingId && pendingAt && Date.now() - pendingAt < 12 * 60 * 1000) {
          setPipelineEvents((prev) => [
            ...prev,
            {
              stage: "heartbeat",
              stageNumber: 0,
              totalStages: 7,
              percentage: Math.max(0, Math.min(95, Math.round(((Date.now() - pendingAt) / (10 * 60_000)) * 100))),
              detail: "Reconnecting — checking whether your analysis completed in the background…",
              data: null,
            } as any,
          ])
          const resumed = await tryResumeFromKv(pendingId, pendingAt, abortControllerRef)
          if (resumed && !abortControllerRef.current?.signal.aborted) {
            handleAnalysisResult(
              resumed.analysisResult,
              pendingAt,
              JSON.parse(localStorage.getItem("step1Data") || "{}"),
              JSON.parse(localStorage.getItem("step2Data") || "{}"),
              JSON.parse(sessionStorage.getItem("analysisPatientCase") || "{}"),
              router,
            )
            return
          }
        }

        setError(err instanceof Error ? err.message : "Analysis failed")
        setProgress(0)
      }
    }

    startAnalysis()

    return () => {
      abortControllerRef.current?.abort()
    }
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-xl font-semibold mb-4">Analysis Failed</div>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={() => router.push("/step-1")} className="px-6 py-3 bg-[#8b2500] text-white rounded-none">
            Start Over
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <TestUserGroundTruthBanner />
      <AnalysisLoading progress={progress} pipelineEvents={pipelineEvents} preTriageSymptoms={preTriageSymptoms} />
    </>
  )
}
