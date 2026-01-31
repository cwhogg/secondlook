"use client"

import React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProgressBarProps {
  value: number
  max?: number
  className?: string
  showPercentage?: boolean
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ value, max = 100, className, showPercentage = false }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

    return (
      <div className={cn("space-y-2", className)} ref={ref}>
        {showPercentage && (
          <div className="flex justify-between text-sm text-neutral-600">
            <span>Progress</span>
            <span>{Math.round(percentage)}%</span>
          </div>
        )}
        <div className="progress-modern">
          <div className="progress-modern-fill" style={{ width: `${percentage}%` }} />
        </div>
      </div>
    )
  },
)

ProgressBar.displayName = "ProgressBar"

interface StepProgressProps {
  steps: Array<{
    id: string
    title: string
    description?: string
  }>
  currentStep: number
  className?: string
}

const StepProgress = React.forwardRef<HTMLDivElement, StepProgressProps>(({ steps, currentStep, className }, ref) => {
  return (
    <div className={cn("w-full", className)} ref={ref}>
      <div className="progress-steps">
        {steps.map((step, index) => {
          const stepNumber = index + 1
          const isCompleted = stepNumber < currentStep
          const isCurrent = stepNumber === currentStep
          const isPending = stepNumber > currentStep

          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "progress-step",
                    isCompleted && "progress-step-completed",
                    isCurrent && "progress-step-current",
                    isPending && "progress-step-pending",
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : <span>{stepNumber}</span>}
                </div>
                <div className="mt-2 text-center">
                  <div className="text-sm font-medium text-neutral-900">{step.title}</div>
                  {step.description && <div className="text-xs text-neutral-500 mt-1">{step.description}</div>}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={cn("progress-connector", stepNumber < currentStep && "progress-connector-completed")} />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
})

StepProgress.displayName = "StepProgress"

export { ProgressBar, StepProgress }
