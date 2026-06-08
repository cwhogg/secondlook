import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ClaudeEvaluatorAgent } from '@/lib/agents/claude-evaluator';
import { ClaudeSynthAgent } from '@/lib/agents/claude-synthesizer';
import type { AgentInput, AgentOutput } from '@/lib/agents/types';
import type {
  AnalysisResult,
  ClarifyingAnswer,
  DiagnosisHypothesis,
  EvidenceItem,
  RefinementDelta,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const answerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.enum(['yes', 'no', 'dont_know']),
});

// Permissive shape on the analysis side — the UI POSTs whatever it has in
// sessionStorage. We only need a handful of fields, the rest passes through.
const requestSchema = z.object({
  originalAnalysis: z.object({
    differentialDiagnoses: z.array(z.any()),
    clarifyingQuestions: z.array(z.any()).optional(),
    nextSteps: z.any().optional(),
    overallAssessment: z.string().optional(),
  }).passthrough(),
  answers: z.array(answerSchema).min(1, 'At least one answer is required'),
  patientCase: z.object({
    demographics: z.object({
      age: z.string(),
      sex: z.enum(['male', 'female', 'other']),
    }),
    symptoms: z.array(z.any()).min(1),
  }).passthrough(),
});

/**
 * Given the original analysis + the patient's yes/no/don't-know answers,
 * synthesize new EvidenceItems on each affected hypothesis based on the
 * Clarifier's `affectsDiagnoses` mapping, then re-run Claude eval + synth.
 *
 * Mapping rules:
 * - answer === 'dont_know' → no signal, hypothesis untouched
 * - per affectsDiagnoses entry, impact = (answer === 'yes' ? ifYes : ifNo)
 *   - 'rules-in'  → supporting evidence, strength 'strong'
 *   - 'supports'  → supporting evidence, strength 'moderate'
 *   - 'weakens'   → contradictory evidence, strength 'moderate'
 *   - 'rules-out' → contradictory evidence, strength 'strong'
 *   - 'neutral'   → no change
 */
function applyAnswersToHypotheses(
  hypotheses: DiagnosisHypothesis[],
  questions: NonNullable<AnalysisResult['clarifyingQuestions']>,
  answers: ClarifyingAnswer[],
): DiagnosisHypothesis[] {
  // Index questions by id and hypotheses by normalized name.
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const hypothesisByName = new Map(hypotheses.map((h) => [normalize(h.diagnosis), h]));

  // Build a mutable copy so we don't mutate the caller's payload.
  const draft: Record<string, DiagnosisHypothesis> = {};
  for (const h of hypotheses) {
    draft[normalize(h.diagnosis)] = {
      ...h,
      supportingEvidence: [...(h.supportingEvidence || [])],
      contradictoryEvidence: [...(h.contradictoryEvidence || [])],
    };
  }

  for (const ans of answers) {
    if (ans.answer === 'dont_know') continue;
    const q = questionById.get(ans.questionId);
    if (!q) continue;

    const phrase = q.question.replace(/[?]+\s*$/, '').trim();
    const patientFraming =
      ans.answer === 'yes'
        ? `Patient confirmed: ${phrase}`
        : `Patient denied: ${phrase}`;

    for (const target of q.affectsDiagnoses) {
      const key = normalize(target.diagnosisName);
      const hyp = draft[key] || hypothesisByName.get(key);
      if (!hyp) continue;

      const impact = ans.answer === 'yes' ? target.ifYes : target.ifNo;
      if (impact === 'neutral') continue;

      const baseItem = {
        finding: patientFraming,
        patientSymptom: phrase,
        attributedTo: 'patient-clarification',
      };

      if (impact === 'rules-in' || impact === 'supports') {
        const item: EvidenceItem = {
          ...baseItem,
          strength: impact === 'rules-in' ? 'strong' : 'moderate',
          type: 'supporting',
        };
        hyp.supportingEvidence.push(item);
      } else if (impact === 'rules-out' || impact === 'weakens') {
        const item: EvidenceItem = {
          ...baseItem,
          strength: impact === 'rules-out' ? 'strong' : 'moderate',
          type: 'contradictory',
        };
        hyp.contradictoryEvidence.push(item);
      }
    }
  }

  return Object.values(draft);
}

