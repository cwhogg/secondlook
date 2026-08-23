/**
 * POST /api/consent — record an immutable consent at the submit gate.
 *
 * Called from the consent step when the user clicks "Start my analysis".
 * The exact consent wording is resolved server-side from the version the
 * client sends (so it can't be forged), and stored with IP + user-agent +
 * timestamp as durable evidence, independent of the session/analysis TTLs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { saveConsent } from '@/lib/admin/consent-log';
import { extractIp } from '@/lib/admin/prod-runs';

export const runtime = 'nodejs';
export const maxDuration = 15;

// Canonical consent wording, keyed by version. Bump alongside the UI's
// CONSENT_VERSION whenever the wording changes so each record captures what
// was actually shown. The current entry mirrors app/step-5/page.tsx.
const CONSENT_TEXTS: Record<string, { analysis: string; acknowledgments: string }> = {
  '2026-08-23-clickwrap-v2': {
    analysis:
      'I consent to AI analysis of the information I provided. My symptom narrative will be processed by OpenAI and Anthropic language models and stored for up to 90 days.',
    acknowledgments:
      'By clicking Start my analysis, you confirm you are 18 or older, that the information you entered is accurate and that you are authorized to submit it (about yourself, or about someone you legally represent), and you understand that SecondLook is an educational research preview — not a medical device, not a substitute for evaluation, diagnosis, or treatment by a licensed clinician, and does not create a clinician–patient relationship.',
  },
};

const bodySchema = z.object({
  consentVersion: z.string().min(1).max(64),
  method: z.string().max(64).optional(),
  sessionId: z.string().max(80).nullable().optional(),
  agreed: z.object({
    consentAnalysis: z.boolean(),
    consentNotSubstitute: z.boolean(),
    consentAccurate: z.boolean(),
  }),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const { consentVersion, method, sessionId, agreed } = parsed.data;
  const texts = CONSENT_TEXTS[consentVersion] || {
    analysis: '(unknown version — wording not on file)',
    acknowledgments: '(unknown version — wording not on file)',
  };

  const id = `csnt_${randomUUID()}`;
  const ok = await saveConsent({
    id,
    createdAt: new Date().toISOString(),
    ip: extractIp(request.headers),
    userAgent: request.headers.get('user-agent'),
    sessionId: sessionId ?? null,
    consentVersion,
    method: method || 'checkbox+clickwrap',
    agreed,
    texts,
  });

  return NextResponse.json({ ok, id }, { status: ok ? 200 : 500 });
}
