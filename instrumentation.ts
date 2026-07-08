// Next.js 14 runtime instrumentation hook. Called once when the server
// starts (Node runtime) or an edge worker warms up (Edge runtime). Loads
// the matching Sentry config so uncaught exceptions get reported.
//
// Required by @sentry/nextjs v8+ — before this, sentry.server.config.ts
// was auto-picked-up on import, but the newer SDK relies on this
// instrumentation hook explicitly.
import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

// Captures errors thrown in React Server Components. Without this, RSC
// errors surface in Vercel logs but never reach the Sentry dashboard.
export const onRequestError = Sentry.captureRequestError
