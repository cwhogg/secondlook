"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { TimelineSelector } from "@/components/timeline-selector"
import { SeveritySlider } from "@/components/severity-slider"
import { ArrowLeft, ArrowRight, CheckCircle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step3Data {
  mainSymptomStart: string
  severity: number
}

export default function Step3() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step3Data>({
    mainSymptomStart: "",
    severity: 5,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaved, setAutoSaved] = useState(false)

  useEffect(() => {
    const step1 = localStorage.getItem("step1Data")
    const step2 = localStorage.getItem("step2Data")
    if (!step1) {
      router.push("/step-1")
      return
    }
    if (!step2) {
      router.push("/step-2")
      return
    }

    const saved = localStorage.getItem("step3Data")
    if (saved) {
      try {
        setFormData(JSON.parse(saved))
      } catch {
        // ignore
      }
    }
  }, [router])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.mainSymptomStart || formData.severity !== 5) {
        localStorage.setItem("step3Data", JSON.stringify(formData))
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 1500)
      }
    }, 700)

    return () => clearTimeout(timer)
  }, [formData])

  const update = (field: keyof Step3Data, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }))
  }

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    if (!formData.mainSymptomStart) nextErrors.mainSymptomStart = "Please select when symptoms started"
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleBack = () => {
    localStorage.setItem("step3Data", JSON.stringify(formData))
    router.push("/step-2")
  }

  const handleContinue = () => {
    if (!validate()) return
    localStorage.setItem("step3Data", JSON.stringify(formData))
    router.push("/step-4")
  }

  const isFormValid = !!formData.mainSymptomStart

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
              <span className="text-sm font-medium text-[#8b2500]">Step 3 of 4</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Timeline & impact</h1>
            <p className="text-lg text-gray-600">Help us understand onset and how much this affects daily life</p>
          </div>

          <div className="max-w-3xl mx-auto bg-white border border-gray-100 p-6 sm:p-8 space-y-8">
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">When did your symptoms start? <span className="text-red-500">*</span></h2>
              <TimelineSelector value={formData.mainSymptomStart} onChange={(value) => update("mainSymptomStart", value)} />
              {errors.mainSymptomStart && <p className="text-red-600 text-sm">{errors.mainSymptomStart}</p>}
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">How much is this affecting your day-to-day life?</h2>
              <div className="bg-[#faf6f0] p-6">
                <SeveritySlider value={formData.severity} onChange={(value) => update("severity", value)} />
              </div>
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
