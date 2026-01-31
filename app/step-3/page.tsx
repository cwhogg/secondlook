"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { MedicationEntry } from "@/components/medication-entry"
import { MedicalCareSelector } from "@/components/medical-care-selector"
import { TestingHistorySelector } from "@/components/testing-history-selector"
import { ReviewSummary } from "@/components/review-summary"
import { ConsentSection } from "@/components/consent-section"
import {
  ArrowLeft,
  Plus,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  Pill,
  Stethoscope,
  FileText,
  Shield,
} from "lucide-react"

interface Medication {
  id: string
  name: string
  type: "prescription" | "otc" | "supplement"
  submitted?: boolean
  parsed?: {
    standardizedName: string
    genericName?: string
    brandNames?: string[]
    ndcCode?: string
    drugClass?: string
    confidence: string
    notes?: string
  }
}

interface Step1Data {
  age: string
  biologicalSex: string
  primaryConcern: string
  patientHypothesis: string
  noIdea: boolean
  bodyRegions: string[]
  severity: number
}

interface Step2Data {
  mainSymptomStart: string
  symptomPattern: string
  triggers: string[]
  associatedSymptoms: string[]
  familyHistory: string[]
  familyHistoryDetails: string
}

interface Step3FormData {
  medicationPath: "none" | "few" | "many"
  medications: Medication[]
  medicationsBulk: string
  medicalCare: string
  specialistType?: string
  erVisits?: number
  testingHistory: string[]
  hypothesisAddition: string
  consentAnalysis: boolean
  consentNotSubstitute: boolean
  consentAccurate: boolean
}

