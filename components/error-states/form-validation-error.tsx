"use client"

import { AlertCircle, ArrowRight, CheckCircle } from "lucide-react"
import { MedicalButton } from "../medical-button"

interface ValidationError {
  field: string
  message: string
  section: string
  sectionLabel: string
}

interface FormValidationErrorProps {
  errors: ValidationError[]
  onNavigateToSection: (section: string) => void
  completedSections: string[]
  totalSections: number
}

export function FormValidationError({
  errors,
  onNavigateToSection,
  completedSections,
  totalSections,
}: FormValidationErrorProps) {
  const groupedErrors = errors.reduce(
    (acc, error) => {
      if (!acc[error.section]) {
        acc[error.section] = []
      }
      acc[error.section].push(error)
      return acc
    },
    {} as Record<string, ValidationError[]>,
  )

  const completionPercentage = Math.round((completedSections.length / totalSections) * 100)

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Please Complete Required Information</h2>
        <p className="text-gray-600">We need a few more details to provide you with an accurate analysis.</p>
      </div>

      {/* Progress Indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-blue-900">Form Progress</span>
          <span className="text-sm text-blue-700">{completionPercentage}% Complete</span>
        </div>
        <div className="w-full bg-blue-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-blue-700">
          {completedSections.length} of {totalSections} sections completed
        </div>
      </div>

      {/* Error Sections */}
      <div className="space-y-4">
        {Object.entries(groupedErrors).map(([section, sectionErrors]) => (
          <div key={section} className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-medium text-red-900">{sectionErrors[0].sectionLabel}</h3>
                <p className="text-sm text-red-700">
                  {sectionErrors.length} {sectionErrors.length === 1 ? "issue" : "issues"} need attention
                </p>
              </div>
              <MedicalButton
                variant="outline"
                size="sm"
                onClick={() => onNavigateToSection(section)}
                className="border-red-300 text-red-700 hover:bg-red-100 hover:border-red-400 flex items-center space-x-1"
              >
                <span>Fix Now</span>
                <ArrowRight className="h-3 w-3" />
              </MedicalButton>
            </div>

            <ul className="space-y-2">
              {sectionErrors.map((error, index) => (
                <li key={index} className="flex items-start space-x-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <span className="text-red-800">{error.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Completed Sections */}
      {completedSections.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h3 className="font-medium text-green-900 mb-3 flex items-center space-x-2">
            <CheckCircle className="h-5 w-5" />
            <span>Completed Sections</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {completedSections.map((section) => (
              <div key={section} className="flex items-center space-x-2 text-sm text-green-800">
                <CheckCircle className="h-4 w-4" />
                <span>{section}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h3 className="font-medium text-gray-900 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => onNavigateToSection(Object.keys(groupedErrors)[0])}
            className="flex items-center justify-center space-x-2 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium">Fix First Issue</span>
          </button>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center justify-center space-x-2 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowRight className="h-4 w-4 text-gray-600 rotate-[-90deg]" />
            <span className="text-sm font-medium">Go to Top</span>
          </button>
        </div>
      </div>

      {/* Help Text */}
      <div className="text-center text-sm text-gray-600">
        <p>Need help? All required fields are marked with a red asterisk (*)</p>
        <p className="mt-1">Your progress is automatically saved as you complete each section.</p>
      </div>
    </div>
  )
}
