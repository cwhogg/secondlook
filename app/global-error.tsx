"use client"

/**
 * Global error boundary for the Next.js App Router. Catches any error
 * that breaks the root layout — including render errors that would
 * otherwise fall through the layout's own error.tsx (if it had one).
 *
 * Must render its own <html> and <body> because it's the fallback for
 * the ROOT layout itself. Keep the markup minimal and self-contained
 * (no imports from other components, no fetches, no shared styles) —
 * the render tree at this point can't be assumed to work.
 *
 * Reports the error to Sentry using its captureException helper, so
 * server-side and API-route errors aren't the only things showing up
 * in the dashboard.
 */

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "Georgia, serif",
          background: "#f5f0eb",
          color: "#1a1a1a",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "480px", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "1.6rem",
              fontWeight: 700,
              color: "#8b2500",
              marginBottom: "0.75rem",
            }}
          >
            Something went wrong.
          </h1>
          <p
            style={{
              fontSize: "1rem",
              color: "#5a5a5a",
              lineHeight: 1.55,
              marginBottom: "1.5rem",
            }}
          >
            SecondLook hit an unexpected error rendering this page. Your
            information hasn&rsquo;t been lost — it&rsquo;s still saved in
            your browser. We&rsquo;ve been notified automatically and will
            take a look.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#8b2500",
                color: "white",
                border: "none",
                padding: "0.75rem 1.5rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                background: "white",
                color: "#8b2500",
                border: "1px solid #d4c5b0",
                padding: "0.75rem 1.5rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Home
            </a>
          </div>
          {error.digest && (
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.7rem",
                color: "#8b7355",
                fontFamily: "monospace",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
