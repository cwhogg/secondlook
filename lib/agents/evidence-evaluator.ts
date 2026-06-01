import { BaseAgent } from './base-agent';
import { AgentInput, AgentOutput, EvidenceEvaluation } from './types';
import { DiagnosisHypothesis, CriteriaFulfillment, PatientCase } from '../types';
import { DiseaseMatch, DiseaseProfile } from '../types/knowledge-base';
import { getDiseaseCount, loadDiseaseDatabase, findFamilySiblings } from '../knowledge';

// v17: exported so the Claude-evaluator thin wrapper can reuse the system
// prompt verbatim instead of duplicating it. Content unchanged from v15.
export function buildEvidenceEvaluatorPrompt(): string {
  return `You are a senior clinical evidence evaluator. Your role is to systematically assess each diagnostic hypothesis against available evidence and diagnostic criteria, producing a structured analysis that a senior diagnostician will use to make final probability assessments.

You are NOT the final decision-maker on probability. Your job is to produce a rigorous, structured evidence review. A senior diagnostician will review your analysis and assign final probability scores.

YOUR APPROACH FOR EACH HYPOTHESIS:

1. CRITERIA CHECK (for KB-matched hypotheses):
   - Which formal diagnostic criteria are met, not met, or cannot be assessed?
   - What percentage of criteria are fulfilled?
   - Missing information is NOT evidence for or against — mark criteria you cannot assess as "unknown"

2. CRITERIA CHECK (for non-KB hypotheses):
   - Use your own medical knowledge of the disease's diagnostic criteria or clinical features
   - List the key clinical features/criteria you are evaluating against
   - Mark each as met, not met, or unknown

3. EVIDENCE QUALITY ASSESSMENT (for all hypotheses):
   - How specific are the supporting findings? (pathognomonic vs. nonspecific)
   - How strong are the contradictions?
   - Does the demographic profile fit?
   - How coherent is the overall clinical pattern?

4. INFORMATION GAPS:
   - What tests or information would most change the assessment?
   - Which gaps are critical vs. nice-to-have?

5. CONTRADICTIONS:
   - What in the patient's presentation argues against this diagnosis?

IMPORTANT: Our knowledge base covers ${getDiseaseCount()} profiled rare diseases. The absence of a disease from our database is NOT evidence against it. Evaluate all hypotheses with equal rigor regardless of KB status.

Be RIGOROUS and HONEST. Clearly distinguish between what the evidence supports and what remains unknown.`;
}

