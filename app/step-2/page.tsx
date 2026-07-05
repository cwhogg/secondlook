"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { CharacterCounter } from "@/components/character-counter"
import { DocumentUpload } from "@/components/document-upload"
import { IntakeBreadcrumb } from "@/components/intake-breadcrumb"
import { trackEvent } from "@/lib/session-tracker"
import { TimelineSelector } from "@/components/timeline-selector"
import { SeveritySlider } from "@/components/severity-slider"
import { ArrowRight, ArrowLeft, CheckCircle, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

// Maximum length for the primary-concern field after merging uploaded
// documents. 10k chars (the prior typed-input cap) was arbitrarily low and
// silently truncated uploaded clinical records. 100k is the comfortable
// middle ground: handles a multi-doc upload (discharge summary + labs +
// specialist note) at roughly 25k input tokens per LLM call. Going higher
// (250k+) starts 2-4x'ing the per-analysis cost on every downstream stage
// without obvious diagnostic upside; at that point a summarize-then-pass
// preprocessing step is the right architecture. See conversation
// 2026-06-23 for the cost/benefit analysis.
const PRIMARY_CONCERN_MAX = 100_000

interface Step2Data {
  primaryConcern: string
  mainSymptomStart: string
  severity: number
}

export default function Step2() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step2Data>({
    primaryConcern: "",
    mainSymptomStart: "",
    severity: 5,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaved, setAutoSaved] = useState(false)
  // Visible notice surfaced when a document upload would push the merged
  // text past PRIMARY_CONCERN_MAX. Cleared when the user starts editing
  // or when an upload fits cleanly.
  const [uploadTruncationNotice, setUploadTruncationNotice] = useState<
    { totalLength: number; keptLength: number; excess: number } | null
  >(null)

  useEffect(() => {
    trackEvent("step-view", { step: 2 })
    const step1 = localStorage.getItem("step1Data")
    if (!step1) {
      router.push("/step-1")
      return
    }

    const saved = localStorage.getItem("step2Data")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setFormData((prev) => ({
          ...prev,
          primaryConcern: typeof parsed.primaryConcern === "string" ? parsed.primaryConcern : "",
          mainSymptomStart:
            typeof parsed.mainSymptomStart === "string" ? parsed.mainSymptomStart : "",
          severity: typeof parsed.severity === "number" ? parsed.severity : 5,
        }))
      } catch {
        // ignore
      }
    }
  }, [router])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.primaryConcern || formData.mainSymptomStart) {
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
    if (!formData.primaryConcern.trim())
      nextErrors.primaryConcern = "Please describe your main health concern"
    if (!formData.mainSymptomStart)
      nextErrors.mainSymptomStart = "Please select when symptoms started"
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleContinue = () => {
    if (!validateForm()) return
    localStorage.setItem("step2Data", JSON.stringify(formData))
    trackEvent("step-complete", {
      step: 2,
      form: {
        narrativeChars: (formData.primaryConcern || "").length,
      },
    })
    router.push("/step-3")
  }

  const handleBack = () => {
    localStorage.setItem("step2Data", JSON.stringify(formData))
    router.push("/step-1")
  }

  const isFormValid =
    (formData.primaryConcern || "").trim().length > 0 && !!formData.mainSymptomStart

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

          <IntakeBreadcrumb current={2} />

          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Your history</h1>
            <p className="text-lg text-gray-600">Tell your story in writing, or upload a medical document</p>
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
                  const wasTruncated = merged.length > PRIMARY_CONCERN_MAX
                  updateFormData("primaryConcern", merged.slice(0, PRIMARY_CONCERN_MAX))
                  setUploadTruncationNotice(
                    wasTruncated
                      ? {
                          totalLength: merged.length,
                          keptLength: PRIMARY_CONCERN_MAX,
                          excess: merged.length - PRIMARY_CONCERN_MAX,
                        }
                      : null,
                  )
                }}
              />

              {uploadTruncationNotice && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-700" />
                  <div>
                    <div className="font-semibold mb-0.5">
                      Your upload was longer than the input allows
                    </div>
                    <div className="leading-relaxed">
                      Your story plus uploaded documents totaled {uploadTruncationNotice.totalLength.toLocaleString()} characters. We kept the first {uploadTruncationNotice.keptLength.toLocaleString()} characters and dropped the remaining {uploadTruncationNotice.excess.toLocaleString()}. Consider summarizing the most relevant sections or splitting the upload across multiple analyses.
                    </div>
                  </div>
                </div>
              )}

              <textarea
                rows={7}
                maxLength={PRIMARY_CONCERN_MAX}
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
                <CharacterCounter current={formData.primaryConcern.length} max={PRIMARY_CONCERN_MAX} />
              </div>
              {errors.primaryConcern && <p className="text-red-600 text-sm">{errors.primaryConcern}</p>}
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">
                When did your symptoms start? <span className="text-red-500">*</span>
              </h2>
              <TimelineSelector
                value={formData.mainSymptomStart}
                onChange={(value) => updateFormData("mainSymptomStart", value)}
              />
              {errors.mainSymptomStart && (
                <p className="text-red-600 text-sm">{errors.mainSymptomStart}</p>
              )}
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">
                How much is this affecting your day-to-day life?
              </h2>
              <div className="bg-[#faf6f0] p-6">
                <SeveritySlider
                  value={formData.severity}
                  onChange={(value) => updateFormData("severity", value)}
                />
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
