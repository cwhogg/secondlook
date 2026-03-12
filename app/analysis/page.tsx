"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { AnalysisLoading } from "@/components/analysis-loading"
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
          totalStages: 6,
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

        if (!parseResponse.ok) {
          throw new Error(`Symptom parsing failed: ${parseResponse.statusText}`)
        }

        const parseData = await parseResponse.json()
        if (parseData.error || !parseData.symptoms?.length) {
          throw new Error(parseData.error || "No symptoms could be extracted from your description.")
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
          totalStages: 6,
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
                differentialClusters: event.analysis.differentialClusters || [],
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

  return <AnalysisLoading progress={progress} pipelineEvents={pipelineEvents} preTriageSymptoms={preTriageSymptoms} />
}
