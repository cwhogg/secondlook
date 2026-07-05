import { NextRequest } from 'next/server';
import { z } from 'zod';
import { saveFeedback } from '@/lib/admin/feedback';
import { extractIp } from '@/lib/admin/prod-runs';

export const runtime = 'nodejs';
export const maxDuration = 15;

const testSchema = z.object({
  mode: z.literal('test'),
  valueRating: z.number().min(1).max(5).optional(),
  uxRating: z.number().min(1).max(5).optional(),
  comments: z.string().max(5000).optional(),
  expectedDiagnosis: z.string().max(500).optional(),
  actualTop1: z.string().max(500).optional(),
});

const realSchema = z.object({
  mode: z.literal('real'),
  usefulnessRating: z.number().min(1).max(5).optional(),
  learnedSomething: z.enum(['yes', 'no']).optional(),
  whatLearned: z.string().max(5000).optional(),
  confirmedSomething: z.enum(['yes', 'no']).optional(),
  whatConfirmed: z.string().max(5000).optional(),
  comments: z.string().max(5000).optional(),
});

const generalSchema = z.object({
  mode: z.literal('general'),
  message: z.string().min(1).max(5000),
  email: z.string().email().max(200).optional().or(z.literal('')),
  page: z.string().max(500).optional(),
  sessionId: z.string().max(80).optional(),
});

const bodySchema = z.object({
  payload: z.discriminatedUnion('mode', [testSchema, realSchema, generalSchema]),
  analysisRequestId: z.string().max(100).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'invalid body', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const ok = await saveFeedback({
    id,
    createdAt: new Date().toISOString(),
    ip: extractIp(request.headers),
    userAgent: request.headers.get('user-agent'),
    analysisRequestId: parsed.data.analysisRequestId ?? null,
    payload: parsed.data.payload as any,
  });
  return new Response(JSON.stringify({ ok, id }), {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
