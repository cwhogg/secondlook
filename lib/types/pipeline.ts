// ===== PIPELINE PROGRESS TYPES =====
// Shared between server (orchestrator) and client (analysis page + loading component)

export type PipelineProgress =
  | {
      stage: 'extraction';
      stageNumber: 0;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: {
        symptomCount: number;
        symptoms: Array<{
          originalPhrase: string;
          medicalTerm: string;
          code: string | null;
          codeSystem: 'SNOMED' | 'UMLS CUI' | null;
        }>;
      };
    }
  | {
      stage: 'extraction-complete';
      stageNumber: 0;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: {
        symptomCount: number;
        symptoms: Array<{
          originalPhrase: string;
          medicalTerm: string;
          code: string | null;
          codeSystem: 'SNOMED' | 'UMLS CUI' | null;
        }>;
      };
    }
  | {
      stage: 'triage';
      stageNumber: 1;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: {
        bodySystems: string[];
        acuityLevel: string;
        specialties: string[];
        candidateCount: number;
        extractedSymptoms: Array<{
          originalPhrase: string;
          medicalTerm: string;
          code: string | null;
          codeSystem: 'SNOMED' | 'UMLS CUI' | null;
        }>;
      };
    }
  | {
      // v27 + UI fix: explicit selection step between triage and specialists.
      // Surfaces WHICH specialists were chosen for this case so the loader can
      // show them before the specialists start reasoning. Triage emits the
      // ranked list of relevant specialties; this stage emits the actual 5
      // selected (geneticist + general-internist anchors + top 3 from triage).
      stage: 'specialist-selection';
      stageNumber: 2;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: {
        selectedSpecialties: string[];
        triageRanked: string[];
        totalSpecialistCount: number;
      };
    }
  | {
      stage: 'specialists';
      stageNumber: 3;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: { specialties: string[] };
    }
  | {
      stage: 'specialists-complete';
      stageNumber: 3;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: {
        results: Array<{
          agentName: string;
          specialty: string;
          hypotheses: Array<{ diagnosis: string; confidenceScore: number }>;
        }>;
        failedSpecialists?: Array<{ specialty: string; error: string }>;
      };
    }
  | {
      // Emitted as each specialist finishes inside the parallel stage so
      // the client can persist per-agent progress for diagnosing hangs.
      stage: 'specialist-done';
      stageNumber: 3;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: { specialty: string; durationMs: number; hypothesisCount: number };
    }
  | {
      // Emitted when a specialist times out or errors.
      stage: 'specialist-failed';
      stageNumber: 3;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: { specialty: string; durationMs: number; kind: 'timeout' | 'error'; error: string };
    }
  | {
      stage: 'evidence';
      stageNumber: 4;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: { hypothesesCount: number };
    }
  | {
      stage: 'evidence-complete';
      stageNumber: 4;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: {
        evaluatedCount: number;
        kbMatchedCount: number;
        reasoningEvaluatedCount: number;
      };
    }
  | {
      stage: 'synthesis';
      stageNumber: 5;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: null;
    }
  | {
      stage: 'synthesis-complete';
      stageNumber: 5;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: {
        topDiagnoses: Array<{ diagnosis: string; displayName?: string; probabilityScore: number }>;
        consensusLevel: string;
      };
    }
  | {
      stage: 'report';
      stageNumber: 6;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: null;
    }
  | {
      stage: 'complete';
      stageNumber: 6;
      totalStages: 7;
      percentage: 100;
      detail: string;
      data: null;
    }
  | {
      // Emitted periodically (every 30s) while a long sequential stage
      // (evidence-eval or synth) is in flight. Pure keepalive — no semantic
      // progress — but it keeps the SSE stream non-idle so the client's
      // idle-timeout doesn't kill legitimate long o3:high reasoning.
      stage: 'heartbeat';
      stageNumber: number;
      totalStages: 7;
      percentage: number;
      detail: string;
      data: { stage: string; elapsedMs: number };
    };

export type ProgressCallback = (progress: PipelineProgress) => void;
