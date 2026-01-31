"use client"
import { cn } from "@/lib/utils"

interface FamilyHistorySelectorProps {
  value: string[]
  onChange: (value: string[]) => void
  details: string
  onDetailsChange: (details: string) => void
}

const familyHistoryOptions = [
  "Similar symptoms",
  "Autoimmune diseases",
  "Genetic conditions",
  "Nothing unusual I know of",
]

export function FamilyHistorySelector({ value, onChange, details, onDetailsChange }: FamilyHistorySelectorProps) {
  const handleToggle = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option))
    } else {
      onChange([...value, option])
    }
  }

  const showDetailsInput = value.some((v) => v !== "Nothing unusual I know of")

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {familyHistoryOptions.map((option) => {
          const isSelected = value.includes(option)

          return (
            <button
              key={option}
              type="button"
              onClick={() => handleToggle(option)}
              className={cn(
                "p-4 rounded-xl border-2 text-left transition-all duration-200 min-h-[80px]",
                "hover:border-medical-primary hover:bg-blue-50",
                "focus:outline-none focus:ring-2 focus:ring-medical-primary focus:ring-offset-2",
                isSelected
                  ? "border-medical-primary bg-blue-50 text-medical-primary"
                  : "border-gray-200 bg-white text-gray-700",
              )}
            >
              <div className="flex items-center justify-center h-full">
                <span className="font-medium text-sm text-center">{option}</span>
              </div>
            </button>
          )
        })}
      </div>

      {showDetailsInput && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Tell us briefly:</label>
          <textarea
            placeholder="e.g., My mother has lupus, my sister has similar fatigue..."
            value={details}
            onChange={(e) => onDetailsChange(e.target.value)}
            maxLength={100}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-medical-primary focus:border-medical-primary resize-none"
          />
          <div className="text-right">
            <span className="text-xs text-gray-500">{details.length}/100 characters</span>
          </div>
        </div>
      )}
    </div>
  )
}
