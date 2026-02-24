import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: "Step 1: Health Concerns",
  robots: { index: false, follow: false },
}

export default function Step1Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
