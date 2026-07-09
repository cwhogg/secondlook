/**
 * Integrative-panel analysis API.
 *
 * POST { clinicalRequestId }
 *   - Looks up the stored clinical run's patientCase from Upstash
 *   - Runs the integrative pipeline (5 specialists in parallel + synth)
 *   - Streams SSE progress events, ends with a `result` event
 *   - Persists the integrative run to `int:<newId>` for the results page
 *
 * This route is intentionally isolated from the clinical /analyze-patient-v2
 * pipeline: different orchestrator, different persistence keyspace, no shared
 * state. The only cross-reference is the clinicalRequestId back-pointer stored
 * in the integrative run record.
 */
import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { executeIntegrativePipeline } from '@/lib/pipeline/integrative-orchestrator';
import { saveIntegrativeRun } from '@/lib/admin/integrative-runs';
import { Redis } from '@upstash/redis';
import type { ProdRunRecord } from '@/lib/admin/prod-runs';

// Same 10-minute ceiling as the clinical route — the 5 parallel specialists
// dominate wall-clock and each can take 20-40s on gpt-4.1.
export const maxDuration = 600;

const bodySchema = z.object({
  clinicalRequestId: z.string().min(6),
});

async function fetchClinicalRun(clinicalRequestId: string): Promise<ProdRunRecord | null> {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
  const raw = await redis.get<string | ProdRunRecord>(`pr:${clinicalRequestId}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

export async function POST(request: NextRequest) {
  const requestId = `int_${randomUUID()}`;

  let clinicalRequestId: string;
  try {
    const parsed = bodySchema.parse(await request.json());
    clinicalRequestId = parsed.clinicalRequestId;
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body: expected { clinicalRequestId }', requestId }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'AI service not fully configured', requestId }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const clinicalRun = await fetchClinicalRun(clinicalRequestId);
  if (!clinicalRun) {
    return new Response(
      JSON.stringify({ error: `Clinical run not found: ${clinicalRequestId}`, requestId }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const patientCase = clinicalRun.patientCase;
  console.log(`[${requestId}] Integrative panel starting from clinical ${clinicalRequestId}`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const result = await executeIntegrativePipeline(
          patientCase,
          requestId,
          clinicalRequestId,
          (event) => {
            send({ type: 'progress', requestId, ...event });
          },
        );

        try {
          await saveIntegrativeRun(result);
        } catch (err: any) {
          console.warn(`[${requestId}] persist failed (non-fatal):`, err?.message);
        }

        send({ type: 'result', requestId, success: true, analysis: result });
      } catch (err: any) {
        console.error(`[${requestId}] Integrative pipeline error:`, err?.message);
        try {
          const Sentry = await import('@sentry/nextjs');
          Sentry.captureException(err, { tags: { surface: 'analyze-integrative-v1', requestId } });
        } catch { /* Sentry optional */ }
        send({ type: 'error', requestId, error: err?.message || 'unknown error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
