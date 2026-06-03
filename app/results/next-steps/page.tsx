"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Home,
  TestTubes,
  Dna,
  ScanLine,
  Stethoscope,
  AlertTriangle,
  Zap,
  Globe,
  MapPin,
  Info,
  CheckCircle,
} from "lucide-react"
import { MedicalButton } from "@/components/medical-button"

interface RecommendedTest {
  testType: string
  testName: string
  rationale: string
  urgency?: string
  targetDiagnoses?: string[]
}

interface StoredAnalysis {
  recommendedTesting?: RecommendedTest[]
  nextSteps?: {
    immediateActions?: string[]
    specialistReferrals?: string[]
    followUpTiming?: string
    redFlags?: string[]
  }
}

type Category = "laboratory" | "genetic_testing" | "imaging" | "specialist_evaluate" | "other"

const CATEGORY_META: Record<Category, { label: string; Icon: typeof TestTubes; short: string }> = {
  laboratory: { label: "Lab test", Icon: TestTubes, short: "blood / urine / tissue work" },
  genetic_testing: { label: "Genetic test", Icon: Dna, short: "DNA panel or exome sequencing" },
  imaging: { label: "Imaging", Icon: ScanLine, short: "MRI / CT / ultrasound / X-ray" },
  specialist_evaluate: { label: "Specialist visit", Icon: Stethoscope, short: "in-person or telehealth" },
  other: { label: "Other", Icon: Info, short: "" },
}

const CATEGORY_ORDER: Category[] = ["laboratory", "genetic_testing", "imaging", "specialist_evaluate", "other"]

function normalizeCategory(testType: string): Category {
  const t = (testType || "").toLowerCase()
  if (t === "specialist_evaluation" || t === "specialist_evaluate") return "specialist_evaluate"
  if (t === "laboratory" || t === "lab") return "laboratory"
  if (t === "genetic_testing" || t === "genetics") return "genetic_testing"
  if (t === "imaging") return "imaging"
  return "other"
}

interface WhereInfo {
  blurb: string
  inPersonExamples: string[]
  online: { available: boolean; note?: string }
  costRange?: string
}

function getWhereToGetIt(category: Category, testName: string): WhereInfo {
  switch (category) {
    case "laboratory":
      return {
        blurb:
          "A standard outpatient blood (or urine) draw. Most insurance plans cover routine panels; cash-pay prices are usually $30–$200 per panel.",
        inPersonExamples: ["Quest Diagnostics", "LabCorp", "Your hospital outpatient lab"],
        online: {
          available: true,
          note:
            "Common panels (CBC, metabolic, thyroid, ANA, inflammatory markers) can be ordered without a doctor through Quest Direct, LabCorp OnDemand, or Empower DX — you pick the test online, get a requisition, and walk into a draw site.",
        },
        costRange: "$30–$200 typical",
      }
    case "genetic_testing":
      return {
        blurb:
          "Most rare-disease panels need a doctor or genetic counselor to order. Sample is usually saliva or a single blood draw. Results take 2–6 weeks.",
        inPersonExamples: ["Invitae", "GeneDx", "Variantyx", "Blueprint Genetics"],
        online: {
          available: true,
          note:
            "Several clinical genetics labs (Invitae, GeneDx) offer a sponsored-physician pathway: you submit symptoms online, their network physician signs the order, and a kit ships to your home. Many of these programs are no-cost when you have qualifying symptoms.",
        },
        costRange: "$0 (sponsored) – $3,000",
      }
    case "imaging":
      return {
        blurb:
          "Requires a doctor's order. Independent imaging centers are typically 30–70% cheaper than hospital imaging for the same scan.",
        inPersonExamples: ["RadNet", "SimonMed", "Touchstone Imaging", "Hospital radiology"],
        online: {
          available: false,
        },
        costRange: "$100–$3,000 depending on scan and facility",
      }
    case "specialist_evaluate": {
      const lower = testName.toLowerCase()
      let telehealth = "Telehealth specialty visits are available for many fields and most accept insurance."
      if (lower.includes("cardio") || lower.includes("heart")) {
        telehealth = "Heartbeat Health and Sesame offer cardiology telehealth visits, including ECG/Holter interpretation."
      } else if (lower.includes("neuro")) {
        telehealth = "Synapticure (rare neuro / ALS) and Cerebral Neurology offer remote neurology consults."
      } else if (lower.includes("psych")) {
        telehealth = "Talkiatry, Cerebral, and Brightside offer telehealth psychiatry across most states."
      } else if (lower.includes("gastro")) {
        telehealth = "Oshi Health and Sesame have GI telehealth programs."
      } else if (lower.includes("genet")) {
        telehealth = "Genome Medical and GeneDx Genetic Counseling offer telehealth genetic-counseling visits."
      } else if (lower.includes("derm")) {
        telehealth = "Dermatology telehealth is widely available via Apostrophe, Curology, and most major insurers."
      } else if (lower.includes("endo")) {
        telehealth = "Paloma Health (thyroid) and Steady Health offer endocrinology telehealth."
      }
      return {
        blurb:
          "Most specialists need a referral from your primary care doctor. Many telehealth specialty services let you book directly without a referral.",
        inPersonExamples: ["Hospital-affiliated specialty clinics", "Academic medical centers (often best for rare disease)"],
        online: {
          available: true,
          note: telehealth,
        },
      }
    }
    default:
      return {
        blurb: "Ask your primary care doctor for a referral or order. Academic medical centers are best for unusual or complex workups.",
        inPersonExamples: [],
        online: { available: false },
      }
  }
}

