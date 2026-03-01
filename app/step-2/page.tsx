"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { CharacterCounter } from "@/components/character-counter"
import { DocumentUpload } from "@/components/document-upload"
import { ArrowRight, ArrowLeft, CheckCircle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { SymptomMappingSection } from "@/components/symptom-mapping-section"

interface Step2Data {
  primaryConcern: string
  patientHypothesis: string
  noIdea: boolean
}

export default function Step2() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step2Data>({
    primaryConcern: "",
    patientHypothesis: "",
    noIdea: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaved, setAutoSaved] = useState(false)
  const [step1Snapshot, setStep1Snapshot] = useState<{ age: string; biologicalSex: string }>({ age: "", biologicalSex: "" })

  useEffect(() => {
    const step1 = localStorage.getItem("step1Data")
    if (!step1) {
      router.push("/step-1")
      return
    }

    try {
      const parsedStep1 = JSON.parse(step1)
      setStep1Snapshot({
        age: typeof parsedStep1.age === "string" ? parsedStep1.age : "",
        biologicalSex: typeof parsedStep1.biologicalSex === "string" ? parsedStep1.biologicalSex : "",
      })
    } catch {
      // ignore
    }

    const saved = localStorage.getItem("step2Data")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setFormData((prev) => ({
          ...prev,
          primaryConcern: typeof parsed.primaryConcern === "string" ? parsed.primaryConcern : "",
          patientHypothesis: typeof parsed.patientHypothesis === "string" ? parsed.patientHypothesis : "",
          noIdea: typeof parsed.noIdea === "boolean" ? parsed.noIdea : false,
        }))
      } catch {
        // ignore
      }
    }
  }, [router])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.primaryConcern || formData.patientHypothesis) {
        localStorage.setItem("step2Data", JSON.stringify(formData))
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 1500)
      }
    }, 700)

    return () => clearTimeout(timer)
  }, [formData])

  const updateFormData = (field: keyof Step2Data, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }))
  }

  const validateForm = () => {
    const nextErrors: Record<string, string> = {}
    if (!formData.primaryConcern.trim()) nextErrors.primaryConcern = "Please describe your main health concern"
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleContinue = () => {
    if (!validateForm()) return
    localStorage.setItem("step2Data", JSON.stringify(formData))
    router.push("/step-3")
  }

  const handleBack = () => {
    localStorage.setItem("step2Data", JSON.stringify(formData))
    router.push("/step-1")
  }

  const isFormValid = (formData.primaryConcern || "").trim().length > 0

  return (
    <Layout>
      <div className="min-h-screen bg-[#f5f0eb] py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${
              autoSaved ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
            }`}
          >
            <div className="bg-emerald-500 text-white px-6 py-3 rounded-none flex items-center space-x-2">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Progress saved</span>
            </div>
          </div>

          <div className="text-center mb-10">
            <div className="inline-flex items-center space-x-2 bg-[#faf6f0] px-4 py-2 rounded-full mb-6">
              <Sparkles className="h-4 w-4 text-[#8b2500]" />
              <span className="text-sm font-medium text-[#8b2500]">Step 2 of 4</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Tell your story</h1>
            <p className="text-lg text-gray-600">Describe what’s been happening in your own words</p>
          </div>

          <div className="max-w-3xl mx-auto bg-white border border-gray-100 p-6 sm:p-8 space-y-8">
            <div className="space-y-3">
              <label className="block text-lg font-semibold text-gray-900">
                Main health concern <span className="text-red-500">*</span>
              </label>

              <DocumentUpload
                onTextExtracted={(text) => {
                  const current = formData.primaryConcern.trim()
                  const merged = current
                    ? `${formData.primaryConcern}\n\n--- From uploaded document ---\n\n${text}`
                    : text
                  updateFormData("primaryConcern", merged.slice(0, 10000))
                }}
              />

              <textarea
                rows={7}
                maxLength={10000}
                value={formData.primaryConcern}
                onChange={(e) => updateFormData("primaryConcern", e.target.value)}
                className={cn(
                  "w-full px-4 py-4 border rounded-none focus:ring-2 focus:ring-[#8b2500] focus:border-transparent text-lg resize-none",
                  errors.primaryConcern ? "border-red-300" : "border-gray-200",
                )}
                placeholder="Example: Over the last 8 months I’ve had worsening fatigue, muscle weakness, and episodes of dizziness..."
              />
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Include onset, progression, and what makes it better/worse</p>
                <CharacterCounter current={formData.primaryConcern.length} max={10000} />
              </div>
              {errors.primaryConcern && <p className="text-red-600 text-sm">{errors.primaryConcern}</p>}
            </div>

            {formData.primaryConcern.trim().length > 10 && (
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-gray-900">Symptom extraction preview</h2>
                <p className="text-sm text-gray-600">Using the existing parser and mapping pipeline from previous flow.</p>
                <div className="border border-gray-200 p-4">
                  <SymptomMappingSection
                    chiefComplaint={formData.primaryConcern}
                    age={step1Snapshot.age}
                    sex={step1Snapshot.biologicalSex}
                    onMappingUpdate={(mapped) => localStorage.setItem("mappedSymptoms", JSON.stringify(mapped))}
                    onPatternUpdate={(patterns) => localStorage.setItem("symptomPatterns", JSON.stringify(patterns))}
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Do you have a theory about what this might be? (optional)</h2>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.noIdea}
                  onChange={(e) => {
                    updateFormData("noIdea", e.target.checked)
                    if (e.target.checked) updateFormData("patientHypothesis", "")
                  }}
                />
                <span className="text-gray-800">I’m not sure — I’d like help figuring it out</span>
              </label>

              {!formData.noIdea && (
                <textarea
                  rows={4}
                  maxLength={300}
                  value={formData.patientHypothesis}
                  onChange={(e) => updateFormData("patientHypothesis", e.target.value)}
                  className="w-full px-4 py-4 border border-gray-200 rounded-none focus:ring-2 focus:ring-[#8b2500] focus:border-transparent text-base resize-none"
                  placeholder="Example: My doctor mentioned autoimmune disease, or I wonder if this could be thyroid-related..."
                />
              )}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
              <button
                onClick={handleBack}
                className="group flex items-center space-x-2 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold w-full sm:w-auto justify-center"
              >
                <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                <span>Back</span>
              </button>

              <button
                onClick={handleContinue}
                disabled={!isFormValid}
                className={cn(
                  "group px-8 py-4 font-semibold text-lg transition-all duration-300 w-full sm:w-auto min-w-[220px]",
                  isFormValid ? "bg-[#8b2500] text-white" : "bg-gray-200 text-gray-500 cursor-not-allowed",
                )}
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
