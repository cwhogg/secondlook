import { PatientCase, AnalysisResult, StageResult, FamilyEnrichment } from '../types';
import { TriageAgent } from '../agents/triage-agent';
import { CandidateGeneratorAgent } from '../agents/candidate-generator';
import { getSpecialistAgent } from '../agents/specialist-agents';
import { type AnnotationCandidate } from '../agents/specialist-annotator';
import { rerankCandidatesForSpecialty } from '../agents/specialty-reference/kb-rerank';
import { EvidenceEvaluator } from '../agents/evidence-evaluator';
import { SynthesisAgent } from '../agents/synthesizer';
import { ClaudeSynthAgent } from '../agents/claude-synthesizer';
import { reconcileRankings, type ReconciliationResult } from './reconciliation';
import { withLlmCallLog } from './llm-call-log';
import { ReportGenerator } from '../agents/report-generator';
import { expandFamilyVariants } from './family-expansion';
import { deriveSymptomsFromLabs } from './lab-utils';
import { AgentOutput } from '../agents/types';
import { BudgetTracker } from './budget';
import { getDiseaseCount, findFamilySiblings, findDiseaseByName, computeDifferentiatingTests, loadDiseaseDatabase } from '../knowledge';
import { DiseaseMatch } from '../types/knowledge-base';
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

      // ===== STAGES 1 + 1b (parallel) =====
      // Stage 1 (triage) and Stage 1b (LLM-generated wide differential)
      // run in parallel because neither depends on the other. Stage 1b is the
      // v15 union candidate pool addition: an o3:high call producing 30-50
      // candidate diagnoses from the patient case directly. Names that match
      // KB profiles are unioned with triage's KB-retrieved candidates so the
      // specialists see a wider, more inclusive pool. Names WITHOUT a KB match
      // are also carried through — as reasoning-evaluated seed hypotheses
      // (no structured criteria, but with the o3 rationale as initial
      // clinicalReasoning) so the evidence evaluator and synth still see
      // them. Avoids silently dropping the long-tail rare diseases not yet
      // in our KB. See docs/v15-experiment-plan.md decision 1.
      log("orch.stage.triage_and_candidates.start");
      const triageAgent = new TriageAgent();
      const candidateGenAgent = new CandidateGeneratorAgent();
      const triagePromise = triageAgent.execute({ patientCase });
      const candidateGenPromise = candidateGenAgent
        .generate(patientCase)
        .catch((err: any) => {
          // If candidate generation fails, fall back to triage-only — better
          // to lose the union breadth than to fail the whole analysis.
          log("orch.stage.candidates.fail", { msg: (err?.message || "").substring(0, 200) });
          return null;
        });
      const [triageResult, candidateGenResult] = await Promise.all([triagePromise, candidateGenPromise]);
      log("orch.stage.triage.done", { candidates: triageResult.candidateDiseases.length });

      // Union: look up each LLM-generated candidate name in the KB; append
      // any KB matches not already present in the triage pool. Names that
      // don't match a KB profile are collected separately so they can be
      // carried through as reasoning-evaluated seed hypotheses downstream.
      // Track stats for measurement.
      const rationalesMap: Map<string, string> | undefined =
        (candidateGenResult as any)?.rationales ?? (candidateGenResult as any)?.candidateRationales;
      const lookupRationale = (name: string): string => {
        if (rationalesMap && typeof rationalesMap.get === 'function') {
          return rationalesMap.get(name) || '';
        }
        return '';
      };
      const triageCandidateIds = new Set(triageResult.candidateDiseases.map((m) => m.disease.id));
      const addedFromLLM: DiseaseMatch[] = [];
      const rationalesByDiseaseId = new Map<string, string>();
      const nonKbSeedCandidates: Array<{ name: string; rationale: string }> = [];
      let llmCandidateNames: string[] = [];
      if (candidateGenResult && candidateGenResult.diagnosisNames) {
        llmCandidateNames = candidateGenResult.diagnosisNames;
        for (const name of llmCandidateNames) {
          const profile = findDiseaseByName(name);
          if (!profile) {
            // No KB profile — carry through as a reasoning-evaluated seed
            // hypothesis. The evidence evaluator will score it via clinical
            // reasoning rather than structured criteria.
            nonKbSeedCandidates.push({ name, rationale: lookupRationale(name) });
            continue;
          }
          if (triageCandidateIds.has(profile.id)) {
            // Already in triage's pool — no need to add a duplicate, but
            // capture the rationale so the KB-matched seed can use it as
            // initial clinicalReasoning downstream.
            const existing = rationalesByDiseaseId.get(profile.id);
            if (!existing) rationalesByDiseaseId.set(profile.id, lookupRationale(name));
            continue;
          }
          // Synthetic DiseaseMatch for the LLM-surfaced candidate. matchScore
          // 0.4 places it below typical strong KB-retrieval hits (which range
          // 0.5-1.0) but high enough that per-specialty reranking still
          // considers it. systemOverlap pulled from the disease's own
          // declared systems; demographicFit neutral.
          addedFromLLM.push({
            disease: profile,
            matchScore: 0.4,
            matchedSymptoms: [],
            systemOverlap: profile.systemsAffected,
            demographicFit: 0.5,
          });
          triageCandidateIds.add(profile.id);
          rationalesByDiseaseId.set(profile.id, lookupRationale(name));
        }
      }
      const unionCandidates = [...triageResult.candidateDiseases, ...addedFromLLM];
      log("orch.stage.candidates.union", {
        triage: triageResult.candidateDiseases.length,
        llmGenerated: llmCandidateNames.length,
        llmAddedToPool: addedFromLLM.length,
        llmNonKbCarried: nonKbSeedCandidates.length,
        union: unionCandidates.length,
      });

      // Replace triageResult.candidateDiseases with the union for downstream
      // consumers. The triage object itself is otherwise unchanged.
      triageResult.candidateDiseases = unionCandidates;

      // Record Stage 1b as a separate stage for accounting / metadata.
      // Persist the full list of LLM candidate names, their rationales, and
      // the per-candidate disposition (added to pool / duplicate of triage /
      // non-KB carried as reasoning-evaluated) into a top-level
      // pipelineMetadata.candidateGeneration field below. The stages-array
      // summary is the short version for the existing UI; the detailed
      // breakdown is the source of truth.
      const addedDiseaseIds = new Set(addedFromLLM.map((m) => m.disease.id));
      const llmCandidateDetail = llmCandidateNames.map((name) => {
        let disposition: 'added-to-pool' | 'duplicate-of-triage' | 'non-kb-carried' = 'added-to-pool';
        const profile = findDiseaseByName(name);
        if (!profile) disposition = 'non-kb-carried';
        else if (!addedDiseaseIds.has(profile.id)) disposition = 'duplicate-of-triage';
        return {
          name,
          rationale: lookupRationale(name),
          resolvedKbProfile: profile?.id || null,
          resolvedKbName: profile?.name || null,
          disposition,
        };
      });

      if (candidateGenResult) {
        this.budgetTracker.addUsage(candidateGenResult.model || 'o3', candidateGenResult.tokensUsed || 0);
        stages.push({
          stageName: 'candidate-generation',
          durationMs: candidateGenResult.durationMs || 0,
          tokensUsed: candidateGenResult.tokensUsed || 0,
          model: candidateGenResult.model || 'o3',
          agentName: 'candidate-generator',
          inputSummary: `${patientCase.symptoms.length} symptoms, ${patientCase.demographics.age}yo ${patientCase.demographics.sex}`,
          outputSummary: `${llmCandidateNames.length} LLM candidates → ${addedFromLLM.length} KB-matched added + ${llmCandidateNames.length - addedFromLLM.length - nonKbSeedCandidates.length} KB-duplicate + ${nonKbSeedCandidates.length} non-KB carried (reasoning-evaluated)`,
        });
      }

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

      // ===== STAGE 2 (v16 — specialists disabled, candidates pass through) =====
      // The full specialist-annotation flow is commented out below. Decision:
      // each annotator was making one o3:high call with ALL union candidates as
      // structured input, producing 5-7 LLM calls per case at ~$0.50 each and
      // hitting timeout edge cases (PMID_39753114 burned all 6 annotators at
      // 102s simultaneously). The cost/complexity isn't justifying its share of
      // the answer signal — needs rethinking after the rest of the pipeline is
      // stable. Likely future direction: route only the top 3-5 most relevant
      // candidates to 1-2 specialists each (per-disease routing), not all
      // candidates to all specialists.
      //
      // Current path: build seed hypotheses directly from union candidates with
      // their KB profile data attached. No specialist enrichment. Evidence
      // evaluator (Stage 3) still runs criteria checks; synth still ranks.
      log("orch.stage.specialists.start", { count: 0, mode: 'passthrough' });
      onProgress?.({
        stage: 'specialists',
        stageNumber: 2,
        totalStages: 6,
        detail: `Passthrough mode: ${triageResult.candidateDiseases.length} candidates → seed hypotheses (specialist annotation temporarily disabled)`,
        percentage: 20,
        data: { specialties: [] },
      });

      // /* ============ COMMENTED OUT: specialist annotation flow ============
      const topSpecialists_DISABLED = (() => {
        const ranked = [...triageResult.relevantSpecialties];
        const top = ranked.slice(0, 5);
        if (!top.includes('geneticist' as any)) top.push('geneticist' as any);
        if (!top.includes('general-internist' as any)) top.push('general-internist' as any);
        return top;
      })();
      void topSpecialists_DISABLED;

      // Cap the KB-matched candidate pool before building seed hypotheses.
      //
      // Previously the cap was a single top-N-by-matchScore slice, which
      // silently dropped o3-generated KB-matched candidates whenever triage's
      // symptom-overlap retrieval produced enough hits scoring above their
      // hardcoded matchScore (0.4). On the Netherton case this lost the only
      // correct candidate (orchestrator.ts root-cause analysis 2026-06-01).
      //
      // New scheme partitions the union pool by source:
      //   • LLM-added KB-matched candidates: guaranteed seats up to LLM_KB_CAP
      //   • Triage retrieval candidates: fill remaining seats up to a total
      //     ceiling of TOTAL_KB_CAP, sorted by triage matchScore desc.
      //
      // This guarantees o3's clinical-reasoning catches always reach the
      // evidence evaluator even when triage retrieval is noisy.
      const TOTAL_KB_CAP = 35;
      const LLM_KB_CAP = 25;
      const llmAddedIds = new Set(addedFromLLM.map((m) => m.disease.id));
      const triageOnly = triageResult.candidateDiseases.filter((c) => !llmAddedIds.has(c.disease.id));
      const llmOnly = triageResult.candidateDiseases.filter((c) => llmAddedIds.has(c.disease.id));
      const cappedLlm = llmOnly.slice(0, LLM_KB_CAP);
      const triageSlots = Math.max(0, TOTAL_KB_CAP - cappedLlm.length);
      const cappedTriage = [...triageOnly]
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
        .slice(0, triageSlots);
      const cappedCandidates = [...cappedTriage, ...cappedLlm];
      log('orch.stage.kb_cap', {
        triageIn: triageOnly.length,
        llmIn: llmOnly.length,
        triageKept: cappedTriage.length,
        llmKept: cappedLlm.length,
        total: cappedCandidates.length,
      });

      const annotationCandidates: AnnotationCandidate[] = cappedCandidates.map((dm) => ({
        diagnosis: dm.disease.name,
        kbProfile: dm.disease,
        rationale: rationalesByDiseaseId.get(dm.disease.id) || '',
      }));

      /* ============ ANNOTATION FLOW COMMENTED OUT — needs rethinking ============
       *
       * This block fanned out 5-7 o3:high calls per case, each annotating up to 25
       * candidates with structured per-candidate output. Two issues:
       *   1. Cost was ~$0.50 per call × 5-7 = $3-4 per case just for annotation,
       *      on top of synth/eval/recon.
       *   2. Output size + reasoning tokens kept hitting OpenAI request timeouts
       *      at ~100s. PMID_39753114 burned all 6 annotators simultaneously.
       *
       * The annotation idea (specialists adding testing/cardinal/rule-out data
       * per candidate) is still valuable, but needs a cheaper / more targeted
       * design. Likely next iteration: only the top 3-5 ranked candidates get
       * annotated, by 1-2 specialists each (per-candidate routing rather than
       * per-specialist fan-out). Save until the rest of the pipeline is stable.
       *
       * Old code preserved in git history (commit fb1ba77). Specialist annotator
       * agent at lib/agents/specialist-annotator.ts remains in the codebase
       * (unimported by the orchestrator) for the future rethink.
       */

      // ===== STAGE 2 PASSTHROUGH: union candidates → seed hypotheses =====
      // No specialist calls. Each KB-matched union candidate becomes a
      // hypothesis with its KB profile data attached (criteria, symptom tiers,
      // etc). Each non-KB candidate (o3-surfaced names with no matching KB
      // profile) becomes a hypothesis with no KB attachment, marked as
      // reasoning-evaluated so the evidence evaluator (Stage 3) scores it via
      // clinical reasoning rather than structured criteria.
      const kbSeedHypotheses = annotationCandidates.map((c) => {
        const kb = c.kbProfile;
        return {
          diagnosis: c.diagnosis,
          icd10Code: kb?.icd10Codes?.[0],
          confidenceScore: 0,
          evidenceScore: 0,
          rareDisease: kb?.prevalence?.classification !== 'common',
          prevalence: kb?.prevalence?.estimate,
          supportingEvidence: [],
          contradictoryEvidence: [],
          clinicalReasoning: c.rationale || '',
          typicalPresentation: kb?.symptoms?.pathognomonic?.slice(0, 5).map((s: any) => s.symptomName).join('; ') || '',
          specialistRequired: kb?.specialistType?.[0] || '',
          diagnosticCriteria: {
            criteriaName: kb?.diagnosticCriteria?.formalCriteriaName || 'Clinical assessment',
            totalCriteria: 0,
            metCriteria: 0,
            criteriaDetails: [],
            fulfillmentPercentage: 0,
          },
          sourceAgent: 'union-pool-passthrough',
          evaluationType: 'reasoning-evaluated' as const,
          knowledgeBaseMatch: !!kb,
        } as any;
      });

      // Cap the non-KB seed hypotheses separately. Each adds ~1-2K tokens to
      // the evidence evaluator input; capping at 15 keeps the evaluator under
      // the OpenAI request timeout window while still surfacing the long-tail
      // candidates triage's symptom-overlap retrieval missed.
      const MAX_NON_KB_CANDIDATES = 15;
      const nonKbSeedHypotheses = nonKbSeedCandidates.slice(0, MAX_NON_KB_CANDIDATES).map((c) => ({
        diagnosis: c.name,
        icd10Code: undefined,
        confidenceScore: 0,
        evidenceScore: 0,
        rareDisease: true,
        supportingEvidence: [],
        contradictoryEvidence: [],
        clinicalReasoning: c.rationale,
        typicalPresentation: '',
        specialistRequired: '',
        diagnosticCriteria: {
          criteriaName: 'Clinical assessment',
          totalCriteria: 0,
          metCriteria: 0,
          criteriaDetails: [],
          fulfillmentPercentage: 0,
        },
        sourceAgent: 'llm-non-kb-candidate',
        evaluationType: 'reasoning-evaluated' as const,
        knowledgeBaseMatch: false,
      } as any));

      // KB-matched first so dedup tie-breaks inside the evidence evaluator
      // favor the KB-attached entry on any name collision.
      const allSeedHypotheses = [...kbSeedHypotheses, ...nonKbSeedHypotheses];

      const specialistResults = [
        {
          agentName: 'v16-passthrough',
          hypotheses: allSeedHypotheses,
          reasoning: `${allSeedHypotheses.length} candidates passed through from union pool (${kbSeedHypotheses.length} KB-matched, ${nonKbSeedHypotheses.length} non-KB; specialist annotation disabled)`,
          confidence: 0,
          tokensUsed: 0,
          durationMs: 0,
          model: 'n/a (passthrough)',
        },
      ];

      const failedSpecialists: Array<{ specialty: string; error: string }> = [];

      stages.push({
        stageName: 'specialist-passthrough',
        durationMs: 0,
        tokensUsed: 0,
        model: 'n/a',
        agentName: 'union-passthrough',
        inputSummary: `${annotationCandidates.length} KB candidates + ${nonKbSeedHypotheses.length} non-KB candidates from union pool`,
        outputSummary: `${allSeedHypotheses.length} seed hypotheses (${kbSeedHypotheses.length} KB-matched, ${nonKbSeedHypotheses.length} non-KB; no LLM annotation)`,
      } as any);

      this.checkBudget();

      onProgress?.({
        stage: 'specialists-complete',
        stageNumber: 2,
        totalStages: 6,
        detail: `${allSeedHypotheses.length} seed hypotheses (${kbSeedHypotheses.length} KB, ${nonKbSeedHypotheses.length} non-KB; passthrough)`,
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
      // v15 step 5: parallel cross-provider synthesis.
      // Both synthesizers run on identical input (same evaluatedHypotheses,
      // same prompt via SynthesisAgent.buildPrompt). The two model families
      // bring independent training distributions; their independent rankings
      // are the raw material for the reconciliation stage (v15 step 6).
      //
      // For step 5 alone, we run both but use the o3 ranking as primary
      // downstream — exactly equivalent to current behavior until step 6
      // wires the reconciliation in. The Claude ranking is preserved in
      // claudeSynthResult so step 6 can consume it.
      const synthHeartbeat = setInterval(() => {
        const elapsedMs = Date.now() - synthStart;
        onProgress?.({
          stage: 'heartbeat',
          stageNumber: 4,
          totalStages: 6,
          detail: `synthesizers (o3 + Claude opus-4-7) still reasoning... ${Math.round(elapsedMs / 1000)}s`,
          percentage: 75,
          data: { stage: 'synthesis', elapsedMs },
        });
      }, 30_000);
      const synthesizer = new SynthesisAgent();
      const claudeSynth = new ClaudeSynthAgent();
      let synthesisResult: AgentOutput;
      let claudeSynthResult: AgentOutput | null = null;
      try {
        const synthInput = { patientCase, previousStageOutput: { specialistResults, evaluationResult } };
        // Claude side runs in parallel but failures don't fail the whole
        // analysis — we degrade to o3-only ranking when Claude errors.
        const [o3Result, claudeResultSettled] = await Promise.all([
          synthesizer.execute(synthInput),
          claudeSynth.execute(synthInput).catch((err: any) => {
            log("orch.stage.synthesis.claude.fail", { msg: (err?.message || "").substring(0, 200) });
            return null;
          }),
        ]);
        synthesisResult = o3Result;
        claudeSynthResult = claudeResultSettled;
      } finally {
        clearInterval(synthHeartbeat);
      }
      log("orch.stage.synthesis.done", {
        dur: Date.now() - synthStart,
        topO3: synthesisResult.hypotheses[0]?.diagnosis?.substring(0, 80),
        topClaude: claudeSynthResult?.hypotheses[0]?.diagnosis?.substring(0, 80) || '(not available)',
        topOneAgrees: claudeSynthResult
          ? synthesisResult.hypotheses[0]?.diagnosis === claudeSynthResult.hypotheses[0]?.diagnosis
          : null,
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

      // v15 step 5: record Claude synth as its own stage for budget/metadata.
      if (claudeSynthResult) {
        this.budgetTracker.addUsage(claudeSynthResult.model, claudeSynthResult.tokensUsed);
        stages.push({
          stageName: 'synthesis-claude',
          durationMs: claudeSynthResult.durationMs,
          tokensUsed: claudeSynthResult.tokensUsed,
          model: claudeSynthResult.model,
          agentName: claudeSynthResult.agentName,
          inputSummary: `${evaluationResult.hypotheses.length} evaluated hypotheses (same as o3 synth)`,
          outputSummary: `Top: ${claudeSynthResult.hypotheses[0]?.diagnosis || 'none'} (probability: ${claudeSynthResult.hypotheses[0]?.confidenceScore || 0}%)`,
        });
      }

      // ===== v15 step 6: structured iterative reconciliation =====
      // If o3 and Claude agree on top-1 at Round 1: trivial — use o3's
      // ranking with high confidence. If they disagree: run up to 2 more
      // rounds of structured information exchange where each model is
      // asked to genuinely reconsider given the other's reasoning. If
      // unresolved after Round 3: criteria-fulfillment ratio tiebreak with
      // low confidence flag. See lib/pipeline/reconciliation.ts and
      // docs/v15-experiment-plan.md decision 4.
      log("orch.stage.reconciliation.start");
      const reconcileStart = Date.now();
      let reconciliation: ReconciliationResult;
      try {
        reconciliation = await reconcileRankings(
          synthesisResult,
          claudeSynthResult,
          patientCase,
          evaluationResult.hypotheses,
          (event, extra) => log(event, extra || {}),
        );
      } catch (err: any) {
        log("orch.stage.reconciliation.fail", { msg: (err?.message || "").substring(0, 200) });
        // Degrade gracefully: if reconciliation throws (network, JSON
        // parse, etc.), use o3's ranking as the final answer with a
        // descriptive confidence flag.
        reconciliation = {
          hypotheses: synthesisResult.hypotheses,
          confidence: 'o3-only-claude-unavailable',
          reconciliationData: {
            initialAgreement: false,
            finalAgreement: false,
            roundsRun: 1,
            o3InitialTop1: synthesisResult.hypotheses[0]?.diagnosis || '',
            claudeInitialTop1: claudeSynthResult?.hypotheses[0]?.diagnosis || null,
            finalTop1: synthesisResult.hypotheses[0]?.diagnosis || '',
            finalTop1Source: 'o3-after-reconsideration',
            o3RoundHistory: [],
            claudeRoundHistory: [],
            tokensUsed: 0,
            durationMs: Date.now() - reconcileStart,
          },
        };
      }
      log("orch.stage.reconciliation.done", {
        dur: Date.now() - reconcileStart,
        rounds: reconciliation.reconciliationData.roundsRun,
        confidence: reconciliation.confidence,
        finalTop1: reconciliation.reconciliationData.finalTop1,
      });

      // Replace synthesisResult.hypotheses with the reconciled top-10 so
      // every downstream consumer (report generator, family expansion,
      // final result) sees the reconciled ranking. Budget tracking and
      // model attribution remain the o3 synth's — the reconciliation
      // rounds are tracked separately below.
      synthesisResult.hypotheses = reconciliation.hypotheses;

      // Track reconciliation token usage as its own stage. The model
      // attribution is "mixed" since both o3 and Claude were called in
      // each round.
      if (reconciliation.reconciliationData.tokensUsed > 0) {
        this.budgetTracker.addUsage('o3', Math.round(reconciliation.reconciliationData.tokensUsed / 2));
        this.budgetTracker.addUsage('claude-opus-4-7', Math.round(reconciliation.reconciliationData.tokensUsed / 2));
        stages.push({
          stageName: 'reconciliation',
          durationMs: reconciliation.reconciliationData.durationMs,
          tokensUsed: reconciliation.reconciliationData.tokensUsed,
          model: 'mixed (o3 + claude-opus-4-7)',
          agentName: 'reconciliation',
          inputSummary: `o3 top-1: ${reconciliation.reconciliationData.o3InitialTop1}; claude top-1: ${reconciliation.reconciliationData.claudeInitialTop1 || 'n/a'}`,
          outputSummary: `Converged at round ${reconciliation.reconciliationData.roundsRun}: ${reconciliation.reconciliationData.finalTop1} [${reconciliation.confidence}]`,
        });
      } else if (reconciliation.reconciliationData.initialAgreement) {
        // Track the round-1 agreement explicitly even though no extra LLM
        // tokens were spent.
        stages.push({
          stageName: 'reconciliation',
          durationMs: reconciliation.reconciliationData.durationMs,
          tokensUsed: 0,
          model: 'n/a (round-1 consensus)',
          agentName: 'reconciliation',
          inputSummary: `o3 + claude agreed on top-1 at round 1`,
          outputSummary: `${reconciliation.reconciliationData.finalTop1} [${reconciliation.confidence}]`,
        });
      }

      // Attach the reconciliation metadata to the synthesis output so it
      // flows through into the AnalysisResult for /eval visibility and
      // post-hoc analysis.
      (synthesisResult as any).reconciliation = reconciliation;

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
          // v15: surface the full LLM-candidate-generation detail so deep-dive
          // tooling can see exactly which diagnoses the o3 candidate generator
          // proposed, each one's rationale, whether it matched a KB profile,
          // and whether it was added to the pool or de-duplicated against
          // triage's KB retrieval.
          candidateGeneration: candidateGenResult ? {
            totalGenerated: llmCandidateNames.length,
            addedToPool: addedFromLLM.length,
            duplicateOfTriage: llmCandidateNames.length - addedFromLLM.length - nonKbSeedCandidates.length,
            nonKbCarried: nonKbSeedCandidates.length,
            nonKbCarriedAfterCap: nonKbSeedHypotheses.length,
            // Deprecated alias of nonKbCarried — kept so older deep-dive UI
            // reading newly persisted analyses continues to render the count.
            // No longer means "dropped"; these are carried through as
            // reasoning-evaluated seed hypotheses.
            noKbMatch: nonKbSeedCandidates.length,
            unionSize: unionCandidates.length,
            triageCandidateCount: triageResult.candidateDiseases.length - addedFromLLM.length, // back out the additions
            candidates: llmCandidateDetail,
          } : undefined,
          // v15: surface the reconciliation outcome so per-case analysis can
          // tell how often the two synths agreed at round 1, how often they
          // converged after information exchange, and how often they hit
          // persistent disagreement (criteria-fulfillment tiebreak).
          reconciliation: (synthesisResult as any).reconciliation
            ? {
                confidence: (synthesisResult as any).reconciliation.confidence,
                roundsRun: (synthesisResult as any).reconciliation.reconciliationData.roundsRun,
                initialAgreement: (synthesisResult as any).reconciliation.reconciliationData.initialAgreement,
                finalAgreement: (synthesisResult as any).reconciliation.reconciliationData.finalAgreement,
                o3InitialTop1: (synthesisResult as any).reconciliation.reconciliationData.o3InitialTop1,
                claudeInitialTop1: (synthesisResult as any).reconciliation.reconciliationData.claudeInitialTop1,
                finalTop1: (synthesisResult as any).reconciliation.reconciliationData.finalTop1,
                finalTop1Source: (synthesisResult as any).reconciliation.reconciliationData.finalTop1Source,
                tokensUsed: (synthesisResult as any).reconciliation.reconciliationData.tokensUsed,
                durationMs: (synthesisResult as any).reconciliation.reconciliationData.durationMs,
              }
            : undefined,
        } as any,
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
