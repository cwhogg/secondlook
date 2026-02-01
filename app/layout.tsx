import type React from "react"
import type { Metadata } from "next"
import { Inter, Fraunces } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
})

const siteUrl = "https://secondlook.vercel.app"

export const metadata: Metadata = {
  title: {
    default: "SecondLook — AI-Powered Rare Disease Diagnosis Tool",
    template: "%s | SecondLook",
  },
  description:
    "Get a second opinion on your symptoms. SecondLook uses AI to analyze your health data against thousands of rare and complex conditions that general practitioners might miss.",
  keywords: [
    "rare disease diagnosis",
    "AI symptom checker",
    "rare condition finder",
    "medical second opinion",
    "undiagnosed symptoms",
    "health analysis tool",
    "rare disease",
    "diagnostic tool",
    "symptom analysis",
  ],
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "SecondLook",
    title: "SecondLook — AI-Powered Rare Disease Diagnosis Tool",
    description:
      "Analyze your symptoms against thousands of rare and complex conditions. Get insights in minutes, not months.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SecondLook — AI-Powered Rare Disease Diagnosis Tool",
    description:
      "Analyze your symptoms against thousands of rare and complex conditions. Get insights in minutes, not months.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${fraunces.variable} font-sans`}>{children}</body>
    </html>
  )
}
