import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callAnthropic } from '@/lib/anthropic';

const inputSchema = z.object({
  groundTruth: z.object({
    diagnosis: z.string(),
    icd10: z.string().optional(),
    prevalence: z.string().optional(),
    keyFindings: z.array(z.string()),
    expectedBodySystems: z.array(z.string()),
    expectedSpecialists: z.array(z.string()),
  }),
  differentialDiagnoses: z.array(z.object({
    diagnosis: z.string(),
    evidenceScore: z.number(),
    confidenceScore: z.number(),
    clinicalReasoning: z.string(),
    supportingEvidence: z.array(z.any()),
    sourceAgent: z.string(),
    evaluationType: z.string(),
    knowledgeBaseMatch: z.boolean(),
  }).passthrough()),
  pipelineMetadata: z.any().optional(),
  difficulty: z.number().min(1).max(5),
});

export async function POST(request: NextRequest) {
  const requestId = `grade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured', requestId },
      { status: 503 }
    );
  }

  let input;
  try {
    const body = await request.json();
    input = inputSchema.parse(body);
  } catch (error: any) {
    const message = error instanceof z.ZodError
      ? error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : 'Invalid request body';
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }

  try {
    // Take top 10 diagnoses for grading
    const topDiagnoses = input.differentialDiagnoses.slice(0, 10);

    const diagnosisListForPrompt = topDiagnoses.map((d, i) => {
      const evidenceList = d.supportingEvidence
        ?.slice(0, 5)
        .map((e: any) => `  - ${e.finding} (${e.strength})`)
        .join('\n') || '  (no evidence listed)';
      return `#${i + 1}: ${d.diagnosis} (evidence score: ${d.evidenceScore}, confidence: ${d.confidenceScore})
  Source: ${d.sourceAgent} | Type: ${d.evaluationType} | KB match: ${d.knowledgeBaseMatch}
  Reasoning: ${d.clinicalReasoning}
  Evidence:\n${evidenceList}`;
    }).join('\n\n');

    const systemPrompt = `You are a clinical diagnostics evaluator grading an AI diagnostic pipeline's performance on a synthetic patient case.

SCORING RUBRIC:
- 90-100 (A): Correct diagnosis ranked #1 with strong reasoning and key findings identified
- 80-89 (B): Correct diagnosis in top 3 with reasonable reasoning
- 70-79 (C): Correct diagnosis in top 5 with adequate reasoning
- 55-69 (D): Correct diagnosis present but ranked >5, OR absent but a closely related diagnosis in the same disease family/mechanism is in top 3
- 40-54 (F): Diagnosis absent, but pipeline identified the correct disease category, organ system, or specialist pathway that would lead a clinician toward the right diagnosis. The differential would get the patient closer to an answer.
- 20-39 (F): Diagnosis absent, partially relevant differential but significant reasoning errors or misleading false leads
- 0-19 (F): Complete miss — wrong organ system, wrong disease category, misleading differential that would send a clinician in the wrong direction

LETTER GRADE MAPPING:
- 97-100: A+, 93-96: A, 90-92: A-
- 87-89: B+, 83-86: B, 80-82: B-
- 77-79: C+, 73-76: C, 70-72: C-
- 55-69: D
- Below 55: F

EVALUATION CRITERIA:
1. Was the correct diagnosis identified? At what rank?
2. Were the key diagnostic findings recognized in the supporting evidence?
3. Were appropriate body systems and specialists engaged?
4. Were there false leads that could mislead a clinician?

Grade the same regardless of difficulty level. Do NOT give bonus credit for hard cases.

PARTIAL CREDIT: When the correct diagnosis is absent but the pipeline identified useful directions (correct disease category, organ system, or related conditions), explain what partial credit was given and why in the partialCreditReason field. Set partialCreditReason to null when the correct diagnosis was found.

You must respond with valid JSON only (no markdown fences, no extra text).`;

    const userPrompt = `Grade this diagnostic pipeline result.

DIFFICULTY: ${input.difficulty}/5
CORRECT DIAGNOSIS: ${input.groundTruth.diagnosis}
ICD-10: ${input.groundTruth.icd10 || 'N/A'}
KEY FINDINGS that should have been identified: ${input.groundTruth.keyFindings.join(', ')}
EXPECTED BODY SYSTEMS: ${input.groundTruth.expectedBodySystems.join(', ')}
EXPECTED SPECIALISTS: ${input.groundTruth.expectedSpecialists.join(', ')}

PIPELINE'S TOP ${topDiagnoses.length} DIAGNOSES:
${diagnosisListForPrompt}

Respond with this exact JSON structure:
{
  "score": <0-100>,
  "grade": "<letter grade>",
  "correctDiagnosisRank": <1-based rank or null if not found>,
  "inTop3": <boolean>,
  "inTop5": <boolean>,
  "feedback": "2-3 sentence overall assessment",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "missedFindings": ["finding that was in key findings but not in evidence"],
  "falseLeads": ["diagnosis or evidence that was misleading"],
  "partialCreditReason": "explanation of partial credit given, or null if correct diagnosis was found"
}`;

    const result = await callAnthropic({
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.3,
    });

    if (typeof result.content?.score !== 'number' || !result.content?.grade) {
      console.error(`[${requestId}] Invalid grading response:`, JSON.stringify(result.content).substring(0, 500));
      return NextResponse.json(
        { error: `Failed to generate valid grading — unexpected response format (got ${typeof result.content})`, requestId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      grading: result.content,
      gradingMetadata: {
        model: result.model,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
      },
      requestId,
    });
  } catch (error: any) {
    console.error(`[${requestId}] Grading error:`, error.message);
    return NextResponse.json(
      { error: error.message, requestId },
      { status: 500 }
    );
  }
}
