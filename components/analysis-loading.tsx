"use client"

import { useState, useEffect } from "react"
import { Brain, CheckCircle2, Loader2 } from "lucide-react"
import { BreadcrumbNav } from "./breadcrumb-nav"

interface AnalysisLoadingProps {
  progress: number
  currentStep: string
  analysisData?: {
    hasStep1: boolean
    hasStep2: boolean
    hasStep3: boolean
    symptomsCount: number
    step1Keys: string[]
    primaryConcern: string
  } | null
}

export function AnalysisLoading({ progress, currentStep, analysisData }: AnalysisLoadingProps) {
  const [educationalTip, setEducationalTip] = useState(0)

  const educationalContent = [
    {
      title: "Medical Analysis",
      description:
        "Our AI is analyzing your symptoms using advanced medical knowledge bases and diagnostic algorithms.",
    },
    {
      title: "Pattern Recognition",
      description:
        "The system is identifying patterns in your symptoms that may indicate specific conditions or require specialist attention.",
    },
    {
      title: "Evidence-Based Medicine",
      description: "All recommendations are based on current medical literature and clinical practice guidelines.",
    },
    {
      title: "Comprehensive Review",
      description:
        "We're cross-referencing your symptoms with thousands of medical conditions to ensure accurate analysis.",
    },
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setEducationalTip((prev) => (prev + 1) % educationalContent.length)
    }, 4000)

    return () => clearInterval(interval)
  }, [educationalContent.length])

  const analysisSteps = [
    { id: 1, label: "Processing symptoms", completed: progress > 25 },
    { id: 2, label: "Mapping conditions", completed: progress > 50 },
    { id: 3, label: "Analyzing patterns", completed: progress > 75 },
    { id: 4, label: "Generating diagnoses", completed: progress >= 100 },
  ]

  return (
    <div className="min-h-screen bg-[#faf9fe]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
        {/* Breadcrumb Navigation */}
        <BreadcrumbNav
          items={[
            { label: "Home" },
            { label: "Symptoms" },
            { label: "Medical History" },
            { label: "Family History" },
            { label: "Analysis", current: true },
          ]}
        />

        {/* Main Content */}
        <div className="text-center mb-8 sm:mb-12">
          {/* Animated Brain Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-indigo-700 rounded-full mb-6 sm:mb-8 animate-pulse">
            <Brain className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-white" />
          </div>

          {/* Heading */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
            Analyzing Your Health Information
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-2xl mx-auto px-4">
            Please wait while we process your symptoms and medical history...
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8 sm:mb-12">
          <div className="flex items-center justify-between mb-2 sm:mb-3 px-2">
            <span className="text-xs sm:text-sm font-medium text-gray-700">{currentStep}</span>
            <span className="text-xs sm:text-sm font-bold text-indigo-700">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3 overflow-hidden">
            <div
              className="h-full bg-indigo-700 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Analysis Steps */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-8 sm:mb-12">
          {analysisSteps.map((step) => (
            <div
              key={step.id}
              className={`relative flex flex-col items-center p-3 sm:p-4 rounded-lg border-2 transition-all duration-300 ${
                step.completed
                  ? "border-green-500 bg-green-50"
                  : progress > (step.id - 1) * 25
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 bg-white"
              }`}
            >
              {/* Step Number/Icon */}
              <div
                className={`flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full mb-2 sm:mb-3 ${
                  step.completed ? "bg-green-500" : progress > (step.id - 1) * 25 ? "bg-indigo-700" : "bg-gray-200"
                }`}
              >
                {step.completed ? (
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                ) : progress > (step.id - 1) * 25 ? (
                  <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-white animate-spin" />
                ) : (
                  <span className="text-sm sm:text-base font-bold text-gray-500">{step.id}</span>
                )}
              </div>

              {/* Step Label */}
              <span
                className={`text-xs sm:text-sm text-center font-medium ${
                  step.completed ? "text-green-700" : progress > (step.id - 1) * 25 ? "text-indigo-700" : "text-gray-500"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Educational Content */}
        <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 md:p-10 border border-[#e5e2f0]">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                <Brain className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-indigo-700" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">
                {educationalContent[educationalTip].title}
              </h3>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                {educationalContent[educationalTip].description}
              </p>
            </div>
          </div>

          {/* Tip Indicators */}
          <div className="flex justify-center gap-2 mt-6 sm:mt-8">
            {educationalContent.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${
                  index === educationalTip ? "w-8 sm:w-10 bg-indigo-700" : "w-1.5 sm:w-2 bg-gray-300"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Analysis Data Debug Info (optional, for development) */}
        {analysisData && (
          <div className="mt-6 sm:mt-8 p-4 sm:p-6 bg-gray-50 rounded-lg text-xs sm:text-sm">
            <div className="font-medium text-gray-700 mb-2">Analysis Information:</div>
            <div className="space-y-1 text-gray-600">
              <div>• Symptoms collected: {analysisData.symptomsCount}</div>
              <div>
                • Data collected: Step 1 ✓{analysisData.hasStep2 && ", Step 2 ✓"}
                {analysisData.hasStep3 && ", Step 3 ✓"}
              </div>
              <div className="truncate">• Primary concern: {analysisData.primaryConcern}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
