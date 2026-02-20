import { PatientCase, DiagnosisHypothesis, CriteriaFulfillment } from '../types';
import { DiseaseMatch } from '../types/knowledge-base';

// ===== AGENT CONFIGURATION =====

export interface AgentConfig {
  name: string;
  model: 'gpt-4.1' | 'gpt-4.1-mini' | 'gpt-4.1-nano' | 'gpt-4o' | 'gpt-4o-mini';
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

// ===== AGENT I/O =====

export interface AgentInput {
  patientCase: PatientCase;
  candidateDiseases?: DiseaseMatch[];
  previousStageOutput?: any;
}

export interface AgentOutput {
  agentName: string;
  hypotheses: DiagnosisHypothesis[];
  reasoning: string;
  confidence: number;
  tokensUsed: number;
  durationMs: number;
  model: string;
}

// ===== STAGE-SPECIFIC TYPES =====

export interface TriageOutput {
  bodySystems: string[];
  acuityLevel: 'emergent' | 'urgent' | 'non-urgent';
  relevantSpecialties: string[];
  candidateDiseases: DiseaseMatch[];
  triageReasoning: string;
  tokensUsed: number;
  durationMs: number;
}

export interface EvidenceEvaluation {
  hypothesis: DiagnosisHypothesis;
  criteriaFulfillment: CriteriaFulfillment;
  evidenceStrength: number; // 0-100
  informationGaps: string[];
  contradictions: string[];
}

export interface SynthesisOutput {
  rankedDiagnoses: DiagnosisHypothesis[];
  consensusLevel: 'strong' | 'moderate' | 'weak' | 'divergent';
  criticalGaps: string[];
  overallAssessment: string;
  excludedCommonDiagnoses: Array<{
    diagnosis: string;
    reasonExcluded: string;
  }>;
}

// ===== SPECIALIST REGISTRY =====

export const SPECIALIST_TYPES = [
  'neurologist',
  'rheumatologist',
  'cardiologist',
  'immunologist',
  'endocrinologist',
  'gastroenterologist',
  'geneticist',
  'hematologist',
  'psychiatrist',
  'oncologist',
  'general-internist',
] as const;

export type SpecialistType = typeof SPECIALIST_TYPES[number];

// Maps body systems to relevant specialist types
export const SYSTEM_TO_SPECIALIST: Record<string, SpecialistType[]> = {
  neurological: ['neurologist', 'geneticist'],
  musculoskeletal: ['rheumatologist'],
  cardiovascular: ['cardiologist'],
  respiratory: ['immunologist'],
  gastrointestinal: ['gastroenterologist'],
  dermatological: ['rheumatologist', 'immunologist'],
  ophthalmological: ['neurologist', 'rheumatologist'],
  endocrine: ['endocrinologist'],
  hematological: ['hematologist'],
  immunological: ['immunologist', 'rheumatologist'],
  renal: ['rheumatologist'],
  reproductive: ['endocrinologist'],
  psychiatric: ['psychiatrist'],
  constitutional: ['general-internist', 'rheumatologist', 'geneticist'],
  otolaryngological: ['general-internist'],
  oncological: ['oncologist', 'hematologist'],
};
