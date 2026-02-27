"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { AnalysisLoading } from "@/components/analysis-loading"
import type { PipelineProgress } from "@/lib/types/pipeline"

interface Step1Data {
  age: string
  biologicalSex: string
}

interface Step2Data {
  primaryConcern: string
  patientHypothesis?: string
  noIdea?: boolean
}

interface Step3Data {
  mainSymptomStart?: string
  severity?: number
}

interface Step4Data {}

export default function AnalysisPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [pipelineEvents, setPipelineEvents] = useState<PipelineProgress[]>([])
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
        const parsedStep4: Step4Data = JSON.parse(step4Data)

        const symptoms: any[] = []

        const mappedSymptomsData = localStorage.getItem("mappedSymptoms")
        let mappedSymptoms: any[] = []
        if (mappedSymptomsData) {
          try {
            mappedSymptoms = JSON.parse(mappedSymptomsData)
          } catch {
            mappedSymptoms = []
          }
        }

        const symptomPatternsData = localStorage.getItem("symptomPatterns")
        let symptomPatterns: any = null
        if (symptomPatternsData) {
          try {
            symptomPatterns = JSON.parse(symptomPatternsData)
          } catch {
            symptomPatterns = null
          }
        }

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
        } else if (parsedStep2.primaryConcern) {
          symptoms.push({
            text: parsedStep2.primaryConcern,
            originalText: parsedStep2.primaryConcern,
            originalPhrase: parsedStep2.primaryConcern,
            medicalTerm: "Primary concern",
            severity: parsedStep3.severity || 5,
          })
        }

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
          symptomPatterns,
        }

        const startTime = Date.now()

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
              const processingTime = Date.now() - startTime

              if (!event.success || !event.analysis) {
                throw new Error("Invalid analysis result from pipeline")
              }

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
                patientHypothesis: parsedStep2.patientHypothesis,
              }

              sessionStorage.setItem("analysisResults", JSON.stringify(analysisResults))
              sessionStorage.setItem("analysisMetadata", JSON.stringify(analysisMetadata))

              router.push("/results/analysis")
              return
            } else if (event.type === "error") {
              throw new Error(event.error || "Pipeline error")
            }
          }
        }

        throw new Error("Analysis stream ended without a result")
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
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

  return <AnalysisLoading progress={progress} pipelineEvents={pipelineEvents} />
}
