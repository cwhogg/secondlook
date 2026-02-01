"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  Printer,
  Share2,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  AlertCircle,
  TrendingUp,
  Clock,
  Stethoscope,
} from "lucide-react"
import { MedicalButton } from "./medical-button"

interface Diagnosis {
  name: string
  confidence: number
  icd10: string
  isRare: boolean
  prevalence: string
  supportingEvidence: string[]
  lessLikely: string[]
  clinicalExplanation: string
  aboutCondition: {
    symptoms: string
    whyMissed: string
    treatments: string
  }
  learnMoreUrl: string
}

interface AnalysisResultsProps {
  patientHypothesis?: string
  patientAge: string
  patientSex: string
  analysisTimestamp: string
  clinicalSummary: string
  overallConfidence: number
  diagnoses: Diagnosis[]
  informationGaps: Array<{
    item: string
    importance: "high" | "medium" | "low"
    impact: string
  }>
  nextSteps: {
    specialist: string
    urgency: "routine" | "urgent" | "emergent"
    bringInfo: string[]
    questions: string[]
    monitorSymptoms: string[]
  }
}

export function AnalysisResults({
  patientHypothesis,
  patientAge,
  patientSex,
  analysisTimestamp,
  clinicalSummary,
  overallConfidence,
  diagnoses,
  informationGaps,
  nextSteps,
}: AnalysisResultsProps) {
  const [expandedDiagnoses, setExpandedDiagnoses] = useState<Set<number>>(new Set())
  const [showHypothesisResponse, setShowHypothesisResponse] = useState(true)
  const router = useRouter()

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
    if (confidence >= 80) return "text-green-600 bg-green-50 border-green-200"
    if (confidence >= 60) return "text-indigo-600 bg-indigo-50 border-indigo-200"
    return "text-yellow-600 bg-yellow-50 border-yellow-200"
  }

  const getUrgencyStyle = (urgency: string) => {
    switch (urgency) {
      case "emergent":
        return "border-red-500 bg-red-50"
      case "urgent":
        return "border-orange-500 bg-orange-50"
      default:
        return "border-indigo-500 bg-indigo-50"
    }
  }

  const handleShare = () => {
    // Implement sharing functionality
    console.log("Share results")
  }

  const handlePrint = () => {
    window.print()
  }

  // Find patient's hypothesis in diagnoses if it exists
  const hypothesisMatch = patientHypothesis
    ? diagnoses.find((d) => d.name.toLowerCase().includes(patientHypothesis.toLowerCase()))
    : null

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6 sm:space-y-8 pb-24 sm:pb-8">
        {/* Header Section */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-2">Your Health Analysis Complete</h1>
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  <Calendar className="h-4 w-4" />
                  <span>{analysisTimestamp}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <User className="h-4 w-4" />
                  <span>
                    {patientAge} year old {patientSex}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 w-full sm:w-auto">
              <MedicalButton
                variant="outline"
                onClick={handleShare}
                className="flex items-center justify-center space-x-2 text-sm"
              >
                <Share2 className="h-4 w-4" />
                <span>Share with doctor</span>
              </MedicalButton>
              <MedicalButton
                variant="outline"
                onClick={handlePrint}
                className="flex items-center justify-center space-x-2 text-sm"
              >
                <Printer className="h-4 w-4" />
                <span>Print results</span>
              </MedicalButton>
            </div>
          </div>

          {/* Medical Disclaimer */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <strong>Medical Disclaimer:</strong> This analysis is for informational purposes and does not replace
                professional medical advice, diagnosis, or treatment. Always consult with qualified healthcare providers
                for medical decisions.
              </div>
            </div>
          </div>
        </div>

        {/* Patient Hypothesis Response */}
        {patientHypothesis && (
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">About Your Initial Thoughts</h2>
              <button
                onClick={() => setShowHypothesisResponse(!showHypothesisResponse)}
                className="text-medical-primary hover:text-indigo-800"
              >
                {showHypothesisResponse ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>

            {showHypothesisResponse && (
              <div className="space-y-4">
                <p className="text-gray-600 text-sm sm:text-base">
                  You mentioned you thought this might be <strong>{patientHypothesis}</strong>
                </p>

                {hypothesisMatch ? (
                  <div className="bg-indigo-50 border border-[#e5e2f0] rounded-xl p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                      <h3 className="text-base sm:text-lg font-semibold text-indigo-900">
                        How likely is {hypothesisMatch.name}?
                      </h3>
                      <div className="text-2xl sm:text-3xl font-bold text-indigo-700">{hypothesisMatch.confidence}%</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <div>
                        <h4 className="font-medium text-green-800 mb-2 flex items-center text-sm sm:text-base">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Why this might fit
                        </h4>
                        <ul className="space-y-1 text-sm text-green-700">
                          {hypothesisMatch.supportingEvidence.map((evidence, index) => (
                            <li key={index} className="flex items-start">
                              <span className="mr-2">•</span>
                              <span>{evidence}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {hypothesisMatch.lessLikely.length > 0 && (
                        <div>
                          <h4 className="font-medium text-yellow-800 mb-2 flex items-center text-sm sm:text-base">
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Why this might not be the answer
                          </h4>
                          <ul className="space-y-1 text-sm text-yellow-700">
                            {hypothesisMatch.lessLikely.map((reason, index) => (
                              <li key={index} className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 p-3 sm:p-4 bg-white rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">
                        What a doctor would do to check for this
                      </h4>
                      <p className="text-sm text-gray-600">{hypothesisMatch.clinicalExplanation}</p>
                    </div>

                    <div className="mt-4">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          hypothesisMatch.confidence >= 60
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {hypothesisMatch.confidence >= 60
                          ? "Matches your guess"
                          : "Different from your initial thought"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 sm:p-6">
                    <p className="text-gray-600 text-sm sm:text-base">
                      We didn't find strong evidence for {patientHypothesis} based on your symptoms, but we've
                      identified other possibilities below that might be worth exploring with a healthcare provider.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Clinical Summary */}
        <div className="bg-indigo-50 border border-[#e5e2f0] rounded-xl p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-indigo-900 mb-4 flex items-center">
            <Stethoscope className="h-5 w-5 mr-2" />
            Clinical Summary
          </h2>
          <p className="text-indigo-800 text-base sm:text-lg leading-relaxed mb-4">{clinicalSummary}</p>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-indigo-700">Overall Confidence:</span>
            <div className="flex-1 bg-indigo-200 rounded-full h-2 max-w-32">
              <div
                className="bg-indigo-700 h-2 rounded-full transition-all duration-500"
                style={{ width: `${overallConfidence}%` }}
              />
            </div>
            <span className="text-sm font-bold text-indigo-700">{overallConfidence}%</span>
          </div>
        </div>

        {/* Differential Diagnoses */}
        <div className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Possible Diagnoses</h2>

          {diagnoses.map((diagnosis, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 mb-2">
                      <h3 className="text-lg sm:text-xl font-semibold text-gray-900">{diagnosis.name}</h3>
                      {diagnosis.isRare && (
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded-full w-fit">
                          Rare Disease
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0 text-sm text-gray-600">
                      <span>ICD-10: {diagnosis.icd10}</span>
                      <span>Affects {diagnosis.prevalence}</span>
                    </div>
                  </div>

                  <div className="text-center sm:text-right">
                    <div
                      className={`text-2xl sm:text-3xl font-bold mb-1 ${getConfidenceColor(diagnosis.confidence).split(" ")[0]}`}
                    >
                      {diagnosis.confidence}%
                    </div>
                    <div
                      className={`w-20 sm:w-24 h-2 rounded-full mx-auto sm:mx-0 ${getConfidenceColor(diagnosis.confidence).split(" ")[1]}`}
                    >
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${getConfidenceColor(diagnosis.confidence).split(" ")[0].replace("text-", "bg-")}`}
                        style={{ width: `${diagnosis.confidence}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Supporting Evidence */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4">
                  <div>
                    <h4 className="font-medium text-green-800 mb-3 flex items-center text-sm sm:text-base">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Supporting Evidence
                    </h4>
                    <ul className="space-y-2">
                      {diagnosis.supportingEvidence.map((evidence, idx) => (
                        <li key={idx} className="flex items-start text-sm text-green-700">
                          <CheckCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                          <span>{evidence}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {diagnosis.lessLikely.length > 0 && (
                    <div>
                      <h4 className="font-medium text-yellow-800 mb-3 flex items-center text-sm sm:text-base">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Less Likely Because
                      </h4>
                      <ul className="space-y-2">
                        {diagnosis.lessLikely.map((reason, idx) => (
                          <li key={idx} className="flex items-start text-sm text-yellow-700">
                            <AlertTriangle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Expandable Sections */}
                <div className="border-t border-gray-200 pt-4">
                  <button
                    onClick={() => toggleDiagnosis(index)}
                    className="flex items-center justify-between w-full text-left text-medical-primary hover:text-indigo-800 transition-colors"
                  >
                    <span className="font-medium text-sm sm:text-base">Learn more about this condition</span>
                    {expandedDiagnoses.has(index) ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </button>

                  {expandedDiagnoses.has(index) && (
                    <div className="mt-4 space-y-4">
                      <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                        <h5 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">Clinical Explanation</h5>
                        <p className="text-sm text-gray-600">{diagnosis.clinicalExplanation}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">Typical Symptoms</h5>
                          <p className="text-sm text-gray-600">{diagnosis.aboutCondition.symptoms}</p>
                        </div>
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">Why Often Missed</h5>
                          <p className="text-sm text-gray-600">{diagnosis.aboutCondition.whyMissed}</p>
                        </div>
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">Treatment Approaches</h5>
                          <p className="text-sm text-gray-600">{diagnosis.aboutCondition.treatments}</p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <a
                          href={diagnosis.learnMoreUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-sm text-medical-primary hover:text-indigo-800"
                        >
                          Learn more from patient resources
                          <ExternalLink className="h-4 w-4 ml-1" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Information Gaps */}
        {informationGaps.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-yellow-900 mb-4 flex items-center">
              <Info className="h-5 w-5 mr-2" />
              Information That Could Improve This Analysis
            </h2>
            <div className="space-y-3">
              {informationGaps.map((gap, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      gap.importance === "high"
                        ? "bg-red-100 text-red-800"
                        : gap.importance === "medium"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-indigo-100 text-indigo-800"
                    }`}
                  >
                    {gap.importance.toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <div className="font-medium text-yellow-900 text-sm sm:text-base">{gap.item}</div>
                    <div className="text-sm text-yellow-700">{gap.impact}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Steps */}
        <div className={`rounded-xl p-4 sm:p-6 border-2 ${getUrgencyStyle(nextSteps.urgency)}`}>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2" />
            Recommended Next Steps
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">Schedule appointment with:</h3>
                <p className="text-gray-700 text-sm sm:text-base">{nextSteps.specialist}</p>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">Bring this information:</h3>
                <ul className="space-y-1">
                  {nextSteps.bringInfo.map((info, index) => (
                    <li key={index} className="flex items-start text-sm text-gray-700">
                      <CheckCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-green-600" />
                      <span>{info}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">Questions to ask:</h3>
                <ul className="space-y-1">
                  {nextSteps.questions.map((question, index) => (
                    <li key={index} className="flex items-start text-sm text-gray-700">
                      <span className="mr-2 text-indigo-700">?</span>
                      <span>{question}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">Monitor these symptoms:</h3>
                <ul className="space-y-1">
                  {nextSteps.monitorSymptoms.map((symptom, index) => (
                    <li key={index} className="flex items-start text-sm text-gray-700">
                      <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-orange-600" />
                      <span>{symptom}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Urgency Indicator */}
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 rounded-lg bg-white">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-gray-600" />
              <span className="font-medium text-gray-900 text-sm sm:text-base">
                {nextSteps.urgency === "emergent"
                  ? "Seek immediate medical care"
                  : nextSteps.urgency === "urgent"
                    ? "Seek medical attention soon"
                    : "Routine follow-up recommended"}
              </span>
            </div>
          </div>
        </div>

        {/* Additional Options */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 text-center">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Want more specific analysis?</h3>
          <p className="text-gray-600 mb-6 text-sm sm:text-base">Answer additional questions to refine your results</p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <MedicalButton className="flex items-center justify-center space-x-2 text-sm sm:text-base">
              <span>Answer additional questions</span>
            </MedicalButton>
            <MedicalButton
              variant="outline"
              className="flex items-center justify-center space-x-2 text-sm sm:text-base"
              onClick={() => router.push("/step-1")}
            >
              <span>Start new analysis</span>
            </MedicalButton>
          </div>
        </div>
      </div>
    </div>
  )
}
