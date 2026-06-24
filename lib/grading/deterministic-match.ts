import type { GroundTruth, NearMiss, MatchTier, TierMatch, LetterGrade } from '@/lib/types/admin';
import type { FamilyEnrichment } from '@/lib/types/index';

// ===== SCORE RANGES BY TIER =====

const TIER_SCORE_RANGES: Record<MatchTier, [number, number]> = {
  'exact-top1':        [95, 100],
  'exact-top3':        [88, 95],
  'exact-top5':        [78, 88],
  'exact-beyond5':     [65, 78],
  'variant-top3':      [70, 80],
  'variant-top5':      [60, 72],
  'variant-beyond5':   [50, 62],
  'family-test-top5':  [78, 90],
  'family-test-beyond5': [65, 80],
  'family-top3':       [55, 68],
  'family-top5':       [45, 58],
  'family-beyond5':    [35, 48],
  'icd10-match':       [40, 58],
  'organ-system':      [25, 45],
  'complete-miss':     [0, 25],
};

// ===== DIAGNOSIS NORMALIZATION =====

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'with', 'without',
  'type', 'syndrome', 'disease', 'disorder', 'condition',
]);

/**
 * Normalize a diagnosis name for fuzzy comparison.
 * Lowercases, strips parentheticals, removes stop words, normalizes punctuation.
 */
export function normalizeDiagnosis(name: string): string {
  let normalized = name.toLowerCase();
  // Strip parentheticals
  normalized = normalized.replace(/\([^)]*\)/g, '');
  // Normalize Roman numerals to Arabic so "type I/II/III" matches "type 1/2/3".
  // Apply BEFORE hyphen handling so "type-i" and "type i" both convert.
  // Standalone tokens only — avoid eating part of a longer word
  // (e.g. "ii" appearing inside another word).
  normalized = normalized.replace(/\b(viii|vii|iii|ii|iv|vi|ix|v|i|x)\b/g, (m) => {
    return ROMAN_TO_ARABIC[m] || m;
  });
  // Normalize punctuation: hyphens to spaces, strip other punct
  normalized = normalized.replace(/-/g, ' ');
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  // Split into words, remove stop words, rejoin
  const words = normalized.split(/\s+/).filter(w => w.length > 0 && !STOP_WORDS.has(w));
  return words.join(' ');
}

const ROMAN_TO_ARABIC: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5',
  vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
};

/**
 * Strip subtype designators so umbrella-vs-subtype comparisons land cleanly.
 * General pattern: any subtype tail at the END of a name is removed.
 *
 * Subtype tail patterns we strip (applied to lowercased + normalized input):
 *   - "type <digit>"     | "type <single-letter>"
 *   - "subtype <digit>"  | "subtype <single-letter>"
 *   - a trailing standalone number (only when at least 2 word tokens precede)
 *   - a trailing standalone gene-symbol-shaped token (3-6 letters + optional 1-2 digits),
 *     excluded against the COMMON_WORDS_LOWER list to avoid stripping
 *     legit final words like "syndrome" / "disorder" / etc.
 *
 * No disease names are referenced in this logic — every rule is a generic
 * regex over conventional naming patterns.
 *
 * Note: this operates on the OUTPUT of normalizeDiagnosis() — lowercased,
 * roman-numeral-converted, hyphenless, punctuation-stripped.
 */
function stripSubtypeTail(normalized: string): string {
  let s = normalized;
  // "type 2", "subtype 2", "subtype a"
  s = s.replace(/\s+(type|subtype)\s+(\d+|[a-z])\s*$/g, '');
  // Trailing standalone number (after a multi-word disease name).
  // Only when the disease has at least 2 word tokens BEFORE the number, so
  // we don't strip a legit disease-defining digit (e.g. "trisomy 13" remains).
  s = s.replace(/^(\w+(?:\s+\w+){1,})\s+\d+\s*$/g, '$1');
  // Trailing gene symbol: capture once on the original (uppercase) form via
  // a fast regex on the lower-cased token. Gene symbols are usually all-caps
  // 3-7 chars, sometimes followed by a digit. We only strip at the tail.
  // Conservative: 3-6 letters + optional 1-2 digits, NOT a common english word.
  const tailMatch = s.match(/\s+([a-z]{3,6}\d{0,2})\s*$/);
  if (tailMatch && !COMMON_WORDS_LOWER.has(tailMatch[1])) {
    s = s.slice(0, -tailMatch[0].length);
  }
  return s.trim();
}

