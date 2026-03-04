import type { AnalysisResult, MappedSymptom, PipelineMetadata } from './index';

// ===== GENERATION TYPES =====

export type PatientArchetype =
  | 'researcher'          // Googled extensively, uses medical jargon (sometimes wrong)
  | 'minimizer'           // Downplays everything, omits details they think are minor
  | 'storyteller'         // Exhaustive chronological narrative with life context
  | 'frustrated-chronic'  // Seen many doctors, tired and skeptical
  | 'anxious'             // Catastrophizes, mixes real symptoms with anxiety-driven concerns
  | 'stoic'               // Brief, matter-of-fact, minimal elaboration
  | 'caregiver-proxy'     // Family member describing patient's symptoms secondhand
  | 'elderly-vague';      // Temporal imprecision, attributes symptoms to aging

export interface GeneratedSymptom {
  originalPhrase: string;
  medicalTerm: string;
  bodySystem: string;
  severity: 'mild' | 'moderate' | 'severe';
  duration: string;
  mentionedInNarrative?: boolean; // false = intentionally omitted from narrative
}

export interface GeneratedPatient {
  narrative: string;
  demographics: {
    age: string;
    sex: 'male' | 'female' | 'other';
  };
  chiefComplaint: string;
  symptoms: GeneratedSymptom[];
  medicalHistory: {
    pastMedicalHistory: string[];
    familyHistory: string[];
    currentMedications: string[];
    recentTests: string[];
  };
}

export interface GroundTruth {
  diagnosis: string;
  icd10?: string;
  prevalence?: string;
  keyFindings: string[];
  expectedBodySystems: string[];
  expectedSpecialists: string[];
  difficultyFactors?: string[];
}

// ===== GRADING TYPES =====

export type LetterGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

export interface TestGrading {
  score: number;
  grade: LetterGrade;
  correctDiagnosisRank: number | null;
  inTop3: boolean;
  inTop5: boolean;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  missedFindings: string[];
  falseLeads: string[];
  partialCreditReason: string | null;
}

// ===== API METADATA =====

export interface GenerationMetadata {
  model: string;
  tokensUsed: number;
  durationMs: number;
  archetype?: PatientArchetype;
  source?: 'generated';
  preSelectedDisease?: string | null;
  isKnowledgeBaseDisease?: boolean;
}

// ===== RERUN SNAPSHOT =====

export interface PreviousRunSnapshot {
  score: number;
  grade: LetterGrade;
  correctDiagnosisRank: number | null;
  inTop3: boolean;
  inTop5: boolean;
  ranAt: string; // ISO timestamp of when this run happened
}

// ===== TEST CASE LIFECYCLE =====

export type TestCaseStatus = 'generated' | 'running' | 'completed' | 'graded' | 'error';

export interface TestCase {
  id: string;
  createdAt: string;
  difficulty: number;
  categoryHint?: string;
  diseaseSource?: 'kb' | 'non-kb';
  status: TestCaseStatus;
  source?: 'generated';
  groundTruth: GroundTruth;
  generatedPatient: GeneratedPatient;
  generationMetadata: GenerationMetadata;
  extractedSymptoms?: MappedSymptom[];
  pipelineResult?: AnalysisResult;
  pipelineError?: string;
  grading?: TestGrading;
  gradingMetadata?: GenerationMetadata;
  previousRun?: PreviousRunSnapshot;
}

// ===== AGGREGATE STATS =====

export interface TestSuiteStats {
  totalTests: number;
  gradedTests: number;
  avgScore: number;
  top1Rate: number;
  top3Rate: number;
  top5Rate: number;
  byDifficulty: Record<number, {
    count: number;
    avgScore: number;
    top1Rate: number;
    top3Rate: number;
    top5Rate: number;
  }>;
  bySource: Record<string, {
    count: number;
    avgScore: number;
    top1Rate: number;
    top3Rate: number;
    top5Rate: number;
  }>;
}
