"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { SymptomMappingSection, type SymptomPatternData } from "@/components/symptom-mapping-section"
import { TimelineSelector } from "@/components/timeline-selector"
import { SymptomPatternSelector } from "@/components/symptom-pattern-selector"
import { TriggerSelector } from "@/components/trigger-selector"
import { AssociatedSymptoms } from "@/components/associated-symptoms"
import { FamilyHistorySelector } from "@/components/family-history-selector"
import { ArrowRight, ArrowLeft, CheckCircle, Sparkles, Brain } from "lucide-react"

interface Step1Data {
  age: string
  biologicalSex: string
  primaryConcern: string
  patientHypothesis: string
  noIdea: boolean
  bodyRegions: string[]
  severity: number
}

interface Step2FormData {
  mainSymptomStart: string
  symptomPattern: string
  triggers: string[]
  associatedSymptoms: string[]
  familyHistory: string[]
  familyHistoryDetails: string
}

export default function Step2() {
  const router = useRouter()

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Get data from step 1
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null)
  const [bodyRegions, setBodyRegions] = useState<string[]>([])

  const [formData, setFormData] = useState<Step2FormData>({
    mainSymptomStart: "",
    symptomPattern: "",
    triggers: [],
    associatedSymptoms: [],
    familyHistory: [],
    familyHistoryDetails: "",
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaved, setAutoSaved] = useState(false)
  const [actualMappedSymptoms, setActualMappedSymptoms] = useState<any[]>([])

  const currentStep = 2
  const totalSteps = 3
  const breadcrumbItems = [{ label: "Home" }, { label: "Assessment" }, { label: "Symptom Patterns", current: true }]

  // Load data from previous step and saved data
  useEffect(() => {
    // Load step 1 data to get body regions and other info
    const step1DataString = localStorage.getItem("step1Data")
    if (step1DataString) {
      try {
        const parsed = JSON.parse(step1DataString)
        setStep1Data(parsed)
        setBodyRegions(parsed.bodyRegions || [])
      } catch (error) {
        console.error("Error loading step 1 data:", error)
        // Redirect back to step 1 if no data
        router.push("/step-1")
        return
      }
    } else {
      // No step 1 data, redirect back
      router.push("/step-1")
      return
    }

    // Load saved step 2 data if exists
    const savedData = localStorage.getItem("step2Data")
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        setFormData(parsed)
      } catch (error) {
        console.error("Error loading saved step 2 data:", error)
      }
    }
  }, [router])

  // Auto-save functionality
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.mainSymptomStart) {
        localStorage.setItem("step2Data", JSON.stringify(formData))
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 2000)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [formData])

  const updateFormData = (field: keyof Step2FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.mainSymptomStart) newErrors.mainSymptomStart = "Please select when your main symptom started"
    if (!formData.symptomPattern) newErrors.symptomPattern = "Please describe your symptom pattern"

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleContinue = () => {
    if (validateForm()) {
      localStorage.setItem("step2Data", JSON.stringify(formData))
      // Navigate to step 3
      router.push("/step-3")
    }
  }

  const handleBack = () => {
    // Save current data before going back
    localStorage.setItem("step2Data", JSON.stringify(formData))
    router.push("/step-1")
  }

  const isFormValid = formData.mainSymptomStart && formData.symptomPattern

  if (!step1Data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const handleSymptomMappingUpdate = (mappedSymptoms: any[]) => {
    setActualMappedSymptoms(mappedSymptoms)
    localStorage.setItem("mappedSymptoms", JSON.stringify(mappedSymptoms))
  }

  const handlePatternUpdate = (patterns: SymptomPatternData | null) => {
    if (patterns) {
      localStorage.setItem("symptomPatterns", JSON.stringify(patterns))
    } else {
      localStorage.removeItem("symptomPatterns")
    }
  }

  return (
    <Layout currentStep={currentStep} totalSteps={totalSteps} breadcrumbItems={breadcrumbItems}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Fixed Auto-save notification */}
          <div
            className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${
              autoSaved ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
            }`}
          >
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 rounded-2xl shadow-lg flex items-center space-x-2">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Your information is automatically saved</span>
            </div>
          </div>

          {/* Premium Header Section */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-purple-100 to-blue-100 px-4 py-2 rounded-full mb-6">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700">Step 2 of 3</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              We've analyzed your{" "}
              <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                description
              </span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Here are the symptoms we identified - let's add more details
            </p>
          </div>

          {/* Main Form Container */}
          <div className="max-w-3xl mx-auto space-y-8">
            {/* AI Analysis Section */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 md:p-12">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">AI Symptom Analysis</h2>
              </div>
              <SymptomMappingSection
                chiefComplaint={step1Data.primaryConcern}
                age={step1Data.age}
                sex={step1Data.biologicalSex}
                duration={formData.mainSymptomStart}
                severity={step1Data.severity}
                patientHypothesis={step1Data.patientHypothesis}
                medicalHistory={null}
                familyHistory={formData.familyHistoryDetails}
                onMappingUpdate={handleSymptomMappingUpdate}
                onPatternUpdate={handlePatternUpdate}
              />
            </div>

            {/* Summary Card */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-3xl border border-blue-200 p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Your information so far:</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-base">
                <div>
                  <span className="font-semibold text-gray-700">Age:</span> {step1Data.age}
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Sex:</span> {step1Data.biologicalSex}
                </div>
                <div className="sm:col-span-2">
                  <span className="font-semibold text-gray-700">Main concern:</span>
                  <p className="text-gray-600 mt-1 leading-relaxed">{step1Data.primaryConcern}</p>

                  {actualMappedSymptoms.length > 0 && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-blue-200">
                      <span className="font-semibold text-gray-700 text-sm">Medical terms identified:</span>
                      <div className="mt-1">
                        <span className="text-sm text-purple-700 font-medium">
                          {actualMappedSymptoms
                            .filter((symptom) => symptom.selectedConcept && !symptom.mappingError)
                            .map((symptom) => symptom.userCorrection || symptom.selectedConcept?.name)
                            .join(", ")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {step1Data.patientHypothesis && !step1Data.noIdea && (
                  <div className="sm:col-span-2">
                    <span className="font-semibold text-gray-700">Your thoughts:</span>
                    <p className="text-gray-600 mt-1 leading-relaxed">{step1Data.patientHypothesis}</p>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <span className="font-semibold text-gray-700">Affected areas:</span>
                  <p className="text-gray-600 mt-1">
                    {bodyRegions
                      .map((region) => {
                        const regionLabels: Record<string, string> = {
                          head: "Head/Brain",
                          chest: "Heart/Chest",
                          digestive: "Digestive",
                          muscles: "Muscles/Joints",
                          skin: "Skin",
                          whole: "Whole body",
                        }
                        return regionLabels[region] || region
                      })
                      .join(", ")}
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline Section */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 md:p-12">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-3">When did things start?</h2>
                {errors.mainSymptomStart && <p className="text-red-600 text-sm">{errors.mainSymptomStart}</p>}
              </div>

              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900">When did your main symptom start?</h3>
                <TimelineSelector
                  value={formData.mainSymptomStart}
                  onChange={(value) => updateFormData("mainSymptomStart", value)}
                />
              </div>
            </div>

            {/* Symptom Patterns Section */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 md:p-12">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-3">How would you describe your symptoms?</h2>
                {errors.symptomPattern && <p className="text-red-600 text-sm">{errors.symptomPattern}</p>}
              </div>

              <SymptomPatternSelector
                value={formData.symptomPattern}
                onChange={(value) => updateFormData("symptomPattern", value)}
              />
            </div>

            {/* Triggers Section */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 md:p-12">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-3">What makes your symptoms worse?</h2>
                <p className="text-lg text-gray-600">Select all that apply</p>
              </div>

              <TriggerSelector value={formData.triggers} onChange={(value) => updateFormData("triggers", value)} />
            </div>

            {/* Associated Symptoms Section */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 md:p-12">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-3">What else have you noticed?</h2>
                <p className="text-lg text-gray-600">
                  Based on the areas you selected, here are common related symptoms
                </p>
              </div>

              <AssociatedSymptoms
                bodyRegions={bodyRegions}
                value={formData.associatedSymptoms}
                onChange={(value) => updateFormData("associatedSymptoms", value)}
              />
            </div>

            {/* Family History Section */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 md:p-12">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-3">Does anyone in your family have:</h2>
              </div>

              <FamilyHistorySelector
                value={formData.familyHistory}
                onChange={(value) => updateFormData("familyHistory", value)}
                details={formData.familyHistoryDetails}
                onDetailsChange={(value) => updateFormData("familyHistoryDetails", value)}
              />
            </div>

            {/* Navigation */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-6 pt-8">
              <button
                onClick={handleBack}
                className="group flex items-center space-x-2 px-6 py-3 rounded-2xl border-2 border-gray-300 text-gray-700 font-semibold hover:border-purple-300 hover:text-purple-700 transition-all duration-200 w-full sm:w-auto"
              >
                <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                <span>Back</span>
              </button>

              <button
                onClick={handleContinue}
                disabled={!isFormValid}
                className={`group relative px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300 w-full sm:w-auto min-w-[200px] ${
                  isFormValid
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center justify-center space-x-2">
                  <span>Continue</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
