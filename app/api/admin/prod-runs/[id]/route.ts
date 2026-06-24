import { NextResponse } from 'next/server';
import { getProdRun, requireAdmin } from '@/lib/admin/prod-runs';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  try {
    const run = await getProdRun(id);
    if (!run) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ run });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'fetch failed', detail: (err?.message || '').slice(0, 200) },
      { status: 500 },
    );
  }
}
