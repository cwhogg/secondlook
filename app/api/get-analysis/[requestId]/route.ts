/**
 * Resume-from-KV endpoint for the mobile-disconnect bug. When the user
 * backgrounds the browser mid-analysis on mobile (iOS Safari + Chrome
 * Android aggressively suspend background tabs), the SSE connection
 * dies. The pipeline often continues server-side and writes the final
 * result to KV via the prod-runs persistence — but the client has no
 * way to retrieve it.
 *
 * This endpoint exposes the persisted analysisResult by requestId so
 * the /analysis page can poll for the result when it sees a dead
 * connection on return.
 *
 * Auth: the requestId is opaque (`req_<ts>_<rand>`) and only known to
 * the client that initiated the call. Treating it as a bearer token is
 * fine for this use case — even if leaked, the only payload exposed is
 * the requesting user's own analysis. No auth header required.
 */
import { NextResponse } from 'next/server';
import { getProdRun } from '@/lib/admin/prod-runs';
import { getRunStatus } from '@/lib/results/run-status';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(
  _request: Request,
  { params }: { params: { requestId: string } },
) {
  const id = params?.requestId;
  if (!id) {
    return NextResponse.json({ status: 'invalid' }, { status: 400 });
  }
  try {
    const run = await getProdRun(id);
    if (run) {
      return NextResponse.json({
        status: 'complete',
        analysisResult: run.analysisResult,
        patientCase: run.patientCase,
        durationMs: run.durationMs,
        createdAt: run.createdAt,
      });
    }
    // No completed run yet — consult the run-status marker so the client can
    // tell "still running" (keep waiting) from "failed" (stop and offer retry)
    // from "never existed / expired".
    const rs = await getRunStatus(id);
    if (rs?.status === 'running') {
      return NextResponse.json({ status: 'running', startedAt: rs.startedAt }, { status: 202 });
    }
    if (rs?.status === 'error') {
      return NextResponse.json({ status: 'error', error: rs.error }, { status: 200 });
    }
    // Unknown id, or it finished-and-marked-complete but the prod-run write
    // failed. Treat as pending so the client keeps polling for a while.
    return NextResponse.json({ status: 'pending' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', detail: (err?.message || '').slice(0, 200) },
      { status: 500 },
    );
  }
}
