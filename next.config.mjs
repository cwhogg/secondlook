import { withSentryConfig } from "@sentry/nextjs"

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: false,
  },
  experimental: {
    outputFileTracingIncludes: {
      '/api/admin/eval-case': ['./scripts/benchmark-data/en.jsonl'],
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Prevent results-page URLs (containing requestId that grants
          // access to /api/get-analysis/[requestId]) from leaking via the
          // Referer header to any external site linked from the report.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Defense-in-depth: block clickjacking of any page (results,
          // feedback modal, admin) and content-type sniffing.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },
}

// Wrap in withSentryConfig so source maps get uploaded to Sentry on
// production builds. All Sentry-specific options come from env vars the
// wizard would set (SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN); when
// they're absent, the wrapper is a no-op passthrough and the build
// behaves exactly as before.
const sentryWebpackPluginOptions = {
  silent: true, // suppresses the "Successfully uploaded source maps" chatter
  // Only try to upload source maps if the auth token is present. Prevents
  // build failures on preview deploys where the token isn't wired up.
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
}

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions)
