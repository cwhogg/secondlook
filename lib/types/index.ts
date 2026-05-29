export type { BodySystem, SymptomFrequency, DiagnosticCriterion, DiseaseProfile, SymptomMatch, DiseaseMatch } from './knowledge-base';
export type { PipelineProgress, ProgressCallback } from './pipeline';

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
  isEditingCorrection?: boolean;
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

// Patient-uploaded structured lab result. Extracted from PDF/image lab
// reports by /api/extract-labs (Phase 1), or entered manually. Carried
// through PatientCase so specialists, evidence-evaluator, and retrieval can
// use the actual numbers instead of only the verbalized symptom narrative.
export interface LabResult {
  // What the patient sees on their report. Canonical analyte name where the
  // extractor recognized it (e.g. "Alanine aminotransferase (ALT)"); raw
  // text otherwise.
  testName: string;
  // Raw value as printed. Kept as string so qualitative results
  // ("positive", "negative", "trace") survive without forcing a number.
  value: string;
  // Parsed numeric form when value is numeric. NaN/undefined otherwise.
  numericValue?: number;
  unit?: string;
  // The reference range printed on the report itself — we trust the lab's
  // own range, which already accounts for patient age/sex.
  referenceRange?: {
    low?: number;
    high?: number;
    raw: string;
  };
  // H = high, L = low, HH/LL = critical high/low, CRIT = critical value.
  // null when the value is in-range; undefined when the report did not flag.
  flag?: 'H' | 'L' | 'HH' | 'LL' | 'CRIT' | null;
  dateDrawn?: string; // ISO date when the specimen was drawn
  labName?: string;   // e.g. "LabCorp", "Quest Diagnostics"
  // Phase 2: best-guess LOINC code. Not all results will have one; used for
  // mechanical KB criteria matching when present.
  loincCode?: string;
  source: 'extracted' | 'manual';
  // 0-1 — how confident the extractor is in this row. Low confidence rows
  // should be highlighted in the verification UI.
  confidence: number;
  // Filename of the source upload, so the verification UI can show which
  // file each row came from when the user uploaded multiple.
  sourceFile?: string;
}

export interface PatientCase {
  demographics: Demographics;
  chiefComplaint?: ChiefComplaint;
  symptoms: MappedSymptom[];
  // Clinical findings the source explicitly marked absent/denied/ruled-out.
  // Used as negative evidence by retrieval and downstream agents.
  excludedFindings?: string[];
  // User-uploaded structured lab values; populated from PDF/image uploads
  // on step-2 after the user reviews and confirms the extraction.
  labResults?: LabResult[];
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

// Mechanical scoring breakdown (per-component) so we can audit *why* a
// diagnosis got the evidenceScore it did and so we can fit a calibration
// curve against ground truth from historical graded eval data.
export interface EvidenceScoreBreakdown {
  evidenceScoreRaw: number; // pre-rounding 0-100
  trackUsed: 'kb-grounded' | 'non-kb-reasoning';
  components: {
    criteriaFulfillmentRatio?: number;
    symptomMatchScore: number;
    specialistAgreementScore: number;
    contradictionPenalty: number;
    excludedFindingPenalty: number;
    evidenceQualityScore?: number;
  };
}

export interface DiagnosisHypothesis {
  diagnosis: string;
  icd10Code?: string;
  omimId?: string;
  orphanetId?: string;
  confidenceScore: number; // LLM-assigned probability from the synthesizer
  evidenceScore: number; // deterministic from signals (v7+); same as confidenceScore on pre-v7 data
  // v7+ — set when evidenceScore was computed by the deterministic formula;
  // absent on older data where evidenceScore was just the synth LLM score.
  evidenceScoreRaw?: number;
  evidenceScoreBreakdown?: EvidenceScoreBreakdown;
  scoringVersion?: string; // e.g. 'v1-2026-05-29' — which formula produced the score
  rareDisease: boolean;
  prevalence?: string;
  supportingEvidence: EvidenceItem[];
  contradictoryEvidence: EvidenceItem[];
  clinicalReasoning: string;
  typicalPresentation: string;
  specialistRequired: string;
  diagnosticCriteria: CriteriaFulfillment;
  sourceAgent: string; // legacy: comma-joined specialist agents
  sourceAgents?: string[]; // v7+: structured array (split of sourceAgent for back-compat)
  // For family-expansion entries, the synth-ranked diagnosis whose KB profile
  // listed this variant — used so expansions inherit a discounted score
  // instead of showing zero.
  parentDiagnosis?: string;
  evaluationType: 'criteria-grounded' | 'reasoning-evaluated'; // whether KB criteria were available
  knowledgeBaseMatch: boolean; // whether this disease exists in the KB
  // Marker set only on KB-linked entries appended after synthesis (positions 11-15);
  // synthesizer-ranked diagnoses leave this undefined.
  expansionSource?: 'family' | 'variant';
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

export interface DifferentialCluster {
  clusterName: string;
  diagnoses: string[];
  combinedProbabilityRange: string;
  sharedFeatures: string[];
  distinguishingTests: string[];
  reasoning: string;
}

export interface FamilyEnrichment {
  familyName: string;
  totalSubtypes: number;
  topDiagnosisInFamily: string;
  differentiatingTest: {
    modality: string;
    modalityLabel: string;
    convergenceRatio: number;
    perSubtype: Array<{
      diseaseName: string;
      uniqueFindings: string[];
    }>;
    sharedFindings: string[];
  } | null;
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
  /** Top retrieval candidates with per-component scores (from triage stage) */
  retrievalScores?: Array<{
    diseaseId: string;
    diseaseName: string;
    matchScore: number;
    componentScores: {
      symptom: number;
      system: number;
      demographic: number;
      prevalence: number;
    };
  }>;
}

export interface AnalysisResult {
  differentialDiagnoses: DiagnosisHypothesis[];
  differentialClusters?: DifferentialCluster[];
  familyEnrichments?: FamilyEnrichment[];
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
