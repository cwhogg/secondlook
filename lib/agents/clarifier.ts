/**
 * v18 Stage 6.5 — Clarifying Question Picker.
 *
 * Runs AFTER Claude synth (so we know which hypotheses are top-ranked) and
 * BEFORE the report generator. Pulls candidate questions emitted by the
 * specialists (per-hypothesis), then picks 1-5 final patient-answerable
 * yes/no questions that best discriminate between the top hypotheses.
 *
 * The picked questions land on AnalysisResult.clarifyingQuestions and are
 * what /results/refine presents to the user. Answers flow back to
 * /api/refine-diagnosis which re-runs eval + synth.
 *
 * Provider: Claude (sonnet-4-6 by default). Skipping the Clarifier (e.g.
 * if no candidates exist or the call fails) is non-fatal — the rest of the
 * pipeline produces a valid AnalysisResult without clarifyingQuestions.
 */
import { callAnthropic } from '../anthropic';
import { setLogContext } from '../pipeline/llm-call-log';
import type { ClarifyingQuestion, DiagnosisHypothesis } from '../types';

export interface ClarifierInput {
  // Top hypotheses from synth, in ranked order. The clarifier considers
  // them as the universe to discriminate between.
  rankedHypotheses: DiagnosisHypothesis[];
}

export interface ClarifierOutput {
  questions: ClarifyingQuestion[];
  tokensUsed: number;
  durationMs: number;
  model: string;
  skipped?: 'no-candidates' | 'llm-error';
}

const SYSTEM_PROMPT = `You are a senior diagnostician triaging which 1-5 follow-up questions to ask a patient AFTER an initial differential diagnosis has been delivered.

Your goal: pick questions whose answers will most efficiently shift the probability mass of the differential — either by ruling in / ruling out a specific hypothesis, or by discriminating between the top contenders.

Selection rules (apply ALL):
1. PATIENT-ANSWERABLE. The patient is not a clinician. Acceptable formats:
   - "Has a doctor ever told you you have [specific named diagnosis]?"
   - "Do you experience [specific patient-recognizable symptom]?"
   - "Has anyone in your immediate family been diagnosed with [condition]?"
   - Critical lab values ONLY when the patient is likely to know them (e.g. iron deficiency, hypoglycemia diagnosis).
2. HIGH DISCRIMINATING POWER. Each question must meaningfully shift the ranking. Don't ask questions whose answer would leave the top-3 unchanged.
3. NON-REDUNDANT. Don't ask two questions that test the same underlying feature.
4. UNAMBIGUOUS YES/NO. The question must have a clean yes / no / "don't know" answer. No multi-part questions.
5. SPREAD ACROSS TOP HYPOTHESES. Aim to cover the top 3-5 ranked diagnoses, not pile multiple questions onto the #1 alone — unless the #1 is so dominant that pinning it down is the priority.

For each picked question, populate an \`affectsDiagnoses\` array listing every top-ranked hypothesis the question's answer would influence, and the impact of YES vs NO answers on that hypothesis. Use 'neutral' if the answer wouldn't meaningfully change the hypothesis's standing.

Output format (return ONE JSON object, no markdown fence):
{
  "questions": [
    {
      "id": "q-1",
      "question": "Has a doctor ever told you you have a connective tissue disorder?",
      "questionType": "prior_dx",
      "rationale": "One-sentence clinician-facing reason this question is high-value.",
      "affectsDiagnoses": [
        { "diagnosisName": "Marfan syndrome", "ifYes": "rules-in", "ifNo": "weakens" },
        { "diagnosisName": "Loeys-Dietz syndrome", "ifYes": "supports", "ifNo": "weakens" }
      ]
    }
  ]
}

Constraints:
- 1 to 5 questions total.
- \`diagnosisName\` MUST match EXACTLY one of the hypothesis names in the input pool — copy verbatim.
- \`questionType\` is one of: "symptom" | "prior_dx" | "family_history" | "lab_result".
- \`ifYes\` and \`ifNo\` are each one of: "rules-in" | "supports" | "weakens" | "rules-out" | "neutral".
- Do NOT propose questions that aren't in the candidate pool unless you are very confident a missing question is high-value. Prefer candidates.`;

