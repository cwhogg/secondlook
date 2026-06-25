import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: "Step 5: Review & submit",
  robots: { index: false, follow: false },
}

export default function Step5Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
