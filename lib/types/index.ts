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
  // Clinical findings the source explicitly confirmed (e.g. a patient
  // answered "yes" to a targeted clarifying question). Treated as positive
  // evidence with diagnostic weight — analogous to `excludedFindings` but on
  // the supporting side. Populated by the refinement flow; empty on the
  // initial analysis pass.
  confirmedFindings?: string[];
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
  // v17+: specialty that surfaced this evidence item, preserved through dedup
  // so the deep-dive can show which expert raised each finding.
  attributedTo?: string;
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
  // Patient-facing display label. Populated at dedup time from the richest
  // specialist variant that fed into this group. Rendering ONLY — no pipeline
  // stage reads or acts on this field (evaluator, synth, critic, finalizer
  // continue to use `diagnosis` for logic and label-matching). Falls back to
  // `diagnosis` at render time when absent.
  displayName?: string;
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
  // v17+: specialist-emitted annotation fields. Each hypothesis carries these
  // through dedup as the union of all contributing specialists' suggestions.
  diagnosticTests?: string[];
  cardinalFeatures?: string[];
  ruleOutFeatures?: string[];
  // v17+: per-specialist confidence preserved through dedup so the synth/critic
  // can see disagreement (e.g. geneticist 90 vs internist 40 = uncertain).
  domainConfidenceMap?: Record<string, number>;
  // v17+: alternate names from individual specialists merged into this canonical.
  // Preserved so the deep-dive can show what got combined.
  nameVariants?: string[];
  // v17+: set by Stage 8 (Claude finalize) so the report can show what o3's
  // critique actually changed vs Claude's first synth pass.
  changesFromFirstPass?: {
    rankBefore: number | null;
    rankAfter: number | null;
    changeReason?: 'critique-promoted' | 'critique-demoted' | 'critique-reordered' | 'critique-added' | 'no-change' | 'finalizer-override';
  };
  // v18+: specialist-emitted candidate clarifying questions. These are the
  // raw inputs the Clarifier stage picks from. Patient-answerable yes/no
  // ("Has a doctor ever told you you have X?", "Do you experience Y?").
  clarifyingQuestionCandidates?: ClarifyingQuestionCandidate[];
}

// v18+: emitted by specialists for each of their top hypotheses. Raw
// candidate pool that the Clarifier stage picks 1-5 questions from.
export interface ClarifyingQuestionCandidate {
  question: string; // patient-answerable, ideally yes/no
  ifYesImpact: 'rules-in' | 'supports' | 'weakens' | 'rules-out';
  rationale: string; // why this question discriminates THIS diagnosis
  questionType: 'symptom' | 'prior_dx' | 'family_history' | 'lab_result';
}

// v18+: clarifier-picked questions presented to the patient after the
// initial analysis. Each carries a per-hypothesis impact mapping so the
// refine endpoint can synthesize new EvidenceItems from the patient's
// answers.
export interface ClarifyingQuestion {
  id: string;
  question: string;
  questionType: 'symptom' | 'prior_dx' | 'family_history' | 'lab_result';
  rationale: string;
  affectsDiagnoses: Array<{
    diagnosisName: string;
    ifYes: 'rules-in' | 'supports' | 'weakens' | 'rules-out' | 'neutral';
    ifNo: 'rules-in' | 'supports' | 'weakens' | 'rules-out' | 'neutral';
  }>;
}

export interface ClarifyingAnswer {
  questionId: string;
  answer: 'yes' | 'no' | 'dont_know';
}

// v18+: returned by /api/refine-diagnosis so the UI can show before/after
// rank and score deltas per hypothesis.
export interface RefinementDelta {
  diagnosisName: string;
  oldRank: number | null;
  newRank: number | null;
  oldScore: number | null;
  newScore: number | null;
}

