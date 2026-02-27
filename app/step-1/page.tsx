"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { ArrowRight, CheckCircle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step1Data {
  age: string
  biologicalSex: "male" | "female" | "other" | ""
}

export default function Step1() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step1Data>({
    age: "",
    biologicalSex: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaved, setAutoSaved] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("step1Data")
    if (saved) {
      try {
        setFormData(JSON.parse(saved))
      } catch {
        // ignore corrupt save
      }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.age || formData.biologicalSex) {
        localStorage.setItem("step1Data", JSON.stringify(formData))
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 1500)
      }
    }, 700)

    return () => clearTimeout(timer)
  }, [formData])

  const updateFormData = (field: keyof Step1Data, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value as any }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  const validateForm = () => {
    const nextErrors: Record<string, string> = {}

    if (!formData.age) nextErrors.age = "Please enter your age"
    else if (Number.isNaN(Number.parseInt(formData.age, 10)) || Number.parseInt(formData.age, 10) < 1 || Number.parseInt(formData.age, 10) > 120) {
      nextErrors.age = "Please enter a valid age between 1 and 120"
    }

    if (!formData.biologicalSex) nextErrors.biologicalSex = "Please select your biological sex"

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleContinue = () => {
    if (!validateForm()) return
    localStorage.setItem("step1Data", JSON.stringify(formData))
    router.push("/step-2")
  }

  const isFormValid = !!formData.age && !!formData.biologicalSex

  return (
    <Layout>
      <div className="min-h-screen bg-[#f5f0eb] py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
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
              <span className="text-sm font-medium text-[#8b2500]">Step 1 of 4</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">About you</h1>
            <p className="text-lg text-gray-600">A couple basics to personalize your analysis</p>
          </div>

          <div className="bg-white border border-gray-100 p-6 sm:p-8 space-y-8">
            <div className="space-y-3">
              <label className="block text-lg font-semibold text-gray-900">
                Your age <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={formData.age}
                onChange={(e) => updateFormData("age", e.target.value)}
                className={cn(
                  "w-full px-4 py-4 border rounded-none focus:ring-2 focus:ring-[#8b2500] focus:border-transparent text-lg",
                  errors.age ? "border-red-300" : "border-gray-200",
                )}
                placeholder="Enter your age"
              />
              {errors.age && <p className="text-red-600 text-sm">{errors.age}</p>}
            </div>

            <div className="space-y-3">
              <label className="block text-lg font-semibold text-gray-900">
                Biological sex <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                {[
                  { label: "Male", value: "male" },
                  { label: "Female", value: "female" },
                  { label: "Other", value: "other" },
                ].map((option) => (
                  <label key={option.value} className="flex items-center space-x-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="biologicalSex"
                      value={option.value}
                      checked={formData.biologicalSex === option.value}
                      onChange={(e) => updateFormData("biologicalSex", e.target.value)}
                      className="sr-only"
                    />
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full border-2 transition-all relative",
                        formData.biologicalSex === option.value ? "border-[#8b2500] bg-[#8b2500]" : "border-gray-300",
                      )}
                    >
                      {formData.biologicalSex === option.value && (
                        <div className="w-2 h-2 bg-white rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      )}
                    </div>
                    <span className="text-lg text-gray-900">{option.label}</span>
                  </label>
                ))}
              </div>
              {errors.biologicalSex && <p className="text-red-600 text-sm">{errors.biologicalSex}</p>}
            </div>

            <div className="flex justify-center pt-2">
              <button
                onClick={handleContinue}
                disabled={!isFormValid}
                className={cn(
                  "group px-8 py-4 rounded-none font-semibold text-lg transition-all duration-300 min-w-[220px]",
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
