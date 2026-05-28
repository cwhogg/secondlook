import { PatientCase, AnalysisResult, StageResult, FamilyEnrichment } from '../types';
import { TriageAgent } from '../agents/triage-agent';
import { getSpecialistAgent } from '../agents/specialist-agents';
import { rerankCandidatesForSpecialty } from '../agents/specialty-reference/kb-rerank';
import { EvidenceEvaluator } from '../agents/evidence-evaluator';
import { SynthesisAgent } from '../agents/synthesizer';
import { ReportGenerator } from '../agents/report-generator';
import { expandFamilyVariants } from './family-expansion';
import { AgentOutput } from '../agents/types';
import { BudgetTracker } from './budget';
import { getDiseaseCount, findFamilySiblings, computeDifferentiatingTests, loadDiseaseDatabase } from '../knowledge';
import { PipelineProgress, ProgressCallback } from '../types/pipeline';

export type { PipelineProgress, ProgressCallback };

export class DiagnosticPipeline {
  private budgetTracker: BudgetTracker;
  private maxBudgetCents: number;

  constructor(maxBudgetCents: number = 2500) {
    this.budgetTracker = new BudgetTracker();
    this.maxBudgetCents = maxBudgetCents;
  }

  async execute(
    patientCase: PatientCase,
    onProgress?: ProgressCallback
  ): Promise<AnalysisResult> {
    const stages: StageResult[] = [];
    const pipelineStart = Date.now();

    try {
      // ===== STAGE 1: TRIAGE =====
      const triageAgent = new TriageAgent();
      const triageResult = await triageAgent.execute({ patientCase });

      onProgress?.({
        stage: 'triage',
        stageNumber: 1,
        totalStages: 6,
        detail: 'Classifying symptoms and retrieving candidate conditions from knowledge base',
        percentage: 15,
        data: {
          bodySystems: triageResult.bodySystems,
          acuityLevel: triageResult.acuityLevel,
          specialties: triageResult.relevantSpecialties,
          candidateCount: triageResult.candidateDiseases.length,
          extractedSymptoms: patientCase.symptoms
            .map((s) => {
              const concept = s.selectedConcept || null;
              const code = concept?.snomedCode || concept?.cui || null;
              const codeSystem: 'SNOMED' | 'UMLS CUI' | null = concept?.snomedCode
                ? 'SNOMED'
                : concept?.cui
                  ? 'UMLS CUI'
                  : null;
              return {
                originalPhrase: s.originalPhrase || s.userCorrection || s.medicalTerm || '',
                medicalTerm: s.medicalTerm || s.originalPhrase || s.userCorrection || '',
                code,
                codeSystem,
              };
            })
            .filter((s) => s.medicalTerm)
            .slice(0, 12),
        },
      });

      const triageModel = 'gpt-4.1-nano'; // triage agent model
      this.budgetTracker.addUsage(triageModel, triageResult.tokensUsed);
      stages.push({
        stageName: 'triage',
        durationMs: triageResult.durationMs,
        tokensUsed: triageResult.tokensUsed,
        model: triageModel,
        agentName: 'triage-agent',
        inputSummary: `${patientCase.symptoms.length} symptoms, ${patientCase.demographics.age}yo ${patientCase.demographics.sex}`,
        outputSummary: `Systems: ${triageResult.bodySystems.join(', ')}. Specialists: ${triageResult.relevantSpecialties.join(', ')}. ${triageResult.candidateDiseases.length} candidate diseases.`,
      });

      this.checkBudget();

      // ===== STAGE 2: SPECIALIST CONSULTATION (PARALLEL) =====
      onProgress?.({
        stage: 'specialists',
        stageNumber: 2,
        totalStages: 6,
        detail: `Consulting ${triageResult.relevantSpecialties.length} specialist agents in parallel`,
        percentage: 20,
        data: { specialties: triageResult.relevantSpecialties },
      });

      const specialistPromises = triageResult.relevantSpecialties.map((specialty) => {
        const agent = getSpecialistAgent(specialty);
        // Rerank the triage candidates per specialty: existing retrieval matchScore
        // multiplied by a domain-fit weight (explicit specialistType > body-system
        // mapping > fallback). Each specialist gets the deepest, most domain-aligned
        // slice of the candidate pool, sorted by their own relevance.
        const diseases = rerankCandidatesForSpecialty(
          triageResult.candidateDiseases,
          specialty,
        );
        return agent.execute({ patientCase, candidateDiseases: diseases });
      });

      const specialistResults = await Promise.all(specialistPromises);

      for (const sr of specialistResults) {
        this.budgetTracker.addUsage(sr.model, sr.tokensUsed);
        stages.push({
          stageName: 'specialist',
          durationMs: sr.durationMs,
          tokensUsed: sr.tokensUsed,
          model: sr.model,
          agentName: sr.agentName,
          inputSummary: `Patient case + candidate diseases`,
          outputSummary: `${sr.hypotheses.length} hypotheses: ${sr.hypotheses.map((h) => h.diagnosis).join(', ')}`,
        });
      }

      this.checkBudget();

      onProgress?.({
        stage: 'specialists-complete',
        stageNumber: 2,
        totalStages: 6,
        detail: `${specialistResults.reduce((sum, sr) => sum + sr.hypotheses.length, 0)} hypotheses generated from ${specialistResults.length} specialists`,
        percentage: 50,
        data: {
          results: specialistResults.map((sr) => ({
            agentName: sr.agentName,
            specialty: sr.agentName.replace('-agent', ''),
            hypotheses: sr.hypotheses.map((h) => ({
              diagnosis: h.diagnosis,
              confidenceScore: h.confidenceScore,
            })),
          })),
        },
      });

      // ===== STAGE 3: EVIDENCE EVALUATION =====
      onProgress?.({
        stage: 'evidence',
        stageNumber: 3,
        totalStages: 6,
        detail: 'Evaluating hypotheses against diagnostic criteria from knowledge base',
        percentage: 55,
        data: {
          hypothesesCount: specialistResults.reduce((sum, sr) => sum + sr.hypotheses.length, 0),
        },
      });

      const evaluator = new EvidenceEvaluator();
      const evaluationResult = await evaluator.execute({
        patientCase,
        previousStageOutput: specialistResults,
        candidateDiseases: triageResult.candidateDiseases,
      });

      this.budgetTracker.addUsage(evaluationResult.model, evaluationResult.tokensUsed);
      stages.push({
        stageName: 'evidence-evaluation',
        durationMs: evaluationResult.durationMs,
        tokensUsed: evaluationResult.tokensUsed,
        model: evaluationResult.model,
        agentName: evaluationResult.agentName,
        inputSummary: `${evaluationResult.hypotheses.length} hypotheses to evaluate`,
        outputSummary: `Criteria review complete: ${evaluationResult.hypotheses.filter((h) => h.knowledgeBaseMatch).length} KB-matched, ${evaluationResult.hypotheses.filter((h) => !h.knowledgeBaseMatch).length} reasoning-evaluated`,
      });

      onProgress?.({
        stage: 'evidence-complete',
        stageNumber: 3,
        totalStages: 6,
        detail: `${evaluationResult.hypotheses.length} hypotheses evaluated against diagnostic criteria`,
        percentage: 65,
        data: {
          evaluatedCount: evaluationResult.hypotheses.length,
          kbMatchedCount: evaluationResult.hypotheses.filter((h) => h.knowledgeBaseMatch).length,
          reasoningEvaluatedCount: evaluationResult.hypotheses.filter((h) => !h.knowledgeBaseMatch).length,
        },
      });

      this.checkBudget();

      // ===== STAGE 4: SYNTHESIS =====
      onProgress?.({
        stage: 'synthesis',
        stageNumber: 4,
        totalStages: 6,
        detail: 'Senior diagnostician reviewing all evidence and assigning probabilities',
        percentage: 70,
        data: null,
      });

      const synthesizer = new SynthesisAgent();
      const synthesisResult = await synthesizer.execute({
        patientCase,
        previousStageOutput: { specialistResults, evaluationResult },
      });

      this.budgetTracker.addUsage(synthesisResult.model, synthesisResult.tokensUsed);
      stages.push({
        stageName: 'synthesis',
        durationMs: synthesisResult.durationMs,
        tokensUsed: synthesisResult.tokensUsed,
        model: synthesisResult.model,
        agentName: synthesisResult.agentName,
        inputSummary: `${evaluationResult.hypotheses.length} evaluated hypotheses from ${specialistResults.length} specialists`,
        outputSummary: `Top diagnosis: ${synthesisResult.hypotheses[0]?.diagnosis || 'none'} (probability: ${synthesisResult.hypotheses[0]?.confidenceScore || 0}%)`,
      });

      const synthesisData_ = (synthesisResult as any).synthesisData || {};
      onProgress?.({
        stage: 'synthesis-complete',
        stageNumber: 4,
        totalStages: 6,
        detail: `Final ranking complete — ${synthesisResult.hypotheses.length} diagnoses ranked by evidence`,
        percentage: 85,
        data: {
          topDiagnoses: synthesisResult.hypotheses.slice(0, 10).map((h) => ({
            diagnosis: h.diagnosis,
            probabilityScore: h.confidenceScore,
          })),
          consensusLevel: synthesisData_.consensusLevel || 'moderate',
        },
      });

      this.checkBudget();

      // ===== LOW-CONFIDENCE ESCALATION CHECK =====
      const topScore = synthesisResult.hypotheses[0]?.confidenceScore || 0;
      const allLow = synthesisResult.hypotheses.slice(0, 5).every(h => h.confidenceScore < 40);
      const weakConsensus = synthesisData_.consensusLevel === 'weak' || synthesisData_.consensusLevel === 'divergent';
      const lowReliability = synthesisData_.confidenceCalibration?.topDiagnosisReliability === 'low';

      if (allLow || weakConsensus || lowReliability) {
        const reasons: string[] = [];
        if (allLow) reasons.push(`all top-5 diagnoses scored below 40 (highest: ${topScore})`);
        if (weakConsensus) reasons.push(`specialist consensus is ${synthesisData_.consensusLevel}`);
        if (lowReliability) reasons.push('top diagnosis reliability rated low');

        if (!(synthesisResult as any).synthesisData) (synthesisResult as any).synthesisData = {};
        (synthesisResult as any).synthesisData.escalationContext =
          `LOW DIAGNOSTIC CERTAINTY: ${reasons.join('; ')}. ` +
          `The patient's condition may not match any of the ${getDiseaseCount()} profiled diseases in our knowledge base. ` +
          `Consider broader investigative pathways including genetic panel testing (WES/WGS), ` +
          `advanced neuroimaging, tissue biopsy, and referral to a medical geneticist or ` +
          `academic undiagnosed disease program (e.g., NIH UDP).`;
      }

      // ===== FAMILY ENRICHMENT (deterministic, zero LLM calls) =====
      const familyEnrichments: FamilyEnrichment[] = [];
      const seenFamilies = new Set<string>();
      const patientSymptomTerms = patientCase.symptoms.map(s => s.medicalTerm || s.originalPhrase || '');

      for (const hypothesis of synthesisResult.hypotheses.slice(0, 5)) {
        if (familyEnrichments.length >= 2) break;

        const familyResult = findFamilySiblings(hypothesis.diagnosis, patientSymptomTerms);
        if (!familyResult || familyResult.totalInFamily < 3) continue;
        if (seenFamilies.has(familyResult.familyName)) continue;
        seenFamilies.add(familyResult.familyName);

        // Include the hypothesis itself in the siblings list for differentiating test computation
        const db = loadDiseaseDatabase();
        const diagNorm = hypothesis.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
        const selfProfile = db.find(d => {
          const nameNorm = d.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return nameNorm === diagNorm || nameNorm.includes(diagNorm) || diagNorm.includes(nameNorm);
        });

        const profilesForTest = selfProfile
          ? [selfProfile, ...familyResult.siblings.slice(0, 9)]
          : familyResult.siblings.slice(0, 10);

        const diffTest = computeDifferentiatingTests(profilesForTest);

        familyEnrichments.push({
          familyName: familyResult.familyName,
          totalSubtypes: familyResult.totalInFamily,
          topDiagnosisInFamily: hypothesis.diagnosis,
          differentiatingTest: diffTest,
        });
      }

      // Attach enrichments to synthesis data for report generator
      if (familyEnrichments.length > 0) {
        if (!(synthesisResult as any).synthesisData) (synthesisResult as any).synthesisData = {};
        (synthesisResult as any).synthesisData.familyEnrichments = familyEnrichments;
      }

      // ===== STAGE 5: REPORT GENERATION =====
      onProgress?.({
        stage: 'report',
        stageNumber: 5,
        totalStages: 6,
        detail: 'Generating your detailed diagnostic report',
        percentage: 90,
        data: null,
      });

      const reportGenerator = new ReportGenerator();
      const reportResult = await reportGenerator.execute({
        patientCase,
        previousStageOutput: synthesisResult,
      });

      this.budgetTracker.addUsage(reportResult.model, reportResult.tokensUsed);
      stages.push({
        stageName: 'report',
        durationMs: reportResult.durationMs,
        tokensUsed: reportResult.tokensUsed,
        model: reportResult.model,
        agentName: reportResult.agentName,
        inputSummary: `Synthesis output with ${synthesisResult.hypotheses.length} ranked diagnoses`,
        outputSummary: `Report generated with recommendations`,
      });

      // ===== ASSEMBLE FINAL RESULT =====
      onProgress?.({
        stage: 'complete',
        stageNumber: 5,
        totalStages: 6,
        detail: 'Analysis complete',
        percentage: 100,
        data: null,
      });

      const reportData = (reportResult as any).reportData || {};
      const synthesisData = (synthesisResult as any).synthesisData || {};
      const budgetSummary = this.budgetTracker.getSummary();

      // Family expansion: deterministically append up to 5 KB-linked variants
      // of the top ranked diagnoses at positions 11-15. No LLM calls.
      const familyExpansions = expandFamilyVariants(reportResult.hypotheses);

      const analysisResult: AnalysisResult = {
        differentialDiagnoses: [...reportResult.hypotheses, ...familyExpansions],
        differentialClusters: synthesisData.differentialClusters || [],
        familyEnrichments: familyEnrichments.length > 0 ? familyEnrichments : undefined,
        excludedCommonDiagnoses: synthesisData.excludedCommonDiagnoses || reportData.excludedCommonDiagnoses || [],
        dataGaps: reportData.dataGaps || [],
        recommendedTesting: reportData.recommendedTesting || [],
        nextSteps: reportData.nextSteps || {
          immediateActions: [],
          specialistReferrals: [],
          followUpTiming: 'Follow up with your healthcare provider within 2-4 weeks',
          redFlags: [],
        },
        overallAssessment: reportData.overallAssessment || synthesisResult.reasoning,
        patientHypothesisAnalysis: reportData.patientHypothesisAnalysis || undefined,
        pipelineMetadata: {
          pipelineVersion: '2.1.0',
          stages,
          totalDurationMs: Date.now() - pipelineStart,
          totalTokensUsed: budgetSummary.totalTokens,
          totalCostEstimate: this.budgetTracker.estimatedCostDollars(),
          knowledgeBaseVersion: '1.0.0',
          diseasesConsidered: triageResult.candidateDiseases.length,
          retrievalScores: triageResult.candidateDiseases.slice(0, 30).map((d) => ({
            diseaseId: d.disease.id,
            diseaseName: d.disease.name,
            matchScore: d.matchScore,
            componentScores: d.componentScores ?? {
              symptom: 0,
              system: d.systemOverlap.length / Math.max(d.disease.systemsAffected.length, 1),
              demographic: d.demographicFit,
              prevalence: 0,
            },
          })),
          knowledgeBaseCoverage: {
            totalProfiledDiseases: getDiseaseCount(),
            criteriaGroundedCount: reportResult.hypotheses.filter((h) => h.knowledgeBaseMatch).length,
            reasoningEvaluatedCount: reportResult.hypotheses.filter((h) => !h.knowledgeBaseMatch).length,
            disclaimer: `This analysis was evaluated against a knowledge base of ${getDiseaseCount()} profiled rare diseases. Diagnoses marked as "reasoning-evaluated" were assessed using specialist clinical knowledge rather than structured diagnostic criteria from our database.`,
          },
        },
      };

      return analysisResult;

    } catch (error: any) {
      // If we have partial results, include them in the error
      const budgetSummary = this.budgetTracker.getSummary();
      console.error('[Pipeline] Error:', error.message);
      console.error('[Pipeline] Budget at failure:', budgetSummary);
      throw error;
    }
  }

  private checkBudget(): void {
    const currentCost = this.budgetTracker.estimatedCostCents();
    if (currentCost > this.maxBudgetCents) {
      throw new Error(
        `Analysis budget exceeded: $${(currentCost / 100).toFixed(2)} > $${(this.maxBudgetCents / 100).toFixed(2)} limit. ` +
        `Tokens used: ${this.budgetTracker.totalTokensUsed()}.`
      );
    }
  }
}
