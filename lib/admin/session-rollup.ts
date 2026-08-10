/**
 * Durable daily rollup of the session funnel.
 *
 * Session records (`sess:<id>`) carry a 30-day TTL, so the raw
 * /admin/sessions dataset is a rolling ~30-day window — older sessions are
 * permanently deleted. This module rolls each day's "how many sessions
 * reached step N" counts into a single durable, no-TTL key so all-time
 * funnel trends survive even after the underlying sessions expire.
 *
 * Storage (Upstash KV):
 *   sess:rollup   — JSON map { "<YYYY-MM-DD>": number[9] }, no TTL.
 *                   Each value is indexed by step (0..8); value at index S
 *                   is the count of that day's sessions with furthestStep >= S
 *                   (i.e. the same "reached step S" metric the funnel uses).
 *
 * Refresh model: `updateRollup(records)` recomputes counts from the live
 * (unexpired) sessions and merges them in. A FREEZE rule guarantees a day
 * is only (over)written while it is still safely inside the live window —
 * once a day is older than FREEZE_AFTER_DAYS (< the 30-day TTL) its stored
 * count is frozen, so a later recompute against a partially-expired day can
 * never overwrite a complete historical count with a smaller one. A day with
 * no stored value yet is always written (first capture beats no capture).
 *
 * It is refreshed opportunistically whenever the dashboard lists sessions,
 * and by a daily cron backstop (/api/cron/session-rollup) so quiet periods
 * still capture each day before it can expire.
 */
import { Redis } from '@upstash/redis';
import type { SessionRecord } from './sessions';

const KEY_ROLLUP = 'sess:rollup';
const STEP_SLOTS = 9; // steps 0..8
// Must stay below the 30-day session TTL so every day is captured complete
// before any of its sessions can start expiring.
const FREEZE_AFTER_DAYS = 28;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DailyReached = number[]; // length 9; index = step, value = count reaching >= step
export type SessionRollup = Record<string, DailyReached>; // "YYYY-MM-DD" -> counts

let cachedRedis: Redis | null = null;
function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

/** UTC day bucket ("YYYY-MM-DD") for an ISO timestamp, or null if unparseable. */
export function dayKeyOf(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

function daysAgo(dayKey: string, nowMs: number): number {
  const t = Date.parse(`${dayKey}T00:00:00Z`);
  if (isNaN(t)) return Infinity;
  return Math.floor((nowMs - t) / MS_PER_DAY);
}

/** Build a fresh rollup (day -> reached-counts) from a set of live sessions. */
export function buildFromRecords(records: SessionRecord[]): SessionRollup {
  const out: SessionRollup = {};
  for (const r of records) {
    const day = dayKeyOf(r.createdAt);
    if (!day) continue;
    const furthest = Math.max(0, Math.min(STEP_SLOTS - 1, r.furthestStep ?? 0));
    if (!out[day]) out[day] = new Array(STEP_SLOTS).fill(0);
    for (let s = 0; s <= furthest; s++) out[day][s]++;
  }
  return out;
}

export async function getRollup(): Promise<SessionRollup> {
  const redis = getRedis();
  if (!redis) return {};
  try {
    const raw = await redis.get<SessionRollup>(KEY_ROLLUP);
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/**
 * Merge live-session counts into the durable rollup and persist it. Returns
 * the full merged rollup plus which days were written vs. frozen. `nowMs`
 * is injectable for testing; defaults to Date.now().
 */
export async function updateRollup(
  records: SessionRecord[],
  nowMs: number = Date.now(),
): Promise<{ rollup: SessionRollup; written: number; frozen: number }> {
  const redis = getRedis();
  const stored = await getRollup();
  const fresh = buildFromRecords(records);

  let written = 0;
  let frozen = 0;
  for (const [day, counts] of Object.entries(fresh)) {
    const isRecent = daysAgo(day, nowMs) <= FREEZE_AFTER_DAYS;
    const alreadyStored = Object.prototype.hasOwnProperty.call(stored, day);
    if (isRecent || !alreadyStored) {
      stored[day] = counts;
      written++;
    } else {
      frozen++;
    }
  }

  if (redis && written > 0) {
    try {
      await redis.set(KEY_ROLLUP, JSON.stringify(stored));
    } catch (err: any) {
      console.warn('[session-rollup] persist failed:', err?.message);
    }
  }
  return { rollup: stored, written, frozen };
}
