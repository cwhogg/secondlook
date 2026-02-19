"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { AnalysisLoading } from "@/components/analysis-loading"
import type { PipelineProgress } from "@/lib/types/pipeline"

interface Step1Data {
  age: string
  biologicalSex: string
  primaryConcern: string
  patientHypothesis?: string
  noIdea?: boolean
  bodyRegions?: string[]
  severity?: number
}

interface Step2Data {
  symptoms?: Array<{
    text: string
    medicalTerm?: string
    umls?: {
      cui: string
      name: string
      confidence: number
    }
    severity?: number
    duration?: string
    pattern?: string
    triggers?: string[]
  }>
}

interface Step3Data {
  medications?: Array<{
    name: string
    dosage?: string
    frequency?: string
    duration?: string
  }>
  medicalHistory?: string[]
  familyHistory?: string[]
  recentTests?: string[]
}

export default function AnalysisPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [pipelineEvents, setPipelineEvents] = useState<PipelineProgress[]>([])
  const [analysisStarted, setAnalysisStarted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const startAnalysis = async () => {
      if (analysisStarted) return
      setAnalysisStarted(true)

      console.log("[AnalysisPage] Loading analysis data...")

      // Load data from localStorage (where step-1, step-2, step-3 pages save it)
      const step1Data = localStorage.getItem("step1Data")
      const step2Data = localStorage.getItem("step2Data")
      const step3Data = localStorage.getItem("step3Data")

      console.log("[AnalysisPage] Analysis data loaded:", {
        hasStep1: !!step1Data,
        hasStep2: !!step2Data,
        hasStep3: !!step3Data,
        symptomsCount: step2Data ? JSON.parse(step2Data).symptoms?.length || 0 : 0,
        step1Keys: step1Data ? Object.keys(JSON.parse(step1Data)) : [],
        primaryConcern: step1Data ? JSON.parse(step1Data).primaryConcern?.substring(0, 50) + "..." : "none",
      })

      if (!step1Data) {
        console.error("[AnalysisPage] Missing step 1 data")
        router.push("/step-1")
        return
      }

      try {
        const parsedStep1: Step1Data = JSON.parse(step1Data)
        const parsedStep2: Step2Data = step2Data ? JSON.parse(step2Data) : { symptoms: [] }
        const parsedStep3: Step3Data = step3Data ? JSON.parse(step3Data) : {}

        console.log("[AnalysisPage] Auto-starting analysis...")

        // Build symptoms array - include mapped symptoms from step 2, or fall back to primary concern
        const symptoms: any[] = []

        // Load mapped symptoms from localStorage (persisted by step-2's SymptomMappingSection)
        const mappedSymptomsData = localStorage.getItem("mappedSymptoms")
        let mappedSymptoms: any[] = []
        if (mappedSymptomsData) {
          try {
            mappedSymptoms = JSON.parse(mappedSymptomsData)
          } catch (e) {
            console.error("[AnalysisPage] Failed to parse mapped symptoms:", e)
          }
        }

        // Load symptom patterns from localStorage
        const symptomPatternsData = localStorage.getItem("symptomPatterns")
        let symptomPatterns: any = null
        if (symptomPatternsData) {
          try {
            symptomPatterns = JSON.parse(symptomPatternsData)
          } catch (e) {
            console.error("[AnalysisPage] Failed to parse symptom patterns:", e)
          }
        }

        // Use mapped symptoms if available, otherwise fall back to primary concern
        if (mappedSymptoms.length > 0) {
          symptoms.push(
            ...mappedSymptoms.map((s: any) => ({
              originalPhrase: s.originalPhrase,
              originalText: s.originalPhrase,
              text: s.originalPhrase,
              medicalTerm: s.medicalTerm,
              selectedConcept: s.selectedConcept,
              category: s.category,
              bodyPart: s.bodyPart,
              severity: s.severity,
            })),
          )
        } else {
          // Add primary concern as a symptom if no mapped symptoms available
          if (parsedStep1.primaryConcern) {
            symptoms.push({
              text: parsedStep1.primaryConcern,
              originalText: parsedStep1.primaryConcern,
              medicalTerm: "Primary concern",
              severity: parsedStep1.severity || 5,
            })
          }

          // Add any symptoms from step 2 data
          if (parsedStep2.symptoms && Array.isArray(parsedStep2.symptoms)) {
            symptoms.push(...parsedStep2.symptoms)
          }
        }

        console.log("[AnalysisPage] Constructed symptoms:", symptoms.length)

        const analysisPayload = {
          demographics: {
            age: parsedStep1.age,
            sex: parsedStep1.biologicalSex,
          },
          chiefComplaint: {
            description: parsedStep1.primaryConcern,
            bodyRegions: parsedStep1.bodyRegions || [],
            severity: parsedStep1.severity || 5,
          },
          symptoms: symptoms,
          patientHypothesis: parsedStep1.patientHypothesis || null,
          medicalHistory: {
            currentMedications: parsedStep3.medications || [],
            pastMedicalHistory: parsedStep3.medicalHistory || [],
            familyHistory: parsedStep3.familyHistory || [],
            recentTests: parsedStep3.recentTests || [],
          },
          familyHistory: parsedStep3.familyHistory || [],
          symptomPatterns: symptomPatterns,
        }

        console.log("[AnalysisPage] Sending to v2 pipeline SSE...")
        const startTime = Date.now()

        // Use v2 SSE endpoint
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
            // use default message
          }
          throw new Error(errorMessage)
        }

        // Read SSE stream
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
              console.warn("[AnalysisPage] Failed to parse SSE event:", jsonStr)
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
              setProgress(event.percentage)
              console.log(`[AnalysisPage] Stage: ${event.stage} (${event.percentage}%) — ${event.detail}`)
            } else if (event.type === "result") {
              const processingTime = Date.now() - startTime
              console.log("[AnalysisPage] Pipeline complete:", {
                processingTime,
                diagnosesCount: event.analysis?.differentialDiagnoses?.length,
              })

              if (!event.success || !event.analysis) {
                throw new Error("Invalid analysis result from pipeline")
              }

              // Store results in sessionStorage
              const analysisResults = {
                differentialDiagnoses: event.analysis.differentialDiagnoses || [],
                excludedCommonDiagnoses: event.analysis.excludedCommonDiagnoses || [],
                dataGaps: event.analysis.dataGaps || [],
                recommendedTesting: event.analysis.recommendedTesting || [],
                nextSteps: event.analysis.nextSteps || {},
                overallAssessment: event.analysis.overallAssessment || "",
                patientHypothesisAnalysis: event.analysis.patientHypothesisAnalysis || null,
                pipelineMetadata: event.analysis.pipelineMetadata || null,
              }

              const analysisMetadata = {
                timestamp: new Date().toLocaleString(),
                processingTime,
                patientAge: parsedStep1.age,
                patientSex: parsedStep1.biologicalSex,
                patientHypothesis: parsedStep1.patientHypothesis,
              }

              sessionStorage.setItem("analysisResults", JSON.stringify(analysisResults))
              sessionStorage.setItem("analysisMetadata", JSON.stringify(analysisMetadata))

              console.log("[AnalysisPage] Redirecting to /results/analysis")
              router.push("/results/analysis")
              return
            } else if (event.type === "error") {
              throw new Error(event.error || "Pipeline error")
            }
          }
        }

        // If we reach here without a result event, something went wrong
        throw new Error("Analysis stream ended without a result")
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          console.log("[AnalysisPage] Analysis aborted")
          return
        }
        console.error("[AnalysisPage] Analysis error:", err)
        setError(err instanceof Error ? err.message : "Analysis failed")
        setProgress(0)
      }
    }

    startAnalysis()

    return () => {
      abortControllerRef.current?.abort()
    }
  }, [router, analysisStarted])

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-xl font-semibold mb-4">Analysis Failed</div>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push("/step-1")}
            className="px-6 py-3 bg-[#8b2500] text-white rounded-none hover:bg-[#6d1d00]"
          >
            Start Over
          </button>
        </div>
      </div>
    )
  }

  return <AnalysisLoading progress={progress} pipelineEvents={pipelineEvents} />
}
