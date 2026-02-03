"use client"

import React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

interface LayoutProps {
  children: React.ReactNode
  title?: string
  showBackButton?: boolean
  onBack?: () => void
  className?: string
}

const Layout = React.forwardRef<HTMLDivElement, LayoutProps>(
  ({ children, title, showBackButton, onBack, className }, ref) => {
    return (
      <div className={cn("min-h-screen bg-[#f5f0eb]", className)} ref={ref}>
        {/* Header */}
        <header className="bg-white border-b border-[#d4c5b0] sticky top-0 z-40">
          <div className="mobile-padding py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {showBackButton && (
                  <button
                    onClick={onBack}
                    className="touch-target p-2 -ml-2 rounded-none hover:bg-[#faf6f0] transition-colors"
                    aria-label="Go back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                <Link href="/" className="text-xl font-bold text-[#8b2500] hover:text-[#6d1d00] font-serif transition-colors">
                  SecondLook
                </Link>
                {title && <h1 className="text-lg font-semibold text-neutral-900 truncate hidden sm:block">{title}</h1>}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="bg-white border-t border-[#e5ddd3] pb-safe">
          <div className="mobile-padding py-6">
            <div className="text-center text-sm text-neutral-600">
              <p className="mb-2">
                SecondLook provides educational information only and is not a substitute for professional medical
                advice.
              </p>
              <p>Always consult with a qualified healthcare provider for medical concerns.</p>
            </div>
          </div>
        </footer>
      </div>
    )
  },
)

Layout.displayName = "Layout"

export { Layout }
