import { NextResponse } from 'next/server';
import { listSessions, getSession, deleteSessions, deleteSessionsBy } from '@/lib/admin/sessions';
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

/**
 * DELETE — bulk purge sessions. Body accepts either:
 *   { ids: string[] }         — explicit id list
 *   { ips: string[] }         — every session with a matching client IP
 *   { botsOnly: true }        — session_start events whose totalTimeMs is 0
 *                               AND whose IP matches a known bot range
 * Combinations are OR'd. All matching sessions are dropped from KV.
 */
export async function DELETE(request: Request) {
  const authFail = requireAdmin(request);
  if (authFail) return authFail;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : [];
  const ips: string[] = Array.isArray(body?.ips) ? body.ips.filter((x: unknown) => typeof x === 'string') : [];
  const botsOnly = body?.botsOnly === true;

  let deleted = 0;
  const purgedIds: string[] = [];

  if (ids.length > 0) {
    deleted += await deleteSessions(ids);
    purgedIds.push(...ids);
  }

  if (ips.length > 0 || botsOnly) {
    const ipSet = new Set(ips);
    const res = await deleteSessionsBy((r) => {
      if (r.ip && ipSet.has(r.ip)) return true;
      if (botsOnly) {
        // Vercel + AWS bot IP ranges we've observed in the session
        // corpus: 54.183.*, 13.57.*, 3.*, 34.*, 52.*, 18.*, 44.*, 100.*
        // and Google crawlers 74.125.*, 66.249.*, 172.217.*
        const ip = r.ip || '';
        if (
          /^(54\.183\.|13\.57\.|74\.125\.|66\.249\.|172\.217\.)/.test(ip)
        ) return true;
      }
      return false;
    });
    deleted += res.deleted;
    purgedIds.push(...res.matchedIds);
  }

  return NextResponse.json({ ok: true, deleted, ids: purgedIds });
}
