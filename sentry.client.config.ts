// Sentry — browser-side error capture.
// Loaded automatically by @sentry/nextjs on any page that renders in the
// browser. Errors thrown in React components and unhandled promise
// rejections show up in the Sentry dashboard.
//
// Activates only when NEXT_PUBLIC_SENTRY_DSN is set — that way local dev
// and preview builds without the env var stay silent instead of throwing
// misleading "DSN not configured" warnings.
import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // Capture 10% of transactions for perf traces in prod, all of them
    // in dev. Adjust upward when we're comfortable with the volume.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Never sample session replays automatically; only capture when an
    // error occurs. This keeps the replay quota under control.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Environments should match the Vercel deployment tier.
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    // Ignore noisy browser errors we can't do anything about.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
    ],
  })
}
