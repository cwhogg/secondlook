"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AnalysisLoading } from "@/components/analysis-loading"

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

interface AnalysisResults {
  differentialDiagnoses: Array<{
    diagnosis: string
    icd10Code: string
    confidenceScore: number
    rareDisease: boolean
    prevalence: string
    supportingEvidence: string[]
    contradictoryEvidence: string[]
    clinicalReasoning: string
    typicalPresentation: string
    specialistRequired: string
    diagnosticCriteria: string
  }>
  excludedCommonDiagnoses: Array<{
    diagnosis: string
    reasonExcluded: string
  }>
  dataGaps: Array<{
    gapType: string
    description: string
    priority: string
    estimatedImpact: string
  }>
  recommendedTesting: Array<{
    testType: string
    testName: string
    rationale: string
    urgency: string
  }>
  nextSteps: {
    immediateActions: string[]
    specialistReferrals: string[]
    followUpTiming: string
    redFlags: string[]
  }
  overallAssessment: string
  patientHypothesisAnalysis?: {
    likelihood: number
    reasoning: string
    alternativeExplanation: string
  }
}

export default function AnalysisPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState("")
  const [analysisStarted, setAnalysisStarted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const startAnalysis = async () => {
      if (analysisStarted) return
      setAnalysisStarted(true)

      console.log("[AnalysisPage] Loading analysis data...")

      // Load data from sessionStorage
      const step1Data = sessionStorage.getItem("step1Data")
      const step2Data = sessionStorage.getItem("step2Data")
      const step3Data = sessionStorage.getItem("step3Data")

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

        // Simulate analysis progress
        setCurrentStep("Processing symptoms")
        setProgress(25)

        await new Promise((resolve) => setTimeout(resolve, 1000))

        setCurrentStep("Mapping conditions")
        setProgress(50)

        await new Promise((resolve) => setTimeout(resolve, 1000))

        setCurrentStep("Analyzing patterns")
        setProgress(75)

        console.log("[AnalysisPage] Auto-starting analysis...")

        // Prepare analysis payload
        console.log("[AnalysisPage] ===== STARTING EXPERT ANALYSIS =====")

        // Build symptoms array - include both step2 symptoms and primary concern
        const symptoms = []

        // Add primary concern as a symptom if it exists
        if (parsedStep1.primaryConcern) {
          symptoms.push({
            text: parsedStep1.primaryConcern,
            medicalTerm: "Primary concern",
            severity: parsedStep1.severity || 5,
          })
        }

        // Add any mapped symptoms from step 2
        if (parsedStep2.symptoms && Array.isArray(parsedStep2.symptoms)) {
          symptoms.push(...parsedStep2.symptoms)
        }

        console.log("[AnalysisPage] Constructing symptoms from available data...")
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
        }

        console.log("[AnalysisPage] Analysis payload prepared:", {
          demographics: analysisPayload.demographics,
          chiefComplaintLength: analysisPayload.chiefComplaint.description.length,
          symptomsCount: symptoms.length,
          hasPatientHypothesis: !!analysisPayload.patientHypothesis,
          payloadSize: JSON.stringify(analysisPayload).length,
          symptomsPreview: symptoms.slice(0, 3).map((s) => ({
            text: s.text.substring(0, 30) + "...",
            term: s.medicalTerm,
          })),
        })

        setProgress(90)

        // Call analysis API
        console.log("[AnalysisPage] Making API call to /api/analyze-patient...")
        const startTime = Date.now()

        const response = await fetch("/api/analyze-patient", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(analysisPayload),
        })

        console.log("[AnalysisPage] API response received:", {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        })

        const responseText = await response.text()
        console.log("[AnalysisPage] Response text received:", {
          length: responseText.length,
          preview: responseText.substring(0, 200) + "...",
        })

        if (!response.ok) {
          console.error("[AnalysisPage] Analysis API error:", {
            status: response.status,
            statusText: response.statusText,
            responsePreview: responseText.substring(0, 500),
          })
          throw new Error(`Analysis failed: ${response.statusText}`)
        }

        const result = JSON.parse(responseText)
        const processingTime = Date.now() - startTime

        console.log("[AnalysisPage] Analysis completed:", {
          success: result.success,
          requestId: result.requestId,
          processingTime: processingTime,
          totalTime: result.timing?.totalTime,
          diagnosesCount: result.analysis?.differentialDiagnoses?.length,
          hasAnalysis: !!result.analysis,
          analysisKeys: result.analysis ? Object.keys(result.analysis) : [],
        })

        if (!result.success || !result.analysis) {
          console.error("[AnalysisPage] Invalid analysis result:", {
            hasSuccess: !!result.success,
            hasAnalysis: !!result.analysis,
            resultKeys: Object.keys(result),
          })
          throw new Error("Invalid analysis result")
        }

        // Log detailed analysis structure
        console.log("[AnalysisPage] Analysis structure:", {
          differentialDiagnoses: {
            exists: !!result.analysis.differentialDiagnoses,
            isArray: Array.isArray(result.analysis.differentialDiagnoses),
            length: result.analysis.differentialDiagnoses?.length,
          },
          excludedCommonDiagnoses: {
            exists: !!result.analysis.excludedCommonDiagnoses,
            isArray: Array.isArray(result.analysis.excludedCommonDiagnoses),
            length: result.analysis.excludedCommonDiagnoses?.length,
          },
          dataGaps: {
            exists: !!result.analysis.dataGaps,
            isArray: Array.isArray(result.analysis.dataGaps),
            length: result.analysis.dataGaps?.length,
          },
          recommendedTesting: {
            exists: !!result.analysis.recommendedTesting,
            isArray: Array.isArray(result.analysis.recommendedTesting),
            length: result.analysis.recommendedTesting?.length,
          },
          nextSteps: {
            exists: !!result.analysis.nextSteps,
            type: typeof result.analysis.nextSteps,
          },
          overallAssessment: {
            exists: !!result.analysis.overallAssessment,
            type: typeof result.analysis.overallAssessment,
          },
        })

        // Store results in sessionStorage with the correct key name
        const analysisResults = {
          differentialDiagnoses: result.analysis.differentialDiagnoses || [],
          excludedCommonDiagnoses: result.analysis.excludedCommonDiagnoses || [],
          dataGaps: result.analysis.dataGaps || [],
          recommendedTesting: result.analysis.recommendedTesting || [],
          nextSteps: result.analysis.nextSteps || {},
          overallAssessment: result.analysis.overallAssessment || "",
          patientHypothesisAnalysis: result.analysis.patientHypothesisAnalysis || null,
        }

        const analysisMetadata = {
          timestamp: new Date().toLocaleString(),
          processingTime: processingTime,
          patientAge: parsedStep1.age,
          patientSex: parsedStep1.biologicalSex,
          patientHypothesis: parsedStep1.patientHypothesis,
        }

        // Store with keys that expert-results expects
        sessionStorage.setItem("analysisResults", JSON.stringify(analysisResults))
        sessionStorage.setItem("analysisMetadata", JSON.stringify(analysisMetadata))

        console.log("[AnalysisPage] Analysis completed successfully")
        console.log("[AnalysisPage] Stored in sessionStorage:", {
          analysisResultsKey: "analysisResults",
          analysisMetadataKey: "analysisMetadata",
          resultsSize: JSON.stringify(analysisResults).length,
          metadataSize: JSON.stringify(analysisMetadata).length,
        })

        setProgress(100)
        setCurrentStep("Complete")

        // Wait a moment then redirect
        await new Promise((resolve) => setTimeout(resolve, 500))

        console.log("[AnalysisPage] Redirecting to /expert-results")
        router.push("/expert-results")
      } catch (error) {
        console.error("[AnalysisPage] Analysis error:", error)
        setError(error instanceof Error ? error.message : "Analysis failed")
        setProgress(0)
        setCurrentStep("Error")
      }
    }

    startAnalysis()
  }, [router, analysisStarted])

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-xl font-semibold mb-4">Analysis Failed</div>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push("/step-1")}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Start Over
          </button>
        </div>
      </div>
    )
  }

  return <AnalysisLoading progress={progress} currentStep={currentStep} />
}