function getUrgencyBadge(urgency?: string) {
  switch (urgency) {
    case "urgent":
      return { label: "Urgent", className: "bg-red-100 text-red-800 border-red-300" }
    case "when_available":
      return { label: "When you can", className: "bg-gray-100 text-gray-700 border-gray-300" }
    case "routine":
    default:
      return { label: "Routine", className: "bg-[#faf6f0] text-[#6d1d00] border-[#d4c5b0]" }
  }
}

export default function NextStepsPage() {
  const [results, setResults] = useState<StoredAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
    const stored = sessionStorage.getItem("analysisResults")
    if (stored) {
      try {
        setResults(JSON.parse(stored))
      } catch (err) {
        console.error("Error parsing stored results:", err)
      }
    }
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8b2500] mx-auto"></div>
          <p className="mt-6 text-gray-600 text-lg">Loading recommendations…</p>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-6 text-lg">No analysis results found</div>
          <MedicalButton onClick={() => router.push("/step-1")} className="flex items-center space-x-2">
            <Home className="h-5 w-5" />
            <span>Start New Analysis</span>
          </MedicalButton>
        </div>
      </div>
    )
  }

  const tests: RecommendedTest[] = results.recommendedTesting ?? []
  const immediateActions = results.nextSteps?.immediateActions ?? []
  const specialistReferrals = results.nextSteps?.specialistReferrals ?? []
  const followUpTiming = results.nextSteps?.followUpTiming ?? ""
  const redFlags = results.nextSteps?.redFlags ?? []

  // Group tests by normalized category, preserve relative order within group
  const grouped: Record<Category, RecommendedTest[]> = {
    laboratory: [],
    genetic_testing: [],
    imaging: [],
    specialist_evaluate: [],
    other: [],
  }
  for (const test of tests) {
    grouped[normalizeCategory(test.testType)].push(test)
  }

  const hasAnyTests = tests.length > 0
  const hasUrgent =
    tests.some((t) => t.urgency === "urgent") ||
    redFlags.length > 0

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10 pb-28 sm:pb-32 space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="bg-[#8b2500] text-white p-5 sm:p-8">
          <div className="mb-2">
            <Link href="/" className="text-white/80 hover:text-white text-sm font-medium">
              SecondLook
            </Link>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold mb-2">Your Recommended Next Steps</h1>
          <p className="text-[#f0d9c3] text-sm sm:text-lg">
            Based on your analysis, here are the tests we think will move you closer to a clear answer — and where to go for each one.
          </p>
        </div>

        {/* Time-sensitive banner */}
        {hasUrgent && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 sm:p-5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-900 text-sm sm:text-base">Some items below are time-sensitive</div>
              <div className="text-red-800 text-xs sm:text-sm mt-1">
                Items marked <span className="font-semibold">Urgent</span> should be scheduled within days, not weeks. If you experience any of the warning signs at the bottom of this page, seek care immediately.
              </div>
            </div>
          </div>
        )}

        {/* Tests section */}
        {hasAnyTests ? (
          <section>
            <h2 className="text-xl sm:text-2xl font-bold text-[#1a1a1a] mb-1">Recommended tests</h2>
            <p className="text-gray-600 text-sm sm:text-base mb-5">
              Each card explains what the test is, what it will tell you, and where you can get it (including direct-to-consumer options where available).
            </p>

            <div className="space-y-5">
              {CATEGORY_ORDER.flatMap((category) =>
                grouped[category].map((test, idx) => {
                  const meta = CATEGORY_META[category]
                  const where = getWhereToGetIt(category, test.testName)
                  const urgencyBadge = getUrgencyBadge(test.urgency)
                  const Icon = meta.Icon

                  return (
                    <article
                      key={`${category}-${idx}`}
                      className="bg-white border border-[#d4c5b0] p-4 sm:p-6"
                    >
                      {/* Header row */}
                      <div className="flex items-start gap-3 sm:gap-4 mb-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#8b2500] flex items-center justify-center flex-shrink-0">
                          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              {meta.label}
                            </span>
                            <span className={`text-xs font-medium px-2 py-0.5 border ${urgencyBadge.className}`}>
                              {urgencyBadge.label}
                            </span>
                          </div>
                          <h3 className="font-bold text-[#1a1a1a] text-lg sm:text-xl leading-tight">
                            {test.testName}
                          </h3>
                        </div>
                      </div>

                      {/* What it tells you */}
                      <div className="mb-4">
                        <div className="text-xs font-semibold text-[#8b2500] uppercase tracking-wide mb-1.5">
                          What this test will tell you
                        </div>
                        <p className="text-gray-800 text-sm sm:text-base leading-relaxed">
                          {test.rationale}
                        </p>
                        {test.targetDiagnoses && test.targetDiagnoses.length > 0 && (
                          <p className="text-gray-600 text-xs sm:text-sm mt-2">
                            <span className="font-medium">Helps confirm or rule out:</span>{" "}
                            {test.targetDiagnoses.join(", ")}
                          </p>
                        )}
                      </div>

                      {/* Where to get it */}
                      <div className="bg-[#faf6f0] border border-[#d4c5b0] p-3 sm:p-4">
                        <div className="text-xs font-semibold text-[#8b2500] uppercase tracking-wide mb-2">
                          Where to get this test
                        </div>
                        <p className="text-gray-800 text-sm leading-relaxed mb-3">{where.blurb}</p>

                        {where.inPersonExamples.length > 0 && (
                          <div className="flex items-start gap-2 mb-2">
                            <MapPin className="h-4 w-4 text-gray-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-gray-700">
                              <span className="font-medium">In person:</span>{" "}
                              {where.inPersonExamples.join(", ")}
                            </div>
                          </div>
                        )}

                        {where.online.available && where.online.note && (
                          <div className="flex items-start gap-2 mb-2">
                            <Globe className="h-4 w-4 text-green-700 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-gray-700">
                              <span className="font-medium text-green-800">Online option:</span>{" "}
                              {where.online.note}
                            </div>
                          </div>
                        )}

                        {where.costRange && (
                          <div className="text-xs text-gray-500 mt-2">
                            Typical cost: {where.costRange}
                          </div>
                        )}
                      </div>
                    </article>
                  )
                }),
              )}
            </div>
          </section>
        ) : (
          <section className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-[#1a1a1a] mb-2">No specific tests recommended</h2>
            <p className="text-gray-700 text-sm sm:text-base">
              Your analysis didn't surface specific tests to order. Continue with the actions and specialist referrals below.
            </p>
          </section>
        )}

        {/* Specialists */}
        {specialistReferrals.length > 0 && (
          <section className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[#1a1a1a] mb-1 flex items-center gap-2">
              <Stethoscope className="h-5 w-5 sm:h-6 sm:w-6 text-[#8b2500]" />
              Specialists to see
            </h2>
            <p className="text-gray-600 text-sm sm:text-base mb-4">
              For rare diseases, an academic medical center or a specialty telehealth provider is often a faster path than your local hospital.
            </p>
            <ul className="space-y-2">
              {specialistReferrals.map((referral, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 text-gray-800 text-sm sm:text-base"
                >
                  <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-[#8b2500] flex-shrink-0 mt-0.5" />
                  <span>{referral}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Things to do now */}
        {immediateActions.length > 0 && (
          <section className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[#1a1a1a] mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-[#8b2500]" />
              Things to do now
            </h2>
            <ul className="space-y-2">
              {immediateActions.map((action, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 text-gray-800 text-sm sm:text-base"
                >
                  <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-[#8b2500] flex-shrink-0 mt-0.5" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
            {followUpTiming && (
              <div className="mt-4 pt-4 border-t border-[#d4c5b0] text-sm text-gray-700">
                <span className="font-semibold">Follow-up timing: </span>
                {followUpTiming}
              </div>
            )}
          </section>
        )}

        {/* Warning signs */}
        {redFlags.length > 0 && (
          <section className="bg-red-50 border-l-4 border-red-500 p-5 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-red-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-red-600" />
              Get urgent care if you experience any of these
            </h2>
            <ul className="space-y-2">
              {redFlags.map((flag, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 text-red-900 text-sm sm:text-base"
                >
                  <span className="text-red-600 mt-0.5 flex-shrink-0">●</span>
                  <span className="leading-relaxed">{flag}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 p-3 sm:p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center gap-3">
          <button
            onClick={() => router.push("/results/analysis")}
            className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium text-sm sm:text-base"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Back to analysis</span>
            <span className="sm:hidden">Back</span>
          </button>

          <button
            onClick={() => router.push("/step-1")}
            className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-[#8b2500] text-white hover:bg-[#6d1d00] transition-all duration-200 font-medium text-sm sm:text-base"
          >
            <span className="hidden sm:inline">Start new analysis</span>
            <span className="sm:hidden">New</span>
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
