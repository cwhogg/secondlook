"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { CharacterCounter } from "@/components/character-counter"
import { BodyRegionSelector } from "@/components/body-region-selector"
import { SeveritySlider } from "@/components/severity-slider"
import { ArrowRight, CheckCircle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface FormData {
  age: string
  biologicalSex: string
  primaryConcern: string
  patientHypothesis: string
  noIdea: boolean
  bodyRegions: string[]
  severity: number
}

export default function Step1() {
  const router = useRouter()

  const [formData, setFormData] = useState<FormData>({
    age: "",
    biologicalSex: "",
    primaryConcern: "",
    patientHypothesis: "",
    noIdea: false,
    bodyRegions: [],
    severity: 5,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaved, setAutoSaved] = useState(false)

  const currentStep = 1
  const totalSteps = 3
  const breadcrumbItems = [{ label: "Home" }, { label: "Assessment", current: true }]

  // Load saved data on mount, but check for start over flag first
  useEffect(() => {
    // Check if we're starting over
    const startingOver = localStorage.getItem("startingOver")

    if (startingOver) {
      // Remove the flag and don't load any saved data
      localStorage.removeItem("startingOver")
      console.log("Starting over - not loading saved data")
      return
    }

    // Normal data loading
    const savedData = localStorage.getItem("step1Data")
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        setFormData(parsed)
        console.log("Loaded saved step1 data:", parsed)
      } catch (error) {
        console.error("Error loading saved data:", error)
      }
    }
  }, [])

  // Auto-save functionality
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.age || formData.primaryConcern) {
        // Save to localStorage for persistence
        localStorage.setItem("step1Data", JSON.stringify(formData))
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 2000)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [formData])

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.age) newErrors.age = "Please enter your age"
    else if (Number.parseInt(formData.age) < 1 || Number.parseInt(formData.age) > 120) {
      newErrors.age = "Please enter a valid age between 1 and 120"
    }

    if (!formData.biologicalSex) newErrors.biologicalSex = "Please select your biological sex"
    if (!formData.primaryConcern.trim()) newErrors.primaryConcern = "Please describe your main health concern"
    if (formData.bodyRegions.length === 0) newErrors.bodyRegions = "Please select at least one affected area"

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleContinue = () => {
    if (validateForm()) {
      // Save data to localStorage
      localStorage.setItem("step1Data", JSON.stringify(formData))
      // Navigate to step 2 and scroll to top
      router.push("/step-2")
    }
  }

  const isFormValid =
    formData.age && formData.biologicalSex && formData.primaryConcern.trim() && formData.bodyRegions.length > 0

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
              <span className="text-sm font-medium text-purple-700">Step 1 of 3</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Tell us about your{" "}
              <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                health concerns
              </span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              We'll help you explore potential diagnoses that you can discuss with your healthcare provider.
            </p>
          </div>

          {/* Main Form Container */}
          <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-lg border border-gray-100 p-8 md:p-12">
            <div className="space-y-12">
              {/* Section 1: Essential Demographics */}
              <div className="space-y-8">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">Basic Information</h2>
                  <p className="text-lg text-gray-600">This helps us consider conditions that affect people like you</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="block text-lg font-semibold text-gray-900">
                      Your age <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      placeholder="Enter your age"
                      min="1"
                      max="120"
                      value={formData.age}
                      onChange={(e) => updateFormData("age", e.target.value)}
                      className={cn(
                        "w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg transition-all duration-200",
                        errors.age
                          ? "border-red-300 focus:ring-red-500"
                          : formData.age
                            ? "border-emerald-300 focus:ring-emerald-500"
                            : "border-gray-200",
                      )}
                    />
                    {errors.age && <p className="text-red-600 text-sm mt-2">{errors.age}</p>}
                  </div>

                  <div className="space-y-3">
                    <label className="block text-lg font-semibold text-gray-900">
                      Biological sex <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-3">
                      {["Male", "Female", "Other"].map((option) => (
                        <label key={option} className="flex items-center space-x-3 cursor-pointer group">
                          <div className="relative">
                            <input
                              type="radio"
                              name="biologicalSex"
                              value={option.toLowerCase()}
                              checked={formData.biologicalSex === option.toLowerCase()}
                              onChange={(e) => updateFormData("biologicalSex", e.target.value)}
                              className="sr-only"
                            />
                            <div
                              className={cn(
                                "w-5 h-5 rounded-full border-2 transition-all duration-200",
                                formData.biologicalSex === option.toLowerCase()
                                  ? "border-purple-500 bg-purple-500"
                                  : "border-gray-300 group-hover:border-purple-300",
                              )}
                            >
                              {formData.biologicalSex === option.toLowerCase() && (
                                <div className="w-2 h-2 bg-white rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                              )}
                            </div>
                          </div>
                          <span className="text-lg font-medium text-gray-900 group-hover:text-purple-700 transition-colors">
                            {option}
                          </span>
                        </label>
                      ))}
                    </div>
                    {errors.biologicalSex && <p className="text-red-600 text-sm mt-2">{errors.biologicalSex}</p>}
                  </div>
                </div>
              </div>

              {/* Section 2: Primary Concern */}
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">What's your main health concern?</h2>
                  <p className="text-lg text-gray-600">
                    Describe your symptoms in your own words - be as detailed as possible
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="block text-lg font-semibold text-gray-900">
                    Describe your symptoms <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-3">
                    <textarea
                      placeholder="Example: I've been experiencing extreme fatigue and muscle weakness that started about 6 months ago. It's gotten worse over time and now affects my daily activities..."
                      value={formData.primaryConcern}
                      onChange={(e) => updateFormData("primaryConcern", e.target.value)}
                      maxLength={1000}
                      rows={6}
                      className={cn(
                        "w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg resize-none transition-all duration-200",
                        errors.primaryConcern
                          ? "border-red-300 focus:ring-red-500"
                          : formData.primaryConcern
                            ? "border-emerald-300 focus:ring-emerald-500"
                            : "border-gray-200",
                      )}
                    />
                    <div className="flex justify-between items-center">
                      <p className="text-base text-gray-600">
                        Include when symptoms started, how they've changed, and what makes them better or worse
                      </p>
                      <CharacterCounter current={formData.primaryConcern.length} max={1000} />
                    </div>
                  </div>
                  {errors.primaryConcern && <p className="text-red-600 text-sm mt-2">{errors.primaryConcern}</p>}
                </div>
              </div>

              {/* Section 3: Patient Hypothesis */}
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">
                    Do you have any thoughts about what this might be?
                  </h2>
                  <p className="text-lg text-gray-600">
                    Your insights are valuable - many patients research their symptoms and have helpful observations
                  </p>
                </div>

                <div className="space-y-6">
                  <label className="flex items-center space-x-4 cursor-pointer group p-4 rounded-2xl border border-gray-200 hover:border-purple-300 transition-all duration-200">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={formData.noIdea}
                        onChange={(e) => {
                          updateFormData("noIdea", e.target.checked)
                          if (e.target.checked) {
                            updateFormData("patientHypothesis", "")
                          }
                        }}
                        className="sr-only"
                      />
                      <div
                        className={cn(
                          "w-5 h-5 rounded border-2 transition-all duration-200",
                          formData.noIdea
                            ? "border-purple-500 bg-purple-500"
                            : "border-gray-300 group-hover:border-purple-300",
                        )}
                      >
                        {formData.noIdea && <CheckCircle className="w-3 h-3 text-white absolute top-0.5 left-0.5" />}
                      </div>
                    </div>
                    <span className="text-lg font-medium text-gray-900 group-hover:text-purple-700 transition-colors">
                      I'm not sure - I'd like help figuring this out
                    </span>
                  </label>

                  {!formData.noIdea && (
                    <div className="space-y-3">
                      <textarea
                        placeholder="Example: I think it might be related to my thyroid because I've had similar symptoms before... / My doctor mentioned it could be an autoimmune condition... / I read about fibromyalgia and some symptoms match..."
                        value={formData.patientHypothesis}
                        onChange={(e) => updateFormData("patientHypothesis", e.target.value)}
                        maxLength={200}
                        rows={4}
                        className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg resize-none transition-all duration-200"
                      />
                      <div className="flex justify-between items-center">
                        <p className="text-base text-gray-600">
                          This helps us understand your perspective and explain our analysis
                        </p>
                        <CharacterCounter current={formData.patientHypothesis.length} max={200} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 4: Body Regions */}
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">Which parts of your body are affected?</h2>
                  <p className="text-lg text-gray-600 mb-2">
                    Select all areas where you're experiencing symptoms - many conditions affect multiple body systems
                  </p>
                  {errors.bodyRegions && <p className="text-red-600 text-sm">{errors.bodyRegions}</p>}
                </div>

                <BodyRegionSelector
                  value={formData.bodyRegions}
                  onChange={(value) => updateFormData("bodyRegions", value)}
                />
              </div>

              {/* Section 5: Severity */}
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">
                    How much are these symptoms affecting your daily life?
                  </h2>
                  <p className="text-lg text-gray-600">This helps us understand the impact on your quality of life</p>
                </div>
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6">
                  <SeveritySlider value={formData.severity} onChange={(value) => updateFormData("severity", value)} />
                </div>
              </div>

              {/* Navigation */}
              <div className="flex justify-center pt-8">
                <button
                  onClick={handleContinue}
                  disabled={!isFormValid}
                  className={cn(
                    "group relative px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300 min-w-[200px]",
                    isFormValid
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed",
                  )}
                >
                  <span className="flex items-center justify-center space-x-2">
                    <span>Continue to Next Step</span>
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
