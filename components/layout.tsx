"use client"

import React from "react"
import { ArrowLeft, Menu, X, Wifi, Battery, Signal } from "lucide-react"
import { cn } from "@/lib/utils"

interface LayoutProps {
  children: React.ReactNode
  title?: string
  showBackButton?: boolean
  onBack?: () => void
  showMobileStatus?: boolean
  className?: string
}

const Layout = React.forwardRef<HTMLDivElement, LayoutProps>(
  ({ children, title, showBackButton, onBack, showMobileStatus = true, className }, ref) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)

    return (
      <div className={cn("min-h-screen bg-neutral-50", className)} ref={ref}>
        {/* Mobile Status Bar */}
        {showMobileStatus && (
          <div className="bg-neutral-900 text-white px-4 py-1 text-xs flex justify-between items-center safe-area-top">
            <div className="flex items-center gap-1">
              <span className="font-medium">9:41</span>
            </div>
            <div className="flex items-center gap-1">
              <Signal className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <Battery className="h-3 w-3" />
              <span className="text-xs">100%</span>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="bg-white border-b border-neutral-200 sticky top-0 z-40">
          <div className="mobile-padding py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {showBackButton && (
                  <button
                    onClick={onBack}
                    className="touch-target p-2 -ml-2 rounded-lg hover:bg-neutral-100 transition-colors"
                    aria-label="Go back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                {title && <h1 className="text-xl font-semibold text-neutral-900 truncate">{title}</h1>}
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="touch-target p-2 -mr-2 rounded-lg hover:bg-neutral-100 transition-colors md:hidden"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="border-t border-neutral-200 bg-white md:hidden">
              <nav className="mobile-padding py-4 space-y-2">
                <a
                  href="/"
                  className="block px-3 py-2 rounded-lg text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  Home
                </a>
                <a
                  href="/step-1"
                  className="block px-3 py-2 rounded-lg text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  Start Assessment
                </a>
                <a
                  href="/results"
                  className="block px-3 py-2 rounded-lg text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  Results
                </a>
              </nav>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="bg-white border-t border-neutral-200 pb-safe">
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
