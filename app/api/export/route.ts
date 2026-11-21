/**
 * Read-only export for the external admin app (github.com/cwhogg/admin).
 *
 * Returns aggregates + structured per-record fields for a trailing window.
 * Deliberately EXCLUDES patient free text (symptom phrases, narratives,
 * patientCase / analysisResult bodies), emails, IPs and user agents.
 * Feedback free text (comments about the app itself) is included,
 * truncated.
 *
 * Auth: `Authorization: Bearer <ADMIN_EXPORT_TOKEN>`. Unlike requireAdmin,
 * this is closed when the env var is unset.
 *
 * Read-only: uses getRollup(), NOT updateRollup() (the admin sessions route
 * writes the rollup as a side effect; this route must not).
 */
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { listSessions, type SessionRecord } from '@/lib/admin/sessions';
import { getRollup } from '@/lib/admin/session-rollup';
import { listProdRuns } from '@/lib/admin/prod-runs';
import { listFeedback, type FeedbackSummary } from '@/lib/admin/feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_DAYS = 90;
const TEXT_LIMIT = 500;

function authorized(request: Request): boolean {
  const expected = process.env.ADMIN_EXPORT_TOKEN;
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const a = Buffer.from(auth.slice('Bearer '.length));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function referrerDomain(referrer?: string): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function truncate(s: string | undefined): string | null {
  if (!s) return null;
  return s.length > TEXT_LIMIT ? `${s.slice(0, TEXT_LIMIT)}…` : s;
}

function exportSession(r: SessionRecord) {
  return {
    id: r.id,
    createdAt: r.createdAt,
    lastActiveAt: r.lastActiveAt,
    furthestStep: r.furthestStep,
    lastStep: r.lastStep,
    totalTimeMs: r.totalTimeMs,
    mode: r.form?.mode ?? 'real',
    age: r.form?.age ?? null,
    sex: r.form?.sex ?? null,
    symptomCount: r.form?.symptoms?.length ?? 0,
    narrativeChars: r.form?.narrativeChars ?? null,
    labResultCount: r.form?.labResultCount ?? null,
    photoCount: r.form?.photoCount ?? null,
    hasClarifications: r.form?.hasClarifications ?? null,
    referrerDomain: referrerDomain(r.referrer),
    utmSource: r.utmParams?.utm_source ?? null,
    top1Diagnosis: r.analysis?.top1Diagnosis ?? null,
    top1Confidence: r.analysis?.top1Confidence ?? null,
    analysisRequestId: r.analysis?.requestId ?? null,
  };
}

function exportFeedback(f: FeedbackSummary) {
  const p = f.payload;
  const base = {
    id: f.id,
    createdAt: f.createdAt,
    mode: f.mode,
    analysisRequestId: f.analysisRequestId,
    hasEmail: Boolean((p as { email?: string }).email),
  };
  switch (p.mode) {
    case 'test':
      return {
        ...base,
        valueRating: p.valueRating ?? null,
        uxRating: p.uxRating ?? null,
        expectedDiagnosis: p.expectedDiagnosis ?? null,
        actualTop1: p.actualTop1 ?? null,
        comments: truncate(p.comments),
      };
    case 'real':
      return {
        ...base,
        usefulnessRating: p.usefulnessRating ?? null,
        learnedSomething: p.learnedSomething ?? null,
        whatLearned: truncate(p.whatLearned),
        confirmedSomething: p.confirmedSomething ?? null,
        whatConfirmed: truncate(p.whatConfirmed),
        comments: truncate(p.comments),
      };
    default:
      return { ...base, page: p.page ?? null, message: truncate(p.message) };
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const days = Math.min(MAX_DAYS, Math.max(1, Number(url.searchParams.get('days')) || 7));
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const inWindow = (iso: string) => Date.parse(iso) >= since;

  const [{ records }, rollup, { runs, total: runsTotal }, { items, total: feedbackTotal }] =
    await Promise.all([listSessions(5000, 0), getRollup(), listProdRuns(500, 0), listFeedback(500, 0)]);

  return NextResponse.json({
    app: 'secondlook',
    generatedAt: new Date().toISOString(),
    window: { days, since: new Date(since).toISOString() },
    totals: { liveSessions: records.length, runs: runsTotal, feedback: feedbackTotal },
    rollup,
    sessions: records.filter((r) => inWindow(r.createdAt)).map(exportSession),
    runs: runs
      .filter((r) => inWindow(r.createdAt))
      .map(({ id, createdAt, summary }) => ({ id, createdAt, ...summary })),
    feedback: items.filter((f) => inWindow(f.createdAt)).map(exportFeedback),
  });
}
