"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Info, Stethoscope, Microscope, TestTube, Users, Target, Activity } from "lucide-react"

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

interface ExpertAnalysisResultsProps {
  analysis: AnalysisResults
  processingTime: number
}

export function ExpertAnalysisResults({ analysis, processingTime }: ExpertAnalysisResultsProps) {
  const router = useRouter()
  const [expandedDiagnoses, setExpandedDiagnoses] = useState<Set<number>>(new Set())
  const [showExcluded, setShowExcluded] = useState(true)
  const [showHypothesisAnalysis, setShowHypothesisAnalysis] = useState(true)
  const [expandedExcluded, setExpandedExcluded] = useState<Set<number>>(new Set())

  const {
    differentialDiagnoses,
    excludedCommonDiagnoses,
    dataGaps,
    recommendedTesting,
    nextSteps,
    overallAssessment,
    patientHypothesisAnalysis,
  } = analysis

  // Add safety checks for all arrays and objects
  const safeDifferentialDiagnoses = differentialDiagnoses || []
  const safeExcludedCommonDiagnoses = excludedCommonDiagnoses || []
  const safeDataGaps = dataGaps || []
  const safeRecommendedTesting = recommendedTesting || []
  const safeNextSteps = {
    immediateActions: nextSteps?.immediateActions || [],
    specialistReferrals: nextSteps?.specialistReferrals || [],
    followUpTiming: nextSteps?.followUpTiming || "Unknown",
    redFlags: nextSteps?.redFlags || [],
  }

  // Convert processing time from milliseconds to seconds
  const processingTimeInSeconds = (processingTime / 1000).toFixed(1)

  const toggleDiagnosis = (index: number) => {
    const newExpanded = new Set(expandedDiagnoses)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedDiagnoses(newExpanded)
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "text-green-600"
    if (confidence >= 60) return "text-[#8b2500]"
    if (confidence >= 40) return "text-yellow-600"
    return "text-red-600"
  }

  const getConfidenceBg = (confidence: number) => {
    if (confidence >= 80) return "bg-green-100"
    if (confidence >= 60) return "bg-[#faf6f0]"
    if (confidence >= 40) return "bg-yellow-100"
    return "bg-red-100"
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "low":
        return "bg-[#faf6f0] text-[#6d1d00]"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "urgent":
        return "bg-red-100 text-red-800"
      case "routine":
        return "bg-[#faf6f0] text-[#6d1d00]"
      case "when_available":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getGapTypeIcon = (gapType: string) => {
    switch (gapType) {
      case "laboratory":
        return <TestTube className="h-5 w-5" />
      case "imaging":
        return <Activity className="h-5 w-5" />
      case "genetic_testing":
        return <Microscope className="h-5 w-5" />
      case "specialist_evaluation":
        return <Stethoscope className="h-5 w-5" />
      case "family_history":
        return <Users className="h-5 w-5" />
      case "functional_assessment":
        return <Target className="h-5 w-5" />
      default:
        return <Info className="h-5 w-5" />
    }
  }

  const handleShare = () => {
    console.log("Share expert analysis results")
  }

  const handlePrint = () => {
    window.print()
  }

  const toggleExcludedCondition = (index: number) => {
    const newExpanded = new Set(expandedExcluded)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedExcluded(newExpanded)
  }

  useEffect(() => {
    // Store the analysis results in sessionStorage
    sessionStorage.setItem("analysisResults", JSON.stringify(analysis))
    sessionStorage.setItem(
      "analysisMetadata",
      JSON.stringify({
        processingTime,
        completedAt: new Date().toISOString(),
      }),
    )

    // Redirect to the split results pages
    router.push("/results/analysis")
  }, [analysis, processingTime, router])

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8b2500] mx-auto"></div>
        <p className="mt-4 text-gray-600">Redirecting to your results...</p>
      </div>
    </div>
  )
}
