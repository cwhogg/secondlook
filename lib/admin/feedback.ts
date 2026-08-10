/**
 * Feedback capture: persist responses from the post-report survey modal
 * so /admin/feedback can surface a list of answers + summary stats.
 *
 * Storage layout (Upstash KV, same connection as prod-runs):
 *   fb:<id>     — JSON-serialized FeedbackRecord
 *   fb:index    — sorted set, score = createdAt ms, member = id
 *
 * TTL: 365 days (longer than prod-runs because feedback is the raw
 * signal we'll want to reread across iterations of the product).
 */
import { Redis } from '@upstash/redis';

const KEY_INDEX = 'fb:index';
const KEY_PREFIX = 'fb:';
const TTL_SECONDS = 60 * 60 * 24 * 365; // 365 days

let cachedRedis: Redis | null = null;
function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

const fbKey = (id: string) => `${KEY_PREFIX}${id}`;

export type FeedbackMode = 'test' | 'real' | 'general';

/**
 * General feedback (any-page floating button). Free-form message with
 * optional email for follow-up. Captures the page pathname it was
 * submitted from + the session ID so admin can correlate the feedback
 * with the visitor's journey on /admin/sessions.
 */
export interface GeneralFeedback {
  mode: 'general';
  message: string;
  email?: string;
  page?: string;
  sessionId?: string;
}

/**
 * Test-case feedback (3 questions). All optional so the API doesn't
 * reject submissions where the user partially completed.
 */
export interface TestFeedback {
  mode: 'test';
  valueRating?: number; // 1-5 likert
  uxRating?: number; // 1-5 likert
  comments?: string;
  // Optional email the user leaves for follow-up on the final step.
  email?: string;
  // The known ground-truth diagnosis from the test-user generation, so
  // we can correlate feedback against the case that produced it.
  expectedDiagnosis?: string;
  // The pipeline's actual top-1 so we can see at a glance whether
  // SecondLook got it right.
  actualTop1?: string;
}

/**
 * Real-case feedback (4 questions). The Y/N answers carry an
 * optional free-text field that surfaces only when the user answers yes.
 */
export interface RealFeedback {
  mode: 'real';
  usefulnessRating?: number; // 1-5 likert
  learnedSomething?: 'yes' | 'no';
  whatLearned?: string;
  confirmedSomething?: 'yes' | 'no';
  whatConfirmed?: string;
  comments?: string;
  // Optional email the user leaves for follow-up on the final step.
  email?: string;
}

export interface FeedbackRecord {
  id: string;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
  // The analyze-patient-v2 request id this feedback is associated with.
  // Lets us correlate feedback against the prod-run record on
  // /admin/runs.
  analysisRequestId: string | null;
  payload: TestFeedback | RealFeedback | GeneralFeedback;
}

export interface FeedbackSummary {
  id: string;
  createdAt: string;
  ip: string | null;
  mode: FeedbackMode;
  analysisRequestId: string | null;
  payload: TestFeedback | RealFeedback | GeneralFeedback;
}

export async function saveFeedback(record: FeedbackRecord): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.warn('[feedback] KV not configured; skipping save for', record.id);
    return false;
  }
  try {
    const score = Date.parse(record.createdAt) || Date.now();
    await redis.set(fbKey(record.id), JSON.stringify(record), { ex: TTL_SECONDS });
    await redis.zadd(KEY_INDEX, { score, member: record.id });
    console.log(`[feedback] saved ${record.id} (mode=${record.payload.mode})`);
    return true;
  } catch (err: any) {
    console.error('[feedback] save failed for', record.id, err?.message);
    return false;
  }
}

export async function listFeedback(
  limit: number = 100,
  offset: number = 0,
): Promise<{ items: FeedbackSummary[]; total: number }> {
  const redis = getRedis();
  if (!redis) return { items: [], total: 0 };
  const total = await redis.zcard(KEY_INDEX);
  const start = Math.max(0, offset);
  const stop = start + Math.max(1, limit) - 1;
  const ids = (await redis.zrange<string[]>(KEY_INDEX, start, stop, { rev: true })) || [];
  if (ids.length === 0) return { items: [], total };
  const raw = await redis.mget<(string | null)[]>(...ids.map(fbKey));
  const expired: string[] = [];
  const items: FeedbackSummary[] = [];
  for (let i = 0; i < ids.length; i++) {
    const r = raw[i];
    if (!r) {
      expired.push(ids[i]);
      continue;
    }
    try {
      const parsed: FeedbackRecord = typeof r === 'string' ? JSON.parse(r) : (r as any);
      items.push({
        id: parsed.id,
        createdAt: parsed.createdAt,
        ip: parsed.ip,
        mode: parsed.payload.mode,
        analysisRequestId: parsed.analysisRequestId,
        payload: parsed.payload,
      });
    } catch {
      expired.push(ids[i]);
    }
  }
  if (expired.length > 0) {
    redis.zrem(KEY_INDEX, ...expired).catch(() => {});
  }
  return { items, total };
}
