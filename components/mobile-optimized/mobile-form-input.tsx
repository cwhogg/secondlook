"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Eye, EyeOff, Mic, MicOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface MobileFormInputProps {
  label: string
  type?: "text" | "email" | "tel" | "number" | "password" | "textarea"
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  disabled?: boolean
  maxLength?: number
  rows?: number
  autoComplete?: string
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal" | "search"
  pattern?: string
  voiceInput?: boolean
  className?: string
}

export function MobileFormInput({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  required,
  disabled,
  maxLength,
  rows = 4,
  autoComplete,
  inputMode,
  pattern,
  voiceInput = false,
  className,
}: MobileFormInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  // Initialize speech recognition
  useEffect(() => {
    if (voiceInput && "webkitSpeechRecognition" in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = "en-US"

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript
        onChange(value + (value ? " " : "") + transcript)
        setIsListening(false)
      }

      recognitionRef.current.onerror = () => {
        setIsListening(false)
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [voiceInput, value, onChange])

  const startVoiceInput = () => {
    if (recognitionRef.current && !isListening) {
      setIsListening(true)
      recognitionRef.current.start()
    }
  }

  const stopVoiceInput = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }

  const hasValue = value.length > 0
  const hasError = !!error

  const inputClasses = cn(
    "w-full px-4 py-4 text-base border-2 rounded-xl transition-all duration-200",
    "focus:outline-none focus:ring-2 focus:ring-medical-primary focus:ring-offset-2",
    "placeholder-transparent", // Hide placeholder when using floating labels
    hasError
      ? "border-red-300 focus:border-red-500"
      : hasValue || isFocused
        ? "border-medical-primary"
        : "border-gray-200 focus:border-medical-primary",
    disabled && "bg-gray-50 cursor-not-allowed",
    type === "textarea" && "resize-none min-h-[120px]",
    className,
  )

  const labelClasses = cn(
    "absolute left-4 transition-all duration-200 pointer-events-none",
    "text-gray-600 font-medium",
    hasValue || isFocused ? "top-2 text-xs text-medical-primary" : "top-4 text-base",
    hasError && "text-red-600",
  )

  const commonProps = {
    ref: inputRef,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    disabled,
    maxLength,
    autoComplete,
    inputMode,
    pattern,
    className: inputClasses,
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        {type === "textarea" ? (
          <textarea {...commonProps} rows={rows} placeholder={placeholder} />
        ) : (
          <input
            {...commonProps}
            type={type === "password" && showPassword ? "text" : type}
            placeholder={placeholder}
          />
        )}

        {/* Floating Label */}
        <label className={labelClasses}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>

        {/* Password Toggle */}
        {type === "password" && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-4 text-gray-500 hover:text-gray-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}

        {/* Voice Input Button */}
        {voiceInput && type === "textarea" && "webkitSpeechRecognition" in window && (
          <button
            type="button"
            onClick={isListening ? stopVoiceInput : startVoiceInput}
            className={cn(
              "absolute right-4 top-4 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors",
              isListening
                ? "text-red-600 bg-red-50 hover:bg-red-100"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
            )}
          >
            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* Character Counter */}
      {maxLength && (
        <div className="flex justify-between items-center text-sm">
          <div />
          <span className={cn("font-medium", value.length > maxLength * 0.9 ? "text-red-600" : "text-gray-500")}>
            {value.length}/{maxLength}
          </span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <p className="text-sm text-red-600 flex items-center space-x-1">
          <span>{error}</span>
        </p>
      )}

      {/* Voice Input Status */}
      {isListening && (
        <div className="flex items-center space-x-2 text-sm text-blue-600">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span>Listening... Speak now</span>
        </div>
      )}
    </div>
  )
}
