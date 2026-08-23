/**
 * GET /api/admin/consent — list immutable consent records (admin only).
 * Same header/cookie auth as the other /admin APIs.
 */
import { NextResponse } from 'next/server';
import { listConsent } from '@/lib/admin/consent-log';
import { requireAdmin } from '@/lib/admin/prod-runs';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authFail = requireAdmin(request);
  if (authFail) return authFail;
  const url = new URL(request.url);
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 200)));
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
  const { records, total } = await listConsent(limit, offset);
  return NextResponse.json({ records, total, limit, offset });
}
