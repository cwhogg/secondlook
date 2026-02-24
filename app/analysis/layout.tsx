import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: "Analysis",
  robots: { index: false, follow: false },
}

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
