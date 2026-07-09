/**
 * v17 Stage 5 — Claude evidence evaluation (thin wrapper).
 *
 * REUSE POSTURE: this file is a backend-swap wrapper around EvidenceEvaluator.
 * The system prompt (buildEvidenceEvaluatorPrompt), the user-prompt builder
 * (EvidenceEvaluator.buildPrompt), the deterministic KB classification
 * (EvidenceEvaluator.classifyHypotheses), and the per-hypothesis evaluation
 * application (EvidenceEvaluator.applyEvaluation) are all reused VERBATIM.
 *
 * The only delta vs v15 EvidenceEvaluator is the LLM backend: instead of
 * calling o3 via BaseAgent.callWithTools (OpenAI tool-call protocol), this
 * wrapper calls Claude opus-4-7 via callAnthropic and parses the response
 * with the same shape contract.
 *
 * Goal: preserve the eval prompts and logic that have been working since v5
 * while letting Claude be the analytical voice in v17's Claude-first flow.
 */
import {
  EvidenceEvaluator,
  buildEvidenceEvaluatorPrompt,
} from './evidence-evaluator';
import type { AgentInput, AgentOutput } from './types';
import type { DiagnosisHypothesis, PatientCase } from '../types';
import type { DiseaseMatch, DiseaseProfile } from '../types/knowledge-base';
import { callAnthropic } from '../anthropic';
import { setLogContext } from '../pipeline/llm-call-log';

const CLAUDE_EVALUATOR_MODEL = 'claude-opus-4-7';

/**
 * Tell Claude what JSON shape to produce. Mirrors the OpenAI tool-call schema
 * EvidenceEvaluator originally used; the wrapper parses the same field set.
 */
function buildClaudeOutputInstruction(): string {
  return `

Return your analysis as a single JSON object with this exact structure (no markdown fences):
{
  "evaluations": [
    {
      "diagnosis": "<exact diagnosis name from the hypothesis pool above>",
      "evaluationType": "criteria-grounded" | "reasoning-evaluated",
      "criteriaFulfillment": {
        "criteriaName": "<name of the criteria framework used>",
        "totalCriteria": <integer>,
        "metCriteria": <integer>,
        "criteriaDetails": [
          { "criterion": "<text>", "met": true | false, "evidence": "<text>" }
        ]
      },
      "evidenceQuality": "strong" | "moderate" | "weak" | "insufficient",
      "informationGaps": ["<gap 1>", "<gap 2>"],
      "contradictions": ["<contradiction 1>"],
      "strengthAssessment": "<narrative assessment>"
    }
  ]
}

Every hypothesis in the pool MUST receive one evaluation entry. If a subtype is a clearly better match than the parent, you may add an ADDITIONAL evaluation entry for it.`;
}

export class ClaudeEvaluatorAgent {
  public readonly name = 'claude-evaluator';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { patientCase, previousStageOutput, candidateDiseases } = input;

    // Reuse EvidenceEvaluator's instance to access the public prompt-builder,
    // classifier, applyEvaluation, and dedup methods. None of these make LLM
    // calls — they're pure preparation / post-processing.
    const helper = new EvidenceEvaluator();

    // Step 1: collect all upstream hypotheses (post-dedup, this is just the
    // merged pool — but the helper API expects specialistResults[]).
    const specialistOutputs: AgentOutput[] = previousStageOutput || [];
    const allHypotheses: DiagnosisHypothesis[] = specialistOutputs.flatMap((o) => o.hypotheses);

    // Step 2: dedup defensively. In v17 Stage 3 has already deduped, but
    // calling this again is idempotent and protects against any future caller
    // sending raw pools.
    const deduped = helper.deduplicateHypotheses(allHypotheses);

    // Step 3: deterministic KB classification (the v15 step-1 fix that prevents
    // the o3-drift evaluationType label override).
    const kbDiseases = candidateDiseases || [];
    const classified = helper.classifyHypotheses(deduped, kbDiseases);

    // Step 4: build the user prompt using the existing v5/v15 prompt builder.
    // No subtype context — that path is for the rare-disease-family expansion
    // and is best left out of the Claude eval to keep the prompt focused.
    const subtypeContext = ''; // disabled in v17 for prompt brevity
    const userPrompt = helper.buildPrompt(patientCase, classified, kbDiseases, subtypeContext)
      + buildClaudeOutputInstruction();