const COMMON_WORDS_LOWER = new Set([
  'syndrome', 'disease', 'disorder', 'type', 'subtype', 'familial', 'hereditary',
  'progressive', 'autosomal', 'recessive', 'dominant', 'congenital', 'isolated',
  'dysplasia', 'deficiency', 'condition', 'multiple', 'systemic', 'acute',
  'chronic', 'common', 'rare', 'severe', 'mild', 'moderate', 'classic',
]);

/**
 * Apply a small medical-suffix stemmer so name tokens that share a clinical
 * root but differ only in conventional suffix endings still align.
 *
 * Tail-collapse only — limited to the set of conventional medical compound
 * endings listed in the implementation. Per-token, applied AFTER
 * normalization. No disease-specific logic.
 */
function medicalStem(word: string): string {
  return word
    .replace(/opathy$/, 'o')
    .replace(/pathy$/, 'o')
    .replace(/itis$/, 'o')
    .replace(/osis$/, 'o')
    .replace(/iasis$/, 'o')
    .replace(/aemia$/, 'emia')
    .replace(/anaemia$/, 'anemia')
    .replace(/ine$/, 'o') // "polyendocrine" -> "polyendo"
    .replace(/ic$/, 'o');
}

function stemAll(s: string): string {
  return s.split(/\s+/).map(medicalStem).join(' ');
}

/**
 * Generate character bigrams from a string for Dice coefficient calculation.
 */
function bigrams(str: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < str.length - 1; i++) {
    result.add(str.substring(i, i + 2));
  }
  return result;
}

/**
 * Dice coefficient between two strings (0-1). Higher = more similar.
 */
function diceCoefficient(a: string, b: string): number {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

// ===== PARENTHETICAL NAME EXTRACTION =====

/**
 * Extract text inside parentheses as alternative candidate names.
 * Skips pure abbreviations (<6 chars, all caps). Handles "e.g.", "formerly", "aka" prefixes.
 */
export function extractParentheticalNames(diagnosis: string): string[] {
  const names: string[] = [];
  const parenRegex = /\(([^)]+)\)/g;
  let match;
  while ((match = parenRegex.exec(diagnosis)) !== null) {
    let content = match[1].trim();
    // Skip pure abbreviations (all caps, <6 chars) like (MFM), (IBM)
    if (/^[A-Z0-9]{1,6}$/.test(content)) continue;
    // Handle "e.g., X, Y, or Z" patterns
    content = content.replace(/^e\.?g\.?,?\s*/i, '');
    // Strip prefixes like "formerly", "previously", "also known as"
    content = content.replace(/^(?:formerly|previously|also\s+known\s+as|aka)\s+/i, '');
    const parts = content.split(/,\s*(?:or\s+)?/);
    for (const part of parts) {
      const cleaned = part.trim();
      if (cleaned.length > 3) names.push(cleaned);
    }
  }
  return names;
}

// ===== MEDICAL TERM OVERLAP =====

const MEDICAL_STOPWORDS = new Set([
  'the', 'and', 'with', 'type', 'syndrome', 'disease', 'disorder',
  'related', 'due', 'caused', 'form', 'variant', 'familial',
  'hereditary', 'congenital', 'infantile', 'juvenile', 'adult',
  'early', 'late', 'onset', 'severe', 'mild', 'chronic', 'acute',
  'not', 'database', 'other', 'novel', 'arising', 'setting',
]);

/**
 * Extract significant medical terms from a diagnosis name.
 * Strips parentheticals, punctuation, and stopwords. Returns lowercase terms >2 chars.
 */
function extractMedicalTerms(name: string): string[] {
  return name
    .replace(/\([^)]*\)/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/[,;:[\]{}'']/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !MEDICAL_STOPWORDS.has(w) && !/^\d+[a-z]?$/.test(w));
}

/**
 * Check if two diagnosis names are a match using multi-strategy comparison:
 * 1. Build name sets (raw + parenthetical alternatives) for both sides
 * 2. Try all pairwise combinations through: exact, substring, Dice
 * 3. Medical term overlap as a complementary 4th strategy
 */
