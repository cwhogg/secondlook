"use client"

import { TrendingUp, Minus, Waves, TrendingDown, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

interface SymptomPatternSelectorProps {
  value?: string
  onChange: (value: string) => void
}

const patterns = [
  {
    id: "getting-worse",
    label: "Getting worse over time",
    description: "Symptoms are progressively worsening",
    icon: TrendingUp,
  },
  {
    id: "staying-same",
    label: "Staying about the same",
    description: "Symptoms remain consistent",
    icon: Minus,
  },
  {
    id: "comes-goes",
    label: "Comes and goes",
    description: "Symptoms appear and disappear in episodes",
    icon: Waves,
  },
  {
    id: "getting-better",
    label: "Getting better",
    description: "Symptoms are improving over time",
    icon: TrendingDown,
  },
  {
    id: "unpredictable",
    label: "Unpredictable",
    description: "No clear pattern to symptoms",
    icon: MoreHorizontal,
  },
]

export function SymptomPatternSelector({ value, onChange }: SymptomPatternSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {patterns.map((pattern) => {
        const Icon = pattern.icon
        const isSelected = value === pattern.id

        return (
          <button
            key={pattern.id}
            type="button"
            onClick={() => onChange(pattern.id)}
            className={cn(
              "p-4 rounded-none border-2 text-left transition-all duration-200 min-h-[120px]",
              "hover:border-medical-primary hover:bg-blue-50",
              "focus:outline-none focus:ring-2 focus:ring-medical-primary focus:ring-offset-2",
              isSelected
                ? "border-medical-primary bg-blue-50 text-medical-primary"
                : "border-gray-200 bg-white text-gray-700",
            )}
          >
            <div className="flex flex-col items-center text-center space-y-3">
              <Icon className={cn("h-8 w-8", isSelected ? "text-medical-primary" : "text-gray-500")} />
              <div>
                <div className="font-medium text-sm mb-1">{pattern.label}</div>
                <div className="text-xs text-gray-500">{pattern.description}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