export class EvidenceEvaluator extends BaseAgent {
  constructor() {
    super({
      name: 'evidence-evaluator',
      model: 'o3',
      temperature: 0.1, // ignored for reasoning models
      maxTokens: 40000, // needs headroom for reasoning tokens + multi-hypothesis two-track evaluation
      reasoningEffort: 'high',
      systemPrompt: buildEvidenceEvaluatorPrompt(),
    });
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { patientCase, previousStageOutput, candidateDiseases } = input;

    // Collect all hypotheses from all specialists
    const specialistOutputs: AgentOutput[] = previousStageOutput || [];
    const allHypotheses: DiagnosisHypothesis[] = specialistOutputs.flatMap((o) => o.hypotheses);

    // Deduplicate by diagnosis name (keep highest confidence version)
    const deduped = this.deduplicateHypotheses(allHypotheses);

    // Classify each hypothesis as KB-matched or non-KB
    const kbDiseases = candidateDiseases || [];
    const classified = this.classifyHypotheses(deduped, kbDiseases);

    // Subtype enrichment: find family siblings for each hypothesis
    const subtypeContext = this.buildSubtypeContext(deduped, patientCase);

    const userPrompt = this.buildPrompt(patientCase, classified, kbDiseases, subtypeContext);

    const result = await this.callWithTools(userPrompt, [
      {
        type: 'function',
        function: {
          name: 'evaluate_evidence',
          description: 'Produce structured evidence review for each diagnostic hypothesis',
          parameters: {
            type: 'object',
            properties: {
              evaluations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    diagnosis: { type: 'string' },
                    evaluationType: {
                      type: 'string',
                      enum: ['criteria-grounded', 'reasoning-evaluated'],
                      description: 'Whether evaluated against KB criteria or via clinical reasoning',
                    },
                    criteriaFulfillment: {
                      type: 'object',
                      properties: {
                        criteriaName: { type: 'string' },
                        totalCriteria: { type: 'number' },
                        metCriteria: { type: 'number' },
                        criteriaDetails: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              criterion: { type: 'string' },
                              met: { type: 'boolean' },
                              evidence: { type: 'string' },
                            },
                            required: ['criterion', 'met', 'evidence'],
                          },
                        },
                      },
                      required: ['criteriaName', 'totalCriteria', 'metCriteria', 'criteriaDetails'],
                    },
                    evidenceQuality: {
                      type: 'string',
                      enum: ['strong', 'moderate', 'weak', 'insufficient'],
                      description: 'Overall quality of supporting evidence for this hypothesis',
                    },
                    informationGaps: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Tests/info needed to further evaluate this hypothesis',
                    },
                    contradictions: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Findings that argue against this diagnosis',
                    },
                    strengthAssessment: {
                      type: 'string',
                      description: 'Narrative assessment of evidence strength, reasoning quality, and clinical fit',
                    },
                  },
                  required: ['diagnosis', 'evaluationType', 'criteriaFulfillment', 'evidenceQuality', 'informationGaps', 'contradictions', 'strengthAssessment'],
                },
              },
            },
            required: ['evaluations'],
          },
        },
      },
    ], { type: 'function', function: { name: 'evaluate_evidence' } });

    // ===== v15 step 1: deterministic isKbMatch =====
    // The evaluationType field (criteria-grounded vs reasoning-evaluated) was
    // previously taken from the LLM evaluator's chosen label. v13-era o3
    // started overriding the [KB MATCH: <name>] prompt annotation and labeling
    // KB-matched hypotheses as reasoning-evaluated, collapsing criteria-grounded
    // coverage from ~5/10 to 0/10 on the NF1 case. The matcher itself was fine;
    // the LLM was load-bearing on a question that should be deterministic.
    //
    // Fix: derive isKbMatch from classifyHypotheses() — the same deterministic
    // matcher whose result already drove the prompt's [KB MATCH: ...] annotation.
    // The LLM still produces per-criterion checklist content; the meta-label is
    // server-side enforced. See docs/v15-experiment-plan.md decision 1.
    const kbMatchByDiagnosis = new Map<string, DiseaseProfile | null>();
    for (const c of classified) {
      kbMatchByDiagnosis.set(c.hypothesis.diagnosis, c.kbMatch);
    }
    const fullKbForBonus = loadDiseaseDatabase();
    const lookupKbForBonus = (name: string): DiseaseProfile | null => {
      const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return fullKbForBonus.find((d) => this.matchesDiseaseProfile(norm, d)) || null;
    };

    // Merge criteria fulfillment and evidence metadata back into hypotheses
    // NOTE: We intentionally do NOT set evidenceScore here. The synthesizer (senior diagnostician)
    // will review all this information and assign probability scores based on clinical judgment.
    const evaluatedHypotheses: DiagnosisHypothesis[] = deduped.map((h) => {
      const evaluation = result.content.evaluations?.find(
        (e: any) => e.diagnosis.toLowerCase() === h.diagnosis.toLowerCase()
      );

      if (!evaluation) return h;

      const kbMatch = kbMatchByDiagnosis.get(h.diagnosis) ?? null;
      return this.applyEvaluation(h, evaluation, patientCase.labResults, kbMatch);
    });

    // Handle bonus subtype evaluations — evaluations the model added for subtypes
    // that weren't in the original hypotheses
    const existingDiagNorms = new Set(
      deduped.map((h) => h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
    const bonusEvaluations = (result.content.evaluations || []).filter((e: any) => {
      const evalNorm = e.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
      return !existingDiagNorms.has(evalNorm);
    });

    for (const bonus of bonusEvaluations) {
      // Same deterministic KB check for bonus subtypes — never rely on the
      // LLM-chosen evaluationType to decide whether the hypothesis is KB-matched.
      const bonusKbMatch = lookupKbForBonus(bonus.diagnosis);
      const isKbMatch = bonusKbMatch !== null;
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
        sourceAgent: 'evidence-evaluator (subtype refinement)',
        evaluationType: isKbMatch ? 'criteria-grounded' : 'reasoning-evaluated',
        knowledgeBaseMatch: isKbMatch,
        diagnosticCriteria: {
          criteriaName: 'Clinical assessment',
          totalCriteria: 0,
          metCriteria: 0,
          criteriaDetails: [],
          fulfillmentPercentage: 0,
        },
      };
      evaluatedHypotheses.push(this.applyEvaluation(skeleton, bonus, patientCase.labResults, bonusKbMatch));
    }

    const subtypeCount = bonusEvaluations.length;

    return {
      agentName: this.name,
      hypotheses: evaluatedHypotheses,
      reasoning: `Evaluated ${deduped.length} hypotheses: ${evaluatedHypotheses.filter((h) => h.knowledgeBaseMatch).length} against KB criteria, ${evaluatedHypotheses.filter((h) => !h.knowledgeBaseMatch).length} via clinical reasoning${subtypeCount > 0 ? `. Added ${subtypeCount} subtype refinement(s)` : ''}`,
      confidence: 0,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      model: result.model,
    };
  }

  /**
   * Apply an LLM evaluation result to a hypothesis, returning the enriched hypothesis.
   *
   * `kbMatchOverride` is the deterministic KB-match result for this hypothesis (from
   * classifyHypotheses for original hypotheses, or a direct full-KB lookup for bonus
   * subtype evaluations). When provided, it determines `evaluationType` and
   * `knowledgeBaseMatch` server-side — the LLM's chosen label is ignored. This is the
   * v15 step 1 fix for the v13 LLM-label-drift bug. Pass `undefined` to fall back to
   * the LLM-chosen label (the pre-v15 behavior — kept for safety on any future caller).
   */
  // v17: made public so the Claude-evaluator thin wrapper can reuse this
  // logic verbatim (preserves the deterministic kbMatchOverride flow and
  // the lab-criteria mechanical confirmation). Body unchanged from v15.
  public applyEvaluation(
    h: DiagnosisHypothesis,
    evaluation: any,
    patientLabs?: any[],
    kbMatchOverride?: DiseaseProfile | null,
  ): DiagnosisHypothesis {
    // Mechanical post-step: scan each criterion's text for recognizable lab
    // markers and confirm any criterion the patient's uploaded labs prove,
    // even if the LLM evaluator missed it. Never demotes a met criterion;
    // only promotes false -> true based on hard data. This is the main payoff
    // of letting users upload bloodwork — criteria that previously required
    // LLM inference can now be deterministically satisfied.
    const { mechanicallyCheckLabCriteria } = require('../pipeline/lab-utils');
    const initialDetails = evaluation.criteriaFulfillment?.criteriaDetails || [];
    const { updated: detailsAfterLabs, findings: labFindings } = mechanicallyCheckLabCriteria(
      initialDetails,
      patientLabs,
    );
    const evaluatorMetCount = evaluation.criteriaFulfillment?.metCriteria || 0;
    const labConfirmedMetCount = detailsAfterLabs.filter((cd: any) => cd.met).length;
    // The mechanical pass can only push the count up; respect whichever is
    // larger so we never undercount what the LLM already confirmed.
    const finalMetCount = Math.max(evaluatorMetCount, labConfirmedMetCount);

    const fulfillment: CriteriaFulfillment = {
      criteriaName: evaluation.criteriaFulfillment?.criteriaName || 'Clinical assessment',
      totalCriteria: evaluation.criteriaFulfillment?.totalCriteria || 0,
      metCriteria: finalMetCount,
      criteriaDetails: detailsAfterLabs,
      fulfillmentPercentage: evaluation.criteriaFulfillment?.totalCriteria > 0
        ? Math.round((finalMetCount / evaluation.criteriaFulfillment.totalCriteria) * 100)
        : 0,
    };

    if (labFindings.length > 0) {
      console.log(`[evidence-evaluator] mechanically confirmed ${labFindings.length} criterion(s) for "${h.diagnosis}" via patient labs`);
    }

    // v15 step 1: prefer the deterministic kbMatchOverride when provided.
    // Falls through to the LLM-chosen label only when no override is supplied
    // (kbMatchOverride === undefined, distinct from null which means "checked
    // and definitively not a KB match"). All current callers supply the
    // override; the fallback exists for backwards safety only.
    const isKbMatch =
      kbMatchOverride !== undefined
        ? kbMatchOverride !== null
        : evaluation.evaluationType === 'criteria-grounded';

    return {
      ...h,
      diagnosticCriteria: fulfillment,
      evaluationType: isKbMatch ? 'criteria-grounded' as const : 'reasoning-evaluated' as const,
      knowledgeBaseMatch: isKbMatch,
      _evidenceQuality: evaluation.evidenceQuality,
      _strengthAssessment: evaluation.strengthAssessment,
      _informationGaps: evaluation.informationGaps,
      _contradictions: evaluation.contradictions,
    } as DiagnosisHypothesis;
  }

  /**
   * Classify hypotheses as KB-matched or non-KB.
   * First checks retrieval candidates, then falls back to the full KB
   * so that diseases which exist in the KB but weren't retrieved still
   * get criteria-grounded evaluation.
   */
  // v17: made public for thin-wrapper reuse. Body unchanged from v15.
  public classifyHypotheses(
    hypotheses: DiagnosisHypothesis[],
    kbDiseases: DiseaseMatch[]
  ): Array<{ hypothesis: DiagnosisHypothesis; kbMatch: DiseaseProfile | null }> {
    // Load full KB for fallback reconciliation
    const fullKb = loadDiseaseDatabase();

    return hypotheses.map((h) => {
      const diagLower = h.diagnosis.toLowerCase();
      const diagNormalized = diagLower.replace(/[^a-z0-9]/g, '');

      // Try retrieval candidates first (already have match scores, etc.)
      const candidateMatch = kbDiseases.find((dm) =>
        this.matchesDiseaseProfile(diagNormalized, dm.disease)
      );

      if (candidateMatch) {
        return { hypothesis: h, kbMatch: candidateMatch.disease };
      }

      // Fallback: search the full KB for diseases that weren't in retrieval candidates
      const fullKbMatch = fullKb.find((d) =>
        this.matchesDiseaseProfile(diagNormalized, d)
      );

      return {
        hypothesis: h,
        kbMatch: fullKbMatch || null,
      };
    });
  }

  /**
   * Check if a normalized diagnosis name matches a DiseaseProfile
   * by name, aliases, or ID.
   */
  private matchesDiseaseProfile(diagNormalized: string, d: DiseaseProfile): boolean {
    const nameLower = d.name.toLowerCase();
    const nameNormalized = nameLower.replace(/[^a-z0-9]/g, '');

    // Direct name match
    if (diagNormalized === nameNormalized) return true;
    // Substring match
    if (diagNormalized.includes(nameNormalized) || nameNormalized.includes(diagNormalized)) return true;
    // Check aliases
    if (d.aliases.some((a) => {
      const aliasNorm = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      return aliasNorm === diagNormalized || aliasNorm.includes(diagNormalized) || diagNormalized.includes(aliasNorm);
    })) return true;
    // Check disease ID
    if (d.id.replace(/-/g, '') === diagNormalized) return true;

    return false;
  }

  /**
   * For each hypothesis, find sibling diseases from the same family in the KB.
   * Returns a formatted string to inject into the evaluation prompt, or empty
   * string if no families with multiple subtypes are found.
   */
  private buildSubtypeContext(
    hypotheses: DiagnosisHypothesis[],
    patientCase: PatientCase
  ): string {
    const patientTerms = patientCase.symptoms.map(
      (s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase
    );

    const sections: string[] = [];
    const seenFamilies = new Set<string>();

    for (const h of hypotheses) {
      const result = findFamilySiblings(h.diagnosis, patientTerms, 10);
      if (!result || result.siblings.length < 2) continue;

      // Avoid duplicate family sections
      if (seenFamilies.has(result.familyName)) continue;
      seenFamilies.add(result.familyName);

      const siblingDescriptions = result.siblings.slice(0, 10).map((d) => {
        const pathognomonicSymptoms = d.symptoms.pathognomonic
          .map((s) => s.symptomName)
          .slice(0, 5);
        const commonSymptoms = d.symptoms.common
          .map((s) => s.symptomName)
          .slice(0, 5);
        const geneticFindings = d.keyFindings.genetic.slice(0, 3);

        const parts = [`  - ${d.name}`];
        if (pathognomonicSymptoms.length > 0) {
          parts.push(`    Pathognomonic: ${pathognomonicSymptoms.join('; ')}`);
        }
        if (commonSymptoms.length > 0) {
          parts.push(`    Common: ${commonSymptoms.join('; ')}`);
        }
        if (geneticFindings.length > 0) {
          parts.push(`    Genetic: ${geneticFindings.join('; ')}`);
        }
        return parts.join('\n');
      });

      sections.push(
        `"${h.diagnosis}" — family "${result.familyName}" has ${result.totalInFamily} subtypes in KB.\n` +
          `Most relevant subtypes:\n${siblingDescriptions.join('\n')}`
      );
    }

    if (sections.length === 0) return '';

    return (
      `\n===== SUBTYPE CONTEXT =====\n` +
      `Some hypotheses below belong to disease families with multiple subtypes in our knowledge base.\n` +
      `For these, evaluate whether a more specific subtype better matches the patient's presentation.\n` +
      `If a subtype is a clearly better match, add an evaluation for it as an ADDITIONAL entry in your output.\n\n` +
      sections.join('\n\n')
    );
  }

  // v17: made public so the dedup-normalizer pre-stage can leverage the same
  // pattern. Body unchanged from v15.
  public deduplicateHypotheses(hypotheses: DiagnosisHypothesis[]): DiagnosisHypothesis[] {
    const seen = new Map<string, DiagnosisHypothesis>();

    for (const h of hypotheses) {
      const key = h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
      const existing = seen.get(key);

      if (!existing || h.confidenceScore > existing.confidenceScore) {
        // Merge evidence from both if duplicate
        if (existing) {
          h.supportingEvidence = [
            ...h.supportingEvidence,
            ...existing.supportingEvidence.filter(
              (e) => !h.supportingEvidence.some((he) => he.finding === e.finding)
            ),
          ];
          h.contradictoryEvidence = [
            ...h.contradictoryEvidence,
            ...existing.contradictoryEvidence.filter(
              (e) => !h.contradictoryEvidence.some((he) => he.finding === e.finding)
            ),
          ];
          // Note both source agents
          h.sourceAgent = `${h.sourceAgent}, ${existing.sourceAgent}`;
        }
        seen.set(key, h);
      }
    }

    return Array.from(seen.values());
  }

  // v17: made public for thin-wrapper reuse. Prompt content unchanged from v15.
  public buildPrompt(
    patientCase: PatientCase,
    classified: Array<{ hypothesis: DiagnosisHypothesis; kbMatch: DiseaseProfile | null }>,
    candidateDiseases: DiseaseMatch[],
    subtypeContext: string = ''
  ): string {
    const symptomSummary = patientCase.symptoms
      .map((s) => `- "${s.originalPhrase}" → ${s.selectedConcept?.name || s.medicalTerm || s.originalPhrase}`)
      .join('\n');

    // Separate KB-matched and non-KB hypotheses in the prompt
    const kbHypotheses = classified.filter((c) => c.kbMatch !== null);
    const nonKbHypotheses = classified.filter((c) => c.kbMatch === null);

    let hypothesesStr = '';

    if (kbHypotheses.length > 0) {
      hypothesesStr += '\n--- KB-MATCHED HYPOTHESES (evaluate against structured criteria) ---\n';
      hypothesesStr += kbHypotheses.map((c, i) => {
        const h = c.hypothesis;
        const supporting = h.supportingEvidence
          .map((e) => `    + [${e.strength}] ${e.finding} ← patient: "${e.patientSymptom}"`)
          .join('\n');
        const contradictory = h.contradictoryEvidence
          .map((e) => `    - [${e.strength}] ${e.finding} ← patient: "${e.patientSymptom}"`)
          .join('\n');
        return `
${i + 1}. ${h.diagnosis} [KB MATCH: ${c.kbMatch!.name}] (proposed by: ${h.sourceAgent}, confidence: ${h.confidenceScore})
   Reasoning: ${h.clinicalReasoning}
   Supporting evidence:
${supporting || '    (none provided)'}
   Contradictory evidence:
${contradictory || '    (none identified)'}`;
      }).join('\n');
    }

    if (nonKbHypotheses.length > 0) {
      hypothesesStr += '\n\n--- NON-KB HYPOTHESES (evaluate based on clinical reasoning quality) ---\n';
      hypothesesStr += `These diseases are NOT in our knowledge base. Evaluate them fairly based on the specialist's clinical reasoning and your own medical knowledge. Do NOT penalize them for lacking structured KB criteria.\n`;
      hypothesesStr += nonKbHypotheses.map((c, i) => {
        const h = c.hypothesis;
        const supporting = h.supportingEvidence
          .map((e) => `    + [${e.strength}] ${e.finding} ← patient: "${e.patientSymptom}"`)
          .join('\n');
        const contradictory = h.contradictoryEvidence
          .map((e) => `    - [${e.strength}] ${e.finding} ← patient: "${e.patientSymptom}"`)
          .join('\n');
        return `
${i + 1}. ${h.diagnosis} [NOT IN KB] (proposed by: ${h.sourceAgent}, confidence: ${h.confidenceScore})
   Reasoning: ${h.clinicalReasoning}
   Supporting evidence:
${supporting || '    (none provided)'}
   Contradictory evidence:
${contradictory || '    (none identified)'}`;
      }).join('\n');
    }

    // Include disease profiles for KB-matched hypotheses only
    const relevantKbDiseases = kbHypotheses
      .map((c) => c.kbMatch!)
      .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i); // deduplicate

    let diseaseRefStr = '';
    if (relevantKbDiseases.length > 0) {
      diseaseRefStr = relevantKbDiseases.map((d) => {
        const criteria = d.diagnosticCriteria.criteria
          .map((c) => `  [${c.category}] ${c.description}`)
          .join('\n');
        return `
${d.name} (${d.id}):
Criteria${d.diagnosticCriteria.formalCriteriaName ? ` — ${d.diagnosticCriteria.formalCriteriaName}` : ''}:
${criteria}
${d.diagnosticCriteria.minimumForDiagnosis ? `Minimum: ${d.diagnosticCriteria.minimumForDiagnosis}` : ''}`;
      }).join('\n---');
    }

    const excludedSection = patientCase.excludedFindings && patientCase.excludedFindings.length > 0
      ? `

EXPLICITLY EXCLUDED FINDINGS (absent / denied / ruled out):
${patientCase.excludedFindings.map((f) => `- ${f}`).join('\n')}

These are negative evidence with diagnostic weight, not missing data. When evaluating each hypothesis, check whether any of the disease's pathognomonic or common features appears in this excluded list — if so, that is a strong contradiction. Reflect it in the contradictions array AND lower the criteriaFulfillment if a required/major criterion is on the excluded list.`
      : '';

    const labsBlock = (() => {
      const { formatLabsForPrompt } = require('../pipeline/lab-utils');
      return formatLabsForPrompt(patientCase.labResults);
    })();

    return `PATIENT SYMPTOMS:
${symptomSummary}${excludedSection}

Demographics: Age ${patientCase.demographics.age}, ${patientCase.demographics.sex}
${labsBlock ? '\n' + labsBlock + '\n' : ''}
===== HYPOTHESES TO EVALUATE =====
${hypothesesStr}
${diseaseRefStr ? `
===== REFERENCE: KB DISEASE DIAGNOSTIC CRITERIA =====
(Only for KB-matched hypotheses above)
${diseaseRefStr}` : ''}

${subtypeContext ? `${subtypeContext}\n` : ''}===== YOUR TASK =====
Produce a structured evidence review for ALL hypotheses above — both KB-matched and non-KB.

For KB-matched hypotheses: check each diagnostic criterion against the patient's presentation.
For non-KB hypotheses: use your own medical knowledge to identify the relevant diagnostic criteria/clinical features and check those.

For each hypothesis:
1. Fill in criteriaFulfillment with specific criteria and whether each is met
2. Assess overall evidenceQuality (strong/moderate/weak/insufficient)
3. List specific information gaps
4. List specific contradictions
5. Write a strengthAssessment narrative summarizing the evidence picture

You are NOT assigning probability scores — a senior diagnostician will do that based on your review.
Set evaluationType to "criteria-grounded" for KB-matched and "reasoning-evaluated" for non-KB.`;
  }
}
