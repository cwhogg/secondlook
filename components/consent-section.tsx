"use client"

import { AlertTriangle, Shield, FileText } from "lucide-react"

interface ConsentSectionProps {
  consentAnalysis: boolean
  onConsentAnalysisChange: (value: boolean) => void
  consentNotSubstitute: boolean
  onConsentNotSubstituteChange: (value: boolean) => void
  consentAccurate: boolean
  onConsentAccurateChange: (value: boolean) => void
  errors: Record<string, string>
}

export function ConsentSection({
  consentAnalysis,
  onConsentAnalysisChange,
  consentNotSubstitute,
  onConsentNotSubstituteChange,
  consentAccurate,
  onConsentAccurateChange,
  errors,
}: ConsentSectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start space-x-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-gray-700">
          <p className="font-medium mb-2">Important Medical Disclaimer</p>
          <p>
            This AI analysis is for informational purposes only and should not replace professional medical advice,
            diagnosis, or treatment. Always consult with a qualified healthcare provider for medical decisions.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Consent to AI Analysis */}
        <div className="flex items-start space-x-3">
          <div className="flex items-center h-5">
            <input
              id="consent-analysis"
              type="checkbox"
              checked={consentAnalysis}
              onChange={(e) => onConsentAnalysisChange(e.target.checked)}
              className="h-4 w-4 text-medical-primary focus:ring-medical-primary border-gray-300 rounded"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="consent-analysis" className="text-sm font-medium text-gray-900 cursor-pointer">
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-medical-primary" />
                <span>I consent to AI analysis of my medical information</span>
              </div>
            </label>
            {errors.consentAnalysis && <p className="text-sm text-red-600 mt-1">{errors.consentAnalysis}</p>}
          </div>
        </div>

        {/* Not a Substitute */}
        <div className="flex items-start space-x-3">
          <div className="flex items-center h-5">
            <input
              id="consent-not-substitute"
              type="checkbox"
              checked={consentNotSubstitute}
              onChange={(e) => onConsentNotSubstituteChange(e.target.checked)}
              className="h-4 w-4 text-medical-primary focus:ring-medical-primary border-gray-300 rounded"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="consent-not-substitute" className="text-sm font-medium text-gray-900 cursor-pointer">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span>I understand this is not a substitute for medical care</span>
              </div>
            </label>
            {errors.consentNotSubstitute && <p className="text-sm text-red-600 mt-1">{errors.consentNotSubstitute}</p>}
          </div>
        </div>

        {/* Information Accuracy */}
        <div className="flex items-start space-x-3">
          <div className="flex items-center h-5">
            <input
              id="consent-accurate"
              type="checkbox"
              checked={consentAccurate}
              onChange={(e) => onConsentAccurateChange(e.target.checked)}
              className="h-4 w-4 text-medical-primary focus:ring-medical-primary border-gray-300 rounded"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="consent-accurate" className="text-sm font-medium text-gray-900 cursor-pointer">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-green-600" />
                <span>I confirm that the information I provided is accurate to the best of my knowledge</span>
              </div>
            </label>
            {errors.consentAccurate && <p className="text-sm text-red-600 mt-1">{errors.consentAccurate}</p>}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Your Privacy is Protected</p>
            <p>
              Your medical information is processed securely and is not stored permanently. This analysis is
              confidential and for your personal use only.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
