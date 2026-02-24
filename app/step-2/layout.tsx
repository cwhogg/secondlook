import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: "Step 2: Symptom Details",
  robots: { index: false, follow: false },
}

export default function Step2Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