function buildUserPrompt(input: ClarifierInput): string {
  const tops = input.rankedHypotheses.slice(0, 10);

  // Build a compact representation of each hypothesis with its candidate
  // questions. Without candidates, the LLM can still pick from scratch.
  const hypothesesBlock = tops
    .map((h, i) => {
      const candidates = (h.clarifyingQuestionCandidates || [])
        .map(
          (q, j) =>
            `    candidate-${j + 1}: "${q.question}" [${q.questionType}; ifYes=${q.ifYesImpact}] — ${q.rationale || ''}`,
        )
        .join('\n');
      const score = typeof h.evidenceScore === 'number' && h.evidenceScore > 0
        ? h.evidenceScore
        : h.confidenceScore;
      return `#${i + 1} (${score}%) ${h.diagnosis}
  Clinical reasoning (truncated): ${(h.clinicalReasoning || '').slice(0, 240)}
  Candidate clarifying questions (from specialists):
${candidates || '    (none provided)'}`;
    })
    .join('\n\n');

  return `Top-ranked differential diagnoses with specialist-emitted candidate questions:

${hypothesesBlock}

Pick 1-5 final questions to ask the patient. Follow the rules in the system prompt and use the candidates above as your primary source. Return the JSON object now.`;
}

function isValidImpact(v: any): v is 'rules-in' | 'supports' | 'weakens' | 'rules-out' | 'neutral' {
  return v === 'rules-in' || v === 'supports' || v === 'weakens' || v === 'rules-out' || v === 'neutral';
}

function isValidQuestionType(v: any): v is ClarifyingQuestion['questionType'] {
  return v === 'symptom' || v === 'prior_dx' || v === 'family_history' || v === 'lab_result';
}

export class ClarifierAgent {
  public readonly name = 'clarifier';
  private readonly model: string;

  constructor(model: string = 'claude-sonnet-4-6') {
    this.model = model;
  }

  async execute(input: ClarifierInput): Promise<ClarifierOutput> {
    const tops = input.rankedHypotheses.slice(0, 10);
    const haveCandidates = tops.some((h) => (h.clarifyingQuestionCandidates || []).length > 0);

    // Short-circuit when nothing is in the candidate pool. We still allow
    // the path through the LLM IF the user wants from-scratch questions,
    // but for v1 we skip and let downstream code render no questions.
    if (!haveCandidates) {
      return {
        questions: [],
        tokensUsed: 0,
        durationMs: 0,
        model: this.model,
        skipped: 'no-candidates',
      };
    }

    try {
      setLogContext({ agentName: this.name, stageName: 'clarifier' });
    } catch { /* logger optional */ }

    const start = Date.now();
    let result;
    try {
      result = await callAnthropic({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(input),
        maxTokens: 4000,
        temperature: 0.2,
        model: this.model,
      });
    } catch (err) {
      return {
        questions: [],
        tokensUsed: 0,
        durationMs: Date.now() - start,
        model: this.model,
        skipped: 'llm-error',
      };
    }

    const validHypothesisNames = new Set(tops.map((h) => h.diagnosis.toLowerCase()));
    const raw = result.content?.questions;
    const questions: ClarifyingQuestion[] = [];

    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length && questions.length < 5; i++) {
        const q = raw[i];
        if (!q || typeof q.question !== 'string' || !q.question.trim()) continue;
        if (!isValidQuestionType(q.questionType)) continue;
        const affects = Array.isArray(q.affectsDiagnoses)
          ? q.affectsDiagnoses
              .filter(
                (a: any) =>
                  a
                  && typeof a.diagnosisName === 'string'
                  && validHypothesisNames.has(a.diagnosisName.toLowerCase())
                  && isValidImpact(a.ifYes)
                  && isValidImpact(a.ifNo),
              )
              .map((a: any) => ({
                diagnosisName: a.diagnosisName,
                ifYes: a.ifYes,
                ifNo: a.ifNo,
              }))
          : [];
        if (affects.length === 0) continue; // unmoored question — skip
        questions.push({
          id: typeof q.id === 'string' && q.id.trim() ? q.id : `q-${questions.length + 1}`,
          question: q.question.trim(),
          questionType: q.questionType,
          rationale: typeof q.rationale === 'string' ? q.rationale : '',
          affectsDiagnoses: affects,
        });
      }
    }

    return {
      questions,
      tokensUsed: result.tokensUsed,
      durationMs: Date.now() - start,
      model: result.model,
    };
  }
}
