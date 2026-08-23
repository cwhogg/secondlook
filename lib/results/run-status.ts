/**
 * Durable per-run status for leave-and-return. The full analysis result is
 * persisted at completion by prod-runs (pr:<id>); this adds a lightweight
 * status marker written at the START of a run so a returning visitor (or a
 * reconnecting tab) can tell whether their analysis is still running, has
 * finished, or failed — instead of guessing from a missing prod-run.
 *
 * Storage (Upstash KV):
 *   run:<requestId>   JSON RunStatus, 24h TTL (well past the ~10-min pipeline)
 */
import { Redis } from '@upstash/redis';

const KEY = (id: string) => `run:${id}`;
const TTL_SECONDS = 60 * 60 * 24; // 24h

let cachedRedis: Redis | null = null;
function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

export interface RunStatus {
  requestId: string;
  status: 'running' | 'complete' | 'error';
  startedAt: string;
  updatedAt: string;
  error?: string;
}

async function write(status: RunStatus): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(KEY(status.requestId), JSON.stringify(status), { ex: TTL_SECONDS });
  } catch (err: any) {
    console.warn('[run-status] write failed for', status.requestId, err?.message);
  }
}

export async function markRunning(requestId: string): Promise<void> {
  const now = new Date().toISOString();
  await write({ requestId, status: 'running', startedAt: now, updatedAt: now });
}

export async function markComplete(requestId: string, startedAt: string): Promise<void> {
  await write({
    requestId,
    status: 'complete',
    startedAt,
    updatedAt: new Date().toISOString(),
  });
}

export async function markError(
  requestId: string,
  startedAt: string,
  error: string,
): Promise<void> {
  await write({
    requestId,
    status: 'error',
    startedAt,
    updatedAt: new Date().toISOString(),
    error: (error || '').slice(0, 300),
  });
}

export async function getRunStatus(requestId: string): Promise<RunStatus | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return (await redis.get<RunStatus>(KEY(requestId))) || null;
  } catch {
    return null;
  }
}
