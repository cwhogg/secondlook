export type { BodySystem, SymptomFrequency, DiagnosticCriterion, DiseaseProfile, SymptomMatch, DiseaseMatch } from './knowledge-base';

// ===== PATIENT DATA TYPES =====

export interface Demographics {
  age: string;
  sex: 'male' | 'female' | 'other';
}

export interface ChiefComplaint {
  description: string;
  duration?: string;
  severity?: number;
  bodyRegions?: string[];
}

export interface UMLSConcept {
  name: string;
  cui: string;
  semanticType?: string;
  snomedCode?: string;
}

export interface MappedSymptom {
  originalPhrase: string;
  medicalTerm: string;
  alternativeSearchTerms?: string[];
  category?: 'motor' | 'sensory' | 'pain' | 'cognitive' | 'autonomic' | 'constitutional';
  severity?: 'mild' | 'moderate' | 'severe';
  duration?: string;
  bodyPart?: string;
  umlsConcepts: UMLSConcept[];
  selectedConcept: UMLSConcept | null;
  confidence: number;
  confirmed: boolean;
  mappingError: boolean;
  feedbackStatus: 'none' | 'needs_adjustment';
  userCorrection?: string;
  searchTermUsed?: string;
}

export interface SymptomPattern {
  patternName: string;
  clinicalCategory: string;
  symptomIndices: number[];
  confidence: number;
  reasoning: string;
  suggestedInvestigations: string[];
  differentialConsiderations: string[];
}

export interface SymptomPatternData {
  patterns: SymptomPattern[];
  overallImpression: string;
  symptomsThatDontFitPatterns: number[];
}

export interface PatientCase {
  demographics: Demographics;
  chiefComplaint: ChiefComplaint;
  symptoms: MappedSymptom[];
  symptomPatterns: SymptomPatternData | null;
  patientHypothesis: string | null;
  medicalHistory: {
    currentMedications: any[];
    pastMedicalHistory: string[];
    familyHistory: string[];
    recentTests: string[];
    medicalCare: string;
    testingHistory: string[];
  };
}

// ===== ANALYSIS RESULT TYPES =====

export interface EvidenceItem {
  finding: string;
  patientSymptom: string; // maps back to a specific MappedSymptom
  strength: 'strong' | 'moderate' | 'weak';
  type: 'supporting' | 'contradictory';
}

export interface CriteriaFulfillment {
  criteriaName: string; // e.g., "Brighton Criteria for hEDS"
  totalCriteria: number;
  metCriteria: number;
  criteriaDetails: Array<{
    criterion: string;
    met: boolean;
    evidence: string;
  }>;
  fulfillmentPercentage: number;
}

export interface DiagnosisHypothesis {
  diagnosis: string;
  icd10Code?: string;
  omimId?: string;
  orphanetId?: string;
  confidenceScore: number; // LLM-assessed (legacy compatibility)
  evidenceScore: number; // grounded in diagnostic criteria fulfillment
  rareDisease: boolean;
  prevalence?: string;
  supportingEvidence: EvidenceItem[];
  contradictoryEvidence: EvidenceItem[];
  clinicalReasoning: string;
  typicalPresentation: string;
  specialistRequired: string;
  diagnosticCriteria: CriteriaFulfillment;
  sourceAgent: string; // which specialist agent proposed this
  evaluationType: 'criteria-grounded' | 'reasoning-evaluated'; // whether KB criteria were available
  knowledgeBaseMatch: boolean; // whether this disease exists in the KB
}

export interface DataGap {
  gapType: 'laboratory' | 'imaging' | 'genetic_testing' | 'specialist_evaluation' | 'family_history' | 'functional_assessment';
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: string;
  wouldAffectDiagnoses: string[];
}

export interface RecommendedTest {
  testType: string;
  testName: string;
  rationale: string;
  urgency: 'urgent' | 'routine' | 'when_available';
  targetDiagnoses: string[];
}

export interface NextSteps {
  immediateActions: string[];
  specialistReferrals: string[];
  followUpTiming: string;
  redFlags: string[];
}

export interface StageResult {
  stageName: string;
  durationMs: number;
  tokensUsed: number;
  model: string;
  agentName?: string;
  inputSummary: string;
  outputSummary: string;
}

export interface PipelineMetadata {
  pipelineVersion: string;
  stages: StageResult[];
  totalDurationMs: number;
  totalTokensUsed: number;
  totalCostEstimate: number;
  knowledgeBaseVersion: string;
  diseasesConsidered: number;
  knowledgeBaseCoverage: {
    totalProfiledDiseases: number;
    criteriaGroundedCount: number; // how many final diagnoses had KB criteria
    reasoningEvaluatedCount: number; // how many were scored on reasoning alone
    disclaimer: string;
  };
}

export interface AnalysisResult {
  differentialDiagnoses: DiagnosisHypothesis[];
  excludedCommonDiagnoses: Array<{
    diagnosis: string;
    reasonExcluded: string;
  }>;
  dataGaps: DataGap[];
  recommendedTesting: RecommendedTest[];
  nextSteps: NextSteps;
  overallAssessment: string;
  patientHypothesisAnalysis?: {
    likelihood: number;
    reasoning: string;
    alternativeExplanation: string;
  };
  pipelineMetadata: PipelineMetadata;
}
