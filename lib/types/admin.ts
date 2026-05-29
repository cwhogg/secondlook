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

export interface NearMiss {
  diagnosis: string;
  creditLevel: 'variant' | 'family';
  reason?: string;
}

export interface GroundTruth {
  diagnosis: string;
  icd10?: string | null;
  prevalence?: string | null;
  keyFindings: string[];
  expectedBodySystems: string[];
  expectedSpecialists: string[];
  difficultyFactors?: string[];
  nearMisses?: NearMiss[];
}

// ===== GRADING TYPES =====

export type LetterGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

export type MatchTier =
  | 'exact-top1'
  | 'exact-top3'
  | 'exact-top5'
  | 'exact-beyond5'
  | 'variant-top3'
  | 'variant-top5'
  | 'variant-beyond5'
  | 'family-test-top5'
  | 'family-test-beyond5'
  | 'family-top3'
  | 'family-top5'
  | 'family-beyond5'
  | 'icd10-match'
  | 'organ-system'
  | 'complete-miss';

export interface TierMatch {
  tier: MatchTier;
  matchedDiagnosis?: string;
  matchedRank?: number;
  matchedNearMiss?: NearMiss;
  icd10Match?: boolean;
  scoreRange: [number, number];
}

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
  tierMatch?: TierMatch;
  nearMissMatch?: string | null;
  gradingVersion?: 'v1' | 'v2';
}

// ===== API METADATA =====

export interface GenerationMetadata {
  model: string;
  tokensUsed: number;
  durationMs: number;
  archetype?: PatientArchetype;
  source?: 'generated';
  preSelectedDisease?: string | null;
}

// ===== RERUN SNAPSHOT =====

export interface PreviousRunSnapshot {
  score: number;
  grade: LetterGrade;
  correctDiagnosisRank: number | null;
  inTop3: boolean;
  inTop5: boolean;
  ranAt: string; // ISO timestamp of when this run happened
  gradingVersion?: 'v1' | 'v2';
}

// ===== TEST CASE LIFECYCLE =====

export type TestCaseStatus = 'generated' | 'running' | 'completed' | 'graded' | 'error';

export interface TestCase {
  id: string;
  createdAt: string;
  difficulty: number;
  categoryHint?: string;
  testVersion?: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'v8' | 'v9' | 'v10' | 'v11' | 'v12' | 'v13' | 'v14' | 'v15' | 'Eval';
  // For Eval-tagged testCases: which version of the pipeline produced them.
  // v1 = pre-2026-05-27 pipeline (5-cap on diagnoses, no family expansion).
  // v2 = 2026-05-27 pipeline: 10-cap synth + KB-linked family expansion.
  // v3 = v2 + excluded-findings integration (retrieval penalty, specialist
  //      + evidence-evaluator negative-evidence handling).
  // v4 = v3 + parsimonious-common rule reverted + KB matcher tightened
  //      (short generic KB names no longer matched as substrings of long
  //      specialist phrases — prevents family expansion pulling in unrelated
  //      KB entries like Cystic Fibrosis under an Optic Atrophy case).
  // v5 = v4 + specialist agents upgraded from gpt-4.1 to o3 reasoning:high.
  //      Apples-to-apples test: does the SecondLook harness beat single-shot
  //      o3 baseline when specialists run on the same model class?
  // v6 = v5 + eval baselines aligned to the Phenopacket2Prompt official
  //      protocol: ask for top 10 (was top 5), use the paper's "single
  //      definitive diagnosis" framing, drop the JSON-only "no prose"
  //      stricture (kept JSON output for parsability). Matches the protocol
  //      used to publish the Exomiser / o1-preview / GPT-4o benchmark
  //      numbers so apples-to-apples comparisons against those are valid.
  // v7 = v6 + deterministic mechanical evidenceScore (replaces synth's
  //      probabilityScore as the rank key). confidenceScore still carries
  //      the LLM clinical judgment. Adds downstream-condition penalty,
  //      meaningful scores for family-expansion entries, and persistence of
  //      per-component score breakdowns so ground-truth-vs-score
  //      calibration can be fit offline later.
  // v8 = v7 + specialist reasoning effort dropped o3:high -> o3:medium.
  //      Evidence-evaluator and synthesizer stay at o3:high (ranking-
  //      critical). v7 hit the 300s Vercel wall on a meaningful slice of
  //      complex cases; v8 trades a small per-specialist reasoning-depth
  //      cut for ~50% wall-time reduction on the parallel specialist stage.
  evalVersion?: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'v8';
  // Which "engine" produced this Eval case. secondlook = the full V2 pipeline;
  // openai / claude = single-shot baseline calls to the respective top model.
  // Unset entries are treated as 'secondlook' for backward compatibility.
  evalRunMode?: 'secondlook' | 'openai' | 'claude';
  // How the case was sampled from the Phenopacket2Prompt corpus.
  // uniform     = standard random-row sampling (matches the published
  //               benchmark protocol; keeps the dataset's natural
  //               concentration on common rare diseases).
  // diversified = sample uniformly across distinct primary-diagnosis labels
  //               first, then pick one random representative case per label.
  //               Use this for pipeline-quality evaluation when corpus
  //               concentration is contaminating the per-disease signal.
  // Unset = uniform (back-compat with all runs prior to the field landing).
  evalSamplingMode?: 'uniform' | 'diversified';
  status: TestCaseStatus;
  source?: 'generated';
  groundTruth: GroundTruth;
  generatedPatient: GeneratedPatient;
  generationMetadata: GenerationMetadata;
  extractedSymptoms?: MappedSymptom[];
  // Findings the source explicitly ruled out / denied — parsed alongside
  // symptoms by /api/parse-symptoms, UMLS-mapped like symptoms, and fed to
  // the pipeline as negative evidence. Older records may still hold string[].
  extractedExcludedFindings?: MappedSymptom[] | string[];
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
  // Grader processes top 10 diagnoses; correctDiagnosisRank <= 10 = a Top-10
  // hit. For pre-v6 baselines that only emitted 5 diagnoses, Top-10 equals
  // Top-5 by construction.
  top10Rate: number;
  clinicalTop5Rate: number;  // exact + variant matches in top 5
  familyTop5Rate: number;    // exact + variant + family matches in top 5
  byDifficultySource: Record<string, {
    difficulty: number;
    version: string;
    count: number;
    avgScore: number;
    top1Rate: number;
    top3Rate: number;
    top5Rate: number;
  }>;
  byVersion: Record<string, {
    version: string;
    count: number;
    avgScore: number;
    top1Rate: number;
    top3Rate: number;
    top5Rate: number;
  }>;
}
