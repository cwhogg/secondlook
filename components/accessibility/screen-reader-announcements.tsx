"use client"

import { useEffect, useRef } from "react"

interface ScreenReaderAnnouncementsProps {
  message: string
  priority?: "polite" | "assertive"
  clearAfter?: number
}

export function ScreenReaderAnnouncements({
  message,
  priority = "polite",
  clearAfter = 5000,
}: ScreenReaderAnnouncementsProps) {
  const announcementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (message && announcementRef.current) {
      // Clear any existing content
      announcementRef.current.textContent = ""

      // Add new message after a brief delay to ensure screen readers pick it up
      setTimeout(() => {
        if (announcementRef.current) {
          announcementRef.current.textContent = message
        }
      }, 100)

      // Clear message after specified time
      if (clearAfter > 0) {
        setTimeout(() => {
          if (announcementRef.current) {
            announcementRef.current.textContent = ""
          }
        }, clearAfter)
      }
    }
  }, [message, clearAfter])

  return <div ref={announcementRef} className="sr-only" aria-live={priority} aria-atomic="true" role="status" />
}

// Hook for easy use throughout the app
export function useScreenReaderAnnouncement() {
  const announce = (message: string, priority: "polite" | "assertive" = "polite") => {
    // Create a temporary element for announcements
    const element = document.createElement("div")
    element.setAttribute("aria-live", priority)
    element.setAttribute("aria-atomic", "true")
    element.setAttribute("class", "sr-only")
    element.textContent = message

    document.body.appendChild(element)

    // Remove after announcement
    setTimeout(() => {
      document.body.removeChild(element)
    }, 5000)
  }

  return { announce }
}
