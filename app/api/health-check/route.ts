import { NextResponse } from "next/server"

/**
 * Lightweight upstream status probe. Queries OpenAI + Anthropic's public
 * status page JSON feeds and returns a summary that a client-side banner
 * uses to warn users when an analysis is likely to hit UPSTREAM_OVERLOAD.
 *
 * Cached at the edge for 60s — the status pages themselves publish state
 * changes at roughly that cadence, and we don't need to hammer them.
 *
 * indicator values (from statuspage.io schema):
 *   "none"      — all systems operational (mapped to "ok")
 *   "minor"     — partial degradation (mapped to "degraded")
 *   "major"     — significant outage
 *   "critical"  — full outage
 */
export const runtime = "edge"

const STATUS_URLS = {
  openai: "https://status.openai.com/api/v2/status.json",
  anthropic: "https://status.anthropic.com/api/v2/status.json",
} as const

type ProviderStatus = "ok" | "degraded" | "major" | "critical" | "unknown"
type StatusResult = { status: ProviderStatus; description: string | null }

function mapIndicator(indicator: string | undefined): ProviderStatus {
  switch (indicator) {
    case "none":
      return "ok"
    case "minor":
      return "degraded"
    case "major":
      return "major"
    case "critical":
      return "critical"
    default:
      return "unknown"
  }
}

async function probe(url: string): Promise<StatusResult> {
  try {
    const res = await fetch(url, {
      // Sub-second budget — statuspage.io is fast; if it's not, we don't
      // want to slow down the banner probe on the client.
      signal: AbortSignal.timeout(2500),
      // Don't participate in the fetch cache; we do our own edge caching
      // via the Cache-Control header on the response.
      cache: "no-store",
    })
    if (!res.ok) return { status: "unknown", description: null }
    const data = (await res.json()) as any
    return {
      status: mapIndicator(data?.status?.indicator),
      description: data?.status?.description ?? null,
    }
  } catch {
    return { status: "unknown", description: null }
  }
}

export async function GET() {
  const [openai, anthropic] = await Promise.all([
    probe(STATUS_URLS.openai),
    probe(STATUS_URLS.anthropic),
  ])

  const anyDegraded = ["degraded", "major", "critical"].some(
    (s) => openai.status === s || anthropic.status === s,
  )

  return NextResponse.json(
    {
      openai,
      anthropic,
      anyDegraded,
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        // 60s edge cache — the status pages don't change faster than this.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  )
}
