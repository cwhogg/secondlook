import { PatientCase, AnalysisResult, StageResult, FamilyEnrichment, DiagnosisHypothesis } from '../types';
import { TriageAgent } from '../agents/triage-agent';
import { getSpecialistV17Agent, selectV17Specialists, SpecialistV17Output } from '../agents/specialist-v17';
import { rerankCandidatesForSpecialty } from '../agents/specialty-reference/kb-rerank';
import { dedupAndNormalizeHypotheses, SpecialistV17Hypothesis } from '../agents/dedup-normalizer';
import { ClaudeEvaluatorAgent } from '../agents/claude-evaluator';
import { ClaudeSynthAgent } from '../agents/claude-synthesizer';
import { O3CriticAgent } from '../agents/o3-critic';
import { ClaudeFinalizerAgent } from '../agents/claude-finalizer';
import { withLlmCallLog } from './llm-call-log';
import { ReportGenerator } from '../agents/report-generator';
import { expandFamilyVariants } from './family-expansion';
import { deriveSymptomsFromLabs } from './lab-utils';
import { AgentOutput, SpecialistType } from '../agents/types';
import { BudgetTracker } from './budget';
import { getDiseaseCount, findFamilySiblings, findDiseaseByName, computeDifferentiatingTests, loadDiseaseDatabase } from '../knowledge';
import { DiseaseProfile } from '../types/knowledge-base';
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
    // Wrap the entire pipeline in an LLM-call log context so every LLM call
    // pushed during execution is captured into a single per-case log. The
    // captured calls are appended to pipelineMetadata.llmCalls below.
    const { result, calls } = await withLlmCallLog(() =>
      this.executeInner(patientCase, onProgress),
    );
    try {
      (result as any).pipelineMetadata.llmCalls = calls;
      (result as any).pipelineMetadata.llmCallsCount = calls.length;
    } catch { /* result may not have pipelineMetadata if error path; safe to skip */ }
    return result;
  }

  private async executeInner(
    patientCase: PatientCase,
    onProgress?: ProgressCallback
  ): Promise<AnalysisResult> {
    const stages: StageResult[] = [];
    const pipelineStart = Date.now();
    const elapsed = () => `${Date.now() - pipelineStart}ms`;
    const log = (event: string, extra: Record<string, any> = {}) => {
      const fields = { event, t: elapsed(), ...extra };
      const tail = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ");
      console.log(`[orch] ${tail}`);
    };
    log("orch.start", { version: '17.0.0', age: patientCase.demographics.age, sex: patientCase.demographics.sex, symptomCount: patientCase.symptoms.length });

    try {
      // ===== STAGE 0: Lab-derived findings (unchanged) =====
      const derivedLabSymptoms = deriveSymptomsFromLabs(patientCase.labResults);
      if (derivedLabSymptoms.length > 0) {
        patientCase = {
          ...patientCase,
          symptoms: [...patientCase.symptoms, ...derivedLabSymptoms],
        };
      }

      // ===== STAGE 1: TRIAGE (v5/v15 unchanged) =====
      const triageAgent = new TriageAgent();
      const triageResult = await triageAgent.execute({ patientCase });
      log("orch.stage.triage.done", { candidates: triageResult.candidateDiseases.length });

      const triageModel = 'gpt-4.1-nano';
      this.budgetTracker.addUsage(triageModel, triageResult.tokensUsed);
      stages.push({
        stageName: 'triage',
        durationMs: triageResult.durationMs,
        tokensUsed: triageResult.tokensUsed,
        model: triageModel,
        agentName: 'triage-agent',
        inputSummary: `${patientCase.symptoms.length} symptoms, ${patientCase.demographics.age}yo ${patientCase.demographics.sex}`,
        outputSummary: `Systems: ${triageResult.bodySystems.join(', ')}. ${triageResult.candidateDiseases.length} candidate diseases.`,
      });

      onProgress?.({
        stage: 'triage',
        stageNumber: 1,
        totalStages: 7,
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
              const codeSystem: 'SNOMED' | 'UMLS CUI' | null = concept?.snomedCode ? 'SNOMED' : concept?.cui ? 'UMLS CUI' : null;
              return {
                originalPhrase: s.originalPhrase || '',
                medicalTerm: s.medicalTerm || s.originalPhrase || '',
                code,
                codeSystem,
              };
            })
            .filter((s) => s.medicalTerm)
            .slice(0, 12),
        },
      });

      this.checkBudget();

      // ===== STAGE 2: SPECIALIST CONSULTATION (v17 — 5 in parallel, v5-style) =====
      // Select 5 distinct specialists: geneticist + general-internist (anchors)
      // + top 3 from triage ranking that aren't already anchors. Each runs the
      // v5 SpecialistAgent prompt (verbatim) + v16 annotation fields. Per-
      // specialty KB candidate slice via existing rerankCandidatesForSpecialty.
      const selectedSpecialties = selectV17Specialists(triageResult.relevantSpecialties as SpecialistType[]);
      log("orch.stage.specialists.start", { count: selectedSpecialties.length, specialties: selectedSpecialties });

      // Specialist Selection — show the user WHICH specialists were chosen
      // before they start reasoning. The 5-of-11 panel selection is a real
      // pipeline step (selectV17Specialists) and the user benefits from seeing
      // it. The triage event lists the ranked-by-relevance specialties; this
      // one shows the actual subset that will run.
      const TOTAL_SPECIALIST_COUNT = 11; // see lib/agents/types — 11 specialist registry
      onProgress?.({
        stage: 'specialist-selection',
        stageNumber: 2,
        totalStages: 7,
        detail: `Selected ${selectedSpecialties.length} of ${TOTAL_SPECIALIST_COUNT} specialists for this case`,
        percentage: 18,
        data: {
          selectedSpecialties,
          triageRanked: triageResult.relevantSpecialties,
          totalSpecialistCount: TOTAL_SPECIALIST_COUNT,
        },
      });

      onProgress?.({
        stage: 'specialists',
        stageNumber: 3,
        totalStages: 7,
        detail: `Consulting ${selectedSpecialties.length} specialist agents in parallel`,
        percentage: 20,
        data: { specialties: selectedSpecialties },
      });

      const specialistStart = Date.now();
      const specialistResults: SpecialistV17Output[] = [];
      const failedSpecialists: Array<{ specialty: string; error: string }> = [];

      // Heartbeat every 10s during the o3:high parallel reasoning. Keeps the
      // SSE stream non-idle AND gives the UI a regular live update so the
      // user can see that work is in flight.
      const specHeartbeat = setInterval(() => {
        const ms = Date.now() - specialistStart;
        const remaining = selectedSpecialties.length - specialistResults.length - failedSpecialists.length;
        onProgress?.({
          stage: 'heartbeat',
          stageNumber: 3,
          totalStages: 7,
          detail: remaining > 0
            ? `${remaining} of ${selectedSpecialties.length} specialists still reasoning... ${Math.round(ms / 1000)}s`
            : `All specialists finished... ${Math.round(ms / 1000)}s`,
          percentage: 35,
          data: { stage: 'specialists', elapsedMs: ms },
        });
      }, 10_000);

      try {
        const specialistPromises = selectedSpecialties.map(async (specialty) => {
          const agentStart = Date.now();
          const agent = getSpecialistV17Agent(specialty);
          // General-internist gets NO KB candidates (counterweight, matches CLAUDE.md convention).
          const candidates = specialty === 'general-internist'
            ? []
            : rerankCandidatesForSpecialty(triageResult.candidateDiseases, specialty);
          try {
            const result = await agent.execute({ patientCase, candidateDiseases: candidates });
            onProgress?.({
              stage: 'specialist-done',
              stageNumber: 3,
              totalStages: 7,
              percentage: 35,
              detail: `${specialty} returned ${result.hypotheses.length} hypotheses (${Math.round((Date.now() - agentStart) / 1000)}s)`,
              data: {
                specialty,
                durationMs: Date.now() - agentStart,
                hypothesisCount: result.hypotheses.length,
              },
            });
            return result;
          } catch (err: any) {
            failedSpecialists.push({ specialty, error: err?.message || 'unknown' });
            log("orch.stage.specialist.fail", { specialty, msg: (err?.message || '').slice(0, 200) });
            onProgress?.({
              stage: 'specialist-failed',
              stageNumber: 3,
              totalStages: 7,
              percentage: 35,
              detail: `${specialty} failed (${Math.round((Date.now() - agentStart) / 1000)}s)`,
              data: {
                specialty,
                durationMs: Date.now() - agentStart,
                kind: 'error',
                error: (err?.message || 'unknown').slice(0, 200),
              },
            });
            return null;
          }
        });
        const results = await Promise.all(specialistPromises);
        for (const r of results) {
          if (r) specialistResults.push(r);
        }
      } finally {
        clearInterval(specHeartbeat);
      }

      log("orch.stage.specialists.done", {
        durationMs: Date.now() - specialistStart,
        succeeded: specialistResults.length,
        failed: failedSpecialists.length,
        totalHypotheses: specialistResults.reduce((sum, r) => sum + r.hypotheses.length, 0),
      });

      for (const sr of specialistResults) {
        this.budgetTracker.addUsage(sr.model, sr.tokensUsed);
        stages.push({
          stageName: 'specialist-consultation',
          durationMs: sr.durationMs,
          tokensUsed: sr.tokensUsed,
          model: sr.model,
          agentName: sr.agentName,
          inputSummary: `Patient case + reranked candidate diseases for ${sr.specialty}`,
          outputSummary: `${sr.hypotheses.length} hypotheses: ${sr.hypotheses.map((h) => h.diagnosis).slice(0, 3).join(', ')}${sr.hypotheses.length > 3 ? '...' : ''}`,
        });
      }
      for (const f of failedSpecialists) {
        stages.push({
          stageName: 'specialist-failed',
          durationMs: 0,
          tokensUsed: 0,
          model: 'n/a',
          agentName: `specialist-${f.specialty}`,
          inputSummary: '',
          outputSummary: `FAILED: ${f.error.slice(0, 200)}`,
        });
      }

      onProgress?.({
        stage: 'specialists-complete',
        stageNumber: 3,
        totalStages: 7,
        detail: `${specialistResults.length}/${selectedSpecialties.length} specialists returned (${specialistResults.reduce((sum, r) => sum + r.hypotheses.length, 0)} hypotheses)`,
        percentage: 45,
        data: {
          results: specialistResults.map((sr) => ({
            agentName: sr.agentName,
            specialty: sr.specialty,
            hypotheses: sr.hypotheses.map((h) => ({ diagnosis: h.diagnosis, confidenceScore: h.confidenceScore })),
          })),
          failedSpecialists,
        },
      });

      this.checkBudget();

      // ===== STAGE 2.5: DIAGNOSIS CANONICALIZATION (v27 — deterministic) =====
      // Rewrite specialist-emitted diagnosis names to their canonical Mondo
      // labels where the lookup is unambiguous. Catches LLM-emitted synonyms
      // (PKAN → Pantothenate Kinase-Associated Neurodegeneration, etc.) before
      // dedup so synonymous hypotheses collapse correctly. Same Mondo synonym
      // index the v4 grader uses (lib/grading/mondo-labels.json).
      const rawPoolPreCanon: SpecialistV17Hypothesis[] = specialistResults.flatMap((sr) => sr.hypotheses);
      const canonStart = Date.now();
      let rawPool: SpecialistV17Hypothesis[];
      let canonRewriteCount = 0;
      try {
        const { canonicalizeHypotheses } = await import('../agents/diagnosis-canonicalizer');
        const canonResult = canonicalizeHypotheses(rawPoolPreCanon);
        rawPool = canonResult.hypotheses as SpecialistV17Hypothesis[];
        canonRewriteCount = canonResult.rewriteCount;
        log("orch.stage.canonicalize.done", {
          durationMs: Date.now() - canonStart,
          input: rawPoolPreCanon.length,
          rewrites: canonRewriteCount,
          sampleRewrites: canonResult.rewrites.slice(0, 5).map((r) => `${r.from} → ${r.to}`),
        });
        stages.push({
          stageName: 'diagnosis-canonicalize',
          durationMs: Date.now() - canonStart,
          tokensUsed: 0,
          model: 'n/a (Mondo synonym index)',
          agentName: 'diagnosis-canonicalizer',
          inputSummary: `${rawPoolPreCanon.length} specialist hypotheses`,
          outputSummary: `${canonRewriteCount} rewritten to canonical Mondo labels`,
        });
      } catch (err: any) {
        log("orch.stage.canonicalize.fail", { msg: (err?.message || '').slice(0, 200) });
        // Non-fatal — fall back to raw pool. Canonicalization is an enhancement,
        // not a load-bearing step.
        rawPool = rawPoolPreCanon;
      }

      // ===== STAGE 3: DEDUP + NAME NORMALIZATION (deterministic) =====
      log("orch.stage.dedup.start", { input: rawPool.length });
      const dedupStart = Date.now();
      const { merged: dedupedHypotheses, stats: dedupStats } = dedupAndNormalizeHypotheses(rawPool);
      const dedupDurMs = Date.now() - dedupStart;
      log("orch.stage.dedup.done", {
        durationMs: dedupDurMs,
        inputCount: dedupStats.inputCount,
        outputCount: dedupStats.outputCount,
        evidenceIn: dedupStats.evidenceItemsInput,
        evidenceOut: dedupStats.evidenceItemsOutput,
        attributionsOut: dedupStats.attributionsOutput,
        validationPassed: dedupStats.validationPassed,
        suspiciousCount: dedupStats.suspiciousPairs.length,
      });
      if (dedupStats.suspiciousPairs.length > 0) {
        log("orch.dedup.suspicious", { pairs: dedupStats.suspiciousPairs.slice(0, 10) });
      }
      stages.push({
        stageName: 'dedup-normalize',
        durationMs: dedupDurMs,
        tokensUsed: 0,
        model: 'n/a (deterministic)',
        agentName: 'dedup-normalizer',
        inputSummary: `${dedupStats.inputCount} specialist hypotheses`,
        outputSummary: `${dedupStats.outputCount} merged (evidence ${dedupStats.evidenceItemsInput}→${dedupStats.evidenceItemsOutput}, attributions ${dedupStats.attributionsOutput}, validation ${dedupStats.validationPassed ? 'PASS' : 'FAIL'}, suspicious-pairs ${dedupStats.suspiciousPairs.length})`,
      });

      // ===== STAGE 3.5: DIFFERENTIAL BROADENER (v28 — non-KB channel) =====
      // Single Claude Sonnet 4.6 call. Generates 2-4 rare-disease candidates
      // that are NOT in the specialist pool. Output is appended to the deduped
      // list with knowledgeBaseMatch=false; the KB attach step below will
      // leave that flag alone since findDiseaseByName won't match, and the
      // evaluator will route these through its reasoning-evaluated track.
      // Fail-soft: if the call errors or returns nothing, we proceed with
      // just the specialist list (the pre-v28 behavior).
      const broadenStart = Date.now();
      try {
        const { broadenDifferential } = await import('../agents/broaden-differential');
        const broadenResult = await broadenDifferential(patientCase, dedupedHypotheses);
        if (broadenResult.hypotheses.length > 0) {
          dedupedHypotheses.push(...broadenResult.hypotheses);
        }
        this.budgetTracker.addUsage(broadenResult.model, broadenResult.tokensUsed);
        stages.push({
          stageName: 'broaden-differential',
          durationMs: broadenResult.durationMs,
          tokensUsed: broadenResult.tokensUsed,
          model: broadenResult.model,
          agentName: 'differential-broadener',
          inputSummary: `${dedupedHypotheses.length - broadenResult.hypotheses.length} deduped specialist hypotheses`,
          outputSummary: `+${broadenResult.acceptedCount} non-KB candidates (raw ${broadenResult.rawCount})`,
        });
        log('orch.stage.broaden.done', {
          durationMs: broadenResult.durationMs,
          rawCount: broadenResult.rawCount,
          acceptedCount: broadenResult.acceptedCount,
          model: broadenResult.model,
        });
      } catch (err: any) {
        log('orch.stage.broaden.fail', {
          msg: (err?.message || '').slice(0, 200),
          durationMs: Date.now() - broadenStart,
        });
        // Continue with specialist-only list — pre-v28 behavior.
      }

      // ===== STAGE 4: KB PROFILE ATTACH (deterministic) =====
      // For each merged hypothesis, look up the KB profile and attach. The
      // claude-evaluator + downstream consumers can use this directly without
      // re-resolving names.
      const kbAttachStart = Date.now();
      const kbAttachCount = { matched: 0, unmatched: 0 };
      for (const h of dedupedHypotheses) {
        const profile = findDiseaseByName(h.diagnosis);
        if (profile) {
          (h as any).kbProfile = profile;
          h.knowledgeBaseMatch = true;
          h.evaluationType = 'criteria-grounded';
          if (!h.icd10Code && profile.icd10Codes?.length) h.icd10Code = profile.icd10Codes[0];
          if (!h.orphanetId && profile.orphanetId) h.orphanetId = profile.orphanetId;
          if (!h.omimId && profile.omimId) h.omimId = profile.omimId;
          kbAttachCount.matched++;
        } else {
          kbAttachCount.unmatched++;
        }
      }
      stages.push({
        stageName: 'kb-annotation-merge',
        durationMs: Date.now() - kbAttachStart,
        tokensUsed: 0,
        model: 'n/a (deterministic)',
        agentName: 'kb-attach',
        inputSummary: `${dedupedHypotheses.length} merged hypotheses`,
        outputSummary: `${kbAttachCount.matched} KB-attached, ${kbAttachCount.unmatched} reasoning-only`,
      });

      // ===== STAGE 5: CLAUDE EVIDENCE EVALUATION =====
      log("orch.stage.evaluation.start", { hypotheses: dedupedHypotheses.length });
      onProgress?.({
        stage: 'evidence',
        stageNumber: 4,
        totalStages: 7,
        detail: 'Claude reviewing evidence against diagnostic criteria',
        percentage: 55,
        data: { hypothesesCount: dedupedHypotheses.length },
      });

      const evalStart = Date.now();
      const evalHeartbeat = setInterval(() => {
        const ms = Date.now() - evalStart;
        onProgress?.({
          stage: 'heartbeat',
          stageNumber: 4,
          totalStages: 7,
          detail: `Claude evaluator still reasoning... ${Math.round(ms / 1000)}s`,
          percentage: 60,
          data: { stage: 'evaluation', elapsedMs: ms },
        });
      }, 10_000);

      const evaluatorPool: AgentOutput = {
        agentName: 'dedup-pool',
        hypotheses: dedupedHypotheses as DiagnosisHypothesis[],
        reasoning: 'Deduped specialist pool',
        confidence: 0,
        tokensUsed: 0,
        durationMs: 0,
        model: 'n/a',
      };

      const claudeEvaluator = new ClaudeEvaluatorAgent();
      let evaluationResult: AgentOutput;
      try {
        evaluationResult = await claudeEvaluator.execute({
          patientCase,
          previousStageOutput: [evaluatorPool],
          candidateDiseases: triageResult.candidateDiseases,
        });
      } finally {
        clearInterval(evalHeartbeat);
      }
      log("orch.stage.evaluation.done", { durationMs: Date.now() - evalStart, evaluated: evaluationResult.hypotheses.length });
      this.budgetTracker.addUsage(evaluationResult.model, evaluationResult.tokensUsed);
      stages.push({
        stageName: 'claude-evaluation',
        durationMs: evaluationResult.durationMs,
        tokensUsed: evaluationResult.tokensUsed,
        model: evaluationResult.model,
        agentName: evaluationResult.agentName,
        inputSummary: `${dedupedHypotheses.length} merged hypotheses`,
        outputSummary: `Criteria review: ${evaluationResult.hypotheses.filter((h) => h.knowledgeBaseMatch).length} KB-matched, ${evaluationResult.hypotheses.filter((h) => !h.knowledgeBaseMatch).length} reasoning-evaluated`,
      });

      onProgress?.({
        stage: 'evidence-complete',
        stageNumber: 4,
        totalStages: 7,
        detail: `${evaluationResult.hypotheses.length} hypotheses evaluated`,
        percentage: 65,
        data: {
          evaluatedCount: evaluationResult.hypotheses.length,
          kbMatchedCount: evaluationResult.hypotheses.filter((h) => h.knowledgeBaseMatch).length,
          reasoningEvaluatedCount: evaluationResult.hypotheses.filter((h) => !h.knowledgeBaseMatch).length,
        },
      });

      this.checkBudget();

      // ===== STAGE 6: CLAUDE SYNTHESIS (reuse existing ClaudeSynthAgent AS-IS) =====
      log("orch.stage.synthesis.start");
      onProgress?.({
        stage: 'synthesis',
        stageNumber: 5,
        totalStages: 7,
        detail: 'Claude ranking diagnoses by overall evidence',
        percentage: 70,
        data: null,
      });

      const synthStart = Date.now();
      const synthHeartbeat = setInterval(() => {
        const ms = Date.now() - synthStart;
        onProgress?.({
          stage: 'heartbeat',
          stageNumber: 5,
          totalStages: 7,
          detail: `Claude synth still reasoning... ${Math.round(ms / 1000)}s`,
          percentage: 75,
          data: { stage: 'synthesis', elapsedMs: ms },
        });
      }, 10_000);

      // ClaudeSynthAgent expects { specialistResults, evaluationResult } shape.
      // Wrap the v17 specialistResults into the legacy AgentOutput[] shape it
      // consumes (it only reads hypotheses + agentName).
      const specialistResultsForSynth: AgentOutput[] = specialistResults.map((sr) => ({
        agentName: sr.agentName,
        hypotheses: sr.hypotheses as DiagnosisHypothesis[],
        reasoning: sr.reasoning,
        confidence: sr.confidence,
        tokensUsed: sr.tokensUsed,
        durationMs: sr.durationMs,
        model: sr.model,
      }));

      const claudeSynth = new ClaudeSynthAgent();
      let synthesisResult: AgentOutput;
      try {
        synthesisResult = await claudeSynth.execute({
          patientCase,
          previousStageOutput: { specialistResults: specialistResultsForSynth, evaluationResult },
        });
      } finally {
        clearInterval(synthHeartbeat);
      }
      log("orch.stage.synthesis.done", { durationMs: Date.now() - synthStart, top1: synthesisResult.hypotheses[0]?.diagnosis });
      this.budgetTracker.addUsage(synthesisResult.model, synthesisResult.tokensUsed);
      stages.push({
        stageName: 'claude-synthesis',
        durationMs: synthesisResult.durationMs,
        tokensUsed: synthesisResult.tokensUsed,
        model: synthesisResult.model,
        agentName: synthesisResult.agentName,
        inputSummary: `${evaluationResult.hypotheses.length} evaluated hypotheses from ${specialistResults.length} specialists`,
        outputSummary: `Top: ${synthesisResult.hypotheses[0]?.diagnosis || 'none'} (probability: ${synthesisResult.hypotheses[0]?.confidenceScore || 0}%)`,
      });

      this.checkBudget();

      // ===== STAGE 7: o3 CRITIQUE =====
      log("orch.stage.critique.start");
      onProgress?.({
        stage: 'synthesis',
        stageNumber: 5,
        totalStages: 7,
        detail: 'o3 critiquing the ranking',
        percentage: 78,
        data: null,
      });

      const synthesisData = (synthesisResult as any).synthesisData || {};
      const o3Critic = new O3CriticAgent();
      const critique = await o3Critic.execute({
        patientCase,
        claudeRanking: synthesisResult.hypotheses,
        claudeOverallAssessment: synthesisResult.reasoning,
        claudeInformationGaps: synthesisData.criticalGaps,
      }).catch((err: any) => {
        log("orch.stage.critique.fail", { msg: (err?.message || '').slice(0, 200) });
        return null;
      });

      if (critique) {
        this.budgetTracker.addUsage(critique.model, critique.tokensUsed);
        stages.push({
          stageName: 'o3-critique',
          durationMs: critique.durationMs,
          tokensUsed: critique.tokensUsed,
          model: critique.model,
          agentName: 'o3-critic',
          inputSummary: `Claude full ranking (${synthesisResult.hypotheses.length} entries) + rationales`,
          outputSummary: `${critique.suggestions.length} suggestions, confidence in Claude: ${critique.confidenceInClaudeRanking}/100`,
        });
        log("orch.stage.critique.done", { suggestions: critique.suggestions.length, confidence: critique.confidenceInClaudeRanking });
      } else {
        log("orch.stage.critique.skipped");
      }

      this.checkBudget();

      // ===== FAMILY ENRICHMENT (v25 — moved before finalize) =====
      // Compute family enrichment on the synth top-5 BEFORE the finalizer
      // runs, so the finalizer can use it to make umbrella-vs-subtype
      // decisions. Also still attached to synthesisData below so the report
      // generator picks it up unchanged (the existing "Consider including
      // the differentiating test" block in report-generator.ts).
      const familyEnrichments: FamilyEnrichment[] = [];
      const seenFamilies = new Set<string>();
      const patientSymptomTerms = patientCase.symptoms.map((s) => s.medicalTerm || s.originalPhrase || '');
      for (const hypothesis of synthesisResult.hypotheses.slice(0, 5)) {
        if (familyEnrichments.length >= 2) break;
        const familyResult = findFamilySiblings(hypothesis.diagnosis, patientSymptomTerms);
        if (!familyResult || familyResult.totalInFamily < 3) continue;
        if (seenFamilies.has(familyResult.familyName)) continue;
        seenFamilies.add(familyResult.familyName);
        const db = loadDiseaseDatabase();
        const diagNorm = hypothesis.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
        const selfProfile = db.find((d) => {
          const nameNorm = d.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return nameNorm === diagNorm || nameNorm.includes(diagNorm) || diagNorm.includes(nameNorm);
        });
        const profilesForTest: DiseaseProfile[] = selfProfile
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
      log("orch.stage.family.done", { count: familyEnrichments.length });

      // ===== STAGE 8: CLAUDE FINALIZE =====
      let finalRanking: DiagnosisHypothesis[] = synthesisResult.hypotheses;
      let finalizerStats: { criticSuggestionsAccepted: number; criticSuggestionsRejected: number; rankChangesFromFirstPass: number; removedFromTop10: string[]; addedToTop10: string[] } | null = null;

      if (critique) {
        log("orch.stage.finalize.start");
        onProgress?.({
          stage: 'synthesis',
          stageNumber: 5,
          totalStages: 7,
          detail: 'Claude finalizing the differential with critique review',
          percentage: 84,
          data: null,
        });

        const finalizer = new ClaudeFinalizerAgent();
        try {
          const finalizerResult = await finalizer.execute({
            patientCase,
            firstPassRanking: synthesisResult.hypotheses,
            firstPassAssessment: synthesisResult.reasoning,
            critique,
            fullHypothesisPool: evaluationResult.hypotheses,
            familyEnrichments,
          });
          finalRanking = finalizerResult.hypotheses;
          finalizerStats = finalizerResult.finalizerStats;
          this.budgetTracker.addUsage(finalizerResult.model, finalizerResult.tokensUsed);
          stages.push({
            stageName: 'claude-finalize',
            durationMs: finalizerResult.durationMs,
            tokensUsed: finalizerResult.tokensUsed,
            model: finalizerResult.model,
            agentName: finalizerResult.agentName,
            inputSummary: `Claude full ranking (${synthesisResult.hypotheses.length} entries) + ${critique.suggestions.length} critique suggestions`,
            outputSummary: `Final top: ${finalRanking[0]?.diagnosis} (accepted ${finalizerStats.criticSuggestionsAccepted}/${critique.suggestions.length} suggestions, ${finalizerStats.rankChangesFromFirstPass} rank changes)`,
          });
          log("orch.stage.finalize.done", { top1: finalRanking[0]?.diagnosis, accepted: finalizerStats.criticSuggestionsAccepted, rejected: finalizerStats.criticSuggestionsRejected });
        } catch (err: any) {
          log("orch.stage.finalize.fail", { msg: (err?.message || '').slice(0, 200) });
          // Degrade gracefully: keep Claude synth's ranking as final.
          finalRanking = synthesisResult.hypotheses;
        }
      } else {
        // No critique → no finalize call needed. Synth ranking is final.
        log("orch.stage.finalize.skipped");
      }

      // ===== STAGE 8.6: NARRATIVE MERGER (v28.1) =====
      // Rewrite the role-prefixed clinicalReasoning ("geneticist: ...
      // general-internist: ... [finalizer]: ...") into a single unified
      // clinical narrative per top-N hypothesis. Single Sonnet 4.6 call
      // for all top-10 in one batch. Original concatenation preserved on
      // clinicalReasoningRaw. Fail-soft.
      const mergerStart = Date.now();
      try {
        const { mergeNarratives, applyNarrativesInPlace } = await import('../agents/narrative-merger');
        const topForMerger = finalRanking.slice(0, 10);
        if (topForMerger.length > 0) {
          const mergerResult = await mergeNarratives(topForMerger);
          const applied = applyNarrativesInPlace(topForMerger, mergerResult.narratives);
          this.budgetTracker.addUsage(mergerResult.model, mergerResult.tokensUsed);
          stages.push({
            stageName: 'narrative-merge',
            durationMs: mergerResult.durationMs,
            tokensUsed: mergerResult.tokensUsed,
            model: mergerResult.model,
            agentName: 'narrative-merger',
            inputSummary: `${topForMerger.length} hypotheses with role-prefixed reasoning`,
            outputSummary: `${applied} hypothesis narratives rewritten`,
          });
          log('orch.stage.narrative-merge.done', {
            durationMs: mergerResult.durationMs,
            rewriteCount: mergerResult.rewriteCount,
            applied,
            model: mergerResult.model,
          });
        }
      } catch (err: any) {
        log('orch.stage.narrative-merge.fail', {
          msg: (err?.message || '').slice(0, 200),
          durationMs: Date.now() - mergerStart,
        });
        // Continue with role-prefixed reasoning — pre-v28.1 behavior.
      }

      // Replace synthesisResult.hypotheses with the finalized ranking so
      // downstream consumers see it.
      synthesisResult.hypotheses = finalRanking;

      // ===== LOW-CONFIDENCE WARNING FLAG =====
      // Compute a structured flag that the UI surfaces as a banner on
      // /results/analysis. The previous version injected a hardcoded
      // recommendation paragraph into the report-generator prompt, which
      // produced generic, untailored advice. The UI banner approach lets
      // the report-gen focus on tailored recommendations from the actual
      // top-10, while still being honest about confidence.
      const highestTopScore = finalRanking[0]?.confidenceScore || 0;
      const allLow = finalRanking.slice(0, 5).every((h) => h.confidenceScore < 40);
      const synthData_ = (synthesisResult as any).synthesisData || {};
      const weakConsensus = synthData_.consensusLevel === 'weak' || synthData_.consensusLevel === 'divergent';
      const lowReliability = synthData_.confidenceCalibration?.topDiagnosisReliability === 'low';
      const lowConfidenceReasons: Array<'all-top-5-below-40' | 'weak-consensus' | 'low-reliability'> = [];
      if (allLow) lowConfidenceReasons.push('all-top-5-below-40');
      if (weakConsensus) lowConfidenceReasons.push('weak-consensus');
      if (lowReliability) lowConfidenceReasons.push('low-reliability');
      const lowConfidenceWarning: AnalysisResult['lowConfidenceWarning'] =
        lowConfidenceReasons.length > 0
          ? { triggered: true, reasons: lowConfidenceReasons, highestTopScore }
          : undefined;

      onProgress?.({
        stage: 'synthesis-complete',
        stageNumber: 5,
        totalStages: 7,
        detail: `Final ranking complete — ${finalRanking.length} diagnoses ranked`,
        percentage: 88,
        data: {
          topDiagnoses: finalRanking.slice(0, 10).map((h) => ({ diagnosis: h.diagnosis, probabilityScore: h.confidenceScore })),
          consensusLevel: synthData_.consensusLevel || 'moderate',
        },
      });

      // Attach family enrichments (computed earlier, see v25 block above) to
      // synthesisData so the report generator's existing prompt block picks
      // them up unchanged.
      if (familyEnrichments.length > 0) {
        if (!(synthesisResult as any).synthesisData) (synthesisResult as any).synthesisData = {};
        (synthesisResult as any).synthesisData.familyEnrichments = familyEnrichments;
      }

      // ===== STAGE 8.5: CLARIFIER (v18) =====
      // Picks 1-5 yes/no questions from the candidate pool the specialists
      // already emitted, scoped to the top-ranked hypotheses from synth.
      // Failure is non-fatal — the pipeline produces a valid AnalysisResult
      // without clarifyingQuestions if Claude errors or no candidates exist.
      log("orch.stage.clarifier.start", { topHypotheses: finalRanking.length });
      const clarifierStart = Date.now();
      let clarifierQuestions: AnalysisResult['clarifyingQuestions'] = undefined;
      try {
        const { ClarifierAgent } = await import('../agents/clarifier');
        const clarifier = new ClarifierAgent();
        const clarifierResult = await clarifier.execute({
          rankedHypotheses: finalRanking,
        });
        if (clarifierResult.questions.length > 0) {
          clarifierQuestions = clarifierResult.questions;
        }
        this.budgetTracker.addUsage(clarifierResult.model, clarifierResult.tokensUsed);
        stages.push({
          stageName: 'clarifier',
          durationMs: clarifierResult.durationMs,
          tokensUsed: clarifierResult.tokensUsed,
          model: clarifierResult.model,
          agentName: 'clarifier',
          inputSummary: `${finalRanking.length} ranked hypotheses, candidate pool from specialists`,
          outputSummary: clarifierResult.skipped
            ? `skipped (${clarifierResult.skipped})`
            : `${clarifierResult.questions.length} questions picked`,
        });
        log("orch.stage.clarifier.done", {
          durationMs: Date.now() - clarifierStart,
          picked: clarifierResult.questions.length,
          skipped: clarifierResult.skipped,
        });
      } catch (err: any) {
        log("orch.stage.clarifier.fail", { msg: (err?.message || '').slice(0, 200) });
        // swallow — clarifier is non-fatal
      }

      // ===== STAGE 9: REPORT GENERATION (unchanged) =====
      log("orch.stage.report.start");
      onProgress?.({
        stage: 'report',
        stageNumber: 6,
        totalStages: 7,
        detail: 'Generating your detailed diagnostic report',
        percentage: 92,
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
        inputSummary: `Synthesis output with ${finalRanking.length} ranked diagnoses`,
        outputSummary: `Report generated with recommendations`,
      });

      // ===== ASSEMBLE FINAL RESULT =====
      onProgress?.({
        stage: 'complete',
        stageNumber: 6,
        totalStages: 7,
        detail: 'Analysis complete',
        percentage: 100,
        data: null,
      });

      const reportData = (reportResult as any).reportData || {};
      const synthesisDataFinal = (synthesisResult as any).synthesisData || {};
      const budgetSummary = this.budgetTracker.getSummary();
      const familyExpansions = expandFamilyVariants(reportResult.hypotheses);

      const analysisResult: AnalysisResult = {
        differentialDiagnoses: [...reportResult.hypotheses, ...familyExpansions],
        differentialClusters: synthesisDataFinal.differentialClusters || [],
        familyEnrichments: familyEnrichments.length > 0 ? familyEnrichments : undefined,
        excludedCommonDiagnoses: synthesisDataFinal.excludedCommonDiagnoses || reportData.excludedCommonDiagnoses || [],
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
        clarifyingQuestions: clarifierQuestions,
        lowConfidenceWarning,
        pipelineMetadata: {
          pipelineVersion: '28.1.0',
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
          // v17 telemetry
          specialistPool: {
            selected: selectedSpecialties,
            perSpecialistResults: [
              ...specialistResults.map((sr) => ({
                specialty: sr.specialty,
                hypothesisCount: sr.hypotheses.length,
                durationMs: sr.durationMs,
                tokensUsed: sr.tokensUsed,
                model: sr.model,
              })),
              ...failedSpecialists.map((f) => ({
                specialty: f.specialty,
                hypothesisCount: 0,
                durationMs: 0,
                tokensUsed: 0,
                model: 'n/a',
                failureReason: f.error,
              })),
            ],
          },
          dedupStats,
          critique: critique
            ? {
                confidenceInClaudeRanking: critique.confidenceInClaudeRanking,
                suggestionCount: critique.suggestions.length,
                acceptedCount: finalizerStats?.criticSuggestionsAccepted ?? 0,
                tokensUsed: critique.tokensUsed,
                durationMs: critique.durationMs,
                overallAssessment: critique.overallAssessment,
                suggestions: critique.suggestions,
              }
            : undefined,
          finalizerChanges: finalizerStats
            ? {
                rankChangesFromFirstPass: finalizerStats.rankChangesFromFirstPass,
                removedFromTop10: finalizerStats.removedFromTop10,
                addedToTop10: finalizerStats.addedToTop10,
              }
            : undefined,
        } as any,
      };

      log("orch.done", { totalDur: elapsed(), stages: stages.length, top1: finalRanking[0]?.diagnosis });
      return analysisResult;

    } catch (error: any) {
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
