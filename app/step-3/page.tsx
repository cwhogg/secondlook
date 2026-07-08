"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import { UnifiedFileUpload, type ExtractedDocument } from "@/components/unified-file-upload"
import { LabVerification } from "@/components/lab-verification"
import { IntakeBreadcrumb } from "@/components/intake-breadcrumb"
import { trackEvent } from "@/lib/session-tracker"
import { ArrowLeft, ArrowRight, CheckCircle, SkipForward, X } from "lucide-react"
import type { LabResult } from "@/lib/types/index"
import type { ExtractedSymptomPhoto } from "@/components/symptom-photo-upload"
import { cn } from "@/lib/utils"

/**
 * Consolidated upload step. Previously two separate screens (labs on
 * step-3, photos on the old step-4). Now one dropzone that accepts
 * PDFs and images, classifies each via /api/extract-document, and
 * routes to the appropriate extractor.
 *
 * Storage: everything the user uploads on this step goes into step3Data.
 * Photos previously lived in step4Data; the analysis loader below
 * (app/analysis/page.tsx) reads photos from step3Data.photos first and
 * falls back to legacy step4Data for anyone mid-flow when this shipped.
 */
interface Step3Data {
  labResults: LabResult[]
  photos: ExtractedSymptomPhoto[]
  documents?: ExtractedDocument[]
}

export default function Step3() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step3Data>({
    labResults: [],
    photos: [],
    documents: [],
  })
  const [autoSaved, setAutoSaved] = useState(false)

  useEffect(() => {
    trackEvent("step-view", { step: 3 })
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

    // Load step3Data. Also fold in any legacy step4Data.photos so users
    // who had progress before this consolidation don't lose their uploads.
    const saved = localStorage.getItem("step3Data")
    const legacyPhotos = localStorage.getItem("step4Data")
    let base: Step3Data = { labResults: [], photos: [], documents: [] }
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        base = {
          labResults: Array.isArray(parsed.labResults) ? parsed.labResults : [],
          photos: Array.isArray(parsed.photos) ? parsed.photos : [],
          documents: Array.isArray(parsed.documents) ? parsed.documents : [],
        }
      } catch {
        // ignore
      }
    }
    if (legacyPhotos && base.photos.length === 0) {
      try {
        const parsed = JSON.parse(legacyPhotos)
        if (Array.isArray(parsed.photos) && parsed.photos.length > 0) {
          base.photos = parsed.photos
        }
      } catch {
        // ignore
      }
    }
    setFormData(base)
  }, [router])

  useEffect(() => {
    const timer = setTimeout(() => {
      const hasAny =
        formData.labResults.length > 0 ||
        formData.photos.length > 0 ||
        (formData.documents?.length ?? 0) > 0
      if (hasAny) {
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
    // Also mirror to step4Data for backwards-compat with the analysis
    // loader that still checks for it. Empty photos array is fine.
    localStorage.setItem(
      "step4Data",
      JSON.stringify({ photos: formData.photos }),
    )
    trackEvent("step-complete", {
      step: 3,
      form: {
        labResultCount: formData.labResults.length,
        photoCount: formData.photos.length,
        documentCount: formData.documents?.length ?? 0,
      },
    })
    router.push("/step-4")
  }

  const handleSkip = () => {
    localStorage.setItem(
      "step3Data",
      JSON.stringify({ labResults: [], photos: [], documents: [] }),
    )
    localStorage.setItem("step4Data", JSON.stringify({ photos: [] }))
    trackEvent("step-complete", {
      step: 3,
      form: { labResultCount: 0, photoCount: 0, documentCount: 0 },
      data: { skipped: true },
    })
    router.push("/step-4")
  }

  const removePhoto = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== idx),
    }))
  }

  const removeDocument = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      documents: (prev.documents ?? []).filter((_, i) => i !== idx),
    }))
  }

  const hasAnyUploads =
    formData.labResults.length > 0 ||
    formData.photos.length > 0 ||
    (formData.documents?.length ?? 0) > 0

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
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Upload any other medical documents
            </h1>
            <p className="text-lg text-gray-600">
              Optional — labs, imaging reports, after-visit summaries, photos of visible
              symptoms. We'll figure out what each file is. Skip if you don't have any.
            </p>
          </div>

          <div className="max-w-3xl mx-auto bg-white border border-gray-100 p-6 sm:p-8 space-y-8">
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">Examples:</span>{" "}
                a lab report PDF, an X-ray or MRI report, an after-visit summary,
                a discharge note, a photo of a rash or swelling, a screenshot of an
                imaging finding. Drop them all here.
              </p>
              <UnifiedFileUpload
                onLabsExtracted={(newLabs) => {
                  setFormData((prev) => ({
                    ...prev,
                    labResults: [...prev.labResults, ...newLabs],
                  }))
                }}
                onPhotoExtracted={(photo) => {
                  setFormData((prev) => ({
                    ...prev,
                    photos: [...prev.photos, photo],
                  }))
                }}
                onDocumentExtracted={(doc) => {
                  setFormData((prev) => ({
                    ...prev,
                    documents: [...(prev.documents ?? []), doc],
                  }))
                }}
              />

              {formData.labResults.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
                    Lab values ({formData.labResults.length})
                  </div>
                  <LabVerification
                    labs={formData.labResults}
                    onChange={(next) =>
                      setFormData((prev) => ({ ...prev, labResults: next }))
                    }
                  />
                </div>
              )}

              {formData.photos.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
                    Photo findings ({formData.photos.length})
                  </div>
                  <div className="border border-gray-200 p-4 bg-[#fafafa]">
                    <ul className="space-y-2">
                      {formData.photos.map((p, i) => (
                        <li
                          key={i}
                          className="flex items-start justify-between gap-2 text-sm text-gray-800"
                        >
                          <div className="flex-1 leading-snug">
                            {p.bodyPart && (
                              <span className="font-semibold">{p.bodyPart}: </span>
                            )}
                            {p.description}
                            <div className="text-xs text-gray-500 mt-0.5">from {p.fileName}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            aria-label={`Remove ${p.fileName}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {(formData.documents?.length ?? 0) > 0 && (
                <div className="pt-2">
                  <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
                    Documents ({formData.documents?.length ?? 0})
                  </div>
                  <div className="border border-gray-200 p-4 bg-[#fafafa]">
                    <ul className="space-y-2">
                      {formData.documents?.map((d, i) => (
                        <li
                          key={i}
                          className="flex items-start justify-between gap-2 text-sm text-gray-800"
                        >
                          <div className="flex-1 leading-snug min-w-0">
                            <div className="font-semibold truncate">{d.fileName}</div>
                            <div className="text-xs text-gray-600 mt-0.5 line-clamp-3">
                              {d.extractedText.slice(0, 300)}
                              {d.extractedText.length > 300 && "…"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDocument(i)}
                            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            aria-label={`Remove ${d.fileName}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
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
                {!hasAnyUploads && (
                  <button
                    onClick={handleSkip}
                    className="group flex items-center justify-center space-x-2 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold"
                  >
                    <SkipForward className="h-5 w-5" />
                    <span>Skip — no files</span>
                  </button>
                )}
                <button
                  onClick={handleContinue}
                  className={cn(
                    "group px-8 py-4 font-semibold text-lg transition-all duration-300 w-full sm:w-auto min-w-0 sm:min-w-[220px] bg-[#8b2500] text-white",
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
