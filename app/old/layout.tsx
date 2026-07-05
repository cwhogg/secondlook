import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: "SecondLook (archived landing page)",
  description:
    "Previous version of the SecondLook landing page, kept for comparison during marketing iteration.",
  robots: { index: false, follow: false },
  alternates: {
    // Explicitly do NOT canonicalize to /old — leaving canonical off
    // means the current homepage's canonical (/) wins for any duplicate
    // content the crawler still sees.
    canonical: undefined,
  },
}

export default function OldLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
