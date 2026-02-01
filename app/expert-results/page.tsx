"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ExpertAnalysisResults } from "@/components/expert-analysis-results"

export default function ExpertResultsPage() {
  const router = useRouter()
  const [analysisResults, setAnalysisResults] = useState(null)
  const [analysisMetadata, setAnalysisMetadata] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log("[ExpertResults] Loading analysis results from sessionStorage...")

    // Load analysis results from session storage
    const results = sessionStorage.getItem("analysisResults")
    const metadata = sessionStorage.getItem("analysisMetadata")

    console.log("[ExpertResults] SessionStorage check:", {
      hasResults: !!results,
      hasMetadata: !!metadata,
      resultsLength: results?.length,
      metadataLength: metadata?.length,
      allKeys: Object.keys(sessionStorage),
    })

    if (results) {
      try {
        const parsedResults = JSON.parse(results)
        const parsedMetadata = metadata ? JSON.parse(metadata) : {}

        console.log("[ExpertResults] Successfully parsed results:", {
          diagnosesCount: parsedResults.differentialDiagnoses?.length,
          excludedCount: parsedResults.excludedCommonDiagnoses?.length,
          dataGapsCount: parsedResults.dataGaps?.length,
          hasOverallAssessment: !!parsedResults.overallAssessment,
          metadataKeys: Object.keys(parsedMetadata),
        })

        setAnalysisResults(parsedResults)
        setAnalysisMetadata(parsedMetadata)
      } catch (error) {
        console.error("[ExpertResults] Error parsing analysis results:", error)
        router.push("/step-1")
      }
    } else {
      console.error("[ExpertResults] No results found in sessionStorage")
      // No results found, redirect to start
      router.push("/step-1")
    }

    setLoading(false)
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf9fe] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading expert analysis results...</p>
        </div>
      </div>
    )
  }

  if (!analysisResults) {
    return (
      <div className="min-h-screen bg-[#faf9fe] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">No analysis results found</div>
          <button onClick={() => router.push("/step-1")} className="text-indigo-700 hover:text-indigo-800">
            Start new analysis
          </button>
        </div>
      </div>
    )
  }

  return (
    <ExpertAnalysisResults
      analysis={analysisResults}
      processingTime={analysisMetadata?.processingTime || 0}
    />
  )
}
