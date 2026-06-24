import { NextResponse } from 'next/server';
import { listFeedback } from '@/lib/admin/feedback';
import { requireAdmin } from '@/lib/admin/prod-runs';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
  try {
    const { items, total } = await listFeedback(limit, offset);
    return NextResponse.json({ items, total, limit, offset });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'list failed', detail: (err?.message || '').slice(0, 200) },
      { status: 500 },
    );
  }
}
