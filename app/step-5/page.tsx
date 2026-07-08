"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Layout } from "@/components/layout"
import { IntakeBreadcrumb } from "@/components/intake-breadcrumb"
import { trackEvent } from "@/lib/session-tracker"
import { ArrowLeft, CheckCircle, AlertCircle, Shield } from "lucide-react"

interface Step6Data {
  consentAnalysis: boolean
  consentNotSubstitute: boolean
  consentAccurate: boolean
}

export default function Step5() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step6Data>({
    consentAnalysis: false,
    consentNotSubstitute: false,
    consentAccurate: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaved, setAutoSaved] = useState(false)
  const [showValidationSummary, setShowValidationSummary] = useState(false)

  useEffect(() => {
    trackEvent("step-view", { step: 5 })
    // Step-6 sits after the review screen. If any prior step is missing,
    // bounce back to the earliest one rather than letting the user submit
    // a half-empty case.
    // step4Data omitted — the old photos step was folded into /step-3
    // (Documents) and no longer produces its own storage record.
    const required = [
      ["step1Data", "/step-1"],
      ["step2Data", "/step-2"],
      ["step3Data", "/step-3"],
      // Review step is now at /step-4 (renumbered from /step-5).
      // localStorage key stays 'step5Data' for backwards-compat with
      // in-flight sessions.
      ["step5Data", "/step-4"],
    ] as const
    for (const [key, path] of required) {
      if (!localStorage.getItem(key)) {
        router.push(path)
        return
      }
    }

    const saved = localStorage.getItem("step6Data")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setFormData({
          consentAnalysis:
            typeof parsed.consentAnalysis === "boolean" ? parsed.consentAnalysis : false,
          consentNotSubstitute:
            typeof parsed.consentNotSubstitute === "boolean"
              ? parsed.consentNotSubstitute
              : false,
          consentAccurate:
            typeof parsed.consentAccurate === "boolean" ? parsed.consentAccurate : false,
        })
      } catch {
        // ignore
      }
    }
  }, [router])

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem("step6Data", JSON.stringify(formData))
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 1500)
    }, 800)
    return () => clearTimeout(timer)
  }, [formData])

  const update = (field: keyof Step6Data, value: boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }))
    if (showValidationSummary) setShowValidationSummary(false)
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (!formData.consentAnalysis) next.consentAnalysis = "Please consent to AI analysis"
    if (!formData.consentNotSubstitute)
      next.consentNotSubstitute = "Please acknowledge this is not medical care"
    if (!formData.consentAccurate)
      next.consentAccurate = "Please confirm your information is accurate"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const missingItems = [
    !formData.consentAnalysis ? "Consent to AI analysis" : null,
    !formData.consentNotSubstitute
      ? "Acknowledgment this is not a substitute for medical care"
      : null,
    !formData.consentAccurate ? "Confirmation your information is accurate" : null,
  ].filter(Boolean) as string[]

  const handleBack = () => {
    localStorage.setItem("step6Data", JSON.stringify(formData))
    router.push("/step-4")
  }

  const handleSubmit = () => {
    if (!validate()) {
      setShowValidationSummary(true)
      return
    }
    localStorage.setItem("step6Data", JSON.stringify(formData))
    trackEvent("step-complete", { step: 5 })
    trackEvent("analysis-start", { step: 6 })
    router.push("/analysis")
  }

  const isFormValid =
    formData.consentAnalysis && formData.consentNotSubstitute && formData.consentAccurate

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

          <IntakeBreadcrumb current={5} />

          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Consent &amp; submit</h1>
            <p className="text-lg text-gray-600">
              Review the consent terms and start your analysis.
            </p>
          </div>

          <div className="max-w-3xl mx-auto bg-white border border-gray-100 p-6 sm:p-8 space-y-8">
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#8b2500]" />
                Consent
              </h2>
              <div className="space-y-4 text-sm">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={formData.consentAnalysis}
                    onChange={(e) => update("consentAnalysis", e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I consent to AI analysis of the information I provided. My symptom narrative
                    will be processed by OpenAI and Anthropic language models and stored for up
                    to 90 days. See the{" "}
                    <Link href="/legal/privacy" className="text-[#8b2500] underline" target="_blank">
                      Privacy Policy
                    </Link>{" "}
                    for what we store, where, and for how long.
                  </span>
                </label>
                {errors.consentAnalysis && (
                  <p className="text-red-600">{errors.consentAnalysis}</p>
                )}

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={formData.consentNotSubstitute}
                    onChange={(e) => update("consentNotSubstitute", e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I understand SecondLook is a research preview for educational purposes only,
                    is <strong>not a medical device</strong>, does not establish a
                    clinician–patient relationship, and{" "}
                    <strong>
                      does not replace evaluation, diagnosis, or treatment by a licensed clinician
                    </strong>
                    .
                  </span>
                </label>
                {errors.consentNotSubstitute && (
                  <p className="text-red-600">{errors.consentNotSubstitute}</p>
                )}

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={formData.consentAccurate}
                    onChange={(e) => update("consentAccurate", e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I confirm I am 18 or older, the information I entered is accurate to the best
                    of my knowledge, and I am submitting it about myself (or about a person I
                    legally represent with their informed consent).
                  </span>
                </label>
                {errors.consentAccurate && (
                  <p className="text-red-600">{errors.consentAccurate}</p>
                )}
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
                onClick={handleSubmit}
                disabled={!isFormValid}
                className={`px-8 py-4 font-semibold text-lg transition-all duration-300 w-full sm:w-auto min-w-[260px] ${
                  isFormValid
                    ? "bg-[#8b2500] text-white"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                Start my analysis
              </button>
            </div>
            <p className="text-center sm:text-right text-sm text-gray-500">
              Evaluations take 8–10 mins.
            </p>
            <p className="text-center sm:text-right text-xs text-gray-500">
              By clicking <strong>Start my analysis</strong> you agree to SecondLook&rsquo;s{" "}
              <Link href="/legal/terms" className="text-[#8b2500] underline" target="_blank">
                Terms of Use
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="text-[#8b2500] underline" target="_blank">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
