import { NextRequest, NextResponse } from 'next/server';

// Grade-test calls Claude Sonnet; under three parallel trio runs this can
// occasionally take 30-60s. Default Vercel timeout would kill it and the
// failing trio would orphan its testCases. 300s is generous; o3/Opus
// baseline routes already use the same ceiling.
export const maxDuration = 300;
import { z } from 'zod';
import { callAnthropic } from '@/lib/anthropic';
import { determineTier, isDiagnosisMatch, scoreToGrade, tierDescription } from '@/lib/grading/deterministic-match';
import type { TierMatch } from '@/lib/types/admin';

const nearMissSchema = z.object({
  diagnosis: z.string(),
  creditLevel: z.enum(['variant', 'family']),
  reason: z.string().optional(),
});

const familyEnrichmentSchema = z.object({
  familyName: z.string(),
  totalSubtypes: z.number(),
  topDiagnosisInFamily: z.string(),
  differentiatingTest: z.object({
    modality: z.string(),
    modalityLabel: z.string(),
    convergenceRatio: z.number(),
    perSubtype: z.array(z.object({
      diseaseName: z.string(),
      uniqueFindings: z.array(z.string()),
    })),
    sharedFindings: z.array(z.string()),
  }).nullable(),
});

const inputSchema = z.object({
  groundTruth: z.object({
    diagnosis: z.string(),
    icd10: z.string().nullable().optional(),
    prevalence: z.string().nullable().optional(),
    keyFindings: z.array(z.string()),
    expectedBodySystems: z.array(z.string()),
    expectedSpecialists: z.array(z.string()),
    nearMisses: z.array(nearMissSchema).optional(),
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
    icd10Code: z.string().optional(),
  }).passthrough()),
  pipelineMetadata: z.any().optional(),
  familyEnrichments: z.array(familyEnrichmentSchema).optional(),
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

    // ===== PASS 1: Deterministic tier matching =====
    const tierMatch = determineTier(
      input.groundTruth,
      topDiagnoses.map(d => ({ diagnosis: d.diagnosis, icd10Code: d.icd10Code })),
      input.familyEnrichments,
    );

    // Compute backward-compat fields deterministically using same fuzzy matching
    let correctDiagnosisRank: number | null = null;
    for (let i = 0; i < topDiagnoses.length; i++) {
      if (isDiagnosisMatch(topDiagnoses[i].diagnosis, input.groundTruth.diagnosis)) {
        correctDiagnosisRank = i + 1;
        break;
      }
    }
    const inTop3 = correctDiagnosisRank !== null && correctDiagnosisRank <= 3;
    const inTop5 = correctDiagnosisRank !== null && correctDiagnosisRank <= 5;

    // Near-miss match description for response
    const nearMissMatch = tierMatch.matchedNearMiss
      ? `${tierMatch.matchedNearMiss.diagnosis} (${tierMatch.matchedNearMiss.creditLevel})`
      : null;

    // ===== PASS 2: LLM scoring within constrained range =====
    const [scoreMin, scoreMax] = tierMatch.scoreRange;

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

    const tierContext = tierMatch.matchedDiagnosis
      ? `Matched "${tierMatch.matchedDiagnosis}" at rank #${tierMatch.matchedRank}.`
      : 'No diagnosis match was found.';
    const nearMissContext = tierMatch.matchedNearMiss
      ? ` Near-miss: "${tierMatch.matchedNearMiss.diagnosis}" (${tierMatch.matchedNearMiss.creditLevel} — ${tierMatch.matchedNearMiss.reason || 'related disease'}).`
      : '';
    const familyTestContext = tierMatch.tier.startsWith('family-test')
      ? ` Family-test match: the pipeline identified the correct disease family and a differentiating test that would resolve to the ground truth diagnosis.`
      : '';

    const promotionClause = tierMatch.tier === 'complete-miss'
      ? `\n\nPROMOTION: If the pipeline identified the correct organ system or disease category (even without a diagnosis match), you may promote from "complete-miss" to "organ-system" (score range 25-45). Set "promotedToOrganSystem" to true and explain why in "promotionReason". Otherwise set "promotedToOrganSystem" to false.`
      : '';

    const systemPrompt = `You are a clinical diagnostics evaluator grading an AI diagnostic pipeline's performance on a synthetic patient case.

A deterministic pre-check has already established the scoring tier:
- Tier: ${tierMatch.tier} (${tierDescription(tierMatch.tier)})
- ${tierContext}${nearMissContext}${familyTestContext}
- Your score MUST be between ${scoreMin} and ${scoreMax} (inclusive).

Your job is to evaluate REASONING QUALITY within that fixed range. Assess:
1. Quality of clinical reasoning and evidence identification
2. Whether key diagnostic findings were recognized in supporting evidence
3. Whether appropriate body systems and specialists were engaged
4. Safety — were there false leads that could mislead a clinician?
5. Coverage of key findings from the ground truth

Score toward the HIGH end of the range (${scoreMax}) for excellent reasoning, evidence coverage, and specialist routing.
Score toward the LOW end of the range (${scoreMin}) for poor reasoning, missed evidence, or dangerous false leads.

Grade the same regardless of difficulty level. Do NOT give bonus credit for hard cases.${promotionClause}

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
  "score": <${scoreMin}-${scoreMax}>,
  "feedback": "2-3 sentence overall assessment",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "missedFindings": ["finding that was in key findings but not in evidence"],
  "falseLeads": ["diagnosis or evidence that was misleading"],
  "partialCreditReason": "explanation of partial credit given, or null if correct diagnosis was found"${tierMatch.tier === 'complete-miss' ? `,
  "promotedToOrganSystem": false,
  "promotionReason": null` : ''}
}`;

    const result = await callAnthropic({
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.3,
    });

    if (typeof result.content?.score !== 'number') {
      console.error(`[${requestId}] Invalid grading response:`, JSON.stringify(result.content).substring(0, 500));
      return NextResponse.json(
        { error: `Failed to generate valid grading — unexpected response format (got ${typeof result.content})`, requestId },
        { status: 500 }
      );
    }

    // Handle promotion from complete-miss to organ-system
    let finalTierMatch: TierMatch = tierMatch;
    if (tierMatch.tier === 'complete-miss' && result.content.promotedToOrganSystem) {
      finalTierMatch = {
        ...tierMatch,
        tier: 'organ-system',
        scoreRange: [25, 45],
      };
    }

    // Clamp score to final tier range
    const [finalMin, finalMax] = finalTierMatch.scoreRange;
    const clampedScore = Math.max(finalMin, Math.min(finalMax, Math.round(result.content.score)));
    const grade = scoreToGrade(clampedScore);

    return NextResponse.json({
      grading: {
        score: clampedScore,
        grade,
        correctDiagnosisRank,
        inTop3,
        inTop5,
        feedback: result.content.feedback,
        strengths: result.content.strengths || [],
        weaknesses: result.content.weaknesses || [],
        missedFindings: result.content.missedFindings || [],
        falseLeads: result.content.falseLeads || [],
        partialCreditReason: result.content.partialCreditReason || null,
        tierMatch: finalTierMatch,
        nearMissMatch,
        gradingVersion: 'v2' as const,
      },
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
