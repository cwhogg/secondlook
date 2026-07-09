/**
 * Integrative-run persistence.
 *
 * Separate KV keyspace from clinical runs (`int:` vs `pr:`) so the two
 * paths cannot cross-pollute. Each integrative run stores a
 * `clinicalRequestId` back-reference so we can chain UI navigation
 * without needing a secondary index for MVP.
 *
 * MVP scope: no list/index. If we build an admin view later we can add a
 * sorted-set index like prod-runs uses.
 */
import { Redis } from '@upstash/redis';
import type { IntegrativeAnalysisResult } from '../types/integrative';

const KEY_PREFIX = 'int:';
const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days, mirrors clinical

let cachedRedis: Redis | null = null;
function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

const runKey = (id: string) => `${KEY_PREFIX}${id}`;

export async function saveIntegrativeRun(record: IntegrativeAnalysisResult): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.warn('[integrative-runs] KV not configured; skipping save for', record.requestId);
    return false;
  }
  try {
    const payload = JSON.stringify(record);
    console.log(
      `[integrative-runs] saving ${record.requestId} — payload ${(payload.length / 1024).toFixed(1)} KB (clinical ${record.clinicalRequestId})`,
    );
    await redis.set(runKey(record.requestId), payload, { ex: TTL_SECONDS });
    return true;
  } catch (err: any) {
    console.error('[integrative-runs] save failed for', record.requestId, err?.message);
    return false;
  }
}

export async function getIntegrativeRun(id: string): Promise<IntegrativeAnalysisResult | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | IntegrativeAnalysisResult>(runKey(id));
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err: any) {
    console.error('[integrative-runs] get failed for', id, err?.message);
    return null;
  }
}
