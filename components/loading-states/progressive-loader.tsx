"use client"

import { useState, useEffect } from "react"
import { CheckCircle, Clock, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoadingStep {
  id: string
  label: string
  description?: string
  estimatedTime?: number
  status: "pending" | "loading" | "completed" | "error"
}

interface ProgressiveLoaderProps {
  steps: LoadingStep[]
  currentStepId: string
  onStepComplete?: (stepId: string) => void
  showEstimatedTime?: boolean
  className?: string
}

export function ProgressiveLoader({
  steps,
  currentStepId,
  onStepComplete,
  showEstimatedTime = true,
  className,
}: ProgressiveLoaderProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [startTime] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Date.now() - startTime)
    }, 100)

    return () => clearInterval(timer)
  }, [startTime])

  const currentStepIndex = steps.findIndex((step) => step.id === currentStepId)
  const completedSteps = steps.filter((step) => step.status === "completed").length
  const totalSteps = steps.length
  const overallProgress = (completedSteps / totalSteps) * 100

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  const getStepIcon = (step: LoadingStep) => {
    switch (step.status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case "loading":
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-700" />
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-600" />
      default:
        return <Clock className="h-5 w-5 text-gray-400" />
    }
  }

  const getStepColor = (step: LoadingStep) => {
    switch (step.status) {
      case "completed":
        return "border-green-200 bg-green-50"
      case "loading":
        return "border-blue-200 bg-blue-50"
      case "error":
        return "border-red-200 bg-red-50"
      default:
        return "border-gray-200 bg-gray-50"
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Overall Progress */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-900">Overall Progress</span>
          <span className="text-sm text-gray-600">{Math.round(overallProgress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-indigo-700 h-2 rounded-full transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        {showEstimatedTime && <div className="mt-2 text-xs text-gray-500">Elapsed time: {formatTime(elapsedTime)}</div>}
      </div>

      {/* Step List */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={step.id} className={cn("border rounded-xl p-4 transition-all duration-200", getStepColor(step))}>
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">{getStepIcon(step)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-900 truncate">{step.label}</h3>
                  {step.estimatedTime && showEstimatedTime && step.status === "pending" && (
                    <span className="text-xs text-gray-500 ml-2">~{step.estimatedTime}s</span>
                  )}
                </div>
                {step.description && <p className="text-xs text-gray-600 mt-1">{step.description}</p>}
                {step.status === "loading" && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-1">
                      <div className="bg-indigo-700 h-1 rounded-full animate-pulse w-2/3" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
