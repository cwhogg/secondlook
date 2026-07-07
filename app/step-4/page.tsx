"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout"
import {
  SymptomPhotoUpload,
  type ExtractedSymptomPhoto,
} from "@/components/symptom-photo-upload"
import { IntakeBreadcrumb } from "@/components/intake-breadcrumb"
import { trackEvent } from "@/lib/session-tracker"
import { ArrowLeft, ArrowRight, CheckCircle, SkipForward, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step4Data {
  photos: ExtractedSymptomPhoto[]
}

export default function Step4() {
  const router = useRouter()
  const [formData, setFormData] = useState<Step4Data>({ photos: [] })
  const [autoSaved, setAutoSaved] = useState(false)

  useEffect(() => {
    trackEvent("step-view", { step: 4 })
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
        setFormData({
          photos: Array.isArray(parsed.photos) ? parsed.photos : [],
        })
      } catch {
        // ignore
      }
    }
  }, [router])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.photos.length > 0) {
        localStorage.setItem("step4Data", JSON.stringify(formData))
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 1500)
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [formData])

  const handleBack = () => {
    localStorage.setItem("step4Data", JSON.stringify(formData))
    router.push("/step-3")
  }

  const handleContinue = () => {
    localStorage.setItem("step4Data", JSON.stringify(formData))
    trackEvent("step-complete", {
      step: 4,
      form: { photoCount: formData.photos.length },
    })
    router.push("/step-5")
  }

  const handleSkip = () => {
    localStorage.setItem("step4Data", JSON.stringify({ photos: [] }))
    trackEvent("step-complete", {
      step: 4,
      form: { photoCount: 0 },
      data: { skipped: true },
    })
    router.push("/step-5")
  }

  const removePhoto = (idx: number) => {
    setFormData((prev) => ({ photos: prev.photos.filter((_, i) => i !== idx) }))
  }

  const hasPhotos = formData.photos.length > 0

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

          <IntakeBreadcrumb current={4} />

          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Photos &amp; imaging</h1>
            <p className="text-lg text-gray-600">
              Optional — upload photos of visible symptoms or any medical imaging. Skip if you don't have any.
            </p>
          </div>

          <div className="max-w-3xl mx-auto bg-white border border-gray-100 p-6 sm:p-8 space-y-8">
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Good for: a skin rash, eye redness, joint swelling, visible deformities — or medical
                imaging like an X-ray, CT, MRI, or ultrasound. We'll describe what's visible in clinical
                terms and include it in the analysis. Do not upload anyone else's images.
              </p>

              <SymptomPhotoUpload
                onExtracted={(item) => {
                  setFormData((prev) => ({ photos: [...prev.photos, item] }))
                }}
              />

              {hasPhotos && (
                <div className="border border-gray-200 p-4 bg-[#fafafa]">
                  <div className="text-sm font-semibold text-gray-900 mb-2">
                    Saved findings ({formData.photos.length}):
                  </div>
                  <ul className="space-y-2">
                    {formData.photos.map((p, i) => (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-2 text-sm text-gray-800"
                      >
                        <div className="flex-1 leading-snug">
                          {p.bodyPart && <span className="font-semibold">{p.bodyPart}: </span>}
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
                {!hasPhotos && (
                  <button
                    onClick={handleSkip}
                    className="group flex items-center justify-center space-x-2 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold"
                  >
                    <SkipForward className="h-5 w-5" />
                    <span>Skip — no photos</span>
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
