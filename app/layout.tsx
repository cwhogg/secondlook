import type React from "react"
import type { Metadata } from "next"
import { Playfair_Display, Source_Serif_4, Instrument_Sans } from "next/font/google"
import "./globals.css"

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
})

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
})

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
})

const siteUrl = "https://secondlook.vercel.app"

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
}

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
      <body className={`${playfair.variable} ${sourceSerif.variable} ${instrumentSans.variable} font-serif-body`}>{children}</body>
    </html>
  )
}
