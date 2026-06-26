import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: "Step 6: Consent & submit",
  robots: { index: false, follow: false },
}

export default function Step6Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
