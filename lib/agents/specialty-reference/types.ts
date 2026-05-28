/**
 * Specialty reference content used to enrich the per-specialist agent prompt.
 *
 * Content is AI-authored and intended for clinical review. Each specialty file
 * exports a SpecialtyReference object consumed by lib/agents/specialist-agents.
 */

export interface ClinicalFramework {
  /** Short identifier shown to the LLM, e.g. "SLE classification" */
  name: string;
  /** Compact prose summary of the criteria / framework / staging system */
  summary: string;
}

export interface MimicGroup {
  /** Anchor condition the specialist is considering */
  condition: string;
  /** Conditions that present similarly and should be on the differential */
  mimics: string[];
}

export interface SpecialtyReference {
  title: string;
  /** Short expertise paragraph used at the top of the prompt */
  expertise: string;
  /** Established diagnostic criteria, classification systems, and frameworks */
  clinicalFrameworks: ClinicalFramework[];
  /** Pattern-recognition heuristics — "if you see X, think Y" */
  differentialPatterns: string[];
  /** Don't-miss diagnoses, warning signs, treatable-mimics-of-untreatable */
  redFlags: string[];
  /** Conditions commonly mistaken for each other inside this specialty */
  commonMimics: MimicGroup[];
}
