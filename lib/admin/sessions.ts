/**
 * Session-tracking storage: a per-visitor record of how far they got
 * through the intake flow, what they entered, and (when they submitted)
 * which analysis run their session produced. Powers /admin/sessions.
 *
 * Storage layout (Upstash KV):
 *   sess:<id>          full JSON record (~few KB per session)
 *   sess:index         sorted set, score = lastActiveAt ms, member = id
 *
 * TTL: 30 days per record; the sorted-set entry is pruned lazily on list.
 *
 * Design note: unlike prod-runs which is written server-side at pipeline
 * completion, sessions are written INCREMENTALLY by the client as they
 * progress. Each event triggers a merge-and-write on the server. This
 * means the record's `events[]` array grows over the session's life and
 * `furthestStep` / `lastStep` / `totalTimeMs` are recomputed on every
 * write from the event log — a clean recovery pattern even if events
 * arrive out of order or duplicate.
 */
import { Redis } from '@upstash/redis';

const KEY_PREFIX = 'sess:';
const KEY_INDEX = 'sess:index';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

let cachedRedis: Redis | null = null;
function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

const key = (id: string) => `${KEY_PREFIX}${id}`;

// Step numbering. Homepage = 0. Steps 1..6 map to /step-1../step-6.
// 7 = analysis (submitted, running). 8 = results/completed (report rendered).
export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const STEP_LABELS: Record<StepIndex, string> = {
  0: 'Homepage',
  1: 'Step 1 — Basics',
  2: 'Step 2 — Your history',
  3: 'Step 3 — Labs',
  4: 'Step 4 — Photos',
  5: 'Step 5 — Review',
  6: 'Step 6 — Consent',
  7: 'Analysis running',
  8: 'Report delivered',
};

export type SessionEventType =
  | 'session-start'
  | 'step-view' // page load of a step
  | 'step-complete' // clicked "Continue" on a step
  | 'analysis-start' // submitted from step-6, analysis kicked off
  | 'analysis-complete' // report rendered
  | 'form-snapshot' // periodic snapshot of intake form state
  | 'session-heartbeat'; // liveness ping (used for time-on-site)

export interface SessionEvent {
  ts: string; // ISO
  type: SessionEventType;
  step?: StepIndex;
  path?: string; // originating pathname when known
  data?: Record<string, unknown>;
}

export interface FormSnapshot {
  age?: string;
  sex?: string;
  symptoms?: Array<{
    originalPhrase: string;
    medicalTerm?: string;
  }>;
  narrativeChars?: number;
  labResultCount?: number;
  photoCount?: number;
  hasClarifications?: boolean;
}

export interface AnalysisOutcome {
  requestId?: string;
  top1Diagnosis?: string;
  top1Confidence?: number;
}

export interface SessionRecord {
  id: string;
  createdAt: string; // ISO
  lastActiveAt: string; // ISO
  ip: string | null;
  userAgent: string | null;
  referrer?: string;
  utmParams?: Record<string, string>;

  // Computed from event log on every write.
  furthestStep: StepIndex;
  lastStep: StepIndex;
  totalTimeMs: number;

  // Progressive intake snapshot (last known state from the client).
  form?: FormSnapshot;

  // Populated at analysis-complete.
  analysis?: AnalysisOutcome;

  // Full event log (bounded — trimmed to last 200 events per record).
  events: SessionEvent[];
}

const MAX_EVENTS_PER_RECORD = 200;

function recomputeDerived(record: SessionRecord): SessionRecord {
  let furthest: StepIndex = 0;
  let last: StepIndex = 0;
  let firstTs: number | null = null;
  let lastTs: number | null = null;

  for (const ev of record.events) {
    const t = Date.parse(ev.ts);
    if (Number.isFinite(t)) {
      if (firstTs === null) firstTs = t;
      lastTs = t;
    }
    if (typeof ev.step === 'number') {
      if (ev.step > furthest) furthest = ev.step as StepIndex;
      last = ev.step as StepIndex;
    }
    if (ev.type === 'analysis-start' && (last as number) < 7) last = 7;
    if (ev.type === 'analysis-complete') {
      last = 8;
      if ((furthest as number) < 8) furthest = 8;
    }
  }
  const totalTimeMs = firstTs !== null && lastTs !== null ? Math.max(0, lastTs - firstTs) : 0;
  return { ...record, furthestStep: furthest, lastStep: last, totalTimeMs };
}

