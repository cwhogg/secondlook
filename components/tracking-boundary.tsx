"use client"

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { GoogleAnalytics } from "@next/third-parties/google"
import { SessionTrackingRoot } from "@/components/session-tracking-root"
import { FeedbackButton } from "@/components/feedback-button"
import { honorMuteQueryParam, isTrackingMuted } from "@/lib/tracking-mute"

/**
 * Wraps every tracking-related client component so a single mute flag
 * (localStorage.sl_no_track) suppresses ALL of them at once:
 *   - Google Analytics
 *   - Vercel Analytics + SpeedInsights
 *   - our own session tracker (also self-guards via lib/session-tracker.ts)
 *   - the floating Feedback pill (kept live even when muted, so internal
 *     users can still submit bug reports — feedback is signal, not noise)
 *
 * Also honors ?mute=1 / ?mute=0 URL params on mount so internal users
 * can flip the flag on any browser without an admin login.
 */
export function TrackingBoundary({ gaId }: { gaId: string | undefined }) {
  const [muted, setMuted] = useState<boolean>(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    honorMuteQueryParam()
    setMuted(isTrackingMuted())
    setReady(true)
  }, [])

  if (!ready) {
    // First paint: render only the Feedback pill so admins can still
    // submit while the mute state is being resolved.
    return <FeedbackButton />
  }

  return (
    <>
      <FeedbackButton />
      {!muted && (
        <>
          <SessionTrackingRoot />
          <Analytics />
          <SpeedInsights />
          {gaId && <GoogleAnalytics gaId={gaId} />}
        </>
      )}
    </>
  )
}
