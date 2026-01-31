"use client"
import { useState, useEffect } from "react"
import { ArrowLeft, ArrowRight, Save } from "lucide-react"
import { TouchFriendlyButton } from "./touch-friendly-button"
import { cn } from "@/lib/utils"

interface StickyNavigationProps {
  showBack?: boolean
  showNext?: boolean
  showSave?: boolean
  onBack?: () => void
  onNext?: () => void
  onSave?: () => void
  nextDisabled?: boolean
  nextLabel?: string
  backLabel?: string
  saveLabel?: string
  progress?: number
  className?: string
}

export function StickyNavigation({
  showBack = false,
  showNext = true,
  showSave = false,
  onBack,
  onNext,
  onSave,
  nextDisabled = false,
  nextLabel = "Continue",
  backLabel = "Back",
  saveLabel = "Save",
  progress,
  className,
}: StickyNavigationProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY

      // Show navigation when scrolling up or at top
      if (currentScrollY < lastScrollY || currentScrollY < 100) {
        setIsVisible(true)
      } else {
        // Hide when scrolling down
        setIsVisible(false)
      }

      setLastScrollY(currentScrollY)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [lastScrollY])

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300",
        "bg-white border-t border-gray-200 shadow-lg",
        "safe-area-inset-bottom", // Handle iPhone home indicator
        isVisible ? "translate-y-0" : "translate-y-full",
        className,
      )}
    >
      {/* Progress Bar */}
      {progress !== undefined && (
        <div className="w-full bg-gray-200 h-1">
          <div className="bg-medical-primary h-1 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="p-4 pb-safe">
        <div className="flex items-center justify-between space-x-3">
          {/* Back Button */}
          {showBack ? (
            <TouchFriendlyButton
              variant="outline"
              size="lg"
              onClick={onBack}
              className="flex items-center space-x-2 flex-1 max-w-[120px]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{backLabel}</span>
            </TouchFriendlyButton>
          ) : (
            <div className="flex-1 max-w-[120px]" />
          )}

          {/* Save Button */}
          {showSave && (
            <TouchFriendlyButton variant="ghost" size="lg" onClick={onSave} className="flex items-center space-x-2">
              <Save className="h-4 w-4" />
              <span>{saveLabel}</span>
            </TouchFriendlyButton>
          )}

          {/* Next Button */}
          {showNext && (
            <TouchFriendlyButton
              variant="primary"
              size="lg"
              onClick={onNext}
              disabled={nextDisabled}
              className="flex items-center space-x-2 flex-1"
              fullWidth
            >
              <span>{nextLabel}</span>
              <ArrowRight className="h-4 w-4" />
            </TouchFriendlyButton>
          )}
        </div>
      </div>
    </div>
  )
}
