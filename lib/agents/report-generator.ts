import { BaseAgent } from './base-agent';
import { AgentInput, AgentOutput } from './types';
import { DiagnosisHypothesis, DataGap, RecommendedTest, NextSteps, PatientCase } from '../types';
import { findDiseaseByName } from '../knowledge';

/**
 * For each top hypothesis, pull the KB profile's "required-for-diagnosis"
 * criteria — these are the tests/findings that formally confirm the
 * disease when present. Feeding these into the report-generator prompt
 * (a) gives the LLM explicit signal for what a "clear confirmatory test"
 * looks like per candidate, and (b) grounds the top of the recommended-
 * testing list on the same signal downstream Q2 rubric measures against.
 *
 * Returns null when no KB profile matches or the profile has no criteria
 * flagged requiredForDiagnosis — the LLM then falls back to its own
 * clinical judgment for that candidate.
 */
function collectConfirmatoryHints(
  hypotheses: DiagnosisHypothesis[],
): Array<{ diagnosis: string; requiredCriteria: string[] }> {
  const out: Array<{ diagnosis: string; requiredCriteria: string[] }> = [];
  for (const h of hypotheses.slice(0, 10)) {
    const kb = findDiseaseByName(h.diagnosis);
    if (!kb) continue;
    const req = (kb.diagnosticCriteria?.criteria || [])
      .filter((c) => c.requiredForDiagnosis)
      .map((c) => c.description)
      .filter((d) => typeof d === 'string' && d.length > 0);
    if (req.length === 0) continue;
    out.push({ diagnosis: h.diagnosis, requiredCriteria: req });
  }
  return out;
}

const REPORT_PROMPT = `You are a medical report writer specializing in creating clear, actionable diagnostic reports for patients with complex conditions. Your reports are used by patients to have informed discussions with their healthcare providers.

REPORT PRINCIPLES:
1. Clear language — medical terms should be explained in parenthetical plain language
2. Evidence-linked — every recommendation should trace back to a specific finding
3. Actionable — next steps should be concrete (specific tests, specific specialists)
4. Honest — clearly state the level of certainty and what is unknown
5. Prioritized — most important/urgent items first

For data gaps and recommended testing:
- Link each gap to specific diagnoses it would help confirm or rule out
- Prioritize tests that would narrow the differential most efficiently
- Include urgency levels (urgent, routine, when available)

For next steps:
- Immediate actions: what the patient should do NOW (especially red flags)
- Specialist referrals: specific specialist types with rationale
- Follow-up timing: when to reassess
- Red flags: symptoms that warrant immediate medical attention`;

