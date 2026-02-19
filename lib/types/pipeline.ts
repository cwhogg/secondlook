// ===== PIPELINE PROGRESS TYPES =====
// Shared between server (orchestrator) and client (analysis page + loading component)

export type PipelineProgress =
  | {
      stage: 'triage';
      stageNumber: 1;
      totalStages: 5;
      percentage: number;
      detail: string;
      data: {
        bodySystems: string[];
        acuityLevel: string;
        specialties: string[];
        candidateCount: number;
      };
    }
  | {
      stage: 'specialists';
      stageNumber: 2;
      totalStages: 5;
      percentage: number;
      detail: string;
      data: { specialties: string[] };
    }
  | {
      stage: 'specialists-complete';
      stageNumber: 2;
      totalStages: 5;
      percentage: number;
      detail: string;
      data: {
        results: Array<{
          agentName: string;
          specialty: string;
          hypotheses: Array<{ diagnosis: string; confidenceScore: number }>;
        }>;
      };
    }
  | {
      stage: 'evidence';
      stageNumber: 3;
      totalStages: 5;
      percentage: number;
      detail: string;
      data: { hypothesesCount: number };
    }
  | {
      stage: 'evidence-complete';
      stageNumber: 3;
      totalStages: 5;
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
      stageNumber: 4;
      totalStages: 5;
      percentage: number;
      detail: string;
      data: null;
    }
  | {
      stage: 'synthesis-complete';
      stageNumber: 4;
      totalStages: 5;
      percentage: number;
      detail: string;
      data: {
        topDiagnoses: Array<{ diagnosis: string; probabilityScore: number }>;
        consensusLevel: string;
      };
    }
  | {
      stage: 'report';
      stageNumber: 5;
      totalStages: 5;
      percentage: number;
      detail: string;
      data: null;
    }
  | {
      stage: 'complete';
      stageNumber: 5;
      totalStages: 5;
      percentage: 100;
      detail: string;
      data: null;
    };

export type ProgressCallback = (progress: PipelineProgress) => void;
