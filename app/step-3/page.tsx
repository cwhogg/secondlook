"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { LabUpload } from "@/components/lab-upload"
import { LabVerification } from "@/components/lab-verification"
import { IntakeBreadcrumb } from "@/components/intake-breadcrumb"
import { ArrowLeft, ArrowRight, CheckCircle, SkipForward } from "lucide-react"
import type { LabResult } from "@/lib/types/index"
import { cn } from "@/lib/utils"

interface Step3Data {
  labResults: LabResult[]
}

export default function Step3() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step3Data>({ labResults: [] })
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
        const parsed = JSON.parse(saved)
        setFormData({
          labResults: Array.isArray(parsed.labResults) ? parsed.labResults : [],
        })
      } catch {
        // ignore
      }
    }
  }, [router])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.labResults.length > 0) {
        localStorage.setItem("step3Data", JSON.stringify(formData))
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 1500)
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [formData])

  const handleBack = () => {
    localStorage.setItem("step3Data", JSON.stringify(formData))
    router.push("/step-2")
  }

  const handleContinue = () => {
    localStorage.setItem("step3Data", JSON.stringify(formData))
    router.push("/step-4")
  }

  const handleSkip = () => {
    // Persist an empty labResults so /step-4 (which checks step-3 exists)
    // and /analysis don't bounce us back here.
    localStorage.setItem("step3Data", JSON.stringify({ labResults: [] }))
    router.push("/step-4")
  }

  const hasLabs = formData.labResults.length > 0

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

          <IntakeBreadcrumb current={3} />

          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Lab results</h1>
            <p className="text-lg text-gray-600">
              Optional — upload any recent labs to sharpen the analysis. Skip if you don't have any.
            </p>
          </div>

          <div className="max-w-3xl mx-auto bg-white border border-gray-100 p-6 sm:p-8 space-y-8">
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Upload PDFs or photos of lab reports. We'll extract the numeric values and reference
                ranges — you'll see and confirm everything before continuing.
              </p>
              <LabUpload
                onLabsExtracted={(newLabs) => {
                  setFormData((prev) => ({ labResults: [...prev.labResults, ...newLabs] }))
                }}
              />
              <LabVerification
                labs={formData.labResults}
                onChange={(next) => setFormData({ labResults: next })}
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
              <button
                onClick={handleBack}
                className="group flex items-center space-x-2 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold w-full sm:w-auto justify-center"
              >
                <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                <span>Back</span>
              </button>

              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                {!hasLabs && (
                  <button
                    onClick={handleSkip}
                    className="group flex items-center justify-center space-x-2 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold"
                  >
                    <SkipForward className="h-5 w-5" />
                    <span>Skip — no labs</span>
                  </button>
                )}
                <button
                  onClick={handleContinue}
                  className={cn(
                    "group px-8 py-4 font-semibold text-lg transition-all duration-300 sm:w-auto min-w-[220px] bg-[#8b2500] text-white",
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
      </div>
    </Layout>
  )
}
