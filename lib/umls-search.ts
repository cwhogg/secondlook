/**
 * Shared UMLS search logic with intelligent fallback strategies.
 * Used by both the main symptom-mapping-section and the testing page.
 */

interface UMLSSearchResult {
  concepts: any[];
  confidence: number;
  error: boolean;
}

interface UMLSFallbackResult extends UMLSSearchResult {
  searchTermUsed: string;
}

/**
 * Common medical qualifiers that UMLS doesn't index as part of concept names.
 * "elevated inflammatory markers" fails, but "inflammatory markers" succeeds.
 */
const MEDICAL_QUALIFIERS = new Set([
  // Severity / degree
  'mild', 'moderate', 'severe', 'marked', 'slight', 'significant', 'profound',
  // Temporal
  'acute', 'chronic', 'subacute', 'intermittent', 'persistent', 'recurrent',
  'progressive', 'worsening', 'improving', 'stable', 'fluctuating',
  // Quantity / change direction
  'elevated', 'increased', 'decreased', 'reduced', 'low', 'high',
  'abnormal', 'normal', 'raised', 'lowered',
  // Laterality
  'bilateral', 'unilateral', 'left', 'right',
  // Distribution
  'diffuse', 'focal', 'localized', 'generalized', 'widespread', 'multifocal',
  // Onset / pattern
  'new', 'recent', 'sudden', 'gradual', 'unexplained', 'idiopathic',
  'episodic', 'constant', 'prolonged', 'transient',
  // Test-result qualifiers
  'positive', 'negative', 'borderline', 'equivocal',
]);

/**
 * Generate search variants from a multi-word term by stripping qualifiers,
 * dropping leading/trailing words, and trying individual content words.
 * Returns variants in priority order (most specific first).
 */
function generateSearchVariants(term: string): string[] {
  const words = term.split(/\s+/);
  if (words.length < 2) return [];

  const variants: string[] = [];

  // 1. Strip qualifiers — most targeted, try first
  //    "elevated inflammatory markers" → "inflammatory markers"
  const withoutQualifiers = words.filter(w => !MEDICAL_QUALIFIERS.has(w.toLowerCase()));
  if (withoutQualifiers.length > 0 && withoutQualifiers.length < words.length) {
    variants.push(withoutQualifiers.join(' '));
  }

  // 2. Drop leading words progressively
  //    "orbital discoloration" → "discoloration"
  //    "severe abdominal pain" → "abdominal pain" → "pain"
  for (let drop = 1; drop < words.length; drop++) {
    variants.push(words.slice(drop).join(' '));
  }

  // 3. Drop trailing words progressively
  //    "orbital discoloration" → "orbital"
  //    "lower extremity weakness" → "lower extremity" → "lower"
  for (let drop = 1; drop < words.length; drop++) {
    variants.push(words.slice(0, words.length - drop).join(' '));
  }

  // 4. Individual content words (>= 4 chars, not qualifiers) as last resort
  //    Catches cases where only one core word is the real UMLS concept
  for (const word of words) {
    if (word.length >= 4 && !MEDICAL_QUALIFIERS.has(word.toLowerCase())) {
      variants.push(word);
    }
  }

  // Deduplicate while preserving priority order, exclude original term
  const termLower = term.toLowerCase();
  const seen = new Set<string>();
  return variants.filter(v => {
    const vLower = v.toLowerCase();
    if (vLower === termLower || seen.has(vLower) || v.length < 2) return false;
    seen.add(vLower);
    return true;
  });
}

/**
 * Call the UMLS search API for a single term.
 */
export async function searchUMLS(searchTerm: string): Promise<UMLSSearchResult> {
  try {
    const response = await fetch('/api/umls-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchTerm }),
    });
    if (!response.ok) return { concepts: [], confidence: 0, error: true };
    const data = await response.json();
    return { concepts: data.concepts || [], confidence: data.confidence || 0, error: !!data.error };
  } catch {
    return { concepts: [], confidence: 0, error: true };
  }
}

/**
 * Search UMLS with progressive fallback strategies:
 * 1. Primary medical term
 * 2. LLM-provided alternative search terms
 * 3. Original patient phrase
 * 4. Generated variants (qualifier stripping, word reduction, individual words)
 *
 * Returns as soon as any strategy finds a match.
 */
export async function searchUMLSWithFallbacks(
  primaryTerm: string,
  alternativeTerms: string[],
  originalPhrase: string,
): Promise<UMLSFallbackResult> {
  if (!primaryTerm) {
    return { concepts: [], confidence: 0, error: true, searchTermUsed: '' };
  }

  // 1. Try primary medicalTerm
  let result = await searchUMLS(primaryTerm);
  if (result.concepts.length > 0 && !result.error) {
    return { ...result, searchTermUsed: primaryTerm };
  }

  // 2. Try each alternativeSearchTerm
  for (const altTerm of alternativeTerms) {
    result = await searchUMLS(altTerm);
    if (result.concepts.length > 0 && !result.error) {
      return { ...result, searchTermUsed: altTerm };
    }
  }

  // 3. Try originalPhrase
  if (originalPhrase.toLowerCase() !== primaryTerm.toLowerCase()) {
    result = await searchUMLS(originalPhrase);
    if (result.concepts.length > 0 && !result.error) {
      return { ...result, searchTermUsed: originalPhrase };
    }
  }

  // 4. Generate and try search variants from all source terms
  const allSourceTerms = [primaryTerm, ...alternativeTerms];
  const triedTerms = new Set(allSourceTerms.map(t => t.toLowerCase()));
  triedTerms.add(originalPhrase.toLowerCase());

  for (const baseTerm of allSourceTerms) {
    const variants = generateSearchVariants(baseTerm);
    for (const variant of variants) {
      if (triedTerms.has(variant.toLowerCase())) continue;
      triedTerms.add(variant.toLowerCase());

      result = await searchUMLS(variant);
      if (result.concepts.length > 0 && !result.error) {
        return {
          ...result,
          // Small confidence penalty for needing fallback decomposition
          confidence: Math.max(0.5, result.confidence - 0.1),
          searchTermUsed: variant,
        };
      }
    }
  }

  // All attempts failed
  return { concepts: [], confidence: 0, error: true, searchTermUsed: primaryTerm };
}
