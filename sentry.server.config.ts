// Sentry — Node runtime (server components + regular API routes).
// Loaded automatically by @sentry/nextjs when a Node handler runs.
// Captures uncaught exceptions inside API routes and server components.
//
// Activates only when SENTRY_DSN is set. Same env var value as
// NEXT_PUBLIC_SENTRY_DSN on the client, just exposed to server-side code.
import * as Sentry from "@sentry/nextjs"

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  })
}
