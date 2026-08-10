/**
 * Daily pipeline: pick the next KB disease → generate a grounded, SEO'd
 * patient post → commit it to the repo (auto-publish + deploy) → post the
 * 2-tweet thread to X. Idempotent per day via a KV marker so a double cron
 * fire (or a retry) never publishes twice.
 */
import { Redis } from "@upstash/redis"
import { pickNextDisease, slugForDisease } from "./disease-picker"
import { generatePost } from "./generate"
import { publishToGitHub, isGithubConfigured } from "./github-publish"
import { postTweetThread, isTwitterConfigured } from "./twitter"

const SITE = "https://www.secondlookdx.com"
const KEY_LAST = "blog:lastAutoPostDate"

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function todayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

export interface DailyPostResult {
  ok: boolean
  skipped?: string
  slug?: string
  disease?: string
  url?: string
  tweeted?: boolean
  error?: string
}

export async function runDailyDiseasePost(
  opts: { force?: boolean; nowMs?: number } = {},
): Promise<DailyPostResult> {
  const nowMs = opts.nowMs ?? Date.now()
  const today = todayKey(nowMs)
  const redis = getRedis()

  if (!opts.force && redis) {
    const last = await redis.get<string>(KEY_LAST)
    if (last === today) return { ok: true, skipped: "already posted today" }
  }
  if (!isGithubConfigured()) {
    return { ok: false, error: "GITHUB_TOKEN not configured — cannot publish" }
  }

  const pick = pickNextDisease()
  if (!pick) return { ok: false, error: "no uncovered disease candidates" }

  const disease = pick.disease
  const slug = slugForDisease(disease)

  try {
    const post = await generatePost(disease, slug)
    const { url } = await publishToGitHub(post, slug, disease.id)

    // Claim the day BEFORE tweeting so a tweet failure can't cause a
    // republish loop (the post is already live regardless).
    if (redis) await redis.set(KEY_LAST, today)

    let tweeted = false
    if (isTwitterConfigured()) {
      const link = `${url}?utm_source=twitter&utm_medium=social&utm_campaign=${slug}`
      const tweet2 = post.tweet2.replace(/\{\{URL\}\}/g, link)
      try {
        await postTweetThread(post.tweet1, tweet2)
        tweeted = true
      } catch (err: any) {
        console.warn("[daily-post] tweet failed (post is still live):", err?.message)
      }
    }

    return { ok: true, slug, disease: disease.name, url, tweeted }
  } catch (err: any) {
    return { ok: false, slug, disease: disease.name, error: err?.message || String(err) }
  }
}

export { SITE as SECONDLOOK_SITE }
