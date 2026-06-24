import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  robots: { index: true, follow: true },
}

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
