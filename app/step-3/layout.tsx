import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: "Step 3: Medical History",
  robots: { index: false, follow: false },
}

export default function Step3Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
