"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Layout } from "@/components/layout"
import { IntakeBreadcrumb } from "@/components/intake-breadcrumb"
import { mapSingleSymptom } from "@/lib/symptom-parser"
import { ArrowLeft, ArrowRight, CheckCircle, Loader2 } from "lucide-react"
import type { ExtractedSymptomPhoto } from "@/components/symptom-photo-upload"

interface Step5Data {
  clarifications: string
}

interface ExtractedPreview {
  originalPhrase: string
  medicalTerm: string | null
  code: string | null
  codeSystem: "SNOMED" | "UMLS CUI" | null
}

const CLARIFICATIONS_MAX = 2000

function buildCombinedNarrative(
  primaryConcern: string,
  photos: ExtractedSymptomPhoto[],
): string {
  if (photos.length === 0) return primaryConcern
  const photoBlock = photos
    .map((p) => (p.bodyPart ? `${p.bodyPart}: ${p.description}` : p.description))
    .join("\n")
  const sep = primaryConcern.trim()
    ? "\n\n--- Visible findings (from uploaded photos) ---\n\n"
    : ""
  return `${primaryConcern}${sep}${photoBlock}`
}

export default function Step5() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step5Data>({ clarifications: "" })
  const [autoSaved, setAutoSaved] = useState(false)

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

    const saved = localStorage.getItem("step5Data")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setFormData({
          clarifications:
            typeof parsed.clarifications === "string" ? parsed.clarifications : "",
        })
      } catch {
        // ignore
      }
    }

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

  const handleBack = () => {
    localStorage.setItem("step5Data", JSON.stringify(formData))
    router.push("/step-4")
  }

  const handleContinue = () => {
    localStorage.setItem("step5Data", JSON.stringify(formData))
    router.push("/step-6")
  }

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

          <IntakeBreadcrumb current={5} />

          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Review your symptoms</h1>
            <p className="text-lg text-gray-600">
              These are the symptoms our system extracted from your inputs. Review them before submitting.
            </p>
          </div>

          <div className="max-w-3xl mx-auto bg-white border border-gray-100 p-6 sm:p-8 space-y-8">
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

            {!extracting && (
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-gray-900">
                  Add clarifications{" "}
                  <span className="text-gray-500 text-base font-normal">(optional)</span>
                </h2>
                <p className="text-sm text-gray-600">
                  Anything you want to clarify about the extracted symptoms or add context.
                </p>
                <textarea
                  rows={4}
                  maxLength={CLARIFICATIONS_MAX}
                  value={formData.clarifications}
                  onChange={(e) =>
                    setFormData({ clarifications: e.target.value.slice(0, CLARIFICATIONS_MAX) })
                  }
                  className="w-full px-4 py-3 border border-gray-200 rounded-none focus:ring-2 focus:ring-[#8b2500] focus:border-transparent text-base resize-none"
                  placeholder="Example: the wrist stiffness is worse in the morning and improves throughout the day."
                />
                <div className="text-right text-xs text-gray-500">
                  {formData.clarifications.length} / {CLARIFICATIONS_MAX}
                </div>
              </div>
            )}

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
                disabled={extracting}
                className={`group px-8 py-4 font-semibold text-lg transition-all duration-300 w-full sm:w-auto min-w-[260px] ${
                  extracting
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-[#8b2500] text-white"
                }`}
              >
                <span className="flex items-center justify-center space-x-2">
                  {extracting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Extracting symptoms…</span>
                    </>
                  ) : (
                    <>
                      <span>Continue to consent</span>
                      <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
