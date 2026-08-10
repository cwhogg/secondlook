/**
 * Daily cron backstop for the durable session rollup. The rollup is also
 * refreshed opportunistically whenever an admin loads /admin/sessions, but
 * this cron guarantees each day gets captured into the durable aggregate
 * before it can expire (30-day session TTL) even during quiet periods with
 * no dashboard views.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the
 * CRON_SECRET env var is set. We accept that, or a valid admin password so
 * it can be triggered manually. If neither secret is configured the route
 * is open (dev only) — matching requireAdmin's dev posture.
 *
 * Registered as a daily cron in vercel.json.
 */
import { NextResponse } from 'next/server';
import { listSessions } from '@/lib/admin/sessions';
import { updateRollup } from '@/lib/admin/session-rollup';
import { requireAdmin } from '@/lib/admin/prod-runs';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.cron_secret;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth === `Bearer ${secret}`) return true;
  }
  // Fall back to the admin-password path (also open when TESTING_PASSWORD
  // is unset, i.e. local dev).
  return requireAdmin(request) === null;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Pull the whole live window (well past current volume) so every
  // unexpired day is represented before merging into the rollup.
  const { records } = await listSessions(5000, 0);
  const { written, frozen } = await updateRollup(records);
  return NextResponse.json({
    ok: true,
    liveSessions: records.length,
    daysWritten: written,
    daysFrozen: frozen,
  });
}
