/**
 * Shared symptom parsing utilities.
 * Extracts mapSingleSymptom so both SymptomMappingSection and the analysis page can use it.
 */

import { searchUMLSWithFallbacks } from "@/lib/umls-search"

export interface MappedSymptom {
  originalPhrase: string
  medicalTerm: string
  alternativeSearchTerms?: string[]
  category?: string
  severity?: string
  duration?: string
  bodyPart?: string
  umlsConcepts: UMLSConcept[]
  selectedConcept: UMLSConcept | null
  confidence: number
  confirmed: boolean
  mappingError: boolean
  feedbackStatus: "none" | "needs_adjustment"
  userCorrection?: string
  isEditingCorrection?: boolean
  searchTermUsed?: string
}

export interface UMLSConcept {
  name: string
  cui: string
  semanticType?: string
}

export async function mapSingleSymptom(symptom: {
  originalPhrase?: string
  text?: string
  medicalTerm?: string
  alternativeSearchTerms?: string[]
  category?: string
  severity?: string
  duration?: string
  bodyPart?: string
}): Promise<MappedSymptom> {
  const primaryTerm = symptom.medicalTerm || symptom.originalPhrase
  const alternativeTerms: string[] = symptom.alternativeSearchTerms || []
  const originalPhrase = symptom.originalPhrase || symptom.text || "Unknown"

  const result = await searchUMLSWithFallbacks(primaryTerm || "", alternativeTerms, originalPhrase)

  return {
    originalPhrase,
    medicalTerm: symptom.medicalTerm || originalPhrase,
    alternativeSearchTerms: alternativeTerms,
    category: symptom.category,
    severity: symptom.severity,
    duration: symptom.duration,
    bodyPart: symptom.bodyPart,
    umlsConcepts: result.concepts,
    selectedConcept: result.concepts[0] || null,
    confidence: result.confidence,
    confirmed: false,
    mappingError: result.error,
    feedbackStatus: "none",
    userCorrection: "",
    isEditingCorrection: false,
    searchTermUsed: result.searchTermUsed,
  }
}
