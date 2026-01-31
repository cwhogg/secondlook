"use client"

import { useState, useEffect } from "react"
import { Contrast, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

interface HighContrastModeProps {
  className?: string
}

export function HighContrastMode({ className }: HighContrastModeProps) {
  const [isHighContrast, setIsHighContrast] = useState(false)

  useEffect(() => {
    // Check for saved preference
    const saved = localStorage.getItem("highContrastMode")
    if (saved) {
      setIsHighContrast(JSON.parse(saved))
    } else {
      // Check system preference
      const mediaQuery = window.matchMedia("(prefers-contrast: high)")
      setIsHighContrast(mediaQuery.matches)
    }
  }, [])

  useEffect(() => {
    // Apply high contrast styles
    if (isHighContrast) {
      document.documentElement.classList.add("high-contrast")
    } else {
      document.documentElement.classList.remove("high-contrast")
    }

    // Save preference
    localStorage.setItem("highContrastMode", JSON.stringify(isHighContrast))
  }, [isHighContrast])

  const toggleHighContrast = () => {
    setIsHighContrast(!isHighContrast)
  }

  return (
    <button
      onClick={toggleHighContrast}
      className={cn(
        "flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors",
        "text-sm font-medium",
        "hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-medical-primary focus:ring-offset-2",
        "min-w-[44px] min-h-[44px]",
        isHighContrast ? "bg-gray-900 text-white hover:bg-gray-800" : "bg-white text-gray-700 border border-gray-300",
        className,
      )}
      aria-label={`${isHighContrast ? "Disable" : "Enable"} high contrast mode`}
      aria-pressed={isHighContrast}
    >
      {isHighContrast ? <Sun className="h-4 w-4" /> : <Contrast className="h-4 w-4" />}
      <span className="hidden sm:inline">{isHighContrast ? "Normal" : "High"} Contrast</span>
    </button>
  )
}
