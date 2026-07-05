import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: "Analytics opt-out",
  robots: { index: false, follow: false },
}

export default function MuteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