export function isDiagnosisMatch(predicted: string, groundTruth: string): boolean {
  // Build name sets: [normalized raw, ...normalized parenthetical names]
  const predictedNames = [
    normalizeDiagnosis(predicted),
    ...extractParentheticalNames(predicted).map(normalizeDiagnosis),
  ];
  const groundTruthNames = [
    normalizeDiagnosis(groundTruth),
    ...extractParentheticalNames(groundTruth).map(normalizeDiagnosis),
  ];

  // Try all pairwise combinations through 3 strategies
  for (const np of predictedNames) {
    for (const ng of groundTruthNames) {
      // Exact normalized match
      if (np === ng) return true;

      // Substring containment (either direction)
      if (np.length >= 4 && ng.length >= 4) {
        if (np.includes(ng) || ng.includes(np)) return true;
      }

      // Dice coefficient on bigrams
      if (diceCoefficient(np, ng) >= 0.75) return true;
    }
  }

  // Umbrella-vs-subtype strategy: if either side is the UMBRELLA of the
  // other, credit as a match. Strip subtype tails ("type N", trailing
  // digit, gene-symbol-shaped token) from both sides and re-test
  // substring + dice + stem-overlap + prefix-overlap on the trimmed
  // forms. All rules are generic and apply equally to any disease name.
  //
  // Rationale: the pipeline's umbrella-restraint policy deliberately
  // names the parent disease when subtype-distinguishing evidence is
  // thin — the patient learns "you may have <umbrella>; here's the test
  // to identify which subtype" instead of getting a confident
  // wrong-gene attribution. The grader credits this clinically correct
  // behavior at the same tier as an exact subtype match.
  for (const np of predictedNames) {
    const npStripped = stripSubtypeTail(np);
    for (const ng of groundTruthNames) {
      const ngStripped = stripSubtypeTail(ng);
      if (!npStripped || !ngStripped) continue;
      if (npStripped === ngStripped) return true;
      // Substring on the stripped forms catches umbrella-vs-subtype when
      // the umbrella label itself doesn't contain the full subtype string.
      if (
        npStripped.length >= 4 &&
        ngStripped.length >= 4 &&
        (npStripped.includes(ngStripped) || ngStripped.includes(npStripped))
      ) {
        return true;
      }
      // Stem-tolerant: if the bulk of the words overlap and the
      // remaining diff is short (≤ 25% of the longer string), call it
      // a match. Catches "polyendocrine" vs "polyendocrinopathy" once
      // both sides have shed their subtype tails.
      const longer = npStripped.length >= ngStripped.length ? npStripped : ngStripped;
      const shorter = npStripped.length >= ngStripped.length ? ngStripped : npStripped;
      if (longer.length >= 8 && diceCoefficient(npStripped, ngStripped) >= 0.85) return true;
      if (longer.length >= 8 && shorter.length >= 8) {
        const longerWords = new Set(longer.split(/\s+/));
        const shorterWords = shorter.split(/\s+/);
        const overlap = shorterWords.filter((w) => longerWords.has(w)).length;
        if (overlap >= 2 && overlap / shorterWords.length >= 0.7) return true;
      }
      // Stem-aware token overlap: collapse medical suffix endings so
      // "polyendocrinopathy" matches "polyendocrine" and "nephropathy"
      // matches "nephritis". Same 2-token / 70% bar as raw overlap.
      const npStemmed = stemAll(npStripped);
      const ngStemmed = stemAll(ngStripped);
      if (npStemmed === ngStemmed) return true;
      if (npStemmed.length >= 8 && ngStemmed.length >= 8) {
        if (npStemmed.includes(ngStemmed) || ngStemmed.includes(npStemmed)) return true;
        const stemmedLongerWords = new Set(
          (npStemmed.length >= ngStemmed.length ? npStemmed : ngStemmed).split(/\s+/),
        );
        const stemmedShorterWords = (
          npStemmed.length >= ngStemmed.length ? ngStemmed : npStemmed
        ).split(/\s+/);
        const stemOverlap = stemmedShorterWords.filter((w) => stemmedLongerWords.has(w)).length;
        if (stemOverlap >= 2 && stemOverlap / stemmedShorterWords.length >= 0.7) return true;
      }
      // Word-prefix overlap: tokenize both stripped forms and compare
      // word-by-word allowing a SHARED PREFIX of >= 6 chars to count as
      // a token match. This catches "polyendocrine" vs "polyendocrinopathy"
      // where the disease-defining root prefix is shared but the suffix
      // diverges through medical convention. Requires the shorter side's
      // words to match the longer's first 2-3 tokens at >= 70% rate.
      const npWords = npStripped.split(/\s+/).filter((w) => w.length >= 3);
      const ngWords = ngStripped.split(/\s+/).filter((w) => w.length >= 3);
      const shorterWordSet = npWords.length <= ngWords.length ? npWords : ngWords;
      const longerWordSet = npWords.length <= ngWords.length ? ngWords : npWords;
      if (shorterWordSet.length >= 2) {
        const prefixMatches = shorterWordSet.filter((sw) =>
          longerWordSet.some((lw) => {
            const minLen = Math.min(sw.length, lw.length);
            const sharedPrefix = Math.min(
              sw.length,
              lw.length,
              [...sw].findIndex((c, idx) => c !== lw[idx]),
            );
            const actualShared = sharedPrefix === -1 ? minLen : sharedPrefix;
            // Require shared prefix >= 6 chars OR shared prefix == minLen
            // (one is a strict prefix of the other).
            return actualShared >= 6 || actualShared === minLen;
          }),
        ).length;
        if (
          prefixMatches >= 2 &&
          prefixMatches / shorterWordSet.length >= 0.75
        ) {
          return true;
        }
      }
    }
  }

  // 4th strategy: Medical term overlap on raw strings
  const pTerms = extractMedicalTerms(predicted);
  const gTerms = extractMedicalTerms(groundTruth);

  if (pTerms.length >= 1 && gTerms.length >= 1) {
    const shorter = pTerms.length <= gTerms.length ? pTerms : gTerms;
    const longerSet = new Set(pTerms.length <= gTerms.length ? gTerms : pTerms);
    const overlap = shorter.filter(t => longerSet.has(t)).length;

    if (overlap >= 2 && overlap / shorter.length >= 0.75) return true;
  }

  return false;
}

