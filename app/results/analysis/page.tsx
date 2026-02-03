"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Share2, Printer, Download, Brain, Activity, AlertTriangle } from "lucide-react"

interface AnalysisData {
  timestamp: string
  status: string
  conditions: Array<{
    name: string
    confidence: number
    severity: string
    icdCode: string
    description: string
    symptoms: string[]
    riskFactors: string[]
    recommendations: string[]
  }>
  recommendations: {
    immediateActions: string[]
    specialists: string[]
    tests: string[]
    lifestyle: string[]
  }
  metadata: {
    totalConditions: number
    rareDiseasesCount: number
    avgConfidence: number
    complexConditionsCount: number
  }
}

export default function AnalysisResultsPage() {
  const router = useRouter()
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Results are stored in sessionStorage by the ExpertAnalysisResults component
    const data = sessionStorage.getItem("analysisResults")
    if (data) {
      try {
        const raw = JSON.parse(data)

        // Transform API response format into the shape this page expects
        if (raw.differentialDiagnoses && !raw.conditions) {
          const conditions = (raw.differentialDiagnoses || []).map((d: any) => ({
            name: d.diagnosis || "Unknown condition",
            confidence: (d.confidenceScore || 0) / 100,
            severity: d.confidenceScore >= 60 ? "high" : d.confidenceScore >= 30 ? "moderate" : "low",
            icdCode: d.icd10Code || "N/A",
            description: d.clinicalReasoning || d.typicalPresentation || "",
            symptoms: d.supportingEvidence || [],
            riskFactors: d.contradictoryEvidence || [],
            recommendations: [
              d.diagnosticCriteria,
              d.specialistRequired ? `See specialist: ${d.specialistRequired}` : null,
            ].filter(Boolean),
          }))

          const rareCount = (raw.differentialDiagnoses || []).filter((d: any) => d.rareDisease).length
          const avgConf =
            conditions.length > 0
              ? conditions.reduce((sum: number, c: any) => sum + c.confidence, 0) / conditions.length
              : 0

          const transformed: AnalysisData = {
            timestamp: new Date().toISOString(),
            status: "complete",
            conditions,
            recommendations: {
              immediateActions: raw.nextSteps?.immediateActions || [],
              specialists: raw.nextSteps?.specialistReferrals || [],
              tests: (raw.recommendedTesting || []).map((t: any) => `${t.testName}: ${t.rationale}`),
              lifestyle: [],
            },
            metadata: {
              totalConditions: conditions.length,
              rareDiseasesCount: rareCount,
              avgConfidence: avgConf,
              complexConditionsCount: conditions.filter((c: any) => c.confidence < 0.5).length,
            },
          }
          setAnalysisData(transformed)
        } else {
          // Already in the expected format
          setAnalysisData(raw)
        }
      } catch (error) {
        console.error("Error parsing analysis results:", error)
      }
    }
    setIsLoading(false)
  }, [])

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SecondLook Medical Analysis",
          text: "View my medical analysis results",
          url: window.location.href,
        })
      } catch (err) {
        console.log("Share cancelled")
      }
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownload = () => {
    const dataStr = JSON.stringify(analysisData, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `secondlook-analysis-${new Date().toISOString()}.json`
    link.click()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8b2500] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your analysis...</p>
        </div>
      </div>
    )
  }

  if (!analysisData) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">No Analysis Found</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-6">
            We couldn't find your analysis results. Please complete the assessment first.
          </p>
          <button
            onClick={() => router.push("/step-1")}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-[#8b2500] hover:bg-[#6d1d00] text-white rounded-none font-semibold transition-all text-sm sm:text-base"
          >
            Start Assessment
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb] pb-28 sm:pb-32">
      {/* Header Section */}
      <div className="bg-[#8b2500] text-white py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-4">
            <Link href="/" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
              SecondLook
            </Link>
          </div>
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="p-2 sm:p-3 bg-white/20 rounded-none sm:rounded-none backdrop-blur-sm">
                <Brain className="h-6 w-6 sm:h-8 sm:w-8" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Analysis Results</h1>
                <p className="text-sm sm:text-base text-[#c9a96e] mt-1">
                  Expert-level differential diagnosis focusing on complex conditions
                </p>
              </div>
            </div>
          </div>

          {/* Metadata Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-none sm:rounded-none p-3 sm:p-4 md:p-6">
              <div className="flex items-center space-x-2 sm:space-x-3 mb-2">
                <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-xs sm:text-sm font-medium">Analysis Time</span>
              </div>
              <div className="text-lg sm:text-xl md:text-2xl font-bold">
                {new Date(analysisData.timestamp).toLocaleString()}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-none sm:rounded-none p-3 sm:p-4 md:p-6">
              <div className="flex items-center space-x-2 sm:space-x-3 mb-2">
                <Brain className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-xs sm:text-sm font-medium">Status</span>
              </div>
              <div className="text-lg sm:text-xl md:text-2xl font-bold capitalize">{analysisData.status}</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={handleShare}
              className="flex items-center space-x-2 px-3 sm:px-4 md:px-6 py-2 sm:py-3 bg-white/20 backdrop-blur-sm rounded-none hover:bg-white/30 transition-all text-sm sm:text-base"
            >
              <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Share</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center space-x-2 px-3 sm:px-4 md:px-6 py-2 sm:py-3 bg-white/20 backdrop-blur-sm rounded-none hover:bg-white/30 transition-all text-sm sm:text-base"
            >
              <Printer className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center space-x-2 px-3 sm:px-4 md:px-6 py-2 sm:py-3 bg-white/20 backdrop-blur-sm rounded-none hover:bg-white/30 transition-all text-sm sm:text-base"
            >
              <Download className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Download</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 md:py-12">
        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-8 sm:mb-12">
          <div className="bg-white rounded-none border border-gray-100 p-4 sm:p-6 md:p-8 text-center">
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#8b2500] mb-2">
              {analysisData.metadata.totalConditions}
            </div>
            <div className="text-xs sm:text-sm md:text-base text-gray-600">Conditions Analyzed</div>
          </div>
          <div className="bg-white rounded-none border border-gray-100 p-4 sm:p-6 md:p-8 text-center">
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-amber-600 mb-2">
              {analysisData.metadata.rareDiseasesCount}
            </div>
            <div className="text-xs sm:text-sm md:text-base text-gray-600">Rare Diseases</div>
          </div>
          <div className="bg-white rounded-none border border-gray-100 p-4 sm:p-6 md:p-8 text-center">
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#8b2500] mb-2">
              {Math.round(analysisData.metadata.avgConfidence * 100)}%
            </div>
            <div className="text-xs sm:text-sm md:text-base text-gray-600">Avg Confidence</div>
          </div>
          <div className="bg-white rounded-none border border-gray-100 p-4 sm:p-6 md:p-8 text-center">
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-red-600 mb-2">
              {analysisData.metadata.complexConditionsCount}
            </div>
            <div className="text-xs sm:text-sm md:text-base text-gray-600">Complex Cases</div>
          </div>
        </div>

        {/* Conditions List */}
        <div className="space-y-4 sm:space-y-6 md:space-y-8">
          {analysisData.conditions.map((condition, index) => (
            <div
              key={index}
              className="bg-white rounded-none border border-gray-100 p-5 md:p-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6 gap-3 sm:gap-0">
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-2">{condition.name}</h3>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="px-2 sm:px-3 py-1 bg-[#faf6f0] text-[#8b2500] rounded-none text-xs sm:text-sm font-medium">
                      {condition.icdCode}
                    </span>
                    <span
                      className={`px-2 sm:px-3 py-1 rounded-none text-xs sm:text-sm font-medium ${
                        condition.severity === "high"
                          ? "bg-red-100 text-red-700"
                          : condition.severity === "moderate"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                      }`}
                    >
                      {condition.severity} severity
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-2xl sm:text-3xl font-bold text-[#8b2500]">
                    {Math.round(condition.confidence * 100)}%
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500">Confidence</div>
                </div>
              </div>

              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 leading-relaxed">{condition.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center space-x-2">
                    <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-[#8b2500]" />
                    <span>Matching Symptoms</span>
                  </h4>
                  <ul className="space-y-1 sm:space-y-2">
                    {condition.symptoms.map((symptom, idx) => (
                      <li key={idx} className="text-xs sm:text-sm text-gray-600 flex items-start">
                        <span className="mr-2">•</span>
                        <span>{symptom}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                    <span>Risk Factors</span>
                  </h4>
                  <ul className="space-y-1 sm:space-y-2">
                    {condition.riskFactors.map((factor, idx) => (
                      <li key={idx} className="text-xs sm:text-sm text-gray-600 flex items-start">
                        <span className="mr-2">•</span>
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
                <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-2 sm:mb-3">Recommended Actions</h4>
                <ul className="space-y-1 sm:space-y-2">
                  {condition.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-600 flex items-start">
                      <span className="mr-2">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fixed Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 safe-area-bottom">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => router.push("/analysis")}
              className="flex items-center justify-center space-x-2 px-4 sm:px-6 py-3 rounded-none border-2 border-gray-300 text-gray-700 font-semibold hover:border-[#d4c5b0] hover:text-[#8b2500] transition-all min-w-[100px] sm:min-w-[140px] text-sm sm:text-base"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>Back</span>
            </button>

            <button
              onClick={() => router.push("/results/next-steps")}
              className="flex-1 max-w-md flex items-center justify-center space-x-2 px-4 sm:px-6 py-3 rounded-none bg-[#8b2500] hover:bg-[#6d1d00] text-white font-semibold transition-all text-sm sm:text-base"
            >
              <span>See Recommendations</span>
              <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
