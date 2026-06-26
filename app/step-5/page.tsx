"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Layout } from "@/components/layout"
import { IntakeBreadcrumb } from "@/components/intake-breadcrumb"
import { mapSingleSymptom } from "@/lib/symptom-parser"
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Shield,
} from "lucide-react"
import type { ExtractedSymptomPhoto } from "@/components/symptom-photo-upload"

interface Step5Data {
  consentAnalysis: boolean
  consentNotSubstitute: boolean
  consentAccurate: boolean
}

interface ExtractedPreview {
  originalPhrase: string
  medicalTerm: string | null
  code: string | null
  codeSystem: "SNOMED" | "UMLS CUI" | null
}

function buildCombinedNarrative(
  primaryConcern: string,
  photos: ExtractedSymptomPhoto[],
): string {
  if (photos.length === 0) return primaryConcern
  const photoBlock = photos
    .map((p) =>
      p.bodyPart ? `${p.bodyPart}: ${p.description}` : p.description,
    )
    .join("\n")
  const sep = primaryConcern.trim()
    ? "\n\n--- Visible findings (from uploaded photos) ---\n\n"
    : ""
  return `${primaryConcern}${sep}${photoBlock}`
}

export default function Step5() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step5Data>({
    consentAnalysis: false,
    consentNotSubstitute: false,
    consentAccurate: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaved, setAutoSaved] = useState(false)
  const [showValidationSummary, setShowValidationSummary] = useState(false)

  // Symptom-extraction preview state.
  const [extracting, setExtracting] = useState(true)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedPreview[]>([])
  const [excluded, setExcluded] = useState<string[]>([])
  const [photoCount, setPhotoCount] = useState(0)
  const [labCount, setLabCount] = useState(0)

  useEffect(() => {
    const step1 = localStorage.getItem("step1Data")
    const step2 = localStorage.getItem("step2Data")
    const step3 = localStorage.getItem("step3Data")
    const step4 = localStorage.getItem("step4Data")
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
    if (!step4) {
      router.push("/step-4")
      return
    }

    // Load my own saved state if returning to this step.
    const saved = localStorage.getItem("step5Data")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setFormData((prev) => ({
          ...prev,
          consentAnalysis:
            typeof parsed.consentAnalysis === "boolean" ? parsed.consentAnalysis : false,
          consentNotSubstitute:
            typeof parsed.consentNotSubstitute === "boolean"
              ? parsed.consentNotSubstitute
              : false,
          consentAccurate:
            typeof parsed.consentAccurate === "boolean" ? parsed.consentAccurate : false,
        }))
      } catch {
        // ignore
      }
    }

    // Kick off the preview parse over the combined narrative + photo
    // descriptions. We re-run the same /api/parse-symptoms call /analysis
    // would have made — surfacing it here lets the patient see what we
    // think their symptoms are BEFORE consenting and waiting 8-10 minutes.
    let cancelled = false
    ;(async () => {
      try {
        const parsedStep1 = JSON.parse(step1)
        const parsedStep2 = JSON.parse(step2)
        const parsedStep3 = JSON.parse(step3)
        const parsedStep4 = JSON.parse(step4)

        const photos: ExtractedSymptomPhoto[] = Array.isArray(parsedStep4.photos)
          ? parsedStep4.photos
          : []
        setPhotoCount(photos.length)
        setLabCount(Array.isArray(parsedStep3.labResults) ? parsedStep3.labResults.length : 0)

        const combined = buildCombinedNarrative(
          parsedStep2.primaryConcern || "",
          photos,
        )
        if (!combined.trim()) {
          setExtractError(
            "We don't have any history yet. Go back to “Your history” and add a narrative or document.",
          )
          setExtracting(false)
          return
        }

        const res = await fetch("/api/parse-symptoms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: combined,
            patientAge: parsedStep1.age,
            patientSex: parsedStep1.biologicalSex,
          }),
        })
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !data) {
          setExtractError(
            data?.error || `Couldn't extract symptoms (HTTP ${res.status}).`,
          )
          setExtracting(false)
          return
        }

        const rawSymptoms: any[] = Array.isArray(data.symptoms) ? data.symptoms : []

        // Map each parsed symptom to UMLS in parallel so we can show the
        // CUI alongside the medical term — same enrichment /analysis does,
        // surfaced here so the patient sees a credible mapping before
        // consenting. Errors per symptom degrade to no-code rather than
        // failing the whole preview.
        const mapped = await Promise.all(
          rawSymptoms.map(async (s) => {
            try {
              return await mapSingleSymptom(s)
            } catch {
              return null
            }
          }),
        )
        if (cancelled) return

        const previews: ExtractedPreview[] = mapped.map((m, i) => {
          const raw = rawSymptoms[i] || {}
          const concept = m?.selectedConcept || null
          return {
            originalPhrase: m?.originalPhrase || raw.originalPhrase || raw.text || "",
            medicalTerm: m?.medicalTerm || raw.medicalTerm || null,
            code: concept?.cui || null,
            codeSystem: concept?.cui ? "UMLS CUI" : null,
          }
        })
        setExtracted(previews)

        const exc: string[] = Array.isArray(data.excludedFindings)
          ? data.excludedFindings
              .map((e: any) =>
                typeof e === "string" ? e : e?.medicalTerm || e?.originalPhrase || "",
              )
              .filter((s: string) => s.length > 0)
          : []
        setExcluded(exc)

        // Cache the parsed preview AND the UMLS-mapped results so
        // /analysis can reuse them and skip its own parse + map round
        // trip. Stored separately from step5Data so the consent state
        // stays clean.
        localStorage.setItem(
          "step5PreviewParse",
          JSON.stringify({
            symptoms: data.symptoms || [],
            excludedFindings: data.excludedFindings || [],
            combinedNarrative: combined,
          }),
        )
        localStorage.setItem(
          "mappedSymptoms",
          JSON.stringify(mapped.filter((m) => m !== null)),
        )
      } catch (err: any) {
        if (!cancelled) {
          setExtractError(err?.message || "Couldn't extract symptoms.")
        }
      } finally {
        if (!cancelled) setExtracting(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem("step5Data", JSON.stringify(formData))
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 1500)
    }, 800)
    return () => clearTimeout(timer)
  }, [formData])

  const update = (field: keyof Step5Data, value: any) => {
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
    !formData.consentNotSubstitute ? "Acknowledgment this is not a substitute for medical care" : null,
    !formData.consentAccurate ? "Confirmation your information is accurate" : null,
  ].filter(Boolean) as string[]

  const handleBack = () => {
    localStorage.setItem("step5Data", JSON.stringify(formData))
    router.push("/step-4")
  }

  const handleSubmit = () => {
    if (!validate()) {
      setShowValidationSummary(true)
      return
    }
    localStorage.setItem("step5Data", JSON.stringify(formData))
    router.push("/analysis")
  }

  const isFormValid =
    formData.consentAnalysis &&
    formData.consentNotSubstitute &&
    formData.consentAccurate

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
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Review &amp; submit</h1>
            <p className="text-lg text-gray-600">
              What we extracted, plus a couple final questions and consent.
            </p>
          </div>

          <div className="max-w-3xl mx-auto bg-white border border-gray-100 p-6 sm:p-8 space-y-8">
            {/* Extracted symptoms preview */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-gray-900">Symptoms we extracted</h2>
              {extracting && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin text-[#8b2500]" />
                  <span>Reading your history…</span>
                </div>
              )}
              {extractError && (
                <div className="bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                  {extractError}
                </div>
              )}
              {!extracting && !extractError && (
                <>
                  <div className="text-xs text-gray-600 mb-1">
                    From your written history
                    {labCount > 0 && `, ${labCount} lab result${labCount === 1 ? "" : "s"}`}
                    {photoCount > 0 && `, and ${photoCount} symptom photo${photoCount === 1 ? "" : "s"}`}.
                  </div>
                  {extracted.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                      We didn't find any symptoms in what you provided. You can still submit, but the
                      analysis will be more useful if you go back and add detail.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {extracted.slice(0, 60).map((s, i) => (
                        <div
                          key={`${s.medicalTerm}-${i}`}
                          className="border border-[#e8ddd0] bg-[#fdfcfa] rounded-sm p-2.5"
                        >
                          <div className="text-sm font-medium text-gray-900">
                            {s.medicalTerm || s.originalPhrase}
                          </div>
                          {s.medicalTerm && s.originalPhrase && s.medicalTerm !== s.originalPhrase && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              From: &ldquo;{s.originalPhrase}&rdquo;
                            </div>
                          )}
                          <div className="text-xs text-[#6d4c30] mt-1">
                            {s.code && s.codeSystem
                              ? `${s.codeSystem}: ${s.code}`
                              : "Code: not mapped"}
                          </div>
                        </div>
                      ))}
                      {extracted.length > 60 && (
                        <div className="text-xs text-gray-500 pt-1">
                          …and {extracted.length - 60} more.
                        </div>
                      )}
                    </div>
                  )}
                  {excluded.length > 0 && (
                    <div className="text-xs text-gray-600">
                      Also flagged as <span className="font-semibold">explicitly excluded</span>:{" "}
                      {excluded.slice(0, 8).join(", ")}
                      {excluded.length > 8 && ` (and ${excluded.length - 8} more)`}
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    If anything important is missing,{" "}
                    <Link href="/step-2" className="text-[#8b2500] underline">
                      go back to your history
                    </Link>{" "}
                    and add it.
                  </div>
                </>
              )}
            </div>

            {/* Consent */}
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
                  isFormValid ? "bg-[#8b2500] text-white" : "bg-gray-200 text-gray-500 cursor-not-allowed"
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
