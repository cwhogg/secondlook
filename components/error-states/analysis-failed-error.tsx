"use client"

import { useState } from "react"
import { AlertTriangle, Download, MessageCircle, RefreshCw, Copy, CheckCircle } from "lucide-react"
import { MedicalButton } from "../medical-button"

interface AnalysisFailedErrorProps {
  errorCode: string
  errorMessage: string
  onRetry: () => void
  onContactSupport: () => void
  onDownloadSummary: () => void
  savedData?: any
}

export function AnalysisFailedError({
  errorCode,
  errorMessage,
  onRetry,
  onContactSupport,
  onDownloadSummary,
  savedData,
}: AnalysisFailedErrorProps) {
  const [copied, setCopied] = useState(false)

  const copyErrorCode = async () => {
    try {
      await navigator.clipboard.writeText(errorCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy error code:", error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Error Icon and Header */}
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Analysis Temporarily Unavailable</h1>
          <p className="text-gray-600 leading-relaxed">
            We're experiencing technical difficulties with our analysis system. This is temporary and we're working to
            resolve it quickly.
          </p>
        </div>

        {/* Reassurance Card */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-green-800 font-medium">Your information is safe</p>
              <p className="text-green-700 text-sm">All your responses have been saved securely and won't be lost.</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <MedicalButton
            onClick={onRetry}
            className="w-full flex items-center justify-center space-x-2 min-h-[52px] text-lg"
          >
            <RefreshCw className="h-5 w-5" />
            <span>Try Analysis Again</span>
          </MedicalButton>

          <MedicalButton
            variant="outline"
            onClick={onContactSupport}
            className="w-full flex items-center justify-center space-x-2 min-h-[52px] text-lg"
          >
            <MessageCircle className="h-5 w-5" />
            <span>Contact Support</span>
          </MedicalButton>

          <button
            onClick={onDownloadSummary}
            className="w-full text-medical-primary hover:text-blue-800 text-center py-3 text-base font-medium transition-colors"
          >
            <div className="flex items-center justify-center space-x-2">
              <Download className="h-4 w-4" />
              <span>Download Your Input Summary</span>
            </div>
          </button>
        </div>

        {/* Error Reference */}
        <div className="bg-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Error Reference Code:</span>
            <button
              onClick={copyErrorCode}
              className="flex items-center space-x-1 text-xs text-gray-600 hover:text-gray-800 transition-colors"
            >
              {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <code className="text-sm font-mono text-gray-900 bg-white px-2 py-1 rounded border">{errorCode}</code>
          <p className="text-xs text-gray-600 mt-2">
            Please include this code when contacting support for faster assistance.
          </p>
        </div>

        {/* What to do next */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="font-medium text-blue-900 mb-3">What to do next:</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start space-x-2">
              <span className="text-blue-600 font-bold mt-0.5">1.</span>
              <span>Try the analysis again in a few minutes</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-blue-600 font-bold mt-0.5">2.</span>
              <span>Download your summary to share with your doctor</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-blue-600 font-bold mt-0.5">3.</span>
              <span>Contact our support team if the issue persists</span>
            </li>
          </ul>
        </div>

        {/* Technical Details (Collapsible) */}
        <details className="group">
          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 transition-colors">
            Technical details
          </summary>
          <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 font-mono">
            <div>Error: {errorMessage}</div>
            <div>Timestamp: {new Date().toISOString()}</div>
            <div>User Agent: {navigator.userAgent.substring(0, 50)}...</div>
          </div>
        </details>
      </div>
    </div>
  )
}
