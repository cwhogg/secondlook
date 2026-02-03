"use client"

import { useState, useEffect } from "react"
import { Wifi, WifiOff, RefreshCw, CheckCircle, Clock } from "lucide-react"
import { MedicalButton } from "../medical-button"

interface NetworkConnectionErrorProps {
  onRetry: () => void
  isRetrying?: boolean
  retryAttempts?: number
  maxRetryAttempts?: number
}

export function NetworkConnectionError({
  onRetry,
  isRetrying = false,
  retryAttempts = 0,
  maxRetryAttempts = 3,
}: NetworkConnectionErrorProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [countdown, setCountdown] = useState(0)
  const [autoRetryEnabled, setAutoRetryEnabled] = useState(true)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  useEffect(() => {
    if (autoRetryEnabled && retryAttempts < maxRetryAttempts && countdown === 0) {
      const retryDelay = Math.min(5000 * Math.pow(2, retryAttempts), 30000) // Exponential backoff, max 30s
      setCountdown(Math.floor(retryDelay / 1000))

      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            if (isOnline) {
              onRetry()
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [retryAttempts, maxRetryAttempts, autoRetryEnabled, countdown, isOnline, onRetry])

  const getEstimatedRetryTime = () => {
    if (!isOnline) return "Waiting for connection..."
    if (countdown > 0) return `Retrying in ${countdown}s`
    if (retryAttempts >= maxRetryAttempts) return "Manual retry required"
    return "Checking connection..."
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Connection Status Icon */}
        <div className="text-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              isOnline ? "bg-yellow-100" : "bg-red-100"
            }`}
          >
            {isOnline ? <Wifi className="h-8 w-8 text-yellow-600" /> : <WifiOff className="h-8 w-8 text-red-600" />}
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Connection Issue Detected</h1>
          <p className="text-gray-600 leading-relaxed">
            {isOnline
              ? "We're having trouble connecting to our servers. This is usually temporary."
              : "Please check your internet connection and try again."}
          </p>
        </div>

        {/* Connection Status */}
        <div
          className={`border rounded-none p-4 ${
            isOnline ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${isOnline ? "bg-yellow-500" : "bg-red-500"}`} />
            <div>
              <p className={`font-medium ${isOnline ? "text-yellow-800" : "text-red-800"}`}>
                {isOnline ? "Internet Connected" : "No Internet Connection"}
              </p>
              <p className={`text-sm ${isOnline ? "text-yellow-700" : "text-red-700"}`}>{getEstimatedRetryTime()}</p>
            </div>
          </div>
        </div>

        {/* Progress Saved Confirmation */}
        <div className="bg-green-50 border border-green-200 rounded-none p-4">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-green-800 font-medium">Your progress is saved</p>
              <p className="text-green-700 text-sm">All your responses are stored locally and won't be lost.</p>
            </div>
          </div>
        </div>

        {/* Retry Actions */}
        <div className="space-y-3">
          <MedicalButton
            onClick={onRetry}
            disabled={isRetrying || (!isOnline && retryAttempts < maxRetryAttempts)}
            className="w-full flex items-center justify-center space-x-2 min-h-[52px] text-lg"
          >
            {isRetrying ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-5 w-5" />
                <span>Retry Now</span>
              </>
            )}
          </MedicalButton>

          {retryAttempts > 0 && (
            <div className="text-center">
              <p className="text-sm text-gray-600">
                Attempt {retryAttempts} of {maxRetryAttempts}
              </p>
            </div>
          )}
        </div>

        {/* Auto-retry Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-100 rounded-none">
          <div>
            <p className="font-medium text-gray-900">Auto-retry</p>
            <p className="text-sm text-gray-600">Automatically retry when connection improves</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoRetryEnabled}
              onChange={(e) => setAutoRetryEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#8b2500]"></div>
          </label>
        </div>

        {/* Offline Mode Indicator */}
        {!isOnline && (
          <div className="bg-gray-100 border border-gray-200 rounded-none p-4">
            <div className="flex items-center space-x-3 mb-3">
              <Clock className="h-5 w-5 text-gray-600" />
              <span className="font-medium text-gray-900">Offline Mode</span>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              You can continue filling out the form. Your responses will be saved and submitted when connection is
              restored.
            </p>
            <div className="text-xs text-gray-500">Estimated retry: When connection is available</div>
          </div>
        )}

        {/* Help Section */}
        <div className="text-center">
          <details className="group">
            <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Connection troubleshooting tips
            </summary>
            <div className="mt-3 text-left space-y-2 text-sm text-gray-600">
              <p>• Check your WiFi or mobile data connection</p>
              <p>• Try refreshing the page</p>
              <p>• Disable VPN if you're using one</p>
              <p>• Clear your browser cache and cookies</p>
              <p>• Try using a different browser or device</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