export class ReportGenerator extends BaseAgent {
  constructor() {
    super({
      name: 'report-generator',
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      // v17: was 3000, raised to 10000 because v17 differentials have richer
      // per-hypothesis clinicalReasoning (concatenated specialist reasoning
      // from dedup) + finalizer rationale appended. Two cohort cases
      // (PMID_36917008, PMID_12920066) failed with "Unterminated string in
      // JSON at position ~12600" when the tool-call arguments were
      // truncated mid-write at 3K. 10K gives comfortable headroom; cost
      // impact is negligible on gpt-4.1-mini (~$0.005/call extra).
      maxTokens: 10000,
      systemPrompt: REPORT_PROMPT,
    });
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { patientCase, previousStageOutput } = input;
    const synthesisOutput: AgentOutput = previousStageOutput;
    const synthesisData = (synthesisOutput as any).synthesisData || {};
    const hypotheses = synthesisOutput.hypotheses;

    const userPrompt = this.buildPrompt(patientCase, hypotheses, synthesisData);

    const result = await this.callWithTools(userPrompt, [
      {
        type: 'function',
        function: {
          name: 'generate_report',
          description: 'Generate the final diagnostic report with actionable recommendations',
          parameters: {
            type: 'object',
            properties: {
              dataGaps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    gapType: {
                      type: 'string',
                      enum: ['laboratory', 'imaging', 'genetic_testing', 'specialist_evaluation', 'family_history', 'functional_assessment'],
                    },
                    description: { type: 'string' },
                    priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                    estimatedImpact: { type: 'string' },
                    wouldAffectDiagnoses: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['gapType', 'description', 'priority', 'estimatedImpact', 'wouldAffectDiagnoses'],
                },
              },
              recommendedTesting: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    testType: { type: 'string' },
                    testName: { type: 'string' },
                    rationale: { type: 'string' },
                    urgency: { type: 'string', enum: ['urgent', 'routine', 'when_available'] },
                    targetDiagnoses: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['testType', 'testName', 'rationale', 'urgency', 'targetDiagnoses'],
                },
              },
              nextSteps: {
                type: 'object',
                properties: {
                  immediateActions: { type: 'array', items: { type: 'string' } },
                  specialistReferrals: { type: 'array', items: { type: 'string' } },
                  followUpTiming: { type: 'string' },
                  redFlags: { type: 'array', items: { type: 'string' } },
                },
                required: ['immediateActions', 'specialistReferrals', 'followUpTiming', 'redFlags'],
              },
              overallAssessment: { type: 'string' },
              patientHypothesisAnalysis: {
                type: 'object',
                properties: {
                  likelihood: { type: 'number', minimum: 0, maximum: 100 },
                  reasoning: { type: 'string' },
                  alternativeExplanation: { type: 'string' },
                },
              },
            },
            required: ['dataGaps', 'recommendedTesting', 'nextSteps', 'overallAssessment'],
          },
        },
      },
    ], { type: 'function', function: { name: 'generate_report' } });

    const report = result.content;

    // Build final output — the pipeline orchestrator will merge this with hypotheses
    const output: AgentOutput = {
      agentName: this.name,
      hypotheses, // Pass through from synthesis
      reasoning: report.overallAssessment,
      confidence: hypotheses.length > 0 ? hypotheses[0].confidenceScore : 0,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      model: result.model,
    };

    // Defensive fallback: some tool-call responses have arrived with the
    // recommendedTesting key missing entirely (not empty — absent). This
    // is the source of the eval-cohort recommendedTesting leak. Coerce
    // to an always-array here so the orchestrator + downstream storage
    // never has to guess.
    const rt = Array.isArray(report.recommendedTesting)
      ? (report.recommendedTesting as RecommendedTest[])
      : [];
    if (rt.length === 0 && hypotheses.length > 0) {
      // Last-resort fallback: at least surface the top-hypothesis's KB
      // required-for-diagnosis rows as recommended tests so we never emit
      // a completely empty list.
      const hints = collectConfirmatoryHints(hypotheses.slice(0, 1));
      if (hints.length > 0) {
        for (const req of hints[0].requiredCriteria) {
          rt.push({
            testType: /genetic|variant|gene\b|molecular/i.test(req)
              ? 'genetic'
              : /biopsy|histolog/i.test(req)
                ? 'histology'
                : /imaging|MRI|CT|X-ray|ultrasound/i.test(req)
                  ? 'imaging'
                  : /enzyme|serum|plasma|assay/i.test(req)
                    ? 'biochemical'
                    : 'clinical',
            testName: req,
            rationale: `Formal required-for-diagnosis criterion for ${hints[0].diagnosis}; a positive finding would definitively confirm this leading candidate.`,
            urgency: 'routine',
            targetDiagnoses: [hints[0].diagnosis],
          });
        }
      }
    }

    (output as any).reportData = {
      dataGaps: Array.isArray(report.dataGaps) ? (report.dataGaps as DataGap[]) : [],
      recommendedTesting: rt,
      nextSteps: report.nextSteps as NextSteps,
      overallAssessment: report.overallAssessment,
      patientHypothesisAnalysis: report.patientHypothesisAnalysis || null,
      excludedCommonDiagnoses: synthesisData.excludedCommonDiagnoses || [],
    };

    return output;
  }

  private buildPrompt(
    patientCase: PatientCase,
    hypotheses: DiagnosisHypothesis[],
    synthesisData: any
  ): string {
    const confirmatoryHints = collectConfirmatoryHints(hypotheses);
    const confirmatoryBlock = formatConfirmatoryBlock(confirmatoryHints);
    const diagSummary = hypotheses
      .map((h, i) => {
        const criteriaStr = h.diagnosticCriteria.criteriaDetails
          .map((c) => `  ${c.met ? '[MET]' : '[NOT MET]'} ${c.criterion}: ${c.evidence}`)
          .join('\n');

        const evalLabel = h.knowledgeBaseMatch ? 'criteria-grounded' : 'reasoning-evaluated';
        return `${i + 1}. ${h.diagnosis} (evidence score: ${h.evidenceScore}, confidence: ${h.confidenceScore}, evaluation: ${evalLabel})
   Specialist: ${h.sourceAgent}
   Reasoning: ${h.clinicalReasoning}
   Supporting: ${h.supportingEvidence.map((e) => `${e.finding} (${e.strength})`).join('; ')}
   Contradictory: ${h.contradictoryEvidence.map((e) => `${e.finding} (${e.strength})`).join('; ') || 'none'}
   Criteria (${h.diagnosticCriteria.fulfillmentPercentage}% fulfilled):
${criteriaStr || '   (no formal criteria assessed)'}`;
      })
      .join('\n\n');

    return `PATIENT: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}
${patientCase.chiefComplaint?.description ? `Chief complaint: "${patientCase.chiefComplaint.description}"` : ''}

${patientCase.patientHypothesis ? `Patient suspects: "${patientCase.patientHypothesis}"` : ''}

===== RANKED DIFFERENTIAL DIAGNOSIS =====
Consensus: ${synthesisData.consensusLevel || 'unknown'}
Critical gaps: ${synthesisData.criticalGaps?.join('; ') || 'none identified'}

${diagSummary}

===== EXCLUDED COMMON CONDITIONS =====
${synthesisData.excludedCommonDiagnoses?.map((e: any) => `- ${e.diagnosis}: ${e.reasonExcluded}`).join('\n') || '(none)'}

${synthesisData.differentialClusters?.length > 0 ? `===== DIFFERENTIAL CLUSTERS =====
The following diagnoses from the ranked differential are phenotypic variants that cannot be reliably distinguished by symptoms alone:

${synthesisData.differentialClusters.map((c: any) => `Cluster: ${c.clusterName}
  Diagnoses: ${c.diagnoses.join(', ')}
  Combined probability: ${c.combinedProbabilityRange}
  Shared features: ${c.sharedFeatures.join('; ')}
  Distinguishing tests: ${c.distinguishingTests.join('; ')}
  Reasoning: ${c.reasoning}`).join('\n\n')}

IMPORTANT: In the overall assessment, present clustered diagnoses as a unified group rather than independent alternatives. Explain that they share the same clinical presentation and recommend the specific discriminating tests prominently. The patient should understand that the answer likely lives within this cluster.
` : ''}${ synthesisData.familyEnrichments?.length > 0 ? `===== KB-GROUNDED FAMILY ANALYSIS =====
The following top diagnoses belong to disease families with multiple subtypes
in our knowledge base. A specific test has been identified that differentiates them.

${synthesisData.familyEnrichments.map((fe: any) => {
  if (!fe.differentiatingTest) return `"${fe.topDiagnosisInFamily}" — family "${fe.familyName}" (${fe.totalSubtypes} subtypes in KB)\nNo single differentiating test identified (mixed modalities).`;
  const dt = fe.differentiatingTest;
  const subtypeLines = dt.perSubtype
    .filter((s: any) => s.uniqueFindings.length > 0)
    .slice(0, 5)
    .map((s: any) => `  - ${s.diseaseName}: ${s.uniqueFindings.slice(0, 2).join('; ')}`)
    .join('\n');
  return `"${fe.topDiagnosisInFamily}" — family "${fe.familyName}" (${fe.totalSubtypes} subtypes in KB)
Differentiating test: ${dt.modalityLabel}
${subtypeLines}
Shared across all subtypes: ${dt.sharedFindings.slice(0, 3).join('; ') || 'none identified'}`;
}).join('\n\n')}

Consider including the differentiating test in your recommendedTesting with appropriate
priority. If clinically relevant, frame it as: "To determine the exact subtype,
[test] may help differentiate between subtypes." You may incorporate this into
the overallAssessment narrative where appropriate.

` : ''}${confirmatoryBlock}===== YOUR TASK =====
Generate the final diagnostic report.
- Identify data gaps linked to specific diagnoses
- Recommend specific tests with urgency levels
- Provide concrete next steps (immediate actions, specialist referrals, red flags)
- Write an honest overall assessment
${patientCase.patientHypothesis ? '- Analyze the patient\'s hypothesis' : ''}

===== RECOMMENDED-TESTING ORDERING RULES (strict) =====
The recommendedTesting[] array is consumed downstream in order — item [0] is
treated as the first test to run, [1] second, etc. Order them so that a
positive result on the earliest tests would come closest to definitively
confirming the top-ranked diagnoses. Use this ranking:

1. FIRST: tests that would definitively confirm the #1 or #2 differential
   diagnosis if positive. A "definitive confirmation" means the finding
   satisfies a formal diagnostic criterion the disease requires (e.g., the
   pathogenic-variant row in the CONFIRMATORY-TEST HINTS block above, if
   present). Targeted single-gene sequencing beats a broad panel when the
   causative gene is known; a broad panel beats an unfocused workup when
   the family is genetically heterogeneous.
2. NEXT: tests that would differentiate the top 2-3 diagnoses from each
   other or from the cluster (the differential-cluster distinguishing
   tests above).
3. NEXT: tests that would confirm lower-ranked but urgent/red-flag
   diagnoses that must not be missed.
4. LAST: broad screening tests, follow-up imaging with lower diagnostic
   yield, tests that would only refine lower-ranked candidates.

You MUST emit at least one test in recommendedTesting. If the top
candidate is criteria-grounded and a specific confirmatory test is
implied by its formal criteria (genetic, biochemical, biopsy, imaging),
that test MUST be at position [0].`;
  }
}

/**
 * Format the KB-derived confirmatory-test hints as a block appended to
 * the report-generator prompt. Empty string when no hints — the prompt
 * still works, the ordering rules just fall back to LLM judgment.
 */
function formatConfirmatoryBlock(
  hints: Array<{ diagnosis: string; requiredCriteria: string[] }>,
): string {
  if (hints.length === 0) return '';
  const lines = hints
    .map((h) => {
      const rows = h.requiredCriteria.map((r) => `  - ${r}`).join('\n');
      return `"${h.diagnosis}":\n${rows}`;
    })
    .join('\n\n');
  return `===== CONFIRMATORY-TEST HINTS (from knowledge base) =====
The following top hypotheses have formal required-for-diagnosis criteria in
our KB. A test that establishes any of these findings would be a definitive
confirmation for that diagnosis. When ordering recommendedTesting[], prefer
tests that would establish one of these rows for the highest-ranked
candidate that has a hint below.

${lines}

`;
}
