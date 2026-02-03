"use client"

import { cn } from "@/lib/utils"

interface DurationSelectorProps {
  value?: string
  onChange: (value: string) => void
}

const durations = [
  { id: "days", label: "Days" },
  { id: "weeks", label: "Weeks" },
  { id: "months", label: "Months" },
  { id: "years", label: "Years" },
]

export function DurationSelector({ value, onChange }: DurationSelectorProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {durations.map((duration) => {
        const isSelected = value === duration.id

        return (
          <button
            key={duration.id}
            type="button"
            onClick={() => onChange(duration.id)}
            className={cn(
              "py-3 px-4 rounded-none border-2 font-medium transition-all duration-200",
              "hover:border-medical-primary hover:bg-blue-50",
              "focus:outline-none focus:ring-2 focus:ring-medical-primary focus:ring-offset-2",
              isSelected
                ? "border-medical-primary bg-blue-50 text-medical-primary"
                : "border-gray-200 bg-white text-gray-700",
            )}
          >
            {duration.label}
          </button>
        )
      })}
    </div>
  )
}
