/**
 * Production-run capture: persist every successful /analyze-patient-v2
 * invocation (patient case + full analysis) so the /admin/runs page can
 * surface a summary table + click into a saved report.
 *
 * Storage layout (Upstash KV, same connection as the testing framework):
 *   pr:<id>     — JSON-serialized ProdRunRecord (full case + analysis, ~100KB+)
 *   prs:<id>    — JSON-serialized ProdRunSummary (lightweight, ~few hundred bytes)
 *   pr:index    — sorted set, score = createdAt ms, member = id (for newest-first listing)
 *
 * The list view reads ONLY the prs:<id> summary keys — hydrating 100 full
 * pr:<id> records in a single mget exceeds Upstash's 10MB per-request cap.
 * The full pr:<id> record is fetched on demand by the detail page.
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
import { timingSafeEqual } from 'crypto';
import type { PatientCase, AnalysisResult } from '../types';

const KEY_INDEX = 'pr:index';
const KEY_PREFIX = 'pr:';
const KEY_SUMMARY_PREFIX = 'prs:';
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
const summaryKey = (id: string) => `${KEY_SUMMARY_PREFIX}${id}`;

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
 * Project a full record down to the lightweight summary view stored in the
 * prs:<id> key and returned by listProdRuns().
 */
function toSummary(record: ProdRunRecord): ProdRunSummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    ip: record.ip,
    summary: record.summary,
  };
}

/**
 * Strip the per-call LLM log from analysisResult before persistence. When
 * LOG_LLM_CALLS=1 is set on the deployment, pipelineMetadata.llmCalls[]
 * carries the full system prompt + user prompt + raw response + structured
 * output for every LLM call — easily 500KB–2MB per call, with 10+ calls
 * per analysis. A single record can exceed Upstash's per-value cap
 * (1MB free tier, 10MB pay-as-you-go), silently dropping the SET. The
 * full LLM trace is still available in Vercel function logs by request
 * ID if needed.
 */
function trimForStorage(analysisResult: AnalysisResult): AnalysisResult {
  const md = (analysisResult as any).pipelineMetadata;
  if (!md || !md.llmCalls || !Array.isArray(md.llmCalls) || md.llmCalls.length === 0) {
    return analysisResult;
  }
  return {
    ...analysisResult,
    pipelineMetadata: {
      ...md,
      llmCalls: [],
      llmCallsOmitted: md.llmCalls.length,
    },
  } as AnalysisResult;
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
    const trimmed: ProdRunRecord = {
      ...record,
      analysisResult: trimForStorage(record.analysisResult),
    };
    const payload = JSON.stringify(trimmed);
    const score = Date.parse(record.createdAt) || Date.now();
    // Log payload size so we can see in Vercel logs when records get
    // close to the per-value cap. Upstash silently rejects writes above
    // ~1MB on free tier / ~10MB on pay-as-you-go.
    console.log(
      `[prod-runs] saving ${record.id} — payload ${(payload.length / 1024).toFixed(1)} KB`,
    );
    // Write the full record + lightweight summary (both with TTL), then add
    // to the index. Index entries for already-expired records are dropped on
    // list(). The summary key is what the list view reads — see header note.
    await redis.set(runKey(record.id), payload, { ex: TTL_SECONDS });
    await redis.set(summaryKey(record.id), JSON.stringify(toSummary(trimmed)), {
      ex: TTL_SECONDS,
    });
    await redis.zadd(KEY_INDEX, { score, member: record.id });
    console.log(`[prod-runs] saved ${record.id}`);
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

  // Read the lightweight summary keys only — NOT the full pr:<id> records.
  // A single mget of 100 full records (~100KB+ each) blows past Upstash's
  // 10MB per-request cap; summaries are a few hundred bytes each.
  const rawSummaries = await redis.mget<(string | null)[]>(...ids.map(summaryKey));

  // Build the result positionally so newest-first order from the index is
  // preserved even after lazy backfill of any missing summaries.
  const out: (ProdRunSummary | null)[] = new Array(ids.length).fill(null);
  const expired: string[] = [];
  const missingIdx: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const r = rawSummaries[i];
    if (!r) {
      missingIdx.push(i);
      continue;
    }
    try {
      out[i] = typeof r === 'string' ? JSON.parse(r) : (r as any);
    } catch (err: any) {
      console.warn('[prod-runs] failed to parse summary for', ids[i], err?.message);
      missingIdx.push(i);
    }
  }

  // Lazy self-heal: any id with no summary key (e.g. pre-dating the summary
  // layout, or a partial backfill) is hydrated from its full record one at a
  // time — single GETs stay well under the request cap — and the summary key
  // is written so subsequent listings are fast. A missing full record means
  // it expired; prune it from the index.
  for (const i of missingIdx) {
    const id = ids[i];
    const full = await getProdRun(id);
    if (!full) {
      expired.push(id);
      continue;
    }
    const summary = toSummary(full);
    const ttl = await redis.ttl(runKey(id));
    redis
      .set(summaryKey(id), JSON.stringify(summary), {
        ex: typeof ttl === 'number' && ttl > 0 ? ttl : TTL_SECONDS,
      })
      .catch(() => {});
    out[i] = summary;
  }

  if (expired.length > 0) {
    // Best-effort prune. Don't await — the next listing also self-heals.
    redis.zrem(KEY_INDEX, ...expired).catch(() => {});
  }
  return { runs: out.filter((x): x is ProdRunSummary => x !== null), total };
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
 *
 * Header-only: query-string passwords leak via Vercel logs, browser history,
 * referrer headers, and screenshots. Comparison is constant-time to avoid
 * a timing side-channel.
 */
export function requireAdmin(request: Request): Response | null {
  const expected = process.env.TESTING_PASSWORD;
  if (!expected) return null; // unset = open (dev mode)
  const provided = request.headers.get('x-admin-password');
  if (!provided) {
    return new Response(JSON.stringify({ error: 'password required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response(JSON.stringify({ error: 'invalid password' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
