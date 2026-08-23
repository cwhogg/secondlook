import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { DiagnosticPipeline } from '@/lib/pipeline/orchestrator';
import { BaseAgent } from '@/lib/agents/base-agent';
import { z } from 'zod';
import { saveProdRun, summarizeAnalysis, extractIp } from '@/lib/admin/prod-runs';
import { markRunning, markComplete, markError } from '@/lib/results/run-status';
import { waitUntil } from '@vercel/functions';

// v5: specialists are o3 reasoning:high (was gpt-4.1) plus the existing o3
// reasoning:high at evidence-evaluator and synthesizer. With 6-8 specialists
// firing in parallel per case and each call now taking 30-60s, total wall
// time can easily exceed the default Vercel 60s timeout. Bump explicitly to
// the platform max so the experiment doesn't get truncated mid-pipeline.
//
// v15 update: parallel Claude-opus-4-7 synth + bounded 3-round reconciliation
// can push hard cases past 5 minutes. Bumped to 600s — within Vercel Pro plan
// limits (max 900s) with headroom for the heaviest reconciliation paths.
export const maxDuration = 600;

// Input validation schema
const demographicsSchema = z.object({
  age: z.string().min(1),
  sex: z.enum(['male', 'female', 'other']),
});

const chiefComplaintSchema = z.object({
  description: z.string().default(''),
  duration: z.string().optional(),
  severity: z.number().min(1).max(10).optional(),
  bodyRegions: z.array(z.string()).optional(),
});

const symptomSchema = z.object({
  originalPhrase: z.string().min(1),
  medicalTerm: z.string().nullable().optional().default(''),
  alternativeSearchTerms: z.array(z.string()).nullable().optional(),
  category: z.string().nullable().optional(),
  severity: z.union([z.string(), z.number()]).nullable().optional(),
  duration: z.string().nullable().optional(),
  bodyPart: z.string().nullable().optional(),
  umlsConcepts: z.array(z.any()).nullable().optional().default([]),
  selectedConcept: z.any().nullable().optional().default(null),
  confidence: z.number().nullable().optional().default(0),
  confirmed: z.boolean().nullable().optional().default(false),
  mappingError: z.boolean().nullable().optional().default(false),
  feedbackStatus: z.string().nullable().optional().default('none'),
  userCorrection: z.string().nullable().optional(),
  searchTermUsed: z.string().nullable().optional(),
  originalText: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
});

const labResultSchema = z.object({
  testName: z.string().min(1),
  value: z.string(),
  numericValue: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  referenceRange: z
    .object({
      low: z.number().nullable().optional(),
      high: z.number().nullable().optional(),
      raw: z.string(),
    })
    .nullable()
    .optional(),
  flag: z.enum(['H', 'L', 'HH', 'LL', 'CRIT']).nullable().optional(),
  dateDrawn: z.string().nullable().optional(),
  labName: z.string().nullable().optional(),
  loincCode: z.string().nullable().optional(),
  source: z.enum(['extracted', 'manual']).optional().default('extracted'),
  confidence: z.number().optional().default(0.5),
  sourceFile: z.string().nullable().optional(),
});

const patientCaseSchema = z.object({
  demographics: demographicsSchema,
  chiefComplaint: chiefComplaintSchema.optional().default({ description: '', bodyRegions: [] }),
  symptoms: z.array(symptomSchema).min(1, 'At least one symptom is required'),
  excludedFindings: z.array(z.string()).optional().default([]),
  labResults: z.array(labResultSchema).optional().default([]),
  symptomPatterns: z.any().nullable().optional().default(null),
  patientHypothesis: z.string().nullable().optional().default(null),
  medicalHistory: z.object({
    currentMedications: z.array(z.any()).optional().default([]),
    pastMedicalHistory: z.array(z.string()).optional().default([]),
    familyHistory: z.array(z.string()).optional().default([]),
    recentTests: z.array(z.string()).optional().default([]),
    medicalCare: z.string().optional().default(''),
    testingHistory: z.array(z.string()).optional().default([]),
  }).optional().default({
    currentMedications: [],
    pastMedicalHistory: [],
    familyHistory: [],
    recentTests: [],
    medicalCare: '',
    testingHistory: [],
  }),
});

// Simple in-memory rate limiting (disabled in development for testing).
// Note: per-instance state — Vercel spins up fresh instances on cold start,
// so the effective global limit is more permissive than the per-instance
// number here. That's fail-safe (too lax > too strict) but worth knowing
// if you need real global rate limiting later (Upstash Ratelimit is the
// standard swap-in).
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
// Bumped from 3 to 5 on 2026-07 for the launch thread: two people on the
// same household NAT'd IP shouldn't run each other out of quota.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

