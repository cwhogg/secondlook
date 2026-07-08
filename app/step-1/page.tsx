"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { IntakeBreadcrumb } from "@/components/intake-breadcrumb"
import { trackEvent } from "@/lib/session-tracker"
import { ArrowRight, CheckCircle, Sparkles, Loader2 } from "lucide-react"
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
  // Test-user generation: hits the same /api/admin/generate-patient
  // endpoint the admin testing page uses, asks for a difficulty-3
  // (Challenging) case with no category filter, then jumps straight to
  // step-2 with the narrative pre-filling primaryConcern + demographics
  // pre-filling step-1.
  const [creatingTestUser, setCreatingTestUser] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    trackEvent("step-view", { step: 1 })
    const saved = localStorage.getItem("step1Data")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setFormData((prev) => ({
          ...prev,
          age: typeof parsed.age === "string" ? parsed.age : "",
          biologicalSex:
            parsed.biologicalSex === "male" || parsed.biologicalSex === "female" || parsed.biologicalSex === "other"
              ? parsed.biologicalSex
              : "",
        }))
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
    trackEvent("step-complete", {
      step: 1,
      form: {
        age: formData.age,
        sex: formData.biologicalSex,
      },
    })
    router.push("/step-2")
  }

  const handleCreateTestUser = async () => {
    if (creatingTestUser) return
    setCreateError(null)
    setCreatingTestUser(true)
    try {
      const response = await fetch("/api/admin/generate-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty: 3 }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err?.error || `Generation failed (${response.status})`)
      }
      const data = await response.json()
      const patient = data?.patient
      if (!patient?.demographics || !patient?.narrative) {
        throw new Error("Generation returned an unexpected shape")
      }
      // Pre-populate both step caches so the user lands on step-2 with
      // demographics already captured and the patient narrative filling
      // the primary-concern field. Existing data is overwritten.
      const sex: "male" | "female" | "other" =
        patient.demographics.sex === "male" || patient.demographics.sex === "female"
          ? patient.demographics.sex
          : "other"
      localStorage.setItem(
        "step1Data",
        JSON.stringify({ age: String(patient.demographics.age), biologicalSex: sex }),
      )
      const existingStep2 = (() => {
        try {
          return JSON.parse(localStorage.getItem("step2Data") || "{}")
        } catch {
          return {}
        }
      })()
      // Step-2 holds narrative + timeline + severity. Rare-disease test
      // cases are typically chronic ("1-2 years ago") with moderate-to-
      // high severity (6/10); the operator can override on the page.
      localStorage.setItem(
        "step2Data",
        JSON.stringify({
          ...existingStep2,
          primaryConcern: patient.narrative,
          mainSymptomStart: "1-2-years",
          severity: 6,
        }),
      )
      // Pre-populate the optional intake steps with empty arrays so the
      // operator can click straight through without seeing the "step
      // missing — sending you back" redirect chain. step3Data now
      // includes photos + documents alongside labResults (post-
      // consolidation); step4Data is retained for backwards-compat.
      localStorage.setItem(
        "step3Data",
        JSON.stringify({ labResults: [], photos: [], documents: [] }),
      )
      localStorage.setItem("step4Data", JSON.stringify({ photos: [] }))
      // Review step (now /step-4) — key stays step5Data for stability.
      localStorage.setItem("step5Data", JSON.stringify({ clarifications: "" }))
      // Consents (now /step-5) — key stays step6Data. Intentionally left
      // unchecked so the operator confirms explicitly.
      localStorage.setItem(
        "step6Data",
        JSON.stringify({
          consentAnalysis: false,
          consentNotSubstitute: false,
          consentAccurate: false,
        }),
      )
      // Persist the ground truth to sessionStorage so the
      // TestUserGroundTruthBanner can display the expected diagnosis
      // alongside the analysis output for verification. sessionStorage
      // (not localStorage) so it disappears when the tab closes.
      if (data?.groundTruth) {
        sessionStorage.setItem("testUserGroundTruth", JSON.stringify(data.groundTruth))
      }
      router.push("/step-2")
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create test user")
      setCreatingTestUser(false)
    }
  }

  const isFormValid = !!formData.age && !!formData.biologicalSex

  return (
    <Layout>
      <div className="min-h-screen bg-[#f5f0eb] py-4 sm:py-8">
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

          <IntakeBreadcrumb current={1} />

          <div className="text-center mb-4 sm:mb-10">
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-1.5 sm:mb-4">About you</h1>
            <p className="text-sm sm:text-lg text-gray-600">A couple basics to personalize your analysis</p>
          </div>

          <div className="bg-white border border-gray-100 p-4 sm:p-8 space-y-4 sm:space-y-8">
            <div className="space-y-2 sm:space-y-3">
              <label className="block text-base sm:text-lg font-semibold text-gray-900">
                Your age <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={formData.age}
                onChange={(e) => updateFormData("age", e.target.value)}
                className={cn(
                  "w-full px-4 py-3 sm:py-4 border rounded-none focus:ring-2 focus:ring-[#8b2500] focus:border-transparent text-base sm:text-lg",
                  errors.age ? "border-red-300" : "border-gray-200",
                )}
                placeholder="Enter your age"
              />
              {errors.age && <p className="text-red-600 text-sm">{errors.age}</p>}
            </div>

            <div className="space-y-2 sm:space-y-3">
              <label className="block text-base sm:text-lg font-semibold text-gray-900">
                Biological sex <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2 sm:space-y-3">
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
                    <span className="text-base sm:text-lg text-gray-900">{option.label}</span>
                  </label>
                ))}
              </div>
              {errors.biologicalSex && <p className="text-red-600 text-sm">{errors.biologicalSex}</p>}
            </div>

            <div className="pt-1 sm:pt-2 space-y-2 sm:space-y-3">
              {/* Continue + Create Test User. On desktop the link sits to
                  the right of the Continue button; on mobile it stacks
                  underneath. The link reuses the same generator the admin
                  testing page does — see /api/admin/generate-patient. */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6">
                <button
                  onClick={handleContinue}
                  disabled={!isFormValid || creatingTestUser}
                  className={cn(
                    "group w-full sm:w-auto px-8 py-3 sm:py-4 rounded-none font-semibold text-base sm:text-lg transition-all duration-300 sm:min-w-[220px]",
                    isFormValid && !creatingTestUser
                      ? "bg-[#8b2500] text-white"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed",
                  )}
                >
                  <span className="flex items-center justify-center space-x-2">
                    <span>Continue</span>
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateTestUser}
                  disabled={creatingTestUser}
                  className={cn(
                    "text-sm text-[#8b2500] underline underline-offset-4 hover:text-[#6d1d00] transition-colors flex items-center gap-2",
                    creatingTestUser && "cursor-wait opacity-80",
                  )}
                >
                  {creatingTestUser ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Creating challenging test patient…</span>
                    </>
                  ) : (
                    <span>Create Test User</span>
                  )}
                </button>
              </div>
              {createError && (
                <p className="text-center text-sm text-red-600">{createError}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
