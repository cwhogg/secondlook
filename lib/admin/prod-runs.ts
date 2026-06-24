/**
 * Production-run capture: persist every successful /analyze-patient-v2
 * invocation (patient case + full analysis) so the /admin/runs page can
 * surface a summary table + click into a saved report.
 *
 * Storage layout (Upstash KV, same connection as the testing framework):
 *   pr:<id>     — JSON-serialized ProdRunRecord
 *   pr:index    — sorted set, score = createdAt ms, member = id (for newest-first listing)
 *
 * TTL: each pr:<id> key gets a 90-day expiry; the sorted set is pruned
 * lazily on list (entries with no surviving key are dropped). Free-tier
 * Upstash holds ~5K records at typical analysis size.
 *
 * Privacy posture: this module captures the FULL patient case (including
 * chief-complaint narrative) and the FULL analysis result. Per user
 * decision, full IP is also captured. Beta-only. If this stack ships to
 * production with real GDPR exposure, revisit the trim/hash logic here.
 */
import { Redis } from '@upstash/redis';
import type { PatientCase, AnalysisResult } from '../types';

const KEY_INDEX = 'pr:index';
const KEY_PREFIX = 'pr:';
const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

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

export interface ProdRunRecord {
  id: string;
  createdAt: string; // ISO
  ip: string | null;
  userAgent: string | null;
  durationMs: number;
  patientCase: PatientCase;
  analysisResult: AnalysisResult;
  // Denormalized fields for the list view so we don't have to hydrate the
  // full analysisResult to render a row.
  summary: {
    age: string | null;
    sex: string | null;
    symptomCount: number;
    top1Diagnosis: string | null;
    top1Confidence: number | null;
    top1EvidenceScore: number | null;
    top1EvaluationType: 'criteria-grounded' | 'reasoning-evaluated' | null;
    diagnosisCount: number;
    refined: boolean;
  };
}

export interface ProdRunSummary {
  id: string;
  createdAt: string;
  ip: string | null;
  summary: ProdRunRecord['summary'];
}

export function summarizeAnalysis(
  patientCase: PatientCase,
  analysisResult: AnalysisResult,
): ProdRunRecord['summary'] {
  const top = analysisResult.differentialDiagnoses?.[0];
  return {
    age: patientCase.demographics?.age ?? null,
    sex: patientCase.demographics?.sex ?? null,
    symptomCount: patientCase.symptoms?.length ?? 0,
    top1Diagnosis: top?.diagnosis ?? null,
    top1Confidence: typeof top?.confidenceScore === 'number' ? top.confidenceScore : null,
    top1EvidenceScore: typeof top?.evidenceScore === 'number' ? top.evidenceScore : null,
    top1EvaluationType: (top?.evaluationType as any) ?? null,
    diagnosisCount: analysisResult.differentialDiagnoses?.length ?? 0,
    refined: !!(analysisResult as any).refinement,
  };
}

/**
 * Persist one analysis run. Best-effort: errors are logged and swallowed
 * so failures here never break the user's analysis response.
 */
export async function saveProdRun(record: ProdRunRecord): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.warn('[prod-runs] KV not configured; skipping save for', record.id);
    return false;
  }
  try {
    const score = Date.parse(record.createdAt) || Date.now();
    // Write the full record with TTL, then add to the index. Index entries
    // for already-expired records are dropped on list().
    await redis.set(runKey(record.id), JSON.stringify(record), { ex: TTL_SECONDS });
    await redis.zadd(KEY_INDEX, { score, member: record.id });
    return true;
  } catch (err: any) {
    console.error('[prod-runs] save failed for', record.id, err?.message);
    return false;
  }
}

/**
 * List the most recent runs. Returns the summary view only — clients
 * fetch the full record via getProdRun() on demand.
 */
export async function listProdRuns(
  limit: number = 50,
  offset: number = 0,
): Promise<{ runs: ProdRunSummary[]; total: number }> {
  const redis = getRedis();
  if (!redis) return { runs: [], total: 0 };
  const total = await redis.zcard(KEY_INDEX);
  const start = Math.max(0, offset);
  const stop = start + Math.max(1, limit) - 1;
  const ids = (await redis.zrange<string[]>(KEY_INDEX, start, stop, { rev: true })) || [];
  if (ids.length === 0) return { runs: [], total };

  // mget returns nulls for keys that have expired — we collect those ids
  // and remove them from the index in the background so subsequent listings
  // are clean.
  const raw = await redis.mget<(string | null)[]>(...ids.map(runKey));
  const expired: string[] = [];
  const runs: ProdRunSummary[] = [];
  for (let i = 0; i < ids.length; i++) {
    const r = raw[i];
    if (!r) {
      expired.push(ids[i]);
      continue;
    }
    try {
      const parsed: ProdRunRecord = typeof r === 'string' ? JSON.parse(r) : (r as any);
      runs.push({
        id: parsed.id,
        createdAt: parsed.createdAt,
        ip: parsed.ip,
        summary: parsed.summary,
      });
    } catch (err: any) {
      console.warn('[prod-runs] failed to parse record for', ids[i], err?.message);
      expired.push(ids[i]);
    }
  }
  if (expired.length > 0) {
    // Best-effort prune. Don't await — the next listing also self-heals.
    redis.zrem(KEY_INDEX, ...expired).catch(() => {});
  }
  return { runs, total };
}

/**
 * Fetch the full record for the detail page.
 */
export async function getProdRun(id: string): Promise<ProdRunRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get<string>(runKey(id));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as any);
  } catch {
    return null;
  }
}

/**
 * Extract the client IP from a Next.js Request. Order:
 *   x-forwarded-for (first hop) → x-real-ip → x-vercel-forwarded-for → null
 */
export function extractIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get('x-real-ip') ||
    headers.get('x-vercel-forwarded-for') ||
    headers.get('cf-connecting-ip') ||
    null
  );
}

/**
 * Shared admin auth guard. Returns null if authorized, or a Response with
 * 401/403 if not. The password is read from the same TESTING_PASSWORD env
 * var that /testing and /admin/test-cases use — one shared admin password
 * across all admin endpoints.
 */
export function requireAdmin(request: Request): Response | null {
  const expected = process.env.TESTING_PASSWORD;
  if (!expected) return null; // unset = open (dev mode)
  const provided =
    request.headers.get('x-admin-password') ||
    new URL(request.url).searchParams.get('password');
  if (!provided) {
    return new Response(JSON.stringify({ error: 'password required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (provided !== expected) {
    return new Response(JSON.stringify({ error: 'invalid password' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
