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
  // Normalize punctuation: hyphens to spaces, strip other punct
  normalized = normalized.replace(/-/g, ' ');
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  // Split into words, remove stop words, rejoin
  const words = normalized.split(/\s+/).filter(w => w.length > 0 && !STOP_WORDS.has(w));
  return words.join(' ');
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
