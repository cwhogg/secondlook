"use client"
import { Brain, Heart, Utensils, Dumbbell, Palette, User } from "lucide-react"
import { cn } from "@/lib/utils"

interface BodyRegionSelectorProps {
  value: string[]
  onChange: (value: string[]) => void
}

const regions = [
  { id: "head", label: "Head/Brain", icon: Brain, description: "Headaches, cognitive issues, vision" },
  { id: "chest", label: "Heart/Chest", icon: Heart, description: "Breathing, chest pain, palpitations" },
  { id: "digestive", label: "Digestive", icon: Utensils, description: "Stomach, bowel, appetite" },
  { id: "muscles", label: "Muscles/Joints", icon: Dumbbell, description: "Weakness, pain, stiffness" },
  { id: "skin", label: "Skin", icon: Palette, description: "Rashes, color changes, texture" },
  { id: "whole", label: "Whole body", icon: User, description: "Fatigue, fever, weight changes" },
]

export function BodyRegionSelector({ value, onChange }: BodyRegionSelectorProps) {
  const handleToggle = (regionId: string) => {
    if (value.includes(regionId)) {
      // Remove from selection
      onChange(value.filter((id) => id !== regionId))
    } else {
      // Add to selection
      onChange([...value, regionId])
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {regions.map((region) => {
          const Icon = region.icon
          const isSelected = value.includes(region.id)

          return (
            <button
              key={region.id}
              type="button"
              onClick={() => handleToggle(region.id)}
              className={cn(
                "group relative p-6 rounded-2xl border-2 text-left transition-all duration-300 min-h-[140px] hover:scale-105 active:scale-95",
                "focus:outline-none focus:ring-4 focus:ring-purple-500/20",
                isSelected
                  ? "border-purple-500 bg-gradient-to-br from-purple-50 to-blue-50 shadow-lg"
                  : "border-gray-200 bg-white hover:border-purple-300 hover:shadow-md",
              )}
            >
              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}

              <div className="flex flex-col items-center text-center space-y-3">
                <div
                  className={cn(
                    "p-3 rounded-2xl transition-all duration-300",
                    isSelected
                      ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg"
                      : "bg-gray-100 text-gray-600 group-hover:bg-purple-100 group-hover:text-purple-600",
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <div
                    className={cn(
                      "font-semibold text-base mb-1 transition-colors",
                      isSelected ? "text-purple-700" : "text-gray-900 group-hover:text-purple-700",
                    )}
                  >
                    {region.label}
                  </div>
                  <div className="text-sm text-gray-600 leading-relaxed">{region.description}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Selection summary */}
      {value.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-emerald-800">
            <span className="font-semibold">Selected areas ({value.length}):</span>{" "}
            {value
              .map((regionId) => {
                const region = regions.find((r) => r.id === regionId)
                return region?.label
              })
              .join(", ")}
          </p>
        </div>
      )}
    </div>
  )
}
