"use client"

import type React from "react"
import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  defaultOpen?: boolean
  required?: boolean
  completed?: boolean
  error?: boolean
  className?: string
}

export function CollapsibleSection({
  title,
  subtitle,
  children,
  defaultOpen = false,
  required = false,
  completed = false,
  error = false,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const getStatusColor = () => {
    if (error) return "border-red-200 bg-red-50"
    if (completed) return "border-green-200 bg-green-50"
    if (required) return "border-blue-200 bg-blue-50"
    return "border-gray-200 bg-white"
  }

  const getStatusIcon = () => {
    if (error) return "🚫"
    if (completed) return "✅"
    if (required) return "⚠️"
    return null
  }

  return (
    <div className={cn("border rounded-xl overflow-hidden", getStatusColor(), className)}>
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 text-left flex items-center justify-between hover:bg-opacity-80 transition-colors min-h-[60px]"
      >
        <div className="flex-1 pr-4">
          <div className="flex items-center space-x-2">
            {getStatusIcon() && <span className="text-lg">{getStatusIcon()}</span>}
            <h3 className="font-medium text-gray-900">{title}</h3>
            {required && <span className="text-red-500 text-sm">*</span>}
          </div>
          {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
        </div>

        <div className="flex items-center space-x-2">
          {completed && <span className="text-xs text-green-600 font-medium">Complete</span>}
          {error && <span className="text-xs text-red-600 font-medium">Needs attention</span>}
          <div className="w-8 h-8 flex items-center justify-center">
            {isOpen ? (
              <ChevronUp className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500" />
            )}
          </div>
        </div>
      </button>

      {/* Content */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "max-h-screen opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="p-4 pt-0 border-t border-gray-100">{children}</div>
      </div>
    </div>
  )
}
