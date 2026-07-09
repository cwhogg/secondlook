/**
 * Integrative-medicine pipeline types.
 *
 * The integrative path runs a 5-practitioner panel (functional medicine,
 * naturopath, TCM/acupuncture, ayurveda, mind-body/somatic) against the
 * same patient case as the clinical differential, but produces a
 * DIFFERENT output shape: root-cause hypotheses in each modality's
 * vocabulary + recommended tests + interventions to explore. NOT a
 * differential diagnosis. NOT co-mingled with the clinical differential.
 */
export type IntegrativeSpecialty =
  | 'functional-medicine'
  | 'naturopath'
  | 'tcm-acupuncture'
  | 'ayurveda'
  | 'mind-body-somatic';

export interface TestRecommendation {
  name: string;
  rationale: string;
  practitionerType: string;
}

export type InterventionCategory =
  | 'supplement'
  | 'lifestyle'
  | 'therapy'
  | 'diet'
  | 'movement'
  | 'mindset'
  | 'other';

export interface Intervention {
  category: InterventionCategory;
  name: string;
  rationale: string;
  toDiscussWith: string;
}

export interface IntegrativeSpecialistOutput {
  specialty: IntegrativeSpecialty;
  displayName: string;
  rootCauseHypothesis: string;
  reasoning: string;
  recommendedTests: TestRecommendation[];
  interventions: Intervention[];
  tokensUsed: number;
  durationMs: number;
  model: string;
}

export interface IntegrativeAnalysisResult {
  requestId: string;
  clinicalRequestId: string;
  createdAt: string;
  consensusRootCause: string;
  overallReasoning: string;
  perSpecialist: IntegrativeSpecialistOutput[];
  mergedTests: TestRecommendation[];
  mergedInterventions: Intervention[];
  totalTokensUsed: number;
  totalCostEstimate: number;
  totalDurationMs: number;
}

export interface IntegrativeProgressEvent {
  type: 'progress' | 'result' | 'error';
  stage?: 'specialists' | 'specialist-done' | 'synthesis' | 'complete';
  specialty?: IntegrativeSpecialty;
  requestId?: string;
  analysis?: IntegrativeAnalysisResult;
  error?: string;
}
