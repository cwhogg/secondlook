/**
 * Immutable consent log. A standalone, append-only record of every consent
 * a user gives at the submit gate — separate from the session/analysis
 * records so it survives their TTLs and can be produced as evidence.
 *
 * Storage (Upstash KV):
 *   consent:<id>     JSON ConsentRecord (write-once; never updated)
 *   consent:index    sorted set, score = createdAt ms, member = id
 *
 * TTL: 10 years (effectively permanent for our purposes). We capture the
 * exact consent TEXT shown (resolved server-side from the version, so the
 * client can't forge it) plus IP + user-agent + timestamp.
 */
import { Redis } from '@upstash/redis';

const KEY_PREFIX = 'consent:';
const KEY_INDEX = 'consent:index';
const TTL_SECONDS = 60 * 60 * 24 * 365 * 10; // ~10 years

let cachedRedis: Redis | null = null;
function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

export interface ConsentRecord {
  id: string;
  createdAt: string; // ISO
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
  consentVersion: string;
  method: string; // e.g. "checkbox+clickwrap"
  agreed: {
    consentAnalysis: boolean;
    consentNotSubstitute: boolean;
    consentAccurate: boolean;
  };
  // The exact wording the user agreed to, captured verbatim for evidence.
  texts: { analysis: string; acknowledgments: string };
}

export async function saveConsent(record: ConsentRecord): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.warn('[consent-log] KV not configured; skipping', record.id);
    return false;
  }
  try {
    // NX = never overwrite an existing consent id (immutability guard).
    await redis.set(`${KEY_PREFIX}${record.id}`, JSON.stringify(record), {
      ex: TTL_SECONDS,
      nx: true,
    });
    await redis.zadd(KEY_INDEX, {
      score: Date.parse(record.createdAt) || Date.now(),
      member: record.id,
    });
    return true;
  } catch (err: any) {
    console.error('[consent-log] save failed for', record.id, err?.message);
    return false;
  }
}

export async function listConsent(
  limit = 200,
  offset = 0,
): Promise<{ records: ConsentRecord[]; total: number }> {
  const redis = getRedis();
  if (!redis) return { records: [], total: 0 };
  const total = (await redis.zcard(KEY_INDEX)) || 0;
  const ids =
    (await redis.zrange<string[]>(KEY_INDEX, offset, offset + limit - 1, { rev: true })) || [];
  if (ids.length === 0) return { records: [], total };
  const pipe = redis.pipeline();
  for (const id of ids) pipe.get(`${KEY_PREFIX}${id}`);
  const raw = (await pipe.exec()) as unknown as Array<ConsentRecord | null>;
  return { records: raw.filter((r): r is ConsentRecord => r !== null), total };
}