export default function Step3() {
  const router = useRouter()

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Get data from previous steps
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null)
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null)
  const [mappedSymptoms, setMappedSymptoms] = useState<any[]>([])

  const [formData, setFormData] = useState<Step3FormData>({
    medicationPath: "none",
    medications: [],
    medicationsBulk: "",
    medicalCare: "",
    testingHistory: [],
    hypothesisAddition: "",
    consentAnalysis: false,
    consentNotSubstitute: false,
    consentAccurate: false,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaved, setAutoSaved] = useState(false)
  const [lastSaveTime, setLastSaveTime] = useState<number>(0)
  const [showReview, setShowReview] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [showValidationSummary, setShowValidationSummary] = useState(false)

  const currentStep = 3
  const totalSteps = 3
  const breadcrumbItems = [{ label: "Home" }, { label: "Assessment" }, { label: "Medical Context", current: true }]

  // Load data from previous steps
  useEffect(() => {
    // Load step 1 data
    const step1DataString = localStorage.getItem("step1Data")
    if (step1DataString) {
      try {
        const parsed = JSON.parse(step1DataString)
        setStep1Data(parsed)
      } catch (error) {
        console.error("Error loading step 1 data:", error)
        router.push("/step-1")
        return
      }
    } else {
      router.push("/step-1")
      return
    }

    // Load step 2 data
    const step2DataString = localStorage.getItem("step2Data")
    if (step2DataString) {
      try {
        const parsed = JSON.parse(step2DataString)
        setStep2Data(parsed)
      } catch (error) {
        console.error("Error loading step 2 data:", error)
        router.push("/step-2")
        return
      }
    } else {
      router.push("/step-2")
      return
    }

    // Load saved step 3 data if exists
    const savedData = localStorage.getItem("step3Data")
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        setFormData(parsed)
      } catch (error) {
        console.error("Error loading saved step 3 data:", error)
      }
    }

    // Load mapped symptoms if available
    const mappedSymptomsData = localStorage.getItem("mappedSymptoms")
    if (mappedSymptomsData) {
      try {
        const parsed = JSON.parse(mappedSymptomsData)
        setMappedSymptoms(parsed)
      } catch (error) {
        console.error("Error loading mapped symptoms:", error)
      }
    }
  }, [router])

  // Improved auto-save functionality with less frequent notifications
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasContent =
        formData.medicationPath !== "none" ||
        formData.medicalCare ||
        formData.hypothesisAddition.trim() ||
        formData.testingHistory.length > 0

      if (hasContent) {
        const now = Date.now()
        // Only show notification if it's been at least 10 seconds since last save
        const shouldShowNotification = now - lastSaveTime > 10000

        localStorage.setItem("step3Data", JSON.stringify(formData))

        if (shouldShowNotification) {
          setAutoSaved(true)
          setLastSaveTime(now)
          setTimeout(() => setAutoSaved(false), 3000)
        }
      }
    }, 2000) // Increased delay to 2 seconds

    return () => clearTimeout(timer)
  }, [formData, lastSaveTime])

  const updateFormData = (field: keyof Step3FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
    // Hide validation summary when user starts fixing issues
    if (showValidationSummary) {
      setShowValidationSummary(false)
    }
  }

  const addMedication = () => {
    if (formData.medications.length < 10) {
      const newMedication: Medication = {
        id: Date.now().toString(),
        name: "",
        type: "prescription",
        submitted: false,
      }
      updateFormData("medications", [...formData.medications, newMedication])
    }
  }

  const updateMedication = (id: string, field: keyof Medication, value: string) => {
    const updated = formData.medications.map((med) => (med.id === id ? { ...med, [field]: value } : med))
    updateFormData("medications", updated)
  }

  const removeMedication = (id: string) => {
    const filtered = formData.medications.filter((med) => med.id !== id)
    updateFormData("medications", filtered)
  }

  const submitMedication = (id: string) => {
    const updated = formData.medications.map((med) => (med.id === id ? { ...med, submitted: true } : med))
    updateFormData("medications", updated)
  }

  const parseAllMedications = async () => {
    const submittedMedications = formData.medications.filter((med) => med.submitted && med.name.trim())

    if (submittedMedications.length === 0) {
      alert("Please submit at least one medication first.")
      return
    }

    setIsParsing(true)

    try {
      const response = await fetch("/api/parse-medications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          medications: submittedMedications.map((med) => ({
            name: med.name,
            type: med.type,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(`Parsing failed: ${response.status}`)
      }

      const parseData = await response.json()

      if (parseData.error) {
        throw new Error(parseData.error)
      }

      // Update medications with parsed data
      const updatedMedications = formData.medications.map((med, index) => {
        if (med.submitted && parseData.medications[index]) {
          return {
            ...med,
            parsed: parseData.medications[index],
          }
        }
        return med
      })

      updateFormData("medications", updatedMedications)
    } catch (error: any) {
      console.error("Medication parsing error:", error)
      alert(`Failed to parse medications: ${error.message}`)
    } finally {
      setIsParsing(false)
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.medicalCare) {
      newErrors.medicalCare = "Please select your medical care history"
    }

    if (!formData.consentAnalysis) {
      newErrors.consentAnalysis = "Please consent to AI analysis"
    }

    if (!formData.consentNotSubstitute) {
      newErrors.consentNotSubstitute = "Please acknowledge this is not a substitute for medical care"
    }

    if (!formData.consentAccurate) {
      newErrors.consentAccurate = "Please confirm the accuracy of your information"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const getValidationSummary = () => {
    const missing = []

    if (!formData.medicalCare) {
      missing.push("Medical care history")
    }

    if (!formData.consentAnalysis) {
      missing.push("Consent to AI analysis")
    }

    if (!formData.consentNotSubstitute) {
      missing.push("Acknowledgment that this is not medical care")
    }

    if (!formData.consentAccurate) {
      missing.push("Confirmation of information accuracy")
    }

    return missing
  }

  const handleStartAnalysis = async () => {
    const isValid = validateForm()

    if (!isValid) {
      setShowValidationSummary(true)
      // Scroll to the validation summary
      setTimeout(() => {
        const element = document.getElementById("validation-summary")
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }, 100)
      return
    }

    localStorage.setItem("step3Data", JSON.stringify(formData))

    // Save all data for the analysis
    const completeData = {
      step1: step1Data,
      step2: step2Data,
      step3: formData,
      mappedSymptoms,
    }
    localStorage.setItem("analysisData", JSON.stringify(completeData))

    // Navigate to analysis page
    router.push("/analysis")
  }

  const handleSaveAndContinueLater = () => {
    localStorage.setItem("step3Data", JSON.stringify(formData))
    setAutoSaved(true)
    setTimeout(() => setAutoSaved(false), 3000)
  }

  const handleBack = () => {
    localStorage.setItem("step3Data", JSON.stringify(formData))
    router.push("/step-2")
  }

  const isFormValid =
    formData.medicalCare && formData.consentAnalysis && formData.consentNotSubstitute && formData.consentAccurate

  const hasSubmittedMedications = formData.medications.some((med) => med.submitted)
  const allMedicationsHaveParsedData = formData.medications.filter((med) => med.submitted).every((med) => med.parsed)

  if (!step1Data || !step2Data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const missingItems = getValidationSummary()

  return (
    <Layout currentStep={currentStep} totalSteps={totalSteps} breadcrumbItems={breadcrumbItems}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 py-4 sm:py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Fixed Auto-save notification */}
          <div
            className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${
              autoSaved ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
            }`}
          >
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl shadow-lg flex items-center space-x-2">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Progress saved</span>
            </div>
          </div>

          {/* Validation Summary */}
          {showValidationSummary && missingItems.length > 0 && (
            <div
              id="validation-summary"
              className="mb-6 sm:mb-8 bg-red-50 border border-red-200 rounded-xl sm:rounded-2xl p-4 sm:p-6"
            >
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 mb-2 sm:mb-3 text-base sm:text-lg">
                    Please complete the following:
                  </h3>
                  <ul className="space-y-1.5 sm:space-y-2">
                    {missingItems.map((item, index) => (
                      <li key={index} className="text-red-800 flex items-center space-x-2 text-sm sm:text-base">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full flex-shrink-0"></div>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Premium Header Section */}
          <div className="text-center mb-8 sm:mb-12 lg:mb-16">
            <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-purple-100 to-blue-100 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-600" />
              <span className="text-xs sm:text-sm font-medium text-purple-700">Step 3 of 3</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6 leading-tight px-2">
              Almost done - just a few{" "}
              <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                medical details
              </span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed px-4">
              This helps us provide more accurate analysis
            </p>
          </div>

          {/* Main Form Container */}
          <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
            {/* Medications Section */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg border border-gray-100 p-5 sm:p-8 md:p-12">
              <div className="mb-6 sm:mb-8">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-1.5 sm:p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg sm:rounded-xl flex-shrink-0">
                    <Pill className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 leading-tight mb-2">
                      Are you taking any medications or supplements for these symptoms?
                    </h2>
                    <div className="flex items-center space-x-1.5 sm:space-x-2 text-emerald-600">
                      <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium">Optional</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Medication Path Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
                <button
                  onClick={() => updateFormData("medicationPath", "none")}
                  className={`p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl border-2 text-center transition-all duration-300 hover:scale-105 active:scale-95 touch-target ${
                    formData.medicationPath === "none"
                      ? "border-purple-500 bg-gradient-to-br from-purple-50 to-blue-50 shadow-lg"
                      : "border-gray-200 bg-white hover:border-purple-300 hover:shadow-md"
                  }`}
                >
                  <div className="font-semibold text-base sm:text-lg mb-1.5 sm:mb-2 text-gray-900">None</div>
                  <div className="text-xs sm:text-sm text-gray-600">Not taking anything</div>
                </button>

                <button
                  onClick={() => updateFormData("medicationPath", "few")}
                  className={`p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl border-2 text-center transition-all duration-300 hover:scale-105 active:scale-95 touch-target ${
                    formData.medicationPath === "few"
                      ? "border-purple-500 bg-gradient-to-br from-purple-50 to-blue-50 shadow-lg"
                      : "border-gray-200 bg-white hover:border-purple-300 hover:shadow-md"
                  }`}
                >
                  <div className="font-semibold text-base sm:text-lg mb-1.5 sm:mb-2 text-gray-900">A few</div>
                  <div className="text-xs sm:text-sm text-gray-600">1-10 medications</div>
                </button>

                <button
                  onClick={() => updateFormData("medicationPath", "many")}
                  className={`p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl border-2 text-center transition-all duration-300 hover:scale-105 active:scale-95 touch-target ${
                    formData.medicationPath === "many"
                      ? "border-purple-500 bg-gradient-to-br from-purple-50 to-blue-50 shadow-lg"
                      : "border-gray-200 bg-white hover:border-purple-300 hover:shadow-md"
                  }`}
                >
                  <div className="font-semibold text-base sm:text-lg mb-1.5 sm:mb-2 text-gray-900">Many</div>
                  <div className="text-xs sm:text-sm text-gray-600">Easier to list in bulk</div>
                </button>
              </div>

              {/* Few Medications Path */}
              {formData.medicationPath === "few" && (
                <div className="space-y-4">
                  {formData.medications.map((medication) => (
                    <MedicationEntry
                      key={medication.id}
                      medication={medication}
                      onUpdate={updateMedication}
                      onRemove={removeMedication}
                      onSubmit={submitMedication}
                    />
                  ))}

                  {formData.medications.length === 0 && (
                    <div className="text-center py-8 sm:py-12 text-gray-500">
                      <Pill className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-gray-300" />
                      <p className="text-sm sm:text-base">No medications added yet</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-4">
                    {formData.medications.length < 10 && (
                      <button
                        onClick={addMedication}
                        className="flex items-center justify-center space-x-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 border-purple-300 text-purple-700 font-semibold hover:border-purple-500 hover:bg-purple-50 transition-all duration-200 text-sm sm:text-base touch-target"
                      >
                        <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                        <span>Add another</span>
                      </button>
                    )}

                    {hasSubmittedMedications && (
                      <button
                        onClick={parseAllMedications}
                        disabled={isParsing || allMedicationsHaveParsedData}
                        className={`flex items-center justify-center space-x-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-semibold transition-all duration-200 sm:ml-auto text-sm sm:text-base touch-target ${
                          isParsing || allMedicationsHaveParsedData
                            ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                            : "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-lg"
                        }`}
                      >
                        {isParsing ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            <span>Parsing...</span>
                          </>
                        ) : allMedicationsHaveParsedData ? (
                          <>
                            <CheckCircle className="h-4 w-4" />
                            <span>All parsed</span>
                          </>
                        ) : (
                          <span>That's all</span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Many Medications Path */}
              {formData.medicationPath === "many" && (
                <div className="space-y-3">
                  <textarea
                    placeholder="List your medications, one per line. Include dosage if known.&#10;&#10;Example:&#10;Metformin 500mg twice daily&#10;Vitamin D3 1000 IU&#10;Lisinopril 10mg once daily"
                    value={formData.medicationsBulk}
                    onChange={(e) => updateFormData("medicationsBulk", e.target.value)}
                    maxLength={500}
                    rows={8}
                    className="w-full px-3 sm:px-4 py-3 sm:py-4 border border-gray-200 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base md:text-lg resize-none transition-all duration-200"
                  />
                  <div className="flex justify-between items-center">
                    <p className="text-xs sm:text-sm md:text-base text-gray-600">List each on a separate line</p>
                    <span className="text-xs sm:text-sm text-gray-500">{formData.medicationsBulk.length}/500</span>
                  </div>
                </div>
              )}
            </div>

            {/* Medical Care History Section */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg border border-gray-100 p-5 sm:p-8 md:p-12">
              <div className="mb-6 sm:mb-8">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-1.5 sm:p-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg sm:rounded-xl flex-shrink-0">
                    <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 leading-tight mb-2">
                      Have you seen doctors about these symptoms?
                    </h2>
                    {errors.medicalCare && <p className="text-red-600 text-xs sm:text-sm mt-1">{errors.medicalCare}</p>}
                    <div
                      className={`flex items-center space-x-1.5 sm:space-x-2 mt-2 ${formData.medicalCare ? "text-emerald-600" : "text-amber-600"}`}
                    >
                      {formData.medicalCare ? (
                        <>
                          <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-medium">Complete</span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-medium">Required</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <MedicalCareSelector
                value={formData.medicalCare}
                onChange={(value) => updateFormData("medicalCare", value)}
                specialistType={formData.specialistType}
                onSpecialistTypeChange={(value) => updateFormData("specialistType", value)}
                erVisits={formData.erVisits}
                onErVisitsChange={(value) => updateFormData("erVisits", value)}
              />
            </div>

            {/* Testing History Section */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg border border-gray-100 p-5 sm:p-8 md:p-12">
              <div className="mb-6 sm:mb-8">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-1.5 sm:p-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg sm:rounded-xl flex-shrink-0">
                    <FileText className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 leading-tight mb-2">
                      Have you had tests or scans for these symptoms?
                    </h2>
                    <div className="flex items-center space-x-1.5 sm:space-x-2 text-emerald-600">
                      <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium">Optional</span>
                    </div>
                  </div>
                </div>
              </div>

              <TestingHistorySelector
                value={formData.testingHistory}
                onChange={(value) => updateFormData("testingHistory", value)}
              />
            </div>

            {/* Hypothesis Review Section */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg border border-gray-100 p-5 sm:p-8 md:p-12">
              <div className="flex items-center justify-between mb-6 sm:mb-8">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Your initial thoughts</h2>
                <div className="flex items-center space-x-1.5 sm:space-x-2 text-emerald-600">
                  <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="text-xs sm:text-sm font-medium">Optional</span>
                </div>
              </div>

              {step1Data.patientHypothesis && !step1Data.noIdea ? (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="text-xs sm:text-sm text-blue-600 mb-2 font-medium">Earlier you mentioned:</div>
                  <div className="text-blue-900 font-semibold mb-4 sm:mb-6 text-base sm:text-lg">
                    "{step1Data.patientHypothesis}"
                  </div>

                  <div className="space-y-3">
                    <label className="block text-base sm:text-lg font-semibold text-gray-900">
                      Anything else you want to add?
                    </label>
                    <textarea
                      placeholder="Any additional thoughts or details..."
                      value={formData.hypothesisAddition}
                      onChange={(e) => updateFormData("hypothesisAddition", e.target.value)}
                      maxLength={100}
                      rows={3}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base resize-none transition-all duration-200"
                    />
                    <div className="text-right">
                      <span className="text-xs sm:text-sm text-gray-500">{formData.hypothesisAddition.length}/100</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="text-gray-600 text-sm sm:text-base md:text-lg">
                    No initial guesses provided as to cause or disease.
                  </div>
                </div>
              )}
            </div>

            {/* Review Section */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg border border-gray-100 p-5 sm:p-8 md:p-12">
              <div className="flex items-center justify-between mb-6 sm:mb-8">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Review your information</h2>
                <button
                  onClick={() => setShowReview(!showReview)}
                  className="flex items-center space-x-1.5 sm:space-x-2 text-purple-600 hover:text-purple-800 transition-colors font-medium text-sm sm:text-base touch-target"
                >
                  <span>{showReview ? "Hide" : "Show"}</span>
                  {showReview ? (
                    <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : (
                    <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" />
                  )}
                </button>
              </div>

              {showReview && (
                <div className="mb-6 sm:mb-8">
                  <ReviewSummary
                    step1Data={step1Data}
                    step2Data={step2Data}
                    step3Data={formData}
                    mappedSymptoms={mappedSymptoms}
                  />
                </div>
              )}

              <div className="text-center">
                <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-800 px-4 sm:px-6 py-2 sm:py-3 rounded-full border border-emerald-200">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                  <span className="font-semibold text-sm sm:text-base">Information Complete</span>
                </div>
              </div>
            </div>

            {/* Consent & Analysis Section */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg border border-gray-100 p-5 sm:p-8 md:p-12">
              <div className="mb-6 sm:mb-8">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-1.5 sm:p-2 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg sm:rounded-xl flex-shrink-0">
                    <Shield className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 leading-tight mb-2">
                      Consent & Analysis
                    </h2>
                    <div
                      className={`flex items-center space-x-1.5 sm:space-x-2 ${isFormValid ? "text-emerald-600" : "text-amber-600"}`}
                    >
                      {isFormValid ? (
                        <>
                          <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-medium">Ready</span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-medium">Required</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <ConsentSection
                consentAnalysis={formData.consentAnalysis}
                onConsentAnalysisChange={(value) => updateFormData("consentAnalysis", value)}
                consentNotSubstitute={formData.consentNotSubstitute}
                onConsentNotSubstituteChange={(value) => updateFormData("consentNotSubstitute", value)}
                consentAccurate={formData.consentAccurate}
                onConsentAccurateChange={(value) => updateFormData("consentAccurate", value)}
                errors={errors}
              />

              {/* Analysis Initiation */}
              <div className="space-y-4 sm:space-y-6 mt-6 sm:mt-8">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <button
                    onClick={handleStartAnalysis}
                    disabled={!isFormValid || isAnalyzing}
                    className={`group relative px-6 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-semibold text-base sm:text-lg transition-all duration-300 flex-1 min-h-[52px] sm:min-h-[60px] touch-target ${
                      isFormValid && !isAnalyzing
                        ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                        : "bg-gray-200 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    {isAnalyzing ? (
                      <span className="flex items-center justify-center space-x-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span className="text-sm sm:text-base">Preparing...</span>
                      </span>
                    ) : (
                      <span>Start My Analysis</span>
                    )}
                  </button>

                  <button
                    onClick={handleSaveAndContinueLater}
                    disabled={isAnalyzing}
                    className="px-4 sm:px-6 py-3 rounded-xl sm:rounded-2xl border-2 border-gray-300 text-gray-700 font-semibold hover:border-purple-300 hover:text-purple-700 transition-all duration-200 flex-1 sm:flex-none text-sm sm:text-base touch-target"
                  >
                    Save & Continue Later
                  </button>
                </div>

                <div className="text-center text-gray-600">
                  <p className="text-sm sm:text-base md:text-lg">Analysis typically takes 2-3 minutes</p>
                </div>

                {/* What happens next */}
                <details className="group">
                  <summary className="cursor-pointer text-base sm:text-lg font-semibold text-purple-600 hover:text-purple-800 transition-colors touch-target">
                    What happens next?
                  </summary>
                  <div className="mt-3 sm:mt-4 text-sm sm:text-base text-gray-600 space-y-1.5 sm:space-y-2 pl-4">
                    <p>• AI analysis of your symptoms and medical context</p>
                    <p>• Identification of potential conditions to discuss with doctors</p>
                    <p>• Personalized recommendations for next steps</p>
                    <p>• Detailed report you can share with healthcare providers</p>
                  </div>
                </details>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 sm:pt-8">
              <button
                onClick={handleBack}
                disabled={isAnalyzing}
                className="group flex items-center space-x-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 border-gray-300 text-gray-700 font-semibold hover:border-purple-300 hover:text-purple-700 transition-all duration-200 w-full sm:w-auto justify-center text-sm sm:text-base touch-target"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 group-hover:-translate-x-1 transition-transform" />
                <span>Back to previous step</span>
              </button>

              <div className="text-sm sm:text-base text-gray-500 font-medium">Step 3 of 3 • Ready for Analysis</div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