    // Step 5: Claude call with the existing system prompt verbatim.
    try {
      setLogContext({ agentName: this.name, stageName: 'claude-evaluation' });
    } catch { /* logger optional */ }

    const callStart = Date.now();
    const result = await callAnthropic({
      systemPrompt: buildEvidenceEvaluatorPrompt(),
      userPrompt,
      // Opus 4.8 runs more verbose evaluations than 4.7 on rich hypothesis
      // pools; 16k occasionally truncates mid-object. Opus 4.x supports 32k.
      maxTokens: 32000,
      model: CLAUDE_EVALUATOR_MODEL,
    });

    try {
      setLogContext({ agentName: undefined, stageName: undefined });
    } catch { /* logger optional */ }

    // Step 6: parse + validate shape.
    const parsed = typeof result.content === 'object' && result.content !== null
      ? (result.content as { evaluations?: any[] })
      : null;

    if (!parsed || !Array.isArray(parsed.evaluations)) {
      throw new Error(`Claude evaluator returned non-conforming output (got ${typeof result.content}); fallback should route to synthesizer-only path.`);
    }

    // Step 7: same KB-match map + apply loop the v15 evaluator runs.
    const kbMatchByDiagnosis = new Map<string, DiseaseProfile | null>();
    for (const c of classified) {
      kbMatchByDiagnosis.set(c.hypothesis.diagnosis, c.kbMatch);
    }

    const evaluatedHypotheses: DiagnosisHypothesis[] = deduped.map((h) => {
      const evaluation = parsed.evaluations!.find(
        (e: any) => typeof e?.diagnosis === 'string'
          && e.diagnosis.toLowerCase() === h.diagnosis.toLowerCase(),
      );
      if (!evaluation) return h;
      const kbMatch = kbMatchByDiagnosis.get(h.diagnosis) ?? null;
      return helper.applyEvaluation(h, evaluation, patientCase.labResults, kbMatch);
    });

    // Step 8: handle bonus subtype evaluations Claude may have added (matches
    // the v15 evaluator's behavior).
    const existingDiagNorms = new Set(
      deduped.map((h) => h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '')),
    );
    const bonusEvaluations = parsed.evaluations!.filter((e: any) => {
      if (typeof e?.diagnosis !== 'string') return false;
      const evalNorm = e.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
      return !existingDiagNorms.has(evalNorm);
    });

    for (const bonus of bonusEvaluations) {
      const skeleton: DiagnosisHypothesis = {
        diagnosis: bonus.diagnosis,
        confidenceScore: 0,
        evidenceScore: 0,
        rareDisease: true,
        supportingEvidence: [],
        contradictoryEvidence: [],
        clinicalReasoning: bonus.strengthAssessment || '',
        typicalPresentation: '',
        specialistRequired: '',
        sourceAgent: 'claude-evaluator (subtype refinement)',
        evaluationType: 'reasoning-evaluated',
        knowledgeBaseMatch: false,
        diagnosticCriteria: {
          criteriaName: 'Clinical assessment',
          totalCriteria: 0,
          metCriteria: 0,
          criteriaDetails: [],
          fulfillmentPercentage: 0,
        },
      };
      // For bonus subtypes, fall back to the LLM-chosen evaluationType label
      // (kbMatchOverride: undefined). v15 evaluator did a full KB lookup here;
      // for v17 minimal-touch we accept the LLM label to avoid duplicating
      // matchesDiseaseProfile.
      evaluatedHypotheses.push(helper.applyEvaluation(skeleton, bonus, patientCase.labResults));
    }

    return {
      agentName: this.name,
      hypotheses: evaluatedHypotheses,
      reasoning: `Claude evaluated ${deduped.length} hypotheses: ${evaluatedHypotheses.filter((h) => h.knowledgeBaseMatch).length} against KB criteria, ${evaluatedHypotheses.filter((h) => !h.knowledgeBaseMatch).length} via clinical reasoning${bonusEvaluations.length > 0 ? `. Added ${bonusEvaluations.length} subtype refinement(s).` : ''}`,
      confidence: 0,
      tokensUsed: result.tokensUsed,
      durationMs: Date.now() - callStart,
      model: result.model || CLAUDE_EVALUATOR_MODEL,
    };
  }
}
