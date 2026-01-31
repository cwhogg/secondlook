"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface SwipeNavigationProps {
  children: React.ReactNode[]
  currentIndex: number
  onIndexChange: (index: number) => void
  showIndicators?: boolean
  showArrows?: boolean
  enableSwipe?: boolean
  className?: string
}

export function SwipeNavigation({
  children,
  currentIndex,
  onIndexChange,
  showIndicators = true,
  showArrows = false,
  enableSwipe = true,
  className,
}: SwipeNavigationProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [currentX, setCurrentX] = useState(0)
  const [translateX, setTranslateX] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const totalItems = children.length

  useEffect(() => {
    setTranslateX(-currentIndex * 100)
  }, [currentIndex])

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enableSwipe) return

    setIsDragging(true)
    setStartX(e.touches[0].clientX)
    setCurrentX(e.touches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!enableSwipe || !isDragging) return

    const x = e.touches[0].clientX
    setCurrentX(x)

    const diff = x - startX
    const containerWidth = containerRef.current?.offsetWidth || 0
    const dragPercentage = (diff / containerWidth) * 100

    setTranslateX(-currentIndex * 100 + dragPercentage)
  }

  const handleTouchEnd = () => {
    if (!enableSwipe || !isDragging) return

    setIsDragging(false)

    const diff = currentX - startX
    const containerWidth = containerRef.current?.offsetWidth || 0
    const threshold = containerWidth * 0.2 // 20% of container width

    if (Math.abs(diff) > threshold) {
      if (diff > 0 && currentIndex > 0) {
        // Swipe right - go to previous
        onIndexChange(currentIndex - 1)
      } else if (diff < 0 && currentIndex < totalItems - 1) {
        // Swipe left - go to next
        onIndexChange(currentIndex + 1)
      }
    }

    // Reset to current position
    setTranslateX(-currentIndex * 100)
  }

  const goToPrevious = () => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1)
    }
  }

  const goToNext = () => {
    if (currentIndex < totalItems - 1) {
      onIndexChange(currentIndex + 1)
    }
  }

  const goToIndex = (index: number) => {
    onIndexChange(index)
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Content Container */}
      <div
        ref={containerRef}
        className="flex transition-transform duration-300 ease-out"
        style={{
          transform: `translateX(${translateX}%)`,
          transitionDuration: isDragging ? "0ms" : "300ms",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children.map((child, index) => (
          <div key={index} className="w-full flex-shrink-0" style={{ minWidth: "100%" }}>
            {child}
          </div>
        ))}
      </div>

      {/* Navigation Arrows */}
      {showArrows && (
        <>
          <button
            onClick={goToPrevious}
            disabled={currentIndex === 0}
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 z-10",
              "w-12 h-12 bg-white rounded-full shadow-lg",
              "flex items-center justify-center",
              "transition-opacity duration-200",
              currentIndex === 0 ? "opacity-30 cursor-not-allowed" : "opacity-80 hover:opacity-100",
            )}
          >
            <ChevronLeft className="h-6 w-6 text-gray-700" />
          </button>

          <button
            onClick={goToNext}
            disabled={currentIndex === totalItems - 1}
            className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 z-10",
              "w-12 h-12 bg-white rounded-full shadow-lg",
              "flex items-center justify-center",
              "transition-opacity duration-200",
              currentIndex === totalItems - 1 ? "opacity-30 cursor-not-allowed" : "opacity-80 hover:opacity-100",
            )}
          >
            <ChevronRight className="h-6 w-6 text-gray-700" />
          </button>
        </>
      )}

      {/* Indicators */}
      {showIndicators && totalItems > 1 && (
        <div className="flex justify-center space-x-2 mt-4">
          {children.map((_, index) => (
            <button
              key={index}
              onClick={() => goToIndex(index)}
              className={cn(
                "w-3 h-3 rounded-full transition-all duration-200",
                "min-w-[44px] min-h-[44px] flex items-center justify-center", // Touch target
                index === currentIndex ? "bg-medical-primary" : "bg-gray-300 hover:bg-gray-400",
              )}
            >
              <div
                className={cn(
                  "w-3 h-3 rounded-full transition-all duration-200",
                  index === currentIndex ? "bg-medical-primary" : "bg-gray-300",
                )}
              />
            </button>
          ))}
        </div>
      )}

      {/* Swipe Hint */}
      {enableSwipe && totalItems > 1 && (
        <div className="text-center mt-2">
          <p className="text-xs text-gray-500">Swipe left or right to navigate</p>
        </div>
      )}
    </div>
  )
}
