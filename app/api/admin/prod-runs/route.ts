import { NextResponse } from 'next/server';
import { listProdRuns, requireAdmin } from '@/lib/admin/prod-runs';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
  try {
    const { runs, total } = await listProdRuns(limit, offset);
    return NextResponse.json({ runs, total, limit, offset });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'list failed', detail: (err?.message || '').slice(0, 200) },
      { status: 500 },
    );
  }
}
