"use client"

import { cn } from "@/lib/utils"

interface TimelineSelectorProps {
  value?: string
  onChange: (value: string) => void
}

const timelineOptions = [
  { id: "less-1-month", label: "Less than 1 month ago" },
  { id: "1-3-months", label: "1-3 months ago" },
  { id: "3-6-months", label: "3-6 months ago" },
  { id: "6-12-months", label: "6-12 months ago" },
  { id: "1-2-years", label: "1-2 years ago" },
  { id: "more-2-years", label: "More than 2 years ago" },
]

export function TimelineSelector({ value, onChange }: TimelineSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {timelineOptions.map((option) => {
        const isSelected = value === option.id

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "py-3 px-4 rounded-xl border-2 font-medium transition-all duration-200 text-left",
              "hover:border-medical-primary hover:bg-blue-50",
              "focus:outline-none focus:ring-2 focus:ring-medical-primary focus:ring-offset-2",
              isSelected
                ? "border-medical-primary bg-blue-50 text-medical-primary"
                : "border-gray-200 bg-white text-gray-700",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
