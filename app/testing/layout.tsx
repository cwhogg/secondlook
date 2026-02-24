import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: "Testing",
  robots: { index: false, follow: false },
}

export default function TestingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
