import { PatientCase, AnalysisResult, StageResult, FamilyEnrichment } from '../types';
import { TriageAgent } from '../agents/triage-agent';
import { getSpecialistAgent } from '../agents/specialist-agents';
import { rerankCandidatesForSpecialty } from '../agents/specialty-reference/kb-rerank';
import { EvidenceEvaluator } from '../agents/evidence-evaluator';
import { SynthesisAgent } from '../agents/synthesizer';
import { ReportGenerator } from '../agents/report-generator';
import { expandFamilyVariants } from './family-expansion';
import { deriveSymptomsFromLabs } from './lab-utils';
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
    // Tagged log helper. Vercel function logs end up grep-able by event name
    // (orch.start, orch.stage.specialist.start/done/timeout, etc.) so a stuck
    // case can be diagnosed from the log stream alone.
    const elapsed = () => `${Date.now() - pipelineStart}ms`;
    const log = (event: string, extra: Record<string, any> = {}) => {
      const fields = { event, t: elapsed(), ...extra };
      const tail = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ");
      console.log(`[orch] ${tail}`);
    };
    log("orch.start", { age: patientCase.demographics.age, sex: patientCase.demographics.sex, symptomCount: patientCase.symptoms.length });

    try {
      // ===== STAGE 0: Lab-derived findings =====
      // Convert uploaded labs flagged H/L/HH/LL/CRIT into MappedSymptom-shaped
      // entries that retrieval and downstream agents see alongside the user-
      // narrated symptoms. Without this, labs are visible to specialists in
      // their prompt (Phase 1) but invisible to the symptom-overlap retrieval
      // scoring, which means we miss the rare-disease cases where the only
      // strong clue is a specific lab abnormality the patient never thought
      // to verbalize ("low ceruloplasmin" -> Wilson's).
      const derivedLabSymptoms = deriveSymptomsFromLabs(patientCase.labResults);
      if (derivedLabSymptoms.length > 0) {
        patientCase = {
          ...patientCase,
          symptoms: [...patientCase.symptoms, ...derivedLabSymptoms],
        };
      }

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
      log("orch.stage.specialists.start", { count: triageResult.relevantSpecialties.length });
      onProgress?.({
        stage: 'specialists',
        stageNumber: 2,
        totalStages: 6,
        detail: `Consulting ${triageResult.relevantSpecialties.length} specialist agents in parallel`,
        percentage: 20,
        data: { specialties: triageResult.relevantSpecialties },
      });

      // Each specialist gets its own bounded promise. 120s comfortably
      // covers the observed distribution — across 616 specialist calls
      // we've persisted, the longest was 84.7s (v7 at o3:high) and p99
      // was 81.9s. 120s = ~1.4x max-ever-observed; expected real-
      // reasoning kill rate is 0%. The threshold's job is to distinguish
      // "almost done" from "never coming back" (hung OpenAI request,
      // network drop, mid-stream 5xx), not to bound legitimate reasoning.
      // One stuck specialist never deadlocks the pipeline; below
      // recovers gracefully when 1-2 fail and remaining hypotheses still
      // feed evidence-eval and synth.
      const SPECIALIST_TIMEOUT_MS = 120_000;
      const specialistPromises = triageResult.relevantSpecialties.map(async (specialty) => {
        const specStart = Date.now();
        log("orch.specialist.start", { specialty });
        const agent = getSpecialistAgent(specialty);
        const diseases = rerankCandidatesForSpecialty(
          triageResult.candidateDiseases,
          specialty,
        );
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`specialist ${specialty} exceeded ${SPECIALIST_TIMEOUT_MS / 1000}s timeout`)),
            SPECIALIST_TIMEOUT_MS,
          );
        });
        try {
          const result = await Promise.race([
            agent.execute({ patientCase, candidateDiseases: diseases }),
            timeoutPromise,
          ]);
          const dur = Date.now() - specStart;
          log("orch.specialist.done", { specialty, dur, hyp: result.hypotheses.length, tokens: result.tokensUsed });
          onProgress?.({
            stage: 'specialist-done',
            stageNumber: 2,
            totalStages: 6,
            detail: `${specialty} completed in ${(dur / 1000).toFixed(1)}s with ${result.hypotheses.length} hypotheses`,
            percentage: 30,
            data: { specialty, durationMs: dur, hypothesisCount: result.hypotheses.length },
          });
          return { ok: true as const, specialty, result };
        } catch (err: any) {
          const dur = Date.now() - specStart;
          const isTimeout = err?.message?.includes("exceeded");
          log("orch.specialist.fail", { specialty, dur, kind: isTimeout ? "timeout" : "error", msg: (err?.message || "").substring(0, 200) });
          onProgress?.({
            stage: 'specialist-failed',
            stageNumber: 2,
            totalStages: 6,
            detail: `${specialty} ${isTimeout ? "timed out" : "errored"} after ${(dur / 1000).toFixed(1)}s`,
            percentage: 30,
            data: { specialty, durationMs: dur, kind: isTimeout ? "timeout" : "error", error: err?.message },
          });
          return { ok: false as const, specialty, error: err?.message || "unknown error" };
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
      });

      const settledResults = await Promise.all(specialistPromises);
      const specialistResults = settledResults
        .filter((r): r is Extract<typeof r, { ok: true }> => r.ok)
        .map((r) => r.result);
      const failedSpecialists = settledResults
        .filter((r): r is Extract<typeof r, { ok: false }> => !r.ok)
        .map((r) => ({ specialty: r.specialty, error: r.error }));
      log("orch.stage.specialists.done", { completed: specialistResults.length, failed: failedSpecialists.length, failedList: failedSpecialists.map((f) => f.specialty) });

      if (specialistResults.length === 0) {
        throw new Error(`All ${triageResult.relevantSpecialties.length} specialists failed; cannot proceed.`);
      }

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
      // Record any specialist failures as zero-duration stages too so the
      // pipelineMetadata trail shows them in post-mortem analysis even
      // though they did not contribute hypotheses.
      for (const f of failedSpecialists) {
        stages.push({
          stageName: 'specialist-failed',
          durationMs: 0,
          tokensUsed: 0,
          model: 'o3',
          agentName: `specialist-${f.specialty}`,
          inputSummary: `Patient case + candidate diseases`,
          outputSummary: `FAILED: ${f.error.substring(0, 200)}`,
        });
      }

      this.checkBudget();

      onProgress?.({
        stage: 'specialists-complete',
        stageNumber: 2,
        totalStages: 6,
        detail: `${specialistResults.reduce((sum, sr) => sum + sr.hypotheses.length, 0)} hypotheses generated from ${specialistResults.length} of ${triageResult.relevantSpecialties.length} specialists` + (failedSpecialists.length > 0 ? ` (${failedSpecialists.length} failed: ${failedSpecialists.map((f) => f.specialty).join(", ")})` : ""),
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
          failedSpecialists,
        },
      });

      // ===== STAGE 3: EVIDENCE EVALUATION =====
      log("orch.stage.evidence.start", { hypotheses: specialistResults.reduce((sum, sr) => sum + sr.hypotheses.length, 0) });
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

      const evidenceStart = Date.now();
      // Heartbeat keeps the SSE stream alive every 30s while the o3:high
      // evidence-evaluator is reasoning. Without this, evidence-eval emits
      // exactly one event (the start above) then goes silent for 80-100s
      // while o3 thinks, and the client's 180s idle timeout would otherwise
      // be the only thing distinguishing "long reasoning" from "dead
      // function." Heartbeat preserves the safety net for genuine hangs.
      const evidenceHeartbeat = setInterval(() => {
        const elapsedMs = Date.now() - evidenceStart;
        onProgress?.({
          stage: 'heartbeat',
          stageNumber: 3,
          totalStages: 6,
          detail: `evidence-evaluator still reasoning... ${Math.round(elapsedMs / 1000)}s`,
          percentage: 60,
          data: { stage: 'evidence', elapsedMs },
        });
      }, 30_000);
      const evaluator = new EvidenceEvaluator();
      let evaluationResult;
      try {
        evaluationResult = await evaluator.execute({
          patientCase,
          previousStageOutput: specialistResults,
          candidateDiseases: triageResult.candidateDiseases,
        });
      } finally {
        clearInterval(evidenceHeartbeat);
      }
      log("orch.stage.evidence.done", { dur: Date.now() - evidenceStart, evaluated: evaluationResult.hypotheses.length });

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
      log("orch.stage.synthesis.start");
      onProgress?.({
        stage: 'synthesis',
        stageNumber: 4,
        totalStages: 6,
        detail: 'Senior diagnostician reviewing all evidence and assigning probabilities',
        percentage: 70,
        data: null,
      });

      const synthStart = Date.now();
      // Same heartbeat protection for the o3:high synthesizer — it's the
      // second long sequential stage and produces no intermediate events.
      const synthHeartbeat = setInterval(() => {
        const elapsedMs = Date.now() - synthStart;
        onProgress?.({
          stage: 'heartbeat',
          stageNumber: 4,
          totalStages: 6,
          detail: `synthesizer still reasoning... ${Math.round(elapsedMs / 1000)}s`,
          percentage: 75,
          data: { stage: 'synthesis', elapsedMs },
        });
      }, 30_000);
      const synthesizer = new SynthesisAgent();
      let synthesisResult;
      try {
        synthesisResult = await synthesizer.execute({
          patientCase,
          previousStageOutput: { specialistResults, evaluationResult },
        });
      } finally {
        clearInterval(synthHeartbeat);
      }
      log("orch.stage.synthesis.done", { dur: Date.now() - synthStart, top: synthesisResult.hypotheses[0]?.diagnosis?.substring(0, 80) });

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
      log("orch.stage.report.start");
      onProgress?.({
        stage: 'report',
        stageNumber: 5,
        totalStages: 6,
        detail: 'Generating your detailed diagnostic report',
        percentage: 90,
        data: null,
      });

      const reportStart = Date.now();
      const reportGenerator = new ReportGenerator();
      const reportResult = await reportGenerator.execute({
        patientCase,
        previousStageOutput: synthesisResult,
      });
      log("orch.stage.report.done", { dur: Date.now() - reportStart });

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
      // v11: revert to v5 behavior — expansions keep their initial score=0
      // rather than inheriting parent*0.5. v7's applyFamilyExpansionScoring
      // is dropped to test whether the v5-vs-v9 SL regression was due to
      // post-synthesis scoring changes (in combination with the synth
      // downstream-penalty drop in synthesizer.ts).
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

      log("orch.done", { totalDur: elapsed(), stages: stages.length });
      return analysisResult;

    } catch (error: any) {
      // If we have partial results, include them in the error
      const budgetSummary = this.budgetTracker.getSummary();
      log("orch.error", { totalDur: elapsed(), msg: (error?.message || "").substring(0, 200) });
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
