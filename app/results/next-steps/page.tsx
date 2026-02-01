"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  TrendingUp,
  Zap,
  AlertTriangle,
  Stethoscope,
  BookOpen,
  Home,
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  ArrowUpRight,
  Sparkles,
  UserCheck,
  Bot,
  FileText,
  TestTubes,
  Dna,
  ScanLine,
} from "lucide-react"
import { MedicalButton } from "@/components/medical-button"
import { FeedbackModal } from "@/components/feedback-modal"

interface AnalysisResults {
  recommendedTesting: Array<{
    testType: string
    testName: string
    rationale: string
    urgency: string
  }>
  nextSteps: {
    immediateActions: string[]
    specialistReferrals: string[]
    followUpTiming: string
    redFlags: string[]
  }
}

export default function NextStepsPage() {
  const [results, setResults] = useState<AnalysisResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)
  const [feedbackFeatureName, setFeedbackFeatureName] = useState("")
  const router = useRouter()

  const openFeedbackModal = (title: string) => {
    setFeedbackFeatureName(title)
    setFeedbackModalOpen(true)
  }

  // Safe array accessors with default empty arrays
  const safeRecommendedTesting = results?.recommendedTesting || []
  const safeNextSteps = {
    immediateActions: results?.nextSteps?.immediateActions || [],
    specialistReferrals: results?.nextSteps?.specialistReferrals || [],
    followUpTiming: results?.nextSteps?.followUpTiming || "Unknown",
    redFlags: results?.nextSteps?.redFlags || [],
  }

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo({ top: 0, behavior: "smooth" })

    const storedResults = sessionStorage.getItem("analysisResults")
    if (storedResults) {
      try {
        const parsedResults = JSON.parse(storedResults)
        setResults(parsedResults)
      } catch (error) {
        console.error("Error parsing stored results:", error)
      }
    }
    setLoading(false)
  }, [])

  // Function to determine specialist logo based on specialist type
  const getSpecialistLogo = (specialistText: string): string => {
    const lowerText = specialistText.toLowerCase()

    // Check for neurologist
    if (lowerText.includes("neurolog")) {
      return "synapticure"
    }

    // Check for cardiologist
    if (lowerText.includes("cardiolog") || lowerText.includes("cardiac") || lowerText.includes("heart")) {
      return "heartbeat"
    }

    // Check for GI/gastroenterologist
    if (
      lowerText.includes("gastroenterolog") ||
      lowerText.includes("gi ") ||
      lowerText.includes("gastrointestinal") ||
      lowerText.includes("digestive")
    ) {
      return "oshi"
    }

    // Check for mental health/psychiatrist
    if (
      lowerText.includes("psychiatr") ||
      lowerText.includes("psycholog") ||
      lowerText.includes("mental health") ||
      lowerText.includes("behavioral health") ||
      lowerText.includes("therapist") ||
      lowerText.includes("counselor")
    ) {
      return "talkiatry"
    }

    // Default to AmplifyMD for any other specialist
    return "amplifymd"
  }

  // Function to extract and format specialist type for button text
  const getSpecialistButtonText = (specialistText: string): string => {
    const lowerText = specialistText.toLowerCase()

    // Check for neurologist
    if (lowerText.includes("neurolog")) {
      return "Book a visit with a neurologist"
    }

    // Check for cardiologist
    if (lowerText.includes("cardiolog")) {
      return "Book a visit with a cardiologist"
    }

    // Check for cardiac specialist (alternative phrasing)
    if (lowerText.includes("cardiac") || lowerText.includes("heart")) {
      return "Book a visit with a cardiologist"
    }

    // Check for GI/gastroenterologist
    if (lowerText.includes("gastroenterolog")) {
      return "Book a visit with a gastroenterologist"
    }

    // Check for GI specialist (alternative phrasing)
    if (lowerText.includes("gi ") || lowerText.includes("gastrointestinal") || lowerText.includes("digestive")) {
      return "Book a visit with a GI specialist"
    }

    // Check for psychiatrist
    if (lowerText.includes("psychiatr")) {
      return "Book a visit with a psychiatrist"
    }

    // Check for psychologist
    if (lowerText.includes("psycholog")) {
      return "Book a visit with a psychologist"
    }

    // Check for mental health specialist (alternative phrasing)
    if (
      lowerText.includes("mental health") ||
      lowerText.includes("behavioral health") ||
      lowerText.includes("therapist") ||
      lowerText.includes("counselor")
    ) {
      return "Book a visit with a mental health specialist"
    }

    // Check for other common specialists
    if (lowerText.includes("rheumatolog")) {
      return "Book a visit with a rheumatologist"
    }

    if (lowerText.includes("endocrinolog")) {
      return "Book a visit with an endocrinologist"
    }

    if (lowerText.includes("pulmonolog")) {
      return "Book a visit with a pulmonologist"
    }

    if (lowerText.includes("dermatolog")) {
      return "Book a visit with a dermatologist"
    }

    if (lowerText.includes("orthoped")) {
      return "Book a visit with an orthopedist"
    }

    if (lowerText.includes("oncolog")) {
      return "Book a visit with an oncologist"
    }

    if (lowerText.includes("urolog")) {
      return "Book a visit with a urologist"
    }

    if (lowerText.includes("ophthalmolog")) {
      return "Book a visit with an ophthalmologist"
    }

    if (lowerText.includes("otolaryngolog") || lowerText.includes("ent")) {
      return "Book a visit with an ENT specialist"
    }

    if (lowerText.includes("gynecolog")) {
      return "Book a visit with a gynecologist"
    }

    if (lowerText.includes("hematolog")) {
      return "Book a visit with a hematologist"
    }

    if (lowerText.includes("nephrolog")) {
      return "Book a visit with a nephrologist"
    }

    if (lowerText.includes("infectious disease")) {
      return "Book a visit with an infectious disease specialist"
    }

    if (lowerText.includes("internal medicine")) {
      return "Book a visit with an internist"
    }

    // Default fallback
    return "Book a visit with a specialist"
  }

  // Function to get personalized specialist recommendation from existing analysis results
  const getPersonalizedSpecialistRecommendation = () => {
    // Get the first specialist from the analysis results
    const primarySpecialist = safeNextSteps.specialistReferrals[0] || "Internal Medicine Physician"

    // Filter immediate actions that are relevant to specialist visits
    const specialistActions = safeNextSteps.immediateActions.filter(
      (action) =>
        action.toLowerCase().includes("refer") ||
        action.toLowerCase().includes("consult") ||
        action.toLowerCase().includes("evaluation") ||
        action.toLowerCase().includes("examination") ||
        action.toLowerCase().includes("specialist") ||
        action.toLowerCase().includes("neurolog") ||
        action.toLowerCase().includes("cardiolog") ||
        action.toLowerCase().includes("gastro") ||
        action.toLowerCase().includes("rheumat") ||
        action.toLowerCase().includes("endocrin") ||
        action.toLowerCase().includes("pulmon"),
    )

    // Create a detailed rationale based on the specialist and actions
    let rationale = `A ${primarySpecialist} consultation is recommended based on your analysis results to provide expert evaluation and develop an appropriate treatment plan for your specific condition.`

    if (specialistActions.length > 0) {
      // Clean up the actions to create proper sentences
      const cleanedActions = specialistActions
        .map((action) => {
          // Remove "Refer to a [specialist] for" from the beginning
          let cleaned = action.replace(/^Refer to a \w+\s*for\s*/i, "")
          // Remove "Initiate" from the beginning and make it flow better
          cleaned = cleaned.replace(/^Initiate\s*/i, "")
          // Ensure it starts with lowercase for sentence flow
          cleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1)
          return cleaned
        })
        .join(" and ")

      rationale = `A ${primarySpecialist} will perform ${cleanedActions} to provide expert evaluation and develop an appropriate treatment plan for your specific condition.`
    }

    return {
      testName: `Consult with a ${primarySpecialist}`,
      testType: "specialist_evaluate",
      rationale: rationale,
      urgency: "routine",
      specialistType: primarySpecialist, // Add this to pass specialist info
    }
  }

  // Function to get action button configuration based on test type
  const getActionButtonConfig = (testType: string, specialistType?: string, testName?: string) => {
    switch (testType) {
      case "patient_survey":
        return {
          title: "Questions for you",
          price: "free",
          logo: "arrow",
          onClick: () => console.log("Starting personalized questions"),
        }
      case "medical_history": {
        const title = "Retrieve and analyze medical history"
        return {
          title,
          price: "$25",
          logo: "medical_records",
          onClick: () => openFeedbackModal(title),
        }
      }
      case "laboratory": {
        const title = testName ? `Get labs, including ${testName}` : "Get labs"
        return {
          title,
          price: "$20",
          logo: "labs",
          onClick: () => openFeedbackModal(title),
        }
      }
      case "genetic_testing": {
        const title = "Get genetic testing"
        return {
          title,
          price: "$40",
          logo: "genetics",
          onClick: () => openFeedbackModal(title),
        }
      }
      case "imaging": {
        const title = "Get MD order for imaging"
        return {
          title,
          price: "$20",
          logo: "imaging",
          onClick: () => openFeedbackModal(title),
        }
      }
      case "specialist_evaluate": {
        const title = getSpecialistButtonText(specialistType || "")
        return {
          title,
          price: "$100",
          logo: getSpecialistLogo(specialistType || ""),
          onClick: () => openFeedbackModal(title),
        }
      }
      case "human_care_navigator": {
        const title = "A human care navigator will help you schedule and keep visits, find sites of care and give advice"
        return {
          title,
          price: "$50/mo",
          logo: "nurse",
          onClick: () => openFeedbackModal(title),
        }
      }
      case "ai_care_navigator": {
        const title =
          "An AI care navigator is available 24/7 for immediate answers to all questions and requests, with same functions as a human"
        return {
          title,
          price: "$10/mo",
          logo: "robot",
          onClick: () => openFeedbackModal(title),
        }
      }
      default:
        return null
    }
  }

  const handleBack = () => {
    router.push("/results/analysis")
  }

  const handleStartNew = () => {
    router.push("/step-1")
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf9fe] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-700 mx-auto"></div>
          <p className="mt-6 text-gray-600 text-lg">Loading next steps...</p>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-[#faf9fe] flex items-center justify-center">
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

  // Fixed cards that always appear first with action buttons
  const fixedDataCollectionCards = [
    {
      testName: "Answer 5 more questions",
      testType: "patient_survey",
      rationale: "To get closer to your diagnosis",
      urgency: "routine",
    },
    {
      testName: "Retrieve and analyze your medical history",
      testType: "medical_history",
      rationale: "To get closer to your diagnosis",
      urgency: "routine",
    },
  ]

  // Define category order
  const categoryOrder = ["laboratory", "genetic_testing", "imaging", "specialist_evaluate"]

  // Categorize and sort the recommended testing
  // Normalize specialist_evaluation → specialist_evaluate so they don't create duplicates
  const categorizedTesting = safeRecommendedTesting.reduce(
    (acc, test) => {
      let category = test.testType || "other"
      // Normalize specialist_evaluation to specialist_evaluate
      if (category === "specialist_evaluation") {
        category = "specialist_evaluate"
      }
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push({ ...test, testType: category })
      return acc
    },
    {} as Record<string, typeof safeRecommendedTesting>,
  )

  // Ensure we have at least one specialist_evaluate with personalized recommendation from analysis results
  if (!categorizedTesting.specialist_evaluate || categorizedTesting.specialist_evaluate.length === 0) {
    categorizedTesting.specialist_evaluate = [getPersonalizedSpecialistRecommendation()]
  }

  // Create ordered array of all tests
  const orderedTesting = categoryOrder
    .flatMap((category) => categorizedTesting[category] || [])
    .concat(
      // Add any tests that don't fit the main categories
      Object.entries(categorizedTesting)
        .filter(([category]) => !categoryOrder.includes(category))
        .flatMap(([, tests]) => tests),
    )

  // Add the new care navigator options at the end
  const careNavigatorOptions = [
    {
      testName: "Human Care Navigator",
      testType: "human_care_navigator",
      rationale: "A human care navigator will help you schedule and keep visits, find sites of care and give advice",
      urgency: "routine",
    },
    {
      testName: "AI Care Navigator",
      testType: "ai_care_navigator",
      rationale:
        "An AI care navigator is available 24/7 for immediate answers to all questions and requests, with same functions as a human",
      urgency: "routine",
    },
  ]

  const allTesting = [...orderedTesting, ...careNavigatorOptions]

  // Component to render logo based on type
  const renderLogo = (logoType: string) => {
    switch (logoType) {
      case "arrow":
        return <ArrowUpRight className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-700" />
      case "medical_records":
        return <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-700" />
      case "labs":
        return <TestTubes className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-700" />
      case "genetics":
        return <Dna className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-700" />
      case "imaging":
        return <ScanLine className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-700" />
      case "heartbeat":
        return (
          <div className="h-6 w-8 sm:h-8 sm:w-10 relative">
            <Image
              src="/images/heartbeat-health-logo.jpg"
              alt="Heartbeat Health"
              fill
              className="object-contain"
              sizes="40px"
            />
          </div>
        )
      case "talkiatry":
        return (
          <div className="h-6 w-8 sm:h-8 sm:w-10 relative">
            <Image src="/images/talkiatry-logo.png" alt="Talkiatry" fill className="object-contain" sizes="40px" />
          </div>
        )
      case "amplifymd":
        return (
          <div className="h-6 w-8 sm:h-8 sm:w-10 relative">
            <Image src="/images/amplifymd-logo.webp" alt="AmplifyMD" fill className="object-contain" sizes="40px" />
          </div>
        )
      case "oshi":
        return (
          <div className="h-6 w-8 sm:h-8 sm:w-10 relative">
            <Image src="/images/oshi-health-logo.jpg" alt="Oshi Health" fill className="object-contain" sizes="40px" />
          </div>
        )
      case "synapticure":
        return (
          <div className="h-6 w-8 sm:h-8 sm:w-10 relative">
            <Image src="/images/synapticure-logo.png" alt="Synapticure" fill className="object-contain" sizes="40px" />
          </div>
        )
      case "nurse":
        return <UserCheck className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-700" />
      case "robot":
        return <Bot className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-700" />
      case "stethoscope":
        return <Stethoscope className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-700" />
      default:
        return <div className="h-6 w-6 sm:h-8 sm:w-8 bg-gray-300 rounded-md"></div>
    }
  }

  // Component to render a data collection card with action button
  const renderDataCollectionCard = (card: any, index: number, keyPrefix: string) => {
    const actionButtonConfig = getActionButtonConfig(card.testType, card.specialistType, card.testName)

    return (
      <div
        key={`${keyPrefix}-${index}`}
        className="bg-white rounded-2xl sm:rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200"
      >
        <div className="space-y-4">
          {/* Card Content */}
          <div>
            <div className="font-bold text-gray-900 text-lg sm:text-xl mb-2 leading-tight">{card.testName}</div>
            <div className="text-gray-500 text-xs sm:text-sm mb-2 sm:mb-3 bg-gray-100 px-2 sm:px-3 py-1 rounded-full inline-block">
              {card.testType}
            </div>
            <p className="text-gray-600 leading-relaxed text-sm sm:text-base">{card.rationale}</p>
          </div>

          {/* Action Button - Full width rectangular */}
          {actionButtonConfig && (
            <button
              onClick={actionButtonConfig.onClick}
              className="w-full bg-indigo-50 border-2 border-indigo-700 rounded-xl sm:rounded-2xl hover:bg-indigo-100 transition-all duration-200 p-3 sm:p-4 group shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                {/* Logo Section */}
                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg sm:rounded-xl shadow-sm">
                  {renderLogo(actionButtonConfig.logo)}
                </div>

                {/* Text Content Section */}
                <div className="flex-1 text-left min-w-0">
                  <div className="font-semibold text-gray-900 text-sm sm:text-base leading-tight">
                    {actionButtonConfig.title}
                  </div>
                </div>

                {/* Price Section */}
                <div className="flex-shrink-0">
                  <div className="text-indigo-700 font-bold text-xl sm:text-2xl">{actionButtonConfig.price}</div>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#faf9fe]">
      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-8 space-y-6 sm:space-y-8 pb-24 sm:pb-32">
        {/* Premium Header Section */}
        <div className="bg-indigo-700 rounded-2xl sm:rounded-xl shadow-xl p-4 sm:p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-transparent"></div>
          <div className="relative z-10">
            <div className="flex items-center space-x-3 sm:space-x-4 mb-3 sm:mb-4">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 backdrop-blur-sm rounded-xl sm:rounded-2xl flex items-center justify-center">
                <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-4xl font-bold text-white">
                  Get Recommendations
                </h1>
                <p className="text-indigo-200 text-sm sm:text-lg">
                  We recommend trusted partners who can fill in gaps and help get to a specific diagnosis
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Recommended Testing */}
        <div className="bg-indigo-50 border border-[#e5e2f0] rounded-2xl sm:rounded-xl p-4 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-bold text-indigo-900 mb-4 sm:mb-6 flex items-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-700 rounded-xl sm:rounded-2xl flex items-center justify-center mr-3 sm:mr-4">
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            Recommended Data Collection
          </h2>
          <p className="text-indigo-800 mb-6 sm:mb-8 text-base sm:text-lg leading-relaxed">
            Collecting the information below will help you get closer to your diagnosis:
          </p>
          <div className="space-y-4 sm:space-y-6">
            {/* Fixed cards always appear first */}
            {fixedDataCollectionCards.map((card, index) => renderDataCollectionCard(card, index, "fixed"))}

            {/* Dynamic cards from analysis results plus care navigator options */}
            {allTesting.map((test, index) => renderDataCollectionCard(test, index, "dynamic"))}
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-indigo-50 border border-[#e5e2f0] rounded-2xl sm:rounded-xl p-4 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-bold text-indigo-900 mb-4 sm:mb-6 flex items-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-700 rounded-xl sm:rounded-2xl flex items-center justify-center mr-3 sm:mr-4">
              <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            Your Next Steps
          </h2>
          <p className="text-indigo-800 mb-6 sm:mb-8 text-base sm:text-lg leading-relaxed">
            Here's what we recommend you do next:
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            <div className="space-y-6 sm:space-y-8">
              <div>
                <h3 className="font-bold text-indigo-900 mb-4 sm:mb-6 text-lg sm:text-xl">Take Action Now</h3>
                <ul className="space-y-3 sm:space-y-4">
                  {safeNextSteps.immediateActions.map((action, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 sm:gap-4 text-indigo-800 bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#e5e2f0]"
                    >
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-indigo-700 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                        <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                      </div>
                      <span className="leading-relaxed text-sm sm:text-base">{action}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-bold text-indigo-900 mb-4 sm:mb-6 text-lg sm:text-xl">See These Specialists</h3>
                <ul className="space-y-3 sm:space-y-4">
                  {safeNextSteps.specialistReferrals.map((referral, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 sm:gap-4 text-indigo-800 bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#e5e2f0]"
                    >
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-indigo-700 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                        <Stethoscope className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                      </div>
                      <span className="leading-relaxed text-sm sm:text-base">{referral}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-6 sm:space-y-8">
              <div>
                <h3 className="font-bold text-indigo-900 mb-4 sm:mb-6 text-lg sm:text-xl">Follow-up Timeline</h3>
                <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-[#e5e2f0]">
                  <p className="text-indigo-800 leading-relaxed text-base sm:text-lg">{safeNextSteps.followUpTiming}</p>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-red-900 mb-4 sm:mb-6 text-lg sm:text-xl">
                  Watch for These Warning Signs
                </h3>
                <ul className="space-y-3 sm:space-y-4">
                  {safeNextSteps.redFlags.map((flag, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 sm:gap-4 text-red-800 bg-red-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl"
                    >
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-r from-red-500 to-red-600 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                      </div>
                      <span className="leading-relaxed text-sm sm:text-base">{flag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white rounded-2xl sm:rounded-xl shadow-sm border border-gray-100 p-6 sm:p-12 text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-700 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">What's Next?</h3>
          <p className="text-gray-600 mb-6 sm:mb-10 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto">
            Continue your health journey with additional analysis or start fresh
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
            <button className="flex items-center justify-center gap-3 px-6 sm:px-10 py-3 sm:py-4 bg-indigo-700 text-white rounded-xl sm:rounded-2xl hover:bg-indigo-800 transition-all duration-200 font-semibold text-base sm:text-lg shadow-sm hover:shadow-md">
              <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
              Get Detailed Report
            </button>
            <button
              onClick={handleStartNew}
              className="flex items-center justify-center gap-3 px-6 sm:px-10 py-3 sm:py-4 bg-white border-2 border-gray-300 text-gray-700 rounded-xl sm:rounded-2xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold text-base sm:text-lg"
            >
              Start New Analysis
            </button>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 p-3 sm:p-6 safe-area-pb">
        <div className="max-w-4xl mx-auto flex justify-between items-center gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2 sm:py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-xl sm:rounded-2xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium text-sm sm:text-base"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Back to previous step</span>
            <span className="sm:hidden">Back</span>
          </button>

          <button
            onClick={handleStartNew}
            className="flex items-center gap-2 sm:gap-3 px-4 sm:px-8 py-2 sm:py-3 bg-indigo-700 text-white rounded-xl sm:rounded-2xl hover:bg-indigo-800 transition-all duration-200 font-medium shadow-sm hover:shadow-md text-sm sm:text-base"
          >
            <span className="hidden sm:inline">Start New Analysis</span>
            <span className="sm:hidden">Start New</span>
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>

      <FeedbackModal
        open={feedbackModalOpen}
        onOpenChange={setFeedbackModalOpen}
        featureName={feedbackFeatureName}
      />
    </div>
  )
}
