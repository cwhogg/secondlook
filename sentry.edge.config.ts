// Sentry — Edge runtime (middleware, edge API routes).
// The health-check endpoint runs on the edge, so this file captures
// anything thrown there. Loaded automatically by @sentry/nextjs.
import * as Sentry from "@sentry/nextjs"

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  })
}
