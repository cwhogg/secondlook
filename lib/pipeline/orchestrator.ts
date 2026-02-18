import { PatientCase, AnalysisResult, StageResult } from '../types';
import { TriageAgent } from '../agents/triage-agent';
import { getSpecialistAgent } from '../agents/specialist-agents';
import { EvidenceEvaluator } from '../agents/evidence-evaluator';
import { SynthesisAgent } from '../agents/synthesizer';
import { ReportGenerator } from '../agents/report-generator';
import { AgentOutput } from '../agents/types';
import { BudgetTracker } from './budget';

export interface PipelineProgress {
  stage: string;
  stageNumber: number;
  totalStages: number;
  detail: string;
  percentage: number;
}

export type ProgressCallback = (progress: PipelineProgress) => void;

export class DiagnosticPipeline {
  private budgetTracker: BudgetTracker;
  private maxBudgetCents: number;

  constructor(maxBudgetCents: number = 100) {
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
      onProgress?.({
        stage: 'triage',
        stageNumber: 1,
        totalStages: 5,
        detail: 'Classifying symptoms and retrieving candidate conditions from knowledge base',
        percentage: 5,
      });

      const triageAgent = new TriageAgent();
      const triageResult = await triageAgent.execute({ patientCase });

      this.budgetTracker.addUsage('gpt-4o-mini', triageResult.tokensUsed);
      stages.push({
        stageName: 'triage',
        durationMs: triageResult.durationMs,
        tokensUsed: triageResult.tokensUsed,
        model: 'gpt-4o-mini',
        agentName: 'triage-agent',
        inputSummary: `${patientCase.symptoms.length} symptoms, ${patientCase.demographics.age}yo ${patientCase.demographics.sex}`,
        outputSummary: `Systems: ${triageResult.bodySystems.join(', ')}. Specialists: ${triageResult.relevantSpecialties.join(', ')}. ${triageResult.candidateDiseases.length} candidate diseases.`,
      });

      this.checkBudget();

      // ===== STAGE 2: SPECIALIST CONSULTATION (PARALLEL) =====
      onProgress?.({
        stage: 'specialists',
        stageNumber: 2,
        totalStages: 5,
        detail: `Consulting ${triageResult.relevantSpecialties.length} specialist agents in parallel`,
        percentage: 20,
      });

      const specialistPromises = triageResult.relevantSpecialties.map((specialty) => {
        const agent = getSpecialistAgent(specialty);
        const domainDiseases = triageResult.candidateDiseases.filter((d) =>
          d.disease.specialistType.some((s) => s.toLowerCase().includes(specialty.toLowerCase()))
        );
        // If no domain-specific diseases, give them all candidates
        const diseases = domainDiseases.length > 0 ? domainDiseases : triageResult.candidateDiseases.slice(0, 10);
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
        totalStages: 5,
        detail: `${specialistResults.reduce((sum, sr) => sum + sr.hypotheses.length, 0)} hypotheses generated from ${specialistResults.length} specialists`,
        percentage: 50,
      });

      // ===== STAGE 3: EVIDENCE EVALUATION =====
      onProgress?.({
        stage: 'evidence',
        stageNumber: 3,
        totalStages: 5,
        detail: 'Evaluating hypotheses against diagnostic criteria from knowledge base',
        percentage: 55,
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
        outputSummary: `Evidence scores: ${evaluationResult.hypotheses.map((h) => `${h.diagnosis}: ${h.evidenceScore}`).join(', ')}`,
      });

      this.checkBudget();

      // ===== STAGE 4: SYNTHESIS =====
      onProgress?.({
        stage: 'synthesis',
        stageNumber: 4,
        totalStages: 5,
        detail: 'Reconciling specialist opinions and ranking by evidence strength',
        percentage: 75,
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
        outputSummary: `Top diagnosis: ${synthesisResult.hypotheses[0]?.diagnosis || 'none'} (score: ${synthesisResult.hypotheses[0]?.evidenceScore || 0})`,
      });

      this.checkBudget();

      // ===== STAGE 5: REPORT GENERATION =====
      onProgress?.({
        stage: 'report',
        stageNumber: 5,
        totalStages: 5,
        detail: 'Generating your detailed diagnostic report',
        percentage: 90,
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
        totalStages: 5,
        detail: 'Analysis complete',
        percentage: 100,
      });

      const reportData = (reportResult as any).reportData || {};
      const synthesisData = (synthesisResult as any).synthesisData || {};
      const budgetSummary = this.budgetTracker.getSummary();

      const analysisResult: AnalysisResult = {
        differentialDiagnoses: reportResult.hypotheses,
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
          pipelineVersion: '2.0.0',
          stages,
          totalDurationMs: Date.now() - pipelineStart,
          totalTokensUsed: budgetSummary.totalTokens,
          totalCostEstimate: this.budgetTracker.estimatedCostDollars(),
          knowledgeBaseVersion: '1.0.0',
          diseasesConsidered: triageResult.candidateDiseases.length,
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
