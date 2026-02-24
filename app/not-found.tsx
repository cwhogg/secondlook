import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false },
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">
      {/* Header */}
      <nav className="border-b border-[#d4c5b0]">
        <div className="max-w-[1140px] mx-auto px-8 py-6 flex justify-between items-baseline">
          <Link href="/" className="font-serif text-[1.35rem] font-semibold tracking-[0.01em]">
            <span className="text-[#1a1a1a]">Second</span>
            <span className="text-[#8b2500]">Look</span>
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="text-center max-w-md">
          <div className="font-serif text-[6rem] font-normal text-[#d4c5b0] leading-none mb-4">
            404
          </div>
          <h1 className="font-serif text-2xl font-medium text-[#1a1a1a] mb-4">
            Page Not Found
          </h1>
          <p className="font-serif-body text-[#5a5a5a] leading-relaxed mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center font-sans text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-white bg-[#8b2500] px-8 py-3 hover:bg-[#6d1d00] transition-colors"
            >
              Go to Homepage
            </Link>
            <Link
              href="/blog"
              className="inline-flex items-center justify-center font-sans text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[#8b2500] border border-[#d4c5b0] px-8 py-3 hover:border-[#8b2500] transition-colors"
            >
              Browse Resources
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
