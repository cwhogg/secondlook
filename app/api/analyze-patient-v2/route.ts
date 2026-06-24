import { NextRequest } from 'next/server';
import { DiagnosticPipeline } from '@/lib/pipeline/orchestrator';
import { BaseAgent } from '@/lib/agents/base-agent';
import { z } from 'zod';
import { saveProdRun, summarizeAnalysis, extractIp } from '@/lib/admin/prod-runs';

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

// Simple in-memory rate limiting (disabled in development for testing)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 3;
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
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

  console.log(`[${requestId}] Pipeline v2 starting — ${patientCase.symptoms.length} symptoms, ${patientCase.demographics.age}yo ${patientCase.demographics.sex}`);

  // Stream response via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Wire agent logs to SSE so they appear in the browser console.
        // RESPONSE_BODY logs dump full LLM response JSON which can be
        // 50-100KB per call; with v17's 8+ LLM calls per case, this balloons
        // the SSE stream to 200-400KB and reliably causes the Vercel proxy
        // to close the connection mid-flight on long cases (silent SSE
        // close failure mode). Suppress the verbose payloads to SSE; they
        // remain available in pipelineMetadata.llmCalls and Vercel function
        // logs.
        const SSE_VERBOSE_PHASES = new Set(['RESPONSE_BODY', 'USER_PROMPT', 'SYSTEM_PROMPT']);
        BaseAgent.onLog = (agent, phase, message) => {
          if (SSE_VERBOSE_PHASES.has(phase)) return;
          sendEvent({ type: 'log', requestId, agent, phase, message });
        };

        const pipeline = new DiagnosticPipeline(2500); // $25.00 budget cap (o3 reasoning models)

        const result = await pipeline.execute(patientCase as any, (progress) => {
          sendEvent({ type: 'progress', requestId, ...progress });
        });

        console.log(`[${requestId}] Pipeline complete — ${Date.now() - startTime}ms, ${result.pipelineMetadata.totalTokensUsed} tokens, ~$${result.pipelineMetadata.totalCostEstimate.toFixed(3)}`);

        // Persist the full run (patient case + analysis + IP) for the
        // /admin/runs viewer. AWAITED so Vercel doesn't terminate the
        // serverless function before the Upstash write completes — a
        // prior fire-and-forget version silently dropped writes when
        // the stream closed before the HTTP request to Upstash went
        // out. Errors are caught + logged so persistence failures still
        // never break the user's analysis response.
        const clientIp = extractIp(request.headers);
        const userAgent = request.headers.get('user-agent');
        try {
          const ok = await saveProdRun({
            id: requestId,
            createdAt: new Date().toISOString(),
            ip: clientIp,
            userAgent,
            durationMs: Date.now() - startTime,
            patientCase: patientCase as any,
            analysisResult: result as any,
            summary: summarizeAnalysis(patientCase as any, result as any),
          });
          if (!ok) {
            console.warn(`[${requestId}] prod-run persistence returned false (non-fatal)`);
          }
        } catch (err: any) {
          console.warn(
            `[${requestId}] prod-run persistence threw (non-fatal):`,
            err?.message,
          );
        }

        sendEvent({
          type: 'result',
          requestId,
          success: true,
          analysis: result,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
        });
      } catch (error: any) {
        console.error(`[${requestId}] Pipeline error:`, error.message);

        sendEvent({
          type: 'error',
          requestId,
          error: error.message,
          processingTime: Date.now() - startTime,
        });
      } finally {
        BaseAgent.onLog = null;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Request-Id': requestId,
    },
  });
}
