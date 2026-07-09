/**
 * Integrative-panel synthesizer.
 *
 * Takes the 5 specialist outputs and produces:
 *   1. A single consensus root-cause hypothesis that names patterns the panel
 *      collectively converged on (not an average — an interpretive synthesis).
 *   2. A de-duped, prioritized list of tests (specialists overlap heavily on
 *      functional labs; we surface each distinct test once with the
 *      strongest rationale).
 *   3. A de-duped, prioritized list of interventions.
 *
 * Uses Claude Opus 4.7 for reasoning quality on the interpretation.
 */
import type { PatientCase } from '../types';
import type {
  IntegrativeSpecialistOutput,
  TestRecommendation,
  Intervention,
} from '../types/integrative';
import { callAnthropic } from '../anthropic';

const MODEL = 'claude-opus-4-7';

interface IntegrativeSynthResult {
  consensusRootCause: string;
  overallReasoning: string;
  mergedTests: TestRecommendation[];
  mergedInterventions: Intervention[];
  tokensUsed: number;
  durationMs: number;
  model: string;
}

function buildSystemPrompt(): string {
  return `You are the senior integrative-medicine consultant reviewing input from five practitioners in different traditions: a functional medicine physician, a naturopathic doctor, a licensed acupuncturist (TCM), an Ayurvedic practitioner, and a mind-body/somatic practitioner.

Your job is to produce a single unified integrative perspective for the patient. This is NOT a differential diagnosis. It is a complementary view of the case designed to sit alongside — never replace — the patient's clinical workup.

Your synthesis has three parts:

1. CONSENSUS ROOT CAUSE — one 2-4 sentence paragraph identifying the common thread across the five specialists' root-cause hypotheses. Where they converge (e.g., all five point to nervous-system dysregulation and post-viral immune shift), name that pattern in accessible language. Where they diverge, note the divergence briefly rather than papering over it. The patient will read this.

2. OVERALL REASONING — one 3-5 sentence paragraph explaining WHY this integrative panel converged this way given the presentation. Cite specific findings from the case.

3. MERGED TESTS + INTERVENTIONS — deduplicate across specialists. Two specialists recommending an organic-acids panel counts as one entry. Preserve the strongest rationale. Rank by (a) breadth of practitioner agreement, then (b) potential clinical value. Cap tests at 8, interventions at 12.

CRITICAL RULES:
- Never claim any intervention cures a disease.
- Never advise the patient to delay, avoid, or stop conventional medical care.
- If specialists gave prescription-interaction warnings, preserve them.

Return a single JSON object, no markdown fences, no prose before or after:

{
  "consensusRootCause": "...",
  "overallReasoning": "...",
  "mergedTests": [
    { "name": "...", "rationale": "...", "practitionerType": "..." }
  ],
  "mergedInterventions": [
    { "category": "supplement" | "lifestyle" | "therapy" | "diet" | "movement" | "mindset" | "other", "name": "...", "rationale": "...", "toDiscussWith": "..." }
  ]
}`;
}

function buildUserPrompt(patientCase: PatientCase, specialists: IntegrativeSpecialistOutput[]): string {
  const demo = patientCase.demographics;
  const chief = patientCase.chiefComplaint?.description?.trim() || '';
  const symptoms = patientCase.symptoms
    .slice(0, 20)
    .map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase)
    .filter(Boolean)
    .join(', ');

  const panelBlock = specialists.map((s) => {
    const tests = s.recommendedTests.map((t) => `      - ${t.name}: ${t.rationale}`).join('\n');
    const interventions = s.interventions.map((i) => `      - [${i.category}] ${i.name}: ${i.rationale}`).join('\n');
    return `[${s.displayName}]
  Root-cause hypothesis: ${s.rootCauseHypothesis}
  Reasoning: ${s.reasoning}
  Recommended tests:
${tests || '      (none)'}
  Interventions:
${interventions || '      (none)'}`;
  }).join('\n\n');

  return `PATIENT CASE
  ${demo.age}yo ${demo.sex}. ${chief}
  Symptoms: ${symptoms}

PANEL INPUT (five specialists reviewed the same case independently):

${panelBlock}

Now produce your synthesis.`;
}

export async function runIntegrativeSynth(
  patientCase: PatientCase,
  specialists: IntegrativeSpecialistOutput[],
): Promise<IntegrativeSynthResult> {
  const t0 = Date.now();
  const result = await callAnthropic({
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(patientCase, specialists),
    maxTokens: 16000,
    model: MODEL,
  });

  let parsed: any = typeof result.content === 'object' && result.content !== null ? result.content : null;
  if (!parsed && typeof result.content === 'string') {
    const objMatch = result.content.match(/\{[\s\S]*\}/);
    if (objMatch) { try { parsed = JSON.parse(objMatch[0]); } catch { /* fall through */ } }
  }
  if (!parsed) {
    throw new Error(`Integrative synth: non-conforming output (type=${typeof result.content})`);
  }

  return {
    consensusRootCause: String(parsed.consensusRootCause || '').trim(),
    overallReasoning: String(parsed.overallReasoning || '').trim(),
    mergedTests: Array.isArray(parsed.mergedTests)
      ? parsed.mergedTests
          .filter((t: any) => t && typeof t.name === 'string')
          .map((t: any) => ({
            name: String(t.name).trim(),
            rationale: String(t.rationale || '').trim(),
            practitionerType: String(t.practitionerType || '').trim(),
          }))
      : [],
    mergedInterventions: Array.isArray(parsed.mergedInterventions)
      ? parsed.mergedInterventions
          .filter((i: any) => i && typeof i.name === 'string')
          .map((i: any) => ({
            category: normalizeCategory(i.category),
            name: String(i.name).trim(),
            rationale: String(i.rationale || '').trim(),
            toDiscussWith: String(i.toDiscussWith || '').trim(),
          }))
      : [],
    tokensUsed: result.tokensUsed,
    durationMs: Date.now() - t0,
    model: result.model || MODEL,
  };
}

function normalizeCategory(value: any): Intervention['category'] {
  const allowed: Intervention['category'][] = ['supplement', 'lifestyle', 'therapy', 'diet', 'movement', 'mindset', 'other'];
  return allowed.includes(value) ? value : 'other';
}
