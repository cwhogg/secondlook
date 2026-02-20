import type { AnalysisResult, PipelineMetadata } from './index';

// ===== GENERATION TYPES =====

export interface GeneratedSymptom {
  originalPhrase: string;
  medicalTerm: string;
  bodySystem: string;
  severity: 'mild' | 'moderate' | 'severe';
  duration: string;
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
}

// ===== API METADATA =====

export interface GenerationMetadata {
  model: string;
  tokensUsed: number;
  durationMs: number;
}

// ===== TEST CASE LIFECYCLE =====

export type TestCaseStatus = 'generated' | 'running' | 'completed' | 'graded' | 'error';

export interface TestCase {
  id: string;
  createdAt: string;
  difficulty: number;
  categoryHint?: string;
  status: TestCaseStatus;
  groundTruth: GroundTruth;
  generatedPatient: GeneratedPatient;
  generationMetadata: GenerationMetadata;
  pipelineResult?: AnalysisResult;
  pipelineError?: string;
  grading?: TestGrading;
  gradingMetadata?: GenerationMetadata;
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
}
