"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { MedicalButton } from "./medical-button"
import { RefreshCw } from "lucide-react"

interface SymptomMappingSectionProps {
  chiefComplaint: string
  age: string
  sex: string
  duration?: string
  severity?: number
  patientHypothesis?: string
  medicalHistory?: any
  familyHistory?: string
  onMappingUpdate?: (mappedSymptoms: MappedSymptom[]) => void
}

interface MappedSymptom {
  originalPhrase: string
  medicalTerm: string
  severity?: string
  duration?: string
  bodyPart?: string
  umlsConcepts: UMLSConcept[]
  selectedConcept: UMLSConcept | null
  confidence: number
  confirmed: boolean
  mappingError: boolean
  feedbackStatus: "none" | "needs_adjustment"
  userCorrection?: string
  isEditingCorrection?: boolean
}

interface UMLSConcept {
  name: string
  cui: string
  semanticType?: string
}

export function SymptomMappingSection({
  chiefComplaint,
  age,
  sex,
  duration,
  severity,
  patientHypothesis,
  medicalHistory,
  familyHistory,
  onMappingUpdate,
}: SymptomMappingSectionProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [mappedSymptoms, setMappedSymptoms] = useState<MappedSymptom[]>([])
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState("")
  const [newSymptom, setNewSymptom] = useState("")
  const [feedbackData, setFeedbackData] = useState<{ [key: number]: { status: string; correction?: string } }>({})
  const [cumulativeSymptomText, setCumulativeSymptomText] = useState("")
  const router = useRouter()

  useEffect(() => {
    if (chiefComplaint && chiefComplaint.trim().length > 10) {
      setCumulativeSymptomText(chiefComplaint)
      processSymptoms()
    }
  }, [chiefComplaint, age, sex])

  useEffect(() => {
    if (onMappingUpdate && mappedSymptoms.length > 0) {
      onMappingUpdate(mappedSymptoms)
    }
  }, [mappedSymptoms, onMappingUpdate])

  const handleSuggestDifferentTerm = (index: number) => {
    const updatedSymptoms = [...mappedSymptoms]
    const currentStatus = updatedSymptoms[index].feedbackStatus

    if (currentStatus === "needs_adjustment") {
      updatedSymptoms[index].feedbackStatus = "none"
      updatedSymptoms[index].confirmed = false
      updatedSymptoms[index].isEditingCorrection = false
      updatedSymptoms[index].userCorrection = ""
    } else {
      updatedSymptoms[index].feedbackStatus = "needs_adjustment"
      updatedSymptoms[index].confirmed = false
      updatedSymptoms[index].isEditingCorrection = true
      updatedSymptoms[index].userCorrection = updatedSymptoms[index].userCorrection || ""
    }

    setMappedSymptoms(updatedSymptoms)
  }

  const handleCorrectionChange = (index: number, correction: string) => {
    const updatedSymptoms = [...mappedSymptoms]
    updatedSymptoms[index].userCorrection = correction
    setMappedSymptoms(updatedSymptoms)
  }

  const handleCorrectionSave = (index: number) => {
    const updatedSymptoms = [...mappedSymptoms]
    const correction = updatedSymptoms[index].userCorrection?.trim()

    if (correction) {
      updatedSymptoms[index].isEditingCorrection = false
      updatedSymptoms[index].confirmed = true

      const newFeedbackData = { ...feedbackData }
      newFeedbackData[index] = {
        status: "needs_adjustment",
        originalText: updatedSymptoms[index].originalPhrase,
        mappedTerm: updatedSymptoms[index].selectedConcept?.name || "",
        cui: updatedSymptoms[index].selectedConcept?.cui || "",
        userCorrection: correction,
      }
      setFeedbackData(newFeedbackData)
    }

    setMappedSymptoms(updatedSymptoms)
  }

  const handleCorrectionCancel = (index: number) => {
    const updatedSymptoms = [...mappedSymptoms]
    updatedSymptoms[index].isEditingCorrection = false
    updatedSymptoms[index].userCorrection = ""
    updatedSymptoms[index].feedbackStatus = "none"
    setMappedSymptoms(updatedSymptoms)
  }

  const processSymptoms = async () => {
    setIsLoading(true)
    setError(null)
    setCurrentStep("Parsing your symptom description...")

    try {
      setCumulativeSymptomText(chiefComplaint)

      const parseResponse = await fetch("/api/parse-symptoms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: chiefComplaint,
          patientAge: age,
          patientSex: sex,
        }),
      })

      if (!parseResponse.ok) {
        throw new Error(`Parsing failed: ${parseResponse.status}`)
      }

      const parseData = await parseResponse.json()

      if (parseData.error) {
        throw new Error(parseData.error)
      }

      // Validate that symptoms array exists
      if (!parseData.symptoms || !Array.isArray(parseData.symptoms)) {
        console.error("Invalid parse data:", parseData)
        throw new Error("No symptoms were extracted from your description. Please provide more detail.")
      }

      if (parseData.symptoms.length === 0) {
        throw new Error("No symptoms could be identified. Please describe your symptoms in more detail.")
      }

      setCurrentStep("Mapping symptoms to medical terminology...")

      const mappingPromises = parseData.symptoms.map(async (symptom: any, index: number) => {
        setCurrentStep(`Mapping symptom ${index + 1} of ${parseData.symptoms.length}...`)

        try {
          const searchTerm = symptom.medicalTerm || symptom.originalPhrase

          if (!searchTerm) {
            console.warn("Symptom missing both medicalTerm and originalPhrase:", symptom)
            return {
              originalPhrase: symptom.text || "Unknown symptom",
              medicalTerm: symptom.text || "Unknown symptom",
              severity: symptom.severity,
              duration: symptom.duration,
              bodyPart: symptom.bodyPart,
              umlsConcepts: [],
              selectedConcept: null,
              confidence: 0,
              confirmed: false,
              mappingError: true,
              feedbackStatus: "none",
              userCorrection: "",
              isEditingCorrection: false,
            }
          }

          const umlsResponse = await fetch("/api/umls-search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              searchTerm: searchTerm,
            }),
          })

          if (!umlsResponse.ok) {
            console.warn(`UMLS mapping failed for "${searchTerm}": ${umlsResponse.status}`)
            return {
              originalPhrase: symptom.originalPhrase || symptom.text,
              medicalTerm: symptom.medicalTerm || symptom.text,
              severity: symptom.severity,
              duration: symptom.duration,
              bodyPart: symptom.bodyPart,
              umlsConcepts: [],
              selectedConcept: null,
              confidence: 0,
              confirmed: false,
              mappingError: true,
              feedbackStatus: "none",
              userCorrection: "",
              isEditingCorrection: false,
            }
          }

          const umlsData = await umlsResponse.json()

          const newMappedSymptom: MappedSymptom = {
            originalPhrase: symptom.originalPhrase || symptom.text,
            medicalTerm: symptom.medicalTerm || symptom.text,
            severity: symptom.severity,
            duration: symptom.duration,
            bodyPart: symptom.bodyPart,
            umlsConcepts: umlsData.concepts || [],
            selectedConcept: umlsData.concepts?.[0] || null,
            confidence: umlsData.confidence || 0,
            confirmed: false,
            mappingError: umlsData.error ? true : false,
            feedbackStatus: "none",
            userCorrection: "",
            isEditingCorrection: false,
          }
          return newMappedSymptom
        } catch (error) {
          console.error(`Error mapping symptom "${symptom.medicalTerm || symptom.text}":`, error)
          return {
            originalPhrase: symptom.originalPhrase || symptom.text || "Unknown",
            medicalTerm: symptom.medicalTerm || symptom.text || "Unknown",
            severity: symptom.severity,
            duration: symptom.duration,
            bodyPart: symptom.bodyPart,
            umlsConcepts: [],
            selectedConcept: null,
            confidence: 0,
            confirmed: false,
            mappingError: true,
            feedbackStatus: "none",
            userCorrection: "",
            isEditingCorrection: false,
          }
        }
      })

      const results = await Promise.all(mappingPromises)
      setMappedSymptoms(results)
      setCurrentStep("")
      setIsLoading(false)
    } catch (error: any) {
      console.error("Symptom processing error:", error)
      setError(error.message || "Failed to process symptoms. Please try again.")
      setIsLoading(false)
      setCurrentStep("")
    }
  }

  const retryMapping = async (symptomIndex: number) => {
    const symptom = mappedSymptoms[symptomIndex]

    try {
      const umlsResponse = await fetch("/api/umls-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          searchTerm: symptom.medicalTerm,
        }),
      })

      if (umlsResponse.ok) {
        const umlsData = await umlsResponse.json()

        const updatedSymptoms = [...mappedSymptoms]
        updatedSymptoms[symptomIndex] = {
          ...symptom,
          umlsConcepts: umlsData.concepts || [],
          selectedConcept: umlsData.concepts?.[0] || null,
          confidence: umlsData.confidence || 0,
          mappingError: umlsData.error ? true : false,
        }

        setMappedSymptoms(updatedSymptoms)
      } else {
        console.error(`Retry mapping failed: ${umlsResponse.status}`)
      }
    } catch (error) {
      console.error("Retry mapping failed:", error)
    }
  }

  const analyzeNewSymptom = async () => {
    if (!newSymptom.trim()) return

    setIsLoading(true)
    setError(null)
    setCurrentStep("Re-analyzing all symptoms with new information...")

    window.scrollTo({ top: 0, behavior: "smooth" })

    try {
      const updatedCumulativeText = `${cumulativeSymptomText}. ${newSymptom.trim()}`
      setCumulativeSymptomText(updatedCumulativeText)

      const parseResponse = await fetch("/api/parse-symptoms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: updatedCumulativeText,
          patientAge: age,
          patientSex: sex,
        }),
      })

      if (!parseResponse.ok) {
        throw new Error(`Parsing failed: ${parseResponse.status}`)
      }

      const parseData = await parseResponse.json()

      if (parseData.error) {
        throw new Error(parseData.error)
      }

      if (!parseData.symptoms || !Array.isArray(parseData.symptoms)) {
        throw new Error("No symptoms were extracted. Please provide more detail.")
      }

      if (parseData.symptoms.length === 0) {
        throw new Error("No symptoms could be identified. Please describe your symptoms in more detail.")
      }

      setCurrentStep("Mapping all symptoms to medical terminology...")

      const mappingPromises = parseData.symptoms.map(async (symptom: any, index: number) => {
        setCurrentStep(`Mapping symptom ${index + 1} of ${parseData.symptoms.length}...`)

        try {
          const searchTerm = symptom.medicalTerm || symptom.originalPhrase

          if (!searchTerm) {
            return {
              originalPhrase: symptom.text || "Unknown symptom",
              medicalTerm: symptom.text || "Unknown symptom",
              severity: symptom.severity,
              duration: symptom.duration,
              bodyPart: symptom.bodyPart,
              umlsConcepts: [],
              selectedConcept: null,
              confidence: 0,
              confirmed: false,
              mappingError: true,
              feedbackStatus: "none",
              userCorrection: "",
              isEditingCorrection: false,
            }
          }

          const umlsResponse = await fetch("/api/umls-search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              searchTerm: searchTerm,
            }),
          })

          if (!umlsResponse.ok) {
            console.warn(`UMLS mapping failed for "${searchTerm}": ${umlsResponse.status}`)
            return {
              originalPhrase: symptom.originalPhrase || symptom.text,
              medicalTerm: symptom.medicalTerm || symptom.text,
              severity: symptom.severity,
              duration: symptom.duration,
              bodyPart: symptom.bodyPart,
              umlsConcepts: [],
              selectedConcept: null,
              confidence: 0,
              confirmed: false,
              mappingError: true,
              feedbackStatus: "none",
              userCorrection: "",
              isEditingCorrection: false,
            }
          }

          const umlsData = await umlsResponse.json()

          const newMappedSymptom: MappedSymptom = {
            originalPhrase: symptom.originalPhrase || symptom.text,
            medicalTerm: symptom.medicalTerm || symptom.text,
            severity: symptom.severity,
            duration: symptom.duration,
            bodyPart: symptom.bodyPart,
            umlsConcepts: umlsData.concepts || [],
            selectedConcept: umlsData.concepts?.[0] || null,
            confidence: umlsData.confidence || 0,
            confirmed: false,
            mappingError: umlsData.error ? true : false,
            feedbackStatus: "none",
            userCorrection: "",
            isEditingCorrection: false,
          }
          return newMappedSymptom
        } catch (error) {
          console.error(`Error mapping symptom "${symptom.medicalTerm || symptom.text}":`, error)
          return {
            originalPhrase: symptom.originalPhrase || symptom.text || "Unknown",
            medicalTerm: symptom.medicalTerm || symptom.text || "Unknown",
            severity: symptom.severity,
            duration: symptom.duration,
            bodyPart: symptom.bodyPart,
            umlsConcepts: [],
            selectedConcept: null,
            confidence: 0,
            confirmed: false,
            mappingError: true,
            feedbackStatus: "none",
            userCorrection: "",
            isEditingCorrection: false,
          }
        }
      })

      const results = await Promise.all(mappingPromises)

      setMappedSymptoms(results)
      setNewSymptom("")
      setCurrentStep("")
      setIsLoading(false)
    } catch (error: any) {
      console.error("Comprehensive symptom analysis failed:", error)
      setError(error.message || "Failed to analyze symptoms. Please try again.")
      setIsLoading(false)
      setCurrentStep("")
    }
  }

  if (!chiefComplaint || chiefComplaint.trim().length <= 10) {
    return (
      <div className="mb-8 p-6 bg-yellow-50 border border-yellow-200 rounded-xl">
        <div className="text-yellow-800">
          Please provide a more detailed description of your symptoms in the previous step to enable automatic analysis.
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <div>
            <div className="font-medium text-blue-900">Processing your symptoms...</div>
            <div className="text-sm text-blue-700">{currentStep}</div>
          </div>
        </div>
        <div className="mt-4 text-xs text-blue-600">
          This involves real-time analysis and medical term mapping - please wait...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-xl">
        <div className="text-red-800 font-medium">Symptom Analysis Failed</div>
        <div className="text-red-600 text-sm mt-1">{error}</div>
        <div className="mt-4 space-x-3">
          <MedicalButton onClick={processSymptoms} className="bg-red-600 hover:bg-red-700" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </MedicalButton>
          <MedicalButton variant="outline" onClick={() => setError(null)} size="sm">
            Continue Without Analysis
          </MedicalButton>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Symptoms identified from your description:</h3>

      <div className="space-y-4">
        {mappedSymptoms.map((symptom, index) => (
          <div key={index} className="border border-blue-200 rounded-xl p-4 bg-blue-50">
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <div className="text-sm text-gray-600">You described:</div>
                <div className="font-medium text-gray-900">{symptom.originalPhrase}</div>

                {symptom.mappingError ? (
                  <div className="mt-2 p-2 bg-yellow-100 rounded-lg">
                    <div className="text-sm text-yellow-800">Could not find medical term mapping</div>
                    <button
                      onClick={() => retryMapping(index)}
                      className="text-xs text-yellow-700 underline mt-1 hover:text-yellow-900"
                    >
                      Try mapping again
                    </button>
                  </div>
                ) : symptom.selectedConcept ? (
                  <div className="mt-2">
                    <div className="text-sm text-blue-600">Medical term:</div>
                    <div className="font-medium text-blue-900">{symptom.selectedConcept.name}</div>
                    <div className="text-xs text-gray-500">
                      CUI: {symptom.selectedConcept.cui}
                      {symptom.selectedConcept.semanticType && ` | Type: ${symptom.selectedConcept.semanticType}`}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-gray-600">No medical term mapping available</div>
                )}

                {symptom.feedbackStatus === "needs_adjustment" &&
                  symptom.userCorrection &&
                  !symptom.isEditingCorrection && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                      <div className="text-sm text-green-700">Your suggested term:</div>
                      <div className="font-medium text-green-900">{symptom.userCorrection}</div>
                    </div>
                  )}

                {symptom.isEditingCorrection && (
                  <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="e.g., migraine headache, chronic fatigue..."
                        value={symptom.userCorrection || ""}
                        onChange={(e) => handleCorrectionChange(index, e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleCorrectionSave(index)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-medical-primary focus:border-medical-primary"
                        autoFocus
                      />
                      <button
                        onClick={() => handleCorrectionSave(index)}
                        disabled={!symptom.userCorrection?.trim()}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => handleCorrectionCancel(index)}
                        className="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="ml-4">
                {symptom.confidence > 0.8 ? (
                  <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">High confidence</span>
                ) : symptom.confidence > 0.5 ? (
                  <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                    Medium confidence
                  </span>
                ) : symptom.confidence > 0 ? (
                  <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">Low confidence</span>
                ) : (
                  <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">No mapping</span>
                )}
              </div>
            </div>

            {!symptom.mappingError && symptom.selectedConcept && symptom.confidence <= 0.8 && (
              <div className="flex justify-start">
                <button
                  onClick={() => handleSuggestDifferentTerm(index)}
                  className={`text-sm px-3 py-1 rounded-lg transition-all duration-200 ${
                    symptom.feedbackStatus === "needs_adjustment"
                      ? "bg-yellow-600 text-white"
                      : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                  }`}
                >
                  {symptom.feedbackStatus === "needs_adjustment" ? "Editing..." : "Suggest different term"}
                </button>
              </div>
            )}

            {(symptom.mappingError || !symptom.selectedConcept) && (
              <div className="flex justify-start">
                <button
                  onClick={() => handleSuggestDifferentTerm(index)}
                  className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  Add more detail
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {Object.keys(feedbackData).length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
          <h4 className="font-medium text-gray-900 mb-3">Your suggestions:</h4>
          <div className="space-y-2 text-sm">
            {Object.entries(feedbackData).map(([index, feedback]) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-gray-700">"{feedback.originalText}"</span>
                <span className="text-blue-700">→ {feedback.userCorrection}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 p-4 border border-gray-200 rounded-xl">
        <h4 className="font-medium text-gray-900 mb-3">Add symptoms or details to re-analyze everything:</h4>
        <div className="flex space-x-3">
          <input
            type="text"
            placeholder="e.g., joint pain, headaches, difficulty sleeping..."
            value={newSymptom}
            onChange={(e) => setNewSymptom(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && analyzeNewSymptom()}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-medical-primary focus:border-medical-primary"
          />
          <MedicalButton onClick={analyzeNewSymptom}>Analyze</MedicalButton>
        </div>
      </div>
    </div>
  )
}
