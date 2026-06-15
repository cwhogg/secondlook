import { BaseAgent } from './base-agent';
import { AgentInput, AgentOutput } from './types';
import { DiagnosisHypothesis, DataGap, RecommendedTest, NextSteps, PatientCase } from '../types';

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

    // Attach report data for the orchestrator to assemble
    (output as any).reportData = {
      dataGaps: report.dataGaps as DataGap[],
      recommendedTesting: report.recommendedTesting as RecommendedTest[],
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

` : ''}===== YOUR TASK =====
Generate the final diagnostic report.
- Identify data gaps linked to specific diagnoses
- Recommend specific tests with urgency levels
- Provide concrete next steps (immediate actions, specialist referrals, red flags)
- Write an honest overall assessment
${patientCase.patientHypothesis ? '- Analyze the patient\'s hypothesis' : ''}`;
  }
}
