import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordSessionEvent, type SessionEvent, type StepIndex } from '@/lib/admin/sessions';
import { extractIp } from '@/lib/admin/prod-runs';

/**
 * Bot / synthetic-monitor rejection. Vercel's own uptime probes come
 * from EC2 ranges we don't want to track, and Googlebot + friends
 * announce themselves via user-agent. Anything matching either is
 * silently dropped with a 204 so the client doesn't see an error.
 *
 * Personal IPs (dev testing) can be added to EXCLUDED_IPS as a
 * comma-separated env var.
 */
const BOT_UA_RE =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|semrush|ahrefs|pingdom|uptimerobot|monitor|headless|lighthouse|speedcurve|gtmetrix|vercel/i;

function isBotOrExcluded(ip: string | null, ua: string | null): boolean {
  if (ua && BOT_UA_RE.test(ua)) return true;
  const excludedRaw = process.env.EXCLUDED_IPS || '';
  if (excludedRaw && ip) {
    const excluded = excludedRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (excluded.includes(ip)) return true;
  }
  return false;
}

// The client fires this endpoint from useEffect + visibilitychange +
// step transitions. Unauthenticated by design — the client can't hold an
// admin credential. Rate limiting is done at the edge (Vercel) rather
// than in-app; expected volume is a few writes per session and only
// while a user is actively on the site.

const eventSchema = z.object({
  type: z.enum([
    'session-start',
    'step-view',
    'step-complete',
    'analysis-start',
    'analysis-complete',
    'form-snapshot',
    'session-heartbeat',
  ]),
  step: z.number().int().min(0).max(8).optional(),
  path: z.string().max(300).optional(),
  data: z.record(z.any()).optional(),
});

const formPatchSchema = z
  .object({
    age: z.string().max(20).optional(),
    sex: z.string().max(20).optional(),
    symptoms: z
      .array(
        z.object({
          originalPhrase: z.string().max(300),
          medicalTerm: z.string().max(300).optional(),
        }),
      )
      .max(200)
      .optional(),
    narrativeChars: z.number().int().min(0).max(1_000_000).optional(),
    labResultCount: z.number().int().min(0).max(500).optional(),
    photoCount: z.number().int().min(0).max(50).optional(),
    hasClarifications: z.boolean().optional(),
  })
  .optional();

const analysisPatchSchema = z
  .object({
    requestId: z.string().max(120).optional(),
    top1Diagnosis: z.string().max(500).optional(),
    top1Confidence: z.number().min(0).max(100).optional(),
  })
  .optional();

const bodySchema = z.object({
  sessionId: z.string().min(8).max(80),
  event: eventSchema,
  referrer: z.string().max(500).optional(),
  utmParams: z.record(z.string().max(300)).optional(),
  form: formPatchSchema,
  analysis: analysisPatchSchema,
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid payload', issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const ip = extractIp(request.headers);
  const userAgent = request.headers.get('user-agent');

  // Drop bot / synthetic-monitor / personal-testing traffic before it
  // hits KV. Silent 204 — the client's fire-and-forget POST doesn't care
  // about the response, and returning 200 would look identical to a
  // successful write to the tracker script.
  if (isBotOrExcluded(ip, userAgent)) {
    return new NextResponse(null, { status: 204 });
  }

  const evt: SessionEvent = {
    ts: new Date().toISOString(),
    type: parsed.data.event.type,
    step: parsed.data.event.step as StepIndex | undefined,
    path: parsed.data.event.path,
    data: parsed.data.event.data,
  };

  const ok = await recordSessionEvent({
    sessionId: parsed.data.sessionId,
    ip,
    userAgent,
    referrer: parsed.data.referrer,
    utmParams: parsed.data.utmParams,
    event: evt,
    formPatch: parsed.data.form,
    analysisPatch: parsed.data.analysis,
  });

  return NextResponse.json({ ok });
}
