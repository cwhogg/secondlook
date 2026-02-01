"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SymptomEntry {
  id: string
  description: string
  timing: string
}

interface SymptomEntryProps {
  symptom: SymptomEntry
  onUpdate: (id: string, field: keyof SymptomEntry, value: string) => void
  onRemove: (id: string) => void
}

const timingOptions = [
  { id: "same-time", label: "Same time" },
  { id: "weeks-later", label: "Weeks later" },
  { id: "months-later", label: "Months later" },
  { id: "years-later", label: "Years later" },
]

export function SymptomEntryComponent({ symptom, onUpdate, onRemove }: SymptomEntryProps) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-4">
      <div className="flex justify-between items-start">
        <h4 className="text-sm font-medium text-gray-900">Additional Symptom</h4>
        <button
          type="button"
          onClick={() => onRemove(symptom.id)}
          className="text-gray-400 hover:text-red-500 transition-colors touch-target flex items-center justify-center"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">What symptom?</label>
          <input
            type="text"
            placeholder="e.g., Joint pain, headaches, rash..."
            value={symptom.description}
            onChange={(e) => onUpdate(symptom.id, "description", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-medical-primary focus:border-medical-primary text-base"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">When did this start?</label>
          <div className="grid grid-cols-2 gap-2">
            {timingOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onUpdate(symptom.id, "timing", option.id)}
                className={cn(
                  "py-2 px-3 text-sm rounded-lg border transition-colors",
                  symptom.timing === option.id
                    ? "border-medical-primary bg-blue-50 text-medical-primary"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