export async function POST(request: NextRequest) {
  // 128-bit CSPRNG — this id gates unauthenticated access to /api/get-analysis/[requestId]
  const requestId = `req_${randomUUID()}`;
  const startTime = Date.now();

  // Rate limiting (skip in development for testing; also skip when a valid
  // cohort-run bypass header is present so admin-driven batch runs can
  // exceed the per-IP user limit without DoS'ing the analysis flow for
  // organic users).
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const cohortBypassSecret = process.env.COHORT_BYPASS_SECRET;
  const providedBypass = request.headers.get('x-cohort-bypass');
  const cohortBypass = !!cohortBypassSecret && providedBypass === cohortBypassSecret;
  const rateCheck = (process.env.NODE_ENV === 'production' && !cohortBypass)
    ? checkRateLimit(ip)
    : { allowed: true };
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: rateCheck.retryAfter,
        requestId,
      }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfter) } }
    );
  }

  // Check API key
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'AI service not configured', requestId }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Parse and validate input
  let patientCase;
  try {
    const body = await request.json();
    patientCase = patientCaseSchema.parse(body);
  } catch (error: any) {
    const message = error instanceof z.ZodError
      ? error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : 'Invalid request body';

    return new Response(
      JSON.stringify({ error: message, requestId }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[${requestId}] Pipeline v2 starting — ${patientCase.symptoms.length} symptoms`);

  // Stream response via SSE. The pipeline runs decoupled from the stream
  // and is held alive by waitUntil, so if the client disconnects (closes the
  // tab, mobile suspend) the analysis STILL runs to completion and persists —
  // a returning visitor can then retrieve it via /api/get-analysis. Enqueues
  // are best-effort: once the stream is gone we simply stop streaming, we
  // don't abort the run.
  const encoder = new TextEncoder();
  // Ref-object (not a bare `let`) so closure assignments don't confuse
  // control-flow narrowing.
  const ctl: { current: ReadableStreamDefaultController<Uint8Array> | null } = { current: null };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctl.current = controller;
    },
    cancel() {
      // Client disconnected — do NOT abort the pipeline; waitUntil keeps it
      // running so the result is still persisted for retrieval on return.
      ctl.current = null;
    },
  });

  const safeEnqueue = (data: any) => {
    if (!ctl.current) return;
    try {
      ctl.current.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      ctl.current = null; // stream closed/cancelled — stop streaming
    }
  };

  const startedAtIso = new Date().toISOString();

  const runPromise = (async () => {
    await markRunning(requestId);

    // Suppress verbose LLM payloads to SSE (see prior note): they balloon the
    // stream and can trip the Vercel proxy to close the connection mid-flight.
    const SSE_VERBOSE_PHASES = new Set(['RESPONSE_BODY', 'USER_PROMPT', 'SYSTEM_PROMPT']);
    BaseAgent.onLog = (agent, phase, message) => {
      if (SSE_VERBOSE_PHASES.has(phase)) return;
      safeEnqueue({ type: 'log', requestId, agent, phase, message });
    };

    try {
      const pipeline = new DiagnosticPipeline(2500); // $25.00 budget cap
      const result = await pipeline.execute(patientCase as any, (progress) => {
        safeEnqueue({ type: 'progress', requestId, ...progress });
      });

      console.log(
        `[${requestId}] Pipeline complete — ${Date.now() - startTime}ms, ${result.pipelineMetadata.totalTokensUsed} tokens, ~$${result.pipelineMetadata.totalCostEstimate.toFixed(3)}`,
      );

      // Persist the full run BEFORE marking complete, so a client that polls
      // get-analysis the instant it sees "complete" always finds the result.
      try {
        const ok = await saveProdRun({
          id: requestId,
          createdAt: startedAtIso,
          ip: extractIp(request.headers),
          userAgent: request.headers.get('user-agent'),
          durationMs: Date.now() - startTime,
          patientCase: patientCase as any,
          analysisResult: result as any,
          summary: summarizeAnalysis(patientCase as any, result as any),
        });
        if (!ok) console.warn(`[${requestId}] prod-run persistence returned false (non-fatal)`);
      } catch (err: any) {
        console.warn(`[${requestId}] prod-run persistence threw (non-fatal):`, err?.message);
      }
      await markComplete(requestId, startedAtIso);

      safeEnqueue({
        type: 'result',
        requestId,
        success: true,
        analysis: result,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
      });
    } catch (error: any) {
      console.error(`[${requestId}] Pipeline error:`, error.message);
      await markError(requestId, startedAtIso, error.message);
      safeEnqueue({
        type: 'error',
        requestId,
        error: error.message,
        processingTime: Date.now() - startTime,
      });
    } finally {
      BaseAgent.onLog = null;
      const c = ctl.current;
      ctl.current = null;
      if (c) {
        try {
          c.close();
        } catch {
          /* already closed */
        }
      }
    }
  })();

  // Keep the serverless function alive until the pipeline finishes, even if
  // the client has disconnected.
  waitUntil(runPromise);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Request-Id': requestId,
    },
  });
}
