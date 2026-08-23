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

// Bump when the consent wording changes; stored with each submit so a
// consent record can be tied to the exact text the user agreed to.
const CONSENT_VERSION = "2026-08-23-clickwrap-v2"

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
  const [engaged, setEngaged] = useState(false)
  // What we already learned, shown back to the user to reinforce progress
  // and hint at the payoff — a conversion lever at the consent gate.
  const [summary, setSummary] = useState<{ age?: string; sex?: string; symptomCount?: number }>({})

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

    // Pull what we already know for the value/progress panel.
    try {
      const s1 = JSON.parse(localStorage.getItem("step1Data") || "{}")
      const cnt = parseInt(localStorage.getItem("extractedSymptomCount") || "", 10)
      setSummary({
        age: s1.age || undefined,
        sex: s1.biologicalSex || undefined,
        symptomCount: Number.isFinite(cnt) ? cnt : undefined,
      })
    } catch {
      /* ignore */
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
    // Instrumentation: fire once when the user first touches any consent
    // box, so we can distinguish "reached consent, never engaged" from
    // "started checking but didn't finish".
    if (!engaged) {
      setEngaged(true)
      trackEvent("form-snapshot", { step: 5, data: { consentEvent: "engaged" } })
    }
  }

  // Only the health-data/AI consent is a discrete opt-in checkbox. The
  // acknowledgments (not-a-substitute; 18+/accurate/authorized) are captured
  // by the clickwrap statement on the Start button, so clicking = agreeing.
  const validate = () => {
    const next: Record<string, string> = {}
    if (!formData.consentAnalysis) next.consentAnalysis = "Please check the box to consent to AI analysis"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const missingItems = [
    !formData.consentAnalysis ? "Consent to AI analysis of your information" : null,
  ].filter(Boolean) as string[]

  const handleBack = () => {
    localStorage.setItem("step6Data", JSON.stringify(formData))
    router.push("/step-4")
  }

  const handleSubmit = () => {
    if (!validate()) {
      // Feedback instead of a dead button: surface the summary, mark the
      // unchecked boxes, scroll it into view, and record the blocked attempt
      // so we can see which consents people balk at.
      setShowValidationSummary(true)
      trackEvent("form-snapshot", {
        step: 5,
        data: {
          consentEvent: "blocked",
          checked: { ...formData },
          missing: missingItems,
        },
      })
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    // Clicking Start is affirmative agreement to the acknowledgments shown on
    // the button (clickwrap), on top of the explicit AI-analysis checkbox.
    const agreed = { consentAnalysis: true, consentNotSubstitute: true, consentAccurate: true }
    localStorage.setItem("step6Data", JSON.stringify(agreed))

    // Write an immutable server-side consent record (durable evidence with
    // IP + UA + timestamp). Fire-and-forget with keepalive so it survives the
    // navigation to /analysis and never blocks the user.
    try {
      const sessionId = localStorage.getItem("sl_session_id")
      void fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          consentVersion: CONSENT_VERSION,
          method: "checkbox+clickwrap",
          sessionId,
          agreed,
        }),
      }).catch(() => undefined)
    } catch {
      /* never block submit on consent-logging */
    }

    trackEvent("step-complete", { step: 5 })
    // Consent record: the session event is stored server-side (KV) with IP +
    // user-agent + timestamp, so folding the exact consent version + method +
    // agreed flags into analysis-start gives a durable, attributable record
    // of what the user agreed to and when.
    trackEvent("analysis-start", {
      step: 6,
      data: {
        consentVersion: CONSENT_VERSION,
        consentMethod: "checkbox+clickwrap",
        consent: agreed,
      },
    })
    router.push("/analysis")
  }

  const isFormValid = formData.consentAnalysis

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

          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">One last step</h1>
            <p className="text-lg text-gray-600">
              Agree to the terms below and we&rsquo;ll start your analysis.
            </p>
          </div>

          {/* Value / progress panel — remind them what they've built and what
              they'll get, right before the consent ask. */}
          <div className="max-w-3xl mx-auto mb-6 bg-[#faf6f0] border border-[#d4c5b0] p-5 sm:p-6">
            <p className="text-sm text-gray-800">
              {typeof summary.symptomCount === "number" && summary.symptomCount > 0 ? (
                <>
                  Your case is ready. We&rsquo;ve organized{" "}
                  <strong>
                    {summary.symptomCount} symptom{summary.symptomCount === 1 ? "" : "s"}
                  </strong>{" "}
                  from your history
                  {summary.age && summary.sex ? (
                    <> for a {summary.age}-year-old {summary.sex}</>
                  ) : null}
                  .
                </>
              ) : (
                <>Your case is ready to analyze.</>
              )}
            </p>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              In about 8&ndash;10 minutes you&rsquo;ll get a ranked list of up to 10 conditions that
              could explain your symptoms &mdash; including rare ones that are often missed &mdash;
              and the specific tests that can help confirm or rule out each one.
            </p>
          </div>

          <div className="max-w-3xl mx-auto bg-white border border-gray-100 p-6 sm:p-8 space-y-8">
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#8b2500]" />
                Consent
              </h2>
              <div className="space-y-2 text-sm">
                <label
                  className={`flex items-start gap-3 p-3 border-2 cursor-pointer transition-colors ${
                    errors.consentAnalysis
                      ? "border-red-400 bg-red-50"
                      : formData.consentAnalysis
                        ? "border-[#8b2500] bg-[#faf6f0]"
                        : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.consentAnalysis}
                    onChange={(e) => update("consentAnalysis", e.target.checked)}
                    className="mt-1 h-4 w-4 accent-[#8b2500]"
                  />
                  <span className="text-gray-800">
                    I consent to AI analysis of the information I provided. My symptom narrative
                    will be processed by OpenAI and Anthropic language models and stored for up to
                    90 days. See the{" "}
                    <Link href="/legal/privacy" className="text-[#8b2500] underline" target="_blank">
                      Privacy Policy
                    </Link>{" "}
                    for what we store, where, and for how long.
                  </span>
                </label>
                {errors.consentAnalysis && (
                  <p className="text-red-600">{errors.consentAnalysis}</p>
                )}
              </div>
            </div>

            {/* Clickwrap acknowledgments: the act of clicking Start is
                affirmative agreement to these, alongside the AI-consent box
                above. Placed immediately before the button so it's conspicuous
                at the point of action. */}
            <p className="text-sm text-gray-600 leading-relaxed border-t border-gray-200 pt-6">
              By clicking <strong>Start my analysis</strong>, you confirm you are 18 or older, that
              the information you entered is accurate and that you are authorized to submit it
              (about yourself, or about someone you legally represent), and you understand that
              SecondLook is an educational research preview &mdash;{" "}
              <strong>not a medical device</strong>, not a substitute for evaluation, diagnosis, or
              treatment by a licensed clinician, and does not create a clinician&ndash;patient
              relationship. See our{" "}
              <Link href="/legal/terms" className="text-[#8b2500] underline" target="_blank">
                Terms of Use
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="text-[#8b2500] underline" target="_blank">
                Privacy Policy
              </Link>
              .
            </p>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
              <button
                onClick={handleBack}
                className="group flex items-center space-x-2 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold w-full sm:w-auto justify-center"
              >
                <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                <span>Back</span>
              </button>

              {/* Always clickable — an incomplete click shows the checklist
                  instead of a dead, unexplained grey button. Consent is still
                  required: handleSubmit blocks and gives feedback until all
                  boxes are checked. */}
              <button
                onClick={handleSubmit}
                aria-disabled={!isFormValid}
                className="px-8 py-4 font-semibold text-lg transition-all duration-300 w-full sm:w-auto min-w-[260px] bg-[#8b2500] text-white hover:bg-[#6d1d00]"
              >
                Start my analysis
              </button>
            </div>
            <p className="text-center sm:text-right text-sm text-gray-500">
              Evaluations take 8&ndash;10 mins.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
