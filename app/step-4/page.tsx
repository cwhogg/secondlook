"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { ArrowLeft, CheckCircle, AlertCircle, Sparkles, Shield } from "lucide-react"

interface Step4Data {
  medicationsText: string
  familyHistoryText: string
  priorTestsText: string
  consentAnalysis: boolean
  consentNotSubstitute: boolean
  consentAccurate: boolean
}

export default function Step4() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step4Data>({
    medicationsText: "",
    familyHistoryText: "",
    priorTestsText: "",
    consentAnalysis: false,
    consentNotSubstitute: false,
    consentAccurate: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaved, setAutoSaved] = useState(false)
  const [showValidationSummary, setShowValidationSummary] = useState(false)

  useEffect(() => {
    const step1 = localStorage.getItem("step1Data")
    const step2 = localStorage.getItem("step2Data")
    const step3 = localStorage.getItem("step3Data")
    if (!step1) {
      router.push("/step-1")
      return
    }
    if (!step2) {
      router.push("/step-2")
      return
    }
    if (!step3) {
      router.push("/step-3")
      return
    }

    const saved = localStorage.getItem("step4Data")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setFormData((prev) => ({
          ...prev,
          medicationsText: typeof parsed.medicationsText === "string" ? parsed.medicationsText : "",
          familyHistoryText: typeof parsed.familyHistoryText === "string" ? parsed.familyHistoryText : "",
          priorTestsText: typeof parsed.priorTestsText === "string" ? parsed.priorTestsText : "",
          consentAnalysis: typeof parsed.consentAnalysis === "boolean" ? parsed.consentAnalysis : false,
          consentNotSubstitute: typeof parsed.consentNotSubstitute === "boolean" ? parsed.consentNotSubstitute : false,
          consentAccurate: typeof parsed.consentAccurate === "boolean" ? parsed.consentAccurate : false,
        }))
      } catch {
        // ignore
      }
    }
  }, [router])

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem("step4Data", JSON.stringify(formData))
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 1500)
    }, 800)

    return () => clearTimeout(timer)
  }, [formData])

  const update = (field: keyof Step4Data, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }))
    if (showValidationSummary) setShowValidationSummary(false)
  }

  const validate = () => {
    const nextErrors: Record<string, string> = {}

    if (!formData.consentAnalysis) nextErrors.consentAnalysis = "Please consent to AI analysis"
    if (!formData.consentNotSubstitute) nextErrors.consentNotSubstitute = "Please acknowledge this is not medical care"
    if (!formData.consentAccurate) nextErrors.consentAccurate = "Please confirm your information is accurate"

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const missingItems = [
    !formData.consentAnalysis ? "Consent to AI analysis" : null,
    !formData.consentNotSubstitute ? "Acknowledgment this is not a substitute for medical care" : null,
    !formData.consentAccurate ? "Confirmation your information is accurate" : null,
  ].filter(Boolean)

  const handleBack = () => {
    localStorage.setItem("step4Data", JSON.stringify(formData))
    router.push("/step-3")
  }

  const handleStartAnalysis = () => {
    const ok = validate()
    if (!ok) {
      setShowValidationSummary(true)
      return
    }

    localStorage.setItem("step4Data", JSON.stringify(formData))
    router.push("/analysis")
  }

  const isFormValid = formData.consentAnalysis && formData.consentNotSubstitute && formData.consentAccurate

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

          {showValidationSummary && missingItems.length > 0 && (
            <div className="mb-6 bg-red-50 border border-red-200 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-2">Please complete:</h3>
                  <ul className="space-y-1 text-red-800 text-sm">
                    {missingItems.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="text-center mb-10">
            <div className="inline-flex items-center space-x-2 bg-[#faf6f0] px-4 py-2 rounded-full mb-6">
              <Sparkles className="h-4 w-4 text-[#8b2500]" />
              <span className="text-sm font-medium text-[#8b2500]">Step 4 of 4</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Optional context & consent</h1>
            <p className="text-lg text-gray-600">Add any extra context you want us to consider, then start analysis</p>
          </div>

          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white border border-gray-100 p-6 sm:p-8 space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Optional clinical context</h2>

              <div className="space-y-2">
                <label className="font-semibold text-gray-900">Current medications/supplements</label>
                <textarea
                  rows={4}
                  maxLength={1200}
                  value={formData.medicationsText}
                  onChange={(e) => update("medicationsText", e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-none focus:ring-2 focus:ring-[#8b2500] focus:border-transparent"
                  placeholder="Optional: one per line (name, dose, frequency if known)"
                />
              </div>

              <div className="space-y-2">
                <label className="font-semibold text-gray-900">Family history</label>
                <textarea
                  rows={4}
                  maxLength={1200}
                  value={formData.familyHistoryText}
                  onChange={(e) => update("familyHistoryText", e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-none focus:ring-2 focus:ring-[#8b2500] focus:border-transparent"
                  placeholder="Optional: relatives with similar symptoms, diagnoses, or relevant conditions"
                />
              </div>

              <div className="space-y-2">
                <label className="font-semibold text-gray-900">Prior tests/scans and notable results</label>
                <textarea
                  rows={4}
                  maxLength={1200}
                  value={formData.priorTestsText}
                  onChange={(e) => update("priorTestsText", e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-none focus:ring-2 focus:ring-[#8b2500] focus:border-transparent"
                  placeholder="Optional: test name + what was normal/abnormal"
                />
              </div>
            </div>

            <div className="bg-white border border-gray-100 p-6 sm:p-8">
              <div className="flex items-start gap-3 mb-6">
                <div className="p-2 bg-[#8b2500]">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Consent & analysis</h2>
                  <p className="text-sm text-gray-600">Required to continue</p>
                </div>
              </div>

              <div className="space-y-4 text-sm">
                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={formData.consentAnalysis} onChange={(e) => update("consentAnalysis", e.target.checked)} className="mt-1" />
                  <span>I consent to AI analysis of the information I provided.</span>
                </label>
                {errors.consentAnalysis && <p className="text-red-600">{errors.consentAnalysis}</p>}

                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={formData.consentNotSubstitute} onChange={(e) => update("consentNotSubstitute", e.target.checked)} className="mt-1" />
                  <span>I understand this is educational and does not replace professional medical care.</span>
                </label>
                {errors.consentNotSubstitute && <p className="text-red-600">{errors.consentNotSubstitute}</p>}

                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={formData.consentAccurate} onChange={(e) => update("consentAccurate", e.target.checked)} className="mt-1" />
                  <span>I confirm the information I entered is accurate to the best of my knowledge.</span>
                </label>
                {errors.consentAccurate && <p className="text-red-600">{errors.consentAccurate}</p>}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleStartAnalysis}
                  disabled={!isFormValid}
                  className={`px-8 py-4 font-semibold text-lg transition-all duration-300 flex-1 ${
                    isFormValid ? "bg-[#8b2500] text-white" : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  Start My Analysis
                </button>
                <button
                  onClick={handleBack}
                  className="px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold"
                >
                  <span className="inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" /> Back</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
