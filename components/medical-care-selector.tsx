"use client"

import { cn } from "@/lib/utils"

interface MedicalCareSelectorProps {
  value: string
  onChange: (value: string) => void
  specialistType?: string
  onSpecialistTypeChange: (value: string) => void
  erVisits?: number
  onErVisitsChange: (value: number) => void
}

const careOptions = [
  { id: "none", label: "No doctors yet", description: "Haven't seen any healthcare providers" },
  { id: "primary", label: "Primary care doctor only", description: "Seen family doctor or internist" },
  { id: "specialists", label: "Saw specialists", description: "Referred to or saw specialist doctors" },
  { id: "emergency", label: "Emergency room visits", description: "Visited ER for these symptoms" },
]

const specialistTypes = [
  "Cardiologist",
  "Neurologist",
  "Rheumatologist",
  "Endocrinologist",
  "Gastroenterologist",
  "Other",
]

export function MedicalCareSelector({
  value,
  onChange,
  specialistType,
  onSpecialistTypeChange,
  erVisits,
  onErVisitsChange,
}: MedicalCareSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {careOptions.map((option) => {
          const isSelected = value === option.id

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={cn(
                "p-4 rounded-xl border-2 text-left transition-all duration-200",
                "hover:border-medical-primary hover:bg-blue-50",
                "focus:outline-none focus:ring-2 focus:ring-medical-primary focus:ring-offset-2",
                isSelected
                  ? "border-medical-primary bg-blue-50 text-medical-primary"
                  : "border-gray-200 bg-white text-gray-700",
              )}
            >
              <div className="font-medium mb-1">{option.label}</div>
              <div className="text-sm text-gray-500">{option.description}</div>
            </button>
          )
        })}
      </div>

      {/* Specialist Type Follow-up */}
      {value === "specialists" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <label className="block text-sm font-medium text-blue-900 mb-3">Which type of specialist?</label>
          <select
            value={specialistType || ""}
            onChange={(e) => onSpecialistTypeChange(e.target.value)}
            className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-medical-primary focus:border-medical-primary bg-white"
          >
            <option value="">Select specialist type...</option>
            {specialistTypes.map((type) => (
              <option key={type} value={type.toLowerCase()}>
                {type}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ER Visits Follow-up */}
      {value === "emergency" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <label className="block text-sm font-medium text-blue-900 mb-3">How many ER visits?</label>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onErVisitsChange(num)}
                className={cn(
                  "py-2 px-3 rounded-lg border transition-colors text-center",
                  erVisits === num
                    ? "border-medical-primary bg-medical-primary text-white"
                    : "border-blue-300 bg-white text-blue-900 hover:border-medical-primary",
                )}
              >
                {num === 5 ? "5+" : num}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
