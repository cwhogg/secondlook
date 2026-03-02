/**
 * Shared symptom parsing utilities.
 * Extracts mapSingleSymptom so SymptomMappingSection, analysis page, and testing page can reuse it.
 */

import { searchUMLSWithFallbacks } from "@/lib/umls-search"
import type { MappedSymptom, UMLSConcept } from "@/lib/types/index"

export type { MappedSymptom, UMLSConcept }

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
    category: symptom.category as MappedSymptom["category"],
    severity: symptom.severity as MappedSymptom["severity"],
    duration: symptom.duration,
    bodyPart: symptom.bodyPart,
    umlsConcepts: result.concepts,
    selectedConcept: result.concepts[0] || null,
    confidence: result.confidence,
    confirmed: false,
    mappingError: result.error,
    feedbackStatus: "none",
    searchTermUsed: result.searchTermUsed,
  }
}