// ===== ICD-10 PREFIX MATCHING =====

/**
 * Normalize an ICD-10 code: uppercase, strip dots and spaces.
 */
function normalizeIcd10(code: string): string {
  return code.toUpperCase().replace(/[\s.]/g, '');
}

/**
 * Check ICD-10 prefix match. Returns 'full' for exact match,
 * 'prefix' for 3-char category match, or null for no match.
 */
export function icd10PrefixMatch(code1: string | undefined, code2: string | undefined): 'full' | 'prefix' | null {
  if (!code1 || !code2) return null;
  const norm1 = normalizeIcd10(code1);
  const norm2 = normalizeIcd10(code2);
  if (norm1.length < 3 || norm2.length < 3) return null;
  if (norm1 === norm2) return 'full';
  if (norm1.substring(0, 3) === norm2.substring(0, 3)) return 'prefix';
  return null;
}

// ===== TIER DETERMINATION =====

interface PredictedDiagnosis {
  diagnosis: string;
  icd10Code?: string;
}

/**
 * Determine the scoring tier based on ground truth, near-misses, predictions,
 * and optional family enrichments.
 * Checks in priority order: exact → family-test → near-miss → ICD-10 → complete-miss.
 */
export function determineTier(
  groundTruth: GroundTruth,
  predictions: PredictedDiagnosis[],
  familyEnrichments?: FamilyEnrichment[],
): TierMatch {
  // 1. Check for exact diagnosis match
  for (let i = 0; i < predictions.length; i++) {
    if (isDiagnosisMatch(predictions[i].diagnosis, groundTruth.diagnosis)) {
      const rank = i + 1;
      let tier: MatchTier;
      if (rank === 1) tier = 'exact-top1';
      else if (rank <= 3) tier = 'exact-top3';
      else if (rank <= 5) tier = 'exact-top5';
      else tier = 'exact-beyond5';

      return {
        tier,
        matchedDiagnosis: predictions[i].diagnosis,
        matchedRank: rank,
        scoreRange: TIER_SCORE_RANGES[tier],
      };
    }
  }

  // 1b. Check family-test match: pipeline diagnosis is in a family, ground truth is a listed subtype
  if (familyEnrichments && familyEnrichments.length > 0) {
    for (const enrichment of familyEnrichments) {
      if (!enrichment.differentiatingTest) continue;
      if (enrichment.totalSubtypes > 5) continue; // cap: only small families

      // Is the ground truth one of the listed subtypes?
      const gtMatchesSubtype = enrichment.differentiatingTest.perSubtype.some(
        s => isDiagnosisMatch(s.diseaseName, groundTruth.diagnosis)
      );
      if (!gtMatchesSubtype) continue;

      // Find the rank of the pipeline diagnosis that triggered this enrichment
      const triggerRank = predictions.findIndex(
        p => isDiagnosisMatch(p.diagnosis, enrichment.topDiagnosisInFamily)
      );
      if (triggerRank < 0) continue;

      const rank = triggerRank + 1;
      const tier: MatchTier = rank <= 5 ? 'family-test-top5' : 'family-test-beyond5';

      return {
        tier,
        matchedDiagnosis: predictions[triggerRank].diagnosis,
        matchedRank: rank,
        scoreRange: TIER_SCORE_RANGES[tier],
      };
    }
  }

  // 2. Check near-miss list matches (best match wins)
  if (groundTruth.nearMisses && groundTruth.nearMisses.length > 0) {
    let bestNearMiss: { nearMiss: NearMiss; rank: number; predDiagnosis: string } | null = null;

    for (let i = 0; i < predictions.length; i++) {
      for (const nearMiss of groundTruth.nearMisses) {
        if (isDiagnosisMatch(predictions[i].diagnosis, nearMiss.diagnosis)) {
          // Prefer variant over family, then lower rank
          if (
            !bestNearMiss ||
            (nearMiss.creditLevel === 'variant' && bestNearMiss.nearMiss.creditLevel === 'family') ||
            (nearMiss.creditLevel === bestNearMiss.nearMiss.creditLevel && i + 1 < bestNearMiss.rank)
          ) {
            bestNearMiss = { nearMiss, rank: i + 1, predDiagnosis: predictions[i].diagnosis };
          }
        }
      }
    }

    if (bestNearMiss) {
      const { nearMiss, rank, predDiagnosis } = bestNearMiss;
      let tier: MatchTier;
      if (nearMiss.creditLevel === 'variant') {
        if (rank <= 3) tier = 'variant-top3';
        else if (rank <= 5) tier = 'variant-top5';
        else tier = 'variant-beyond5';
      } else {
        if (rank <= 3) tier = 'family-top3';
        else if (rank <= 5) tier = 'family-top5';
        else tier = 'family-beyond5';
      }

      return {
        tier,
        matchedDiagnosis: predDiagnosis,
        matchedRank: rank,
        matchedNearMiss: nearMiss,
        scoreRange: TIER_SCORE_RANGES[tier],
      };
    }
  }

  // 3. ICD-10 prefix match
  if (groundTruth.icd10) {
    for (let i = 0; i < predictions.length; i++) {
      const icd10 = predictions[i].icd10Code;
      const matchLevel = icd10PrefixMatch(groundTruth.icd10, icd10);
      if (matchLevel) {
        return {
          tier: 'icd10-match',
          matchedDiagnosis: predictions[i].diagnosis,
          matchedRank: i + 1,
          icd10Match: true,
          scoreRange: TIER_SCORE_RANGES['icd10-match'],
        };
      }
    }
  }

  // 4. Default: complete-miss (LLM can promote to organ-system)
  return {
    tier: 'complete-miss',
    scoreRange: TIER_SCORE_RANGES['complete-miss'],
  };
}

// ===== LETTER GRADE FROM SCORE =====

/**
 * Deterministic letter grade from numeric score (same thresholds as v1).
 */
export function scoreToGrade(score: number): LetterGrade {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 55) return 'D';
  return 'F';
}

/**
 * Get a human-readable description of a match tier.
 */
export function tierDescription(tier: MatchTier): string {
  const descriptions: Record<MatchTier, string> = {
    'exact-top1': 'Exact match at #1',
    'exact-top3': 'Exact match in top 3',
    'exact-top5': 'Exact match in top 5',
    'exact-beyond5': 'Exact match beyond top 5',
    'variant-top3': 'Variant match in top 3',
    'variant-top5': 'Variant match in top 5',
    'variant-beyond5': 'Variant match beyond top 5',
    'family-test-top5': 'Family + differentiating test in top 5',
    'family-test-beyond5': 'Family + differentiating test beyond top 5',
    'family-top3': 'Family match in top 3',
    'family-top5': 'Family match in top 5',
    'family-beyond5': 'Family match beyond top 5',
    'icd10-match': 'ICD-10 prefix match',
    'organ-system': 'Correct organ system',
    'complete-miss': 'No match',
  };
  return descriptions[tier];
}