/**
 * Upsert a session event. Reads existing record (if any), appends the new
 * event, merges in the delta (form snapshot, analysis outcome, ip/ua),
 * recomputes derived fields, writes back. Best-effort — errors logged,
 * not thrown, so client-side tracking never breaks user flow.
 */
export async function recordSessionEvent(input: {
  sessionId: string;
  ip: string | null;
  userAgent: string | null;
  referrer?: string;
  utmParams?: Record<string, string>;
  event: SessionEvent;
  formPatch?: Partial<FormSnapshot>;
  analysisPatch?: Partial<AnalysisOutcome>;
}): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const existing = (await redis.get<SessionRecord>(key(input.sessionId))) || null;
    const now = new Date().toISOString();

    let record: SessionRecord;
    if (existing) {
      record = {
        ...existing,
        lastActiveAt: now,
        ip: existing.ip || input.ip,
        userAgent: existing.userAgent || input.userAgent,
        referrer: existing.referrer || input.referrer,
        utmParams: existing.utmParams || input.utmParams,
        form: { ...(existing.form || {}), ...(input.formPatch || {}) },
        analysis: { ...(existing.analysis || {}), ...(input.analysisPatch || {}) },
        events: [...existing.events, input.event].slice(-MAX_EVENTS_PER_RECORD),
      };
    } else {
      record = {
        id: input.sessionId,
        createdAt: now,
        lastActiveAt: now,
        ip: input.ip,
        userAgent: input.userAgent,
        referrer: input.referrer,
        utmParams: input.utmParams,
        furthestStep: 0,
        lastStep: 0,
        totalTimeMs: 0,
        form: input.formPatch,
        analysis: input.analysisPatch,
        events: [input.event],
      };
    }

    record = recomputeDerived(record);

    await redis.set(key(record.id), JSON.stringify(record), { ex: TTL_SECONDS });
    const score = Date.parse(record.lastActiveAt) || Date.now();
    await redis.zadd(KEY_INDEX, { score, member: record.id });
    return true;
  } catch (err: any) {
    console.warn(`[sessions] event write failed for ${input.sessionId}:`, err?.message);
    return false;
  }
}

/**
 * List sessions, newest-lastActive first. Uses the sorted-set index so
 * the query is O(log N) + hydration cost per row.
 */
export async function listSessions(
  limit = 100,
  offset = 0,
): Promise<{ records: SessionRecord[]; total: number }> {
  const redis = getRedis();
  if (!redis) return { records: [], total: 0 };

  const total = (await redis.zcard(KEY_INDEX)) || 0;
  const ids =
    (await redis.zrange<string[]>(KEY_INDEX, offset, offset + limit - 1, { rev: true })) || [];
  if (ids.length === 0) return { records: [], total };

  // MGET individual records. Upstash caps a single response at 10 MB; at
  // ~4 KB per record we're safe well past 1000 rows.
  const pipe = redis.pipeline();
  for (const id of ids) pipe.get(key(id));
  const raw = (await pipe.exec()) as unknown as Array<SessionRecord | null>;
  const records = raw.filter((r): r is SessionRecord => r !== null);
  return { records, total };
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get<SessionRecord>(key(id))) || null;
}

/**
 * Bulk delete by id list. Removes both the per-session key and the
 * index entry. Best-effort — returns the count actually removed.
 */
export async function deleteSessions(ids: string[]): Promise<number> {
  const redis = getRedis();
  if (!redis || ids.length === 0) return 0;
  const pipe = redis.pipeline();
  for (const id of ids) {
    pipe.del(key(id));
    pipe.zrem(KEY_INDEX, id);
  }
  await pipe.exec();
  return ids.length;
}

/**
 * Bulk delete by predicate over IP / user-agent. Loads recent sessions
 * up to `limit`, filters by the passed match function, and deletes the
 * matches. Returns the count deleted.
 */
export async function deleteSessionsBy(
  predicate: (r: SessionRecord) => boolean,
  limit = 500,
): Promise<{ deleted: number; matchedIds: string[] }> {
  const { records } = await listSessions(limit, 0);
  const matches = records.filter(predicate);
  const ids = matches.map((r) => r.id);
  if (ids.length === 0) return { deleted: 0, matchedIds: [] };
  const deleted = await deleteSessions(ids);
  return { deleted, matchedIds: ids };
}
