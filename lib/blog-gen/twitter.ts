/**
 * X / Twitter posting (v2) via twitter-api-v2, OAuth 1.0a user context.
 * Mirrors the proven client from the OpenHealthDataHub pipeline. Posts a
 * 2-tweet thread (hook, then teaser + title + link). Gracefully no-ops when
 * credentials are absent, so the daily pipeline still generates + publishes
 * before the SecondLook X account exists.
 */
import { TwitterApi } from "twitter-api-v2"

const TWITTER_API_KEY = process.env.TWITTER_API_KEY
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN
const TWITTER_ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET

export function isTwitterConfigured(): boolean {
  return !!(
    TWITTER_API_KEY &&
    TWITTER_API_SECRET &&
    TWITTER_ACCESS_TOKEN &&
    TWITTER_ACCESS_TOKEN_SECRET
  )
}

export async function postTweetThread(
  tweet1: string,
  tweet2: string,
): Promise<{ tweetId: string; replyId: string }> {
  if (!isTwitterConfigured()) throw new Error("Twitter not configured")

  const client = new TwitterApi({
    appKey: TWITTER_API_KEY!,
    appSecret: TWITTER_API_SECRET!,
    accessToken: TWITTER_ACCESS_TOKEN!,
    accessSecret: TWITTER_ACCESS_TOKEN_SECRET!,
  })

  const first = await client.v2.tweet(tweet1)
  const tweetId = first.data.id
  const reply = await client.v2.reply(tweet2, tweetId)
  return { tweetId, replyId: reply.data.id }
}
