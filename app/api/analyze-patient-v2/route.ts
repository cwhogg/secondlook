import { NextRequest } from 'next/server';
import { DiagnosticPipeline } from '@/lib/pipeline/orchestrator';
import { z } from 'zod';

// Input validation schema
const demographicsSchema = z.object({
  age: z.string().min(1),
  sex: z.enum(['male', 'female', 'other']),
});

const chiefComplaintSchema = z.object({
  description: z.string().min(10, 'Chief complaint must be at least 10 characters'),
  duration: z.string().optional(),
  severity: z.number().min(1).max(10).optional(),
  bodyRegions: z.array(z.string()).optional(),
});

const symptomSchema = z.object({
  originalPhrase: z.string().min(1),
  medicalTerm: z.string().optional().default(''),
  alternativeSearchTerms: z.array(z.string()).optional(),
  category: z.string().optional(),
  severity: z.string().optional(),
  duration: z.string().optional(),
  bodyPart: z.string().optional(),
  umlsConcepts: z.array(z.any()).optional().default([]),
  selectedConcept: z.any().nullable().optional().default(null),
  confidence: z.number().optional().default(0),
  confirmed: z.boolean().optional().default(false),
  mappingError: z.boolean().optional().default(false),
  feedbackStatus: z.string().optional().default('none'),
  userCorrection: z.string().optional(),
  searchTermUsed: z.string().optional(),
});

const patientCaseSchema = z.object({
  demographics: demographicsSchema,
  chiefComplaint: chiefComplaintSchema,
  symptoms: z.array(symptomSchema).min(1, 'At least one symptom is required'),
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

// Simple in-memory rate limiting
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

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const rateCheck = checkRateLimit(ip);
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
        const pipeline = new DiagnosticPipeline(100); // $1.00 budget cap

        const result = await pipeline.execute(patientCase as any, (progress) => {
          sendEvent({ type: 'progress', requestId, ...progress });
        });

        console.log(`[${requestId}] Pipeline complete — ${Date.now() - startTime}ms, ${result.pipelineMetadata.totalTokensUsed} tokens, ~$${result.pipelineMetadata.totalCostEstimate.toFixed(3)}`);

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
