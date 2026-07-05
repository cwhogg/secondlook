import { NextResponse } from 'next/server';
import { listSessions, getSession } from '@/lib/admin/sessions';
import { requireAdmin } from '@/lib/admin/prod-runs';

export async function GET(request: Request) {
  const authFail = requireAdmin(request);
  if (authFail) return authFail;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (id) {
    const record = await getSession(id);
    if (!record) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ record });
  }

  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 100)));
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
  const { records, total } = await listSessions(limit, offset);
  return NextResponse.json({ records, total, limit, offset });
}
