"use client"

import React, { useState } from "react"
import { Eye, EyeOff, Mic, MicOff, XCircle, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface ModernInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  description?: string
  error?: string
  success?: string
  required?: boolean
  showPasswordToggle?: boolean
  showVoiceInput?: boolean
  onVoiceInput?: (transcript: string) => void
}

const ModernInput = React.forwardRef<HTMLInputElement, ModernInputProps>(
  (
    {
      className,
      type,
      label,
      description,
      error,
      success,
      required,
      showPasswordToggle,
      showVoiceInput,
      onVoiceInput,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false)
    const [isListening, setIsListening] = useState(false)

    const inputType = type === "password" && showPassword ? "text" : type

    const handleVoiceInput = () => {
      if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
        alert("Speech recognition is not supported in your browser")
        return
      }

      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition
      const recognition = new SpeechRecognition()

      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = "en-US"

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        if (onVoiceInput) {
          onVoiceInput(transcript)
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognition.onerror = () => {
        setIsListening(false)
        alert("Speech recognition error occurred")
      }

      recognition.start()
    }

    return (
      <div className="space-y-2">
        {label && <label className={cn("label-modern", required && "label-required")}>{label}</label>}
        {description && <p className="text-sm text-neutral-600 mb-2">{description}</p>}
        <div className="relative">
          <input
            type={inputType}
            className={cn(
              "input-modern",
              error && "input-error",
              success && "input-success",
              (showPasswordToggle || showVoiceInput) && "pr-12",
              className,
            )}
            ref={ref}
            {...props}
          />
          {(showPasswordToggle || showVoiceInput) && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-1">
              {showVoiceInput && (
                <button
                  type="button"
                  onClick={handleVoiceInput}
                  className={cn(
                    "p-1 rounded-md transition-colors",
                    isListening ? "text-error-500 bg-error-50" : "text-neutral-400 hover:text-neutral-600",
                  )}
                  aria-label="Voice input"
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              {showPasswordToggle && type === "password" && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="text-sm text-error-600 flex items-center gap-1">
            <XCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        {success && !error && (
          <div className="text-sm text-success-600 flex items-center gap-1">
            <CheckCircle className="h-4 w-4" />
            {success}
          </div>
        )}
      </div>
    )
  },
)

ModernInput.displayName = "ModernInput"

interface ModernTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  description?: string
  error?: string
  success?: string
  required?: boolean
  showVoiceInput?: boolean
  onVoiceInput?: (transcript: string) => void
}

const ModernTextarea = React.forwardRef<HTMLTextAreaElement, ModernTextareaProps>(
  ({ className, label, description, error, success, required, showVoiceInput, onVoiceInput, ...props }, ref) => {
    const [isListening, setIsListening] = useState(false)

    const handleVoiceInput = () => {
      if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
        alert("Speech recognition is not supported in your browser")
        return
      }

      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition
      const recognition = new SpeechRecognition()

      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = "en-US"

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        if (onVoiceInput) {
          onVoiceInput(transcript)
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognition.onerror = () => {
        setIsListening(false)
        alert("Speech recognition error occurred")
      }

      recognition.start()
    }

    return (
      <div className="space-y-2">
        {label && <label className={cn("label-modern", required && "label-required")}>{label}</label>}
        {description && <p className="text-sm text-neutral-600 mb-2">{description}</p>}
        <div className="relative">
          <textarea
            className={cn(
              "input-modern resize-none",
              error && "input-error",
              success && "input-success",
              showVoiceInput && "pr-12",
              className,
            )}
            ref={ref}
            {...props}
          />
          {showVoiceInput && (
            <button
              type="button"
              onClick={handleVoiceInput}
              className={cn(
                "absolute top-3 right-3 p-1 rounded-md transition-colors",
                isListening ? "text-error-500 bg-error-50" : "text-neutral-400 hover:text-neutral-600",
              )}
              aria-label="Voice input"
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && (
          <div className="text-sm text-error-600 flex items-center gap-1">
            <XCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        {success && !error && (
          <div className="text-sm text-success-600 flex items-center gap-1">
            <CheckCircle className="h-4 w-4" />
            {success}
          </div>
        )}
      </div>
    )
  },
)

ModernTextarea.displayName = "ModernTextarea"

export { ModernInput, ModernTextarea }
