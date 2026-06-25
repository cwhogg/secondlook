import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: "Step 4: Symptom photos",
  robots: { index: false, follow: false },
}

export default function Step4Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