// v17+: output shape from the o3 critic. Read by Stage 8 (Claude finalize).
export interface CritiqueSuggestion {
  // EXACT name from Claude's Stage 6 ranking for promote/demote/reorder/merge/flag-gap.
  // For 'add': a NEW diagnosis name not present in Claude's top-10 that o3 believes
  // belongs there based on specific patient evidence.
  targetDiagnosis: string;
  action: 'promote' | 'demote' | 'reorder' | 'merge' | 'flag-gap' | 'add';
  targetNewRank?: number; // 1-10
  // REQUIRED for action='merge' — the EXACT surviving label the finalizer must
  // use. Set by the critic to preserve the more clinically informative label
  // (parentheticals, criteria refs, etiologic qualifiers) rather than defaulting
  // to whichever entry appeared first.
  mergeInto?: string;
  evidence: string[]; // specific patient findings supporting the suggestion
  reasoning: string;
  // 0-100. Required and gated for 'add' (only kept if >= ADD_CONFIDENCE_FLOOR);
  // optional informational signal for the other actions.
  confidence?: number;
}

export interface CritiqueOutput {
  overallAssessment: string;
  suggestions: CritiqueSuggestion[];
  confidenceInClaudeRanking: number; // 0-100
  tokensUsed: number;
  durationMs: number;
  model: string;
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

  // v17+: per-specialist breakdown from Stage 2.
  specialistPool?: {
    selected: string[]; // 5 specialty names
    perSpecialistResults: Array<{
      specialty: string;
      hypothesisCount: number;
      durationMs: number;
      tokensUsed: number;
      model: string;
      failureReason?: string;
    }>;
  };

  // v17+: dedup audit from Stage 3 — detailed so over-splitting is detectable early.
  dedupStats?: {
    inputCount: number;
    outputCount: number;
    evidenceItemsInput: number;
    evidenceItemsOutput: number;
    validationPassed: boolean;
    groups: Array<{
      canonical: string;
      variants: string[];
      contributingSpecialists: string[];
      evidenceItemsContributed: number;
      matchPath: 'exact-normalized' | 'substring' | 'alias-map' | 'kb-anchored';
      canonicalChosenBy: 'kb-anchor' | 'specialist-consensus' | 'shortest';
    }>;
    unmatched: Array<{
      diagnosis: string;
      specialty: string;
    }>;
    suspiciousPairs: Array<{
      a: string;
      b: string;
      editDistance: number;
      reason: 'below-threshold' | 'different-tokens';
    }>;
  };

  // v17+: o3 critique summary from Stage 7.
  critique?: {
    confidenceInClaudeRanking: number;
    suggestionCount: number;
    acceptedCount: number; // how many were honored by finalizer
    tokensUsed: number;
    durationMs: number;
    overallAssessment?: string;
    suggestions?: CritiqueSuggestion[];
  };

  // v17+: Claude finalize delta from Stage 8.
  finalizerChanges?: {
    rankChangesFromFirstPass: number;
    removedFromTop10: string[];
    addedToTop10: string[];
  };
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
  // v18+: optional set of patient-answerable yes/no questions that, once
  // answered, can be used to refine the differential via /api/refine-diagnosis.
  // Picked by the Clarifier stage from the candidate pool emitted by
  // specialists; absent on flows where the Clarifier didn't run.
  clarifyingQuestions?: ClarifyingQuestion[];
  // v18+: present iff this result is the output of /api/refine-diagnosis.
  // Carries before/after rank + score deltas plus the answers the patient
  // provided, so the UI can render rank-change badges on /results/refine.
  refinement?: {
    answers: ClarifyingAnswer[];
    deltas: RefinementDelta[];
    refinedAt: string; // ISO timestamp
  };
  // v18+: set when the analysis confidence is low. UI surfaces this as a
  // banner on /results/analysis. Replaces the prior practice of injecting
  // a hardcoded recommendation paragraph into the report-generator's prompt.
  lowConfidenceWarning?: {
    triggered: boolean;
    // Which of the three checks fired. Multiple can fire at once.
    reasons: Array<'all-top-5-below-40' | 'weak-consensus' | 'low-reliability'>;
    // Highest score among top-5, included so the UI banner can say "highest
    // was 32%" without recomputing.
    highestTopScore: number;
  };
}
