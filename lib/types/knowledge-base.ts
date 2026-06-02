// ===== DISEASE KNOWLEDGE BASE TYPES =====

export type BodySystem =
  | 'neurological'
  | 'musculoskeletal'
  | 'cardiovascular'
  | 'respiratory'
  | 'gastrointestinal'
  | 'dermatological'
  | 'ophthalmological'
  | 'endocrine'
  | 'hematological'
  | 'immunological'
  | 'renal'
  | 'reproductive'
  | 'psychiatric'
  | 'constitutional'
  | 'otolaryngological';

export interface SymptomFrequency {
  symptomName: string;
  snomedCode?: string;
  frequency: number; // 0.0-1.0 proportion of patients who present with this
  bodySystem: BodySystem;
  notes?: string;
  searchTerms?: string[]; // Patient-friendly aliases for HPO/medical symptom names
}

export interface DiagnosticCriterion {
  id: string;
  description: string;
  category: 'major' | 'minor' | 'supportive';
  requiredForDiagnosis: boolean;
}

export interface DiseaseProfile {
  // Identification
  id: string; // e.g., "ehlers-danlos-hypermobile"
  name: string;
  aliases: string[];
  icd10Codes: string[];
  omimId?: string;
  orphanetId?: string;

  // Epidemiology
  prevalence: {
    estimate: string; // "1 in 5,000"
    range?: string; // "1 in 3,000 to 1 in 10,000"
    classification: 'ultra-rare' | 'rare' | 'uncommon' | 'common';
  };
  demographics: {
    typicalOnsetAge: { min: number; max: number; peak?: number };
    sexPredilection: 'male' | 'female' | 'equal' | 'slight-female' | 'slight-male';
    ethnicAssociations?: string[];
  };

  // Diagnostic Criteria
  diagnosticCriteria: {
    formalCriteriaName?: string; // e.g., "2017 International Criteria for hEDS"
    criteria: DiagnosticCriterion[];
    minimumForDiagnosis?: string; // e.g., "2 major + 1 minor"
    notes?: string;
  };

  // Symptom Profile
  symptoms: {
    pathognomonic: SymptomFrequency[]; // >90% of patients
    common: SymptomFrequency[]; // >50%
    occasional: SymptomFrequency[]; // 10-50%
    rare: SymptomFrequency[]; // <10%
  };

  // Body Systems
  systemsAffected: BodySystem[];

  // Laboratory / Imaging
  keyFindings: {
    laboratory: string[];
    imaging: string[];
    genetic: string[];
    other: string[];
  };

  // Differential Diagnosis
  differentialDiagnoses: Array<{
    diseaseId: string;
    distinguishingFeatures: string[];
  }>;

  // Red Flags
  redFlags: string[];

  // Clinical Guidance
  specialistType: string[];

  // Metadata
  lastUpdated: string;
  references: string[];
  confidenceInData: 'high' | 'medium' | 'low' | 'ai-generated';
}

// ===== RETRIEVAL TYPES =====

export interface SymptomMatch {
  patientSymptom: string;
  diseaseSymptom: SymptomFrequency;
  matchType: 'exact' | 'partial' | 'semantic';
}

export interface DiseaseMatch {
  disease: DiseaseProfile;
  matchScore: number;
  matchedSymptoms: SymptomMatch[];
  systemOverlap: BodySystem[];
  demographicFit: number; // 0-1
  /** Per-component retrieval scores (0-1 each, before weighting) */
  componentScores?: {
    symptom: number;
    system: number;
    demographic: number;
    prevalence: number;
    bm25?: number; // v22: lexical-match component
  };
}
