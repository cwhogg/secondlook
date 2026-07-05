"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { isTrackingMuted, setTrackingMuted } from "@/lib/tracking-mute"

/**
 * Simple opt-out toggle. Sets the client-side `sl_no_track` flag which
 * TrackingBoundary + the session tracker + Google Analytics + Vercel
 * Analytics all respect. Also honors ?mute=1 / ?mute=0 in the URL so
 * you can bookmark either state or share a link that flips the flag
 * on a new device without visiting this page.
 */
export default function MutePage() {
  const [muted, setMuted] = useState<boolean>(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Honor URL param first so a shared link wins.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const v = params.get("mute")
      if (v === "1") setTrackingMuted(true)
      else if (v === "0") setTrackingMuted(false)
    }
    setMuted(isTrackingMuted())
    setReady(true)
  }, [])

  const toggle = () => {
    const next = !muted
    setTrackingMuted(next)
    setMuted(next)
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-white border border-[#d4c5b0] p-8">
        <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500] mb-2">
          Internal use
        </div>
        <h1 className="font-serif text-2xl text-[#1a1a1a] mb-4">Analytics opt-out</h1>
        <p className="font-serif-body text-sm text-[#5a5a5a] leading-relaxed mb-6">
          When on, this browser stops sending events to session tracking, Google
          Analytics, Vercel Analytics, and SpeedInsights. Feedback submissions
          still work. Setting persists via localStorage on this device only.
        </p>

        {ready && (
          <>
            <div
              className={`p-4 border mb-4 ${
                muted
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
            >
              <div className="font-semibold text-sm">
                {muted ? "Analytics are MUTED on this browser." : "Analytics are ACTIVE on this browser."}
              </div>
            </div>

            <button
              onClick={toggle}
              className={`w-full px-4 py-3 font-sans text-[0.75rem] font-semibold uppercase tracking-[0.14em] transition-colors ${
                muted
                  ? "bg-white border-2 border-[#8b2500] text-[#8b2500] hover:bg-[#faf6f0]"
                  : "bg-[#8b2500] text-white hover:bg-[#6d1d00]"
              }`}
            >
              {muted ? "Turn analytics back on" : "Mute analytics on this browser"}
            </button>
          </>
        )}

        <div className="mt-6 pt-4 border-t border-[#e5ddd3] font-serif-body text-xs text-[#8b7355] leading-relaxed">
          <div className="mb-2 font-semibold text-[#5a5a5a]">Bookmarks for other devices:</div>
          <ul className="space-y-1">
            <li>
              <code className="font-mono text-[11px]">?mute=1</code> — mute this device
            </li>
            <li>
              <code className="font-mono text-[11px]">?mute=0</code> — un-mute this device
            </li>
          </ul>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="font-sans text-[11px] uppercase tracking-wider text-[#8b7355] hover:text-[#8b2500]">
            ← Back to site
          </Link>
        </div>
      </div>
    </div>
  )
}
