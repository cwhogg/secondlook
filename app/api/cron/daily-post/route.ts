/**
 * Daily cron: generate + publish one KB-disease blog post and post it to X.
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Registered
 * in vercel.json at 0 14 * * * (daily 14:00 UTC). Pass ?force=1 with a valid
 * secret to bypass the once-per-day idempotency guard (manual trigger).
 */
import { runDailyDiseasePost } from "@/lib/blog-gen/pipeline"
import { requireAdmin } from "@/lib/admin/prod-runs"

export const runtime = "nodejs"
export const maxDuration = 300

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.cron_secret
  if (secret) {
    const auth = request.headers.get("authorization") || ""
    if (auth === `Bearer ${secret}`) return true
  }
  // Fallback to admin password (also open when TESTING_PASSWORD is unset).
  return requireAdmin(request) === null
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const force = new URL(request.url).searchParams.get("force") === "1"
  const result = await runDailyDiseasePost({ force })
  return Response.json(result, { status: result.ok ? 200 : 500 })
}
