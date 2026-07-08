import { NextResponse } from "next/server"

/**
 * TEMPORARY smoke-test endpoint. Deliberately throws an unhandled error
 * so we can confirm Sentry is capturing server-side exceptions from the
 * live deployment. Remove after the first test run confirms the error
 * appears in the Sentry dashboard.
 */
export const runtime = "nodejs"
// Force dynamic evaluation — without this, Next tries to prerender the
// route at build time and the throw below breaks the whole build.
export const dynamic = "force-dynamic"

export async function GET() {
  throw new Error(
    "Sentry server-side smoke test at " + new Date().toISOString() + " — safe to ignore",
  )
  return NextResponse.json({ ok: true }) // unreachable, keeps TS quiet
}
