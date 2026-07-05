"use client"

import { useEffect } from "react"
import { installGlobalTracking } from "@/lib/session-tracker"

/**
 * Mount-once client component that installs the global session-tracker
 * hooks (visibilitychange + pagehide + heartbeat) exactly one time per
 * page-lifetime. Rendered from the root layout so tracking is on for
 * every route without individual pages having to opt in.
 */
export function SessionTrackingRoot() {
  useEffect(() => {
    installGlobalTracking()
  }, [])
  return null
}
