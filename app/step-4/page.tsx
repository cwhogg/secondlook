"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * The old Photos & imaging step. Consolidated into step-3 ("Upload any
 * other medical documents") when the two upload flows were merged.
 * Kept as an auto-redirect so any pre-consolidation bookmarks / links
 * still land somewhere sensible.
 *
 * Behavior:
 *  - If the user still has step3Data, forward to /step-5 (review).
 *  - If they don't (fresh session), bounce them back to /step-3.
 */
export default function Step4Redirect() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === "undefined") return
    const step3 = localStorage.getItem("step3Data")
    if (step3) {
      router.replace("/step-5")
    } else {
      router.replace("/step-3")
    }
  }, [router])

  return null
}