function buildDeltas(
  original: DiagnosisHypothesis[],
  refined: DiagnosisHypothesis[],
): RefinementDelta[] {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  const oldByName = new Map<string, { rank: number; score: number }>();
  original.forEach((h, i) => {
    oldByName.set(normalize(h.diagnosis), {
      rank: i + 1,
      score:
        typeof h.evidenceScore === 'number' && h.evidenceScore > 0
          ? h.evidenceScore
          : h.confidenceScore,
    });
  });
  const newByName = new Map<string, { rank: number; score: number }>();
  refined.forEach((h, i) => {
    newByName.set(normalize(h.diagnosis), {
      rank: i + 1,
      score:
        typeof h.evidenceScore === 'number' && h.evidenceScore > 0
          ? h.evidenceScore
          : h.confidenceScore,
    });
  });

  const allNames = new Set<string>([...oldByName.keys(), ...newByName.keys()]);
  const deltas: RefinementDelta[] = [];
  for (const name of allNames) {
    const o = oldByName.get(name);
    const n = newByName.get(name);
    // Use refined diagnosis casing if present, otherwise original.
    const displayName =
      refined.find((h) => normalize(h.diagnosis) === name)?.diagnosis
      || original.find((h) => normalize(h.diagnosis) === name)?.diagnosis
      || name;
    deltas.push({
      diagnosisName: displayName,
      oldRank: o?.rank ?? null,
      newRank: n?.rank ?? null,
      oldScore: o?.score ?? null,
      newScore: n?.score ?? null,
    });
  }
  // Sort by new rank ascending (nulls last).
  deltas.sort((a, b) => {
    if (a.newRank == null && b.newRank == null) return 0;
    if (a.newRank == null) return 1;
    if (b.newRank == null) return -1;
    return a.newRank - b.newRank;
  });
  return deltas;
}

export async function POST(request: NextRequest) {
  const requestId = `refine_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const start = Date.now();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body', requestId }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: 'Invalid request payload',
        details: parsed.error.flatten(),
        requestId,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { originalAnalysis, answers, patientCase } = parsed.data;
  const originalHypotheses = (originalAnalysis.differentialDiagnoses || []) as DiagnosisHypothesis[];
  const questions = (originalAnalysis.clarifyingQuestions || []) as NonNullable<
    AnalysisResult['clarifyingQuestions']
  >;

  if (originalHypotheses.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Original analysis has no diagnoses to refine', requestId }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (questions.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Original analysis has no clarifying questions to apply', requestId }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const augmentedPool = applyAnswersToHypotheses(originalHypotheses, questions, answers);

    // Build the AgentInput shapes the eval + synth expect. We mock a single
    // AgentOutput carrying the augmented pool — the evaluator dedupes
    // defensively and treats it as the merged specialist pool.
    const mockSpecialistOutput: AgentOutput = {
      agentName: 'refine-pool',
      hypotheses: augmentedPool,
      reasoning: 'Augmented hypothesis pool after patient clarification answers',
      confidence: 0,
      tokensUsed: 0,
      durationMs: 0,
      model: 'n/a',
    };

    const evalInput: AgentInput = {
      patientCase: patientCase as any,
      previousStageOutput: [mockSpecialistOutput],
      candidateDiseases: [],
    };

    const evaluator = new ClaudeEvaluatorAgent();
    const evaluationResult = await evaluator.execute(evalInput);

    const synthInput: AgentInput = {
      patientCase: patientCase as any,
      previousStageOutput: {
        specialistResults: [mockSpecialistOutput],
        evaluationResult,
      } as any,
    };

    const synth = new ClaudeSynthAgent();
    const synthResult = await synth.execute(synthInput);

    const refinedHypotheses: DiagnosisHypothesis[] = synthResult.hypotheses;
    const deltas = buildDeltas(originalHypotheses, refinedHypotheses);

    // Build the refined analysis result. Preserve the parts of the original
    // that don't change (recommendedTesting, nextSteps, etc.) since those
    // are still useful — the next-steps page will re-render with refined
    // diagnoses but the patient still wants the original recommendations.
    const refinedAnalysis: Partial<AnalysisResult> = {
      ...(originalAnalysis as any),
      differentialDiagnoses: refinedHypotheses,
      overallAssessment: synthResult.reasoning || originalAnalysis.overallAssessment,
      refinement: {
        answers,
        deltas,
        refinedAt: new Date().toISOString(),
      },
    };

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        refinedAnalysis,
        deltas,
        durationMs: Date.now() - start,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error(`[${requestId}] Refine failed:`, err);
    return new Response(
      JSON.stringify({
        error: 'Refinement failed',
        detail: (err?.message || 'unknown').slice(0, 500),
        requestId,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
