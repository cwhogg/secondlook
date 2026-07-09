/**
 * v17 Stage 3 — deterministic dedup + name normalization.
 *
 * Pure, no LLM call. Groups specialist-emitted hypotheses by canonical disease
 * name and merges per-field by union, never by replacement. Zero info loss is
 * the invariant: every (specialty, evidence-finding) pair present in the input
 * is represented as at least one attribution in the output.
 *
 * Canonical-name selection is tiered:
 *   1. KB-anchored — if any variant resolves to a KB DiseaseProfile via
 *      findDiseaseByName, use that profile's `.name` field. KB names are
 *      curated and authoritative.
 *   2. Specialist consensus — the variant proposed by the most specialists.
 *      Wisdom of crowds: if 3 say "Marfan syndrome" and 1 says
 *      "Marfan syndrome 1 (FBN1)", canonical = "Marfan syndrome".
 *   3. Shortest variant — final tiebreaker. Biases toward the umbrella term,
 *      NOT toward the most specific. Avoids locking the differential into a
 *      wrong subtype when only one specialist proposed a verbose name.
 */
import type { DiagnosisHypothesis, EvidenceItem } from '../types';
import { findDiseaseByName } from '../knowledge';

// Specialist-emitted hypothesis (input to dedup). Carries the specialty that
// emitted it so we can preserve attribution through merge.
export interface SpecialistV17Hypothesis extends DiagnosisHypothesis {
  emittedBySpecialty: string;
}

export interface DedupStatsGroup {
  canonical: string;
  variants: string[];
  contributingSpecialists: string[];
  evidenceItemsContributed: number;
  matchPath: 'exact-normalized' | 'substring' | 'alias-map' | 'kb-anchored';
  canonicalChosenBy: 'kb-anchor' | 'specialist-consensus' | 'shortest';
}

export interface DedupStats {
  inputCount: number;
  outputCount: number;
  evidenceItemsInput: number;
  evidenceItemsOutput: number;
  attributionsOutput: number;
  validationPassed: boolean;
  groups: DedupStatsGroup[];
  unmatched: Array<{ diagnosis: string; specialty: string }>;
  suspiciousPairs: Array<{ a: string; b: string; editDistance: number; reason: 'below-threshold' | 'different-tokens' }>;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function namesMatch(a: string, b: string): { match: boolean; path: 'exact-normalized' | 'substring' | null } {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return { match: true, path: 'exact-normalized' };
  // Length floor avoids matching short tokens like "ad" against any string containing "ad".
  if (na.length >= 12 && nb.length >= 12 && (na.includes(nb) || nb.includes(na))) {
    return { match: true, path: 'substring' };
  }
  return { match: false, path: null };
}

function evidenceItemCount(h: DiagnosisHypothesis): number {
  return (h.supportingEvidence?.length || 0)
    + (h.contradictoryEvidence?.length || 0)
    + (h.diagnosticTests?.length || 0)
    + (h.cardinalFeatures?.length || 0)
    + (h.ruleOutFeatures?.length || 0);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function pickCanonicalName(variants: string[]): { canonical: string; chosenBy: 'kb-anchor' | 'specialist-consensus' | 'shortest' } {
  const baseResult = pickBaseCanonicalName(variants);
  // Preserve a shared clinical modifier (post-COVID onset, late-onset,
  // fulfilling ICC criteria, etc.) when ALL parenthetical-carrying variants
  // agree on it. Divergent parentheticals fall through — umbrella-safety
  // wins there, consistent with the tier-3 shortest bias. Consensus
  // parentheticals get preserved because the specialists' shared modifier
  // carries clinical weight (etiology, timing, criteria).
  const modifier = extractConsensusModifier(variants);
  if (modifier && !baseResult.canonical.toLowerCase().includes(modifier.toLowerCase())) {
    return { canonical: `${baseResult.canonical} (${modifier})`, chosenBy: baseResult.chosenBy };
  }
  return baseResult;
}

function pickBaseCanonicalName(variants: string[]): { canonical: string; chosenBy: 'kb-anchor' | 'specialist-consensus' | 'shortest' } {
  // Tier 1: KB-anchored — first variant that resolves to a KB profile wins.
  for (const v of variants) {
    const profile = findDiseaseByName(v);
    if (profile) return { canonical: profile.name, chosenBy: 'kb-anchor' };
  }
  // Tier 2: specialist consensus — most-common variant among proposers.
  const counts = new Map<string, number>();
  for (const v of variants) counts.set(v, (counts.get(v) || 0) + 1);
  let maxCount = 0;
  for (const c of counts.values()) if (c > maxCount) maxCount = c;
  const mostCommon = [...counts.entries()].filter(([, c]) => c === maxCount).map(([v]) => v);
  if (mostCommon.length === 1) return { canonical: mostCommon[0], chosenBy: 'specialist-consensus' };
  // Tier 3: shortest variant — bias toward umbrella term.
  const shortest = mostCommon.reduce((a, b) => a.length <= b.length ? a : b);
  return { canonical: shortest, chosenBy: 'shortest' };
}

/**
 * Extract a shared clinical modifier that ALL parenthetical-carrying variants
 * agree on. Returns the original casing of the modifier text, or null if the
 * variants disagree or nothing qualifies.
 *
 * Skips pure abbreviations, gene-symbol tokens, and subtype-number markers,
 * which the tiered canonical logic handles correctly and shouldn't get glued
 * back on. Everything else (etiology, timing, criteria refs, phenotype
 * qualifiers) counts as a preservable modifier.
 */
function extractConsensusModifier(variants: string[]): string | null {
  const perVariantMods: string[][] = [];
  let anyVariantHasParen = false;
  for (const v of variants) {
    const mods: string[] = [];
    const matches = [...v.matchAll(/\(([^)]+)\)/g)];
    if (matches.length > 0) anyVariantHasParen = true;
    for (const m of matches) {
      const content = m[1].trim();
      // Skip pure abbreviations (FBN1, PKAN, MFM).
      if (/^[A-Z0-9]{1,6}$/.test(content)) continue;
      // Skip subtype markers ("type 1", "subtype A").
      if (/^(?:type|subtype)\s+(?:\d+|[a-z])\s*$/i.test(content)) continue;
      // Skip very short content — likely noise.
      if (content.length <= 3) continue;
      mods.push(content);
    }
    perVariantMods.push(mods);
  }
  if (!anyVariantHasParen) return null;
  // A variant without parens counts as "does not disagree" — the modifier is
  // preserved as long as every variant that HAS a preservable paren agrees.
  const carrying = perVariantMods.filter((mods) => mods.length > 0);
  if (carrying.length === 0) return null;
  // Each carrying variant should offer the SAME single modifier for consensus.
  const first = carrying[0];
  if (first.length !== 1) return null;
  const target = first[0].toLowerCase().trim();
  for (const mods of carrying) {
    if (mods.length !== 1) return null;
    if (mods[0].toLowerCase().trim() !== target) return null;
  }
  return first[0];
}

function mergeEvidenceItems(itemArrs: Array<{ items: EvidenceItem[]; specialty: string }>): EvidenceItem[] {
  const map = new Map<string, EvidenceItem>();
  const strengthRank: Record<EvidenceItem['strength'], number> = { weak: 0, moderate: 1, strong: 2 };
  for (const { items, specialty } of itemArrs) {
    for (const raw of items || []) {
      const key = (raw.finding || '').toLowerCase().trim();
      if (!key) continue;
      const attribTag = raw.attributedTo || specialty;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...raw, attributedTo: attribTag });
      } else {
        // Merge attribution as comma-separated unique list.
        const prevAttrs = (existing.attributedTo || '').split(', ').filter(Boolean);
        const newAttrs = attribTag.split(', ').filter(Boolean);
        const allAttrs = Array.from(new Set([...prevAttrs, ...newAttrs]));
        existing.attributedTo = allAttrs.join(', ');
        // Take the strongest strength reported.
        if (strengthRank[raw.strength] > strengthRank[existing.strength]) {
          existing.strength = raw.strength;
        }
      }
    }
  }
  return [...map.values()];
}

function mergeStringList(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const arr of lists) {
    for (const s of arr || []) {
      const key = s.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

function countAttributions(items: EvidenceItem[]): number {
  let total = 0;
  for (const it of items) {
    if (it.attributedTo) total += it.attributedTo.split(', ').filter(Boolean).length;
    else total += 1; // unattributed counts as one
  }
  return total;
}

export function dedupAndNormalizeHypotheses(
  pool: SpecialistV17Hypothesis[],
): { merged: DiagnosisHypothesis[]; stats: DedupStats } {
  if (!pool.length) {
    return {
      merged: [],
      stats: {
        inputCount: 0, outputCount: 0,
        evidenceItemsInput: 0, evidenceItemsOutput: 0, attributionsOutput: 0,
        validationPassed: true,
        groups: [], unmatched: [], suspiciousPairs: [],
      },
    };
  }

  // Build groups via iterative merge. Each hypothesis is placed into the first
  // existing group with at least one matching member, or creates a new group.
  type Group = { members: SpecialistV17Hypothesis[]; matchPath: 'exact-normalized' | 'substring' | 'alias-map' | 'kb-anchored' };
  const groups: Group[] = [];
  for (const h of pool) {
    let placed = false;
    for (const g of groups) {
      for (const m of g.members) {
        const { match, path } = namesMatch(h.diagnosis, m.diagnosis);
        if (match) {
          g.members.push(h);
          if (path === 'substring' && g.matchPath === 'exact-normalized') g.matchPath = 'substring';
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) groups.push({ members: [h], matchPath: 'exact-normalized' });
  }

  // Build merged hypothesis per group.
  const merged: DiagnosisHypothesis[] = [];
  const statsGroups: DedupStatsGroup[] = [];
  for (const g of groups) {
    const variants = g.members.map((m) => m.diagnosis);
    const { canonical, chosenBy } = pickCanonicalName(variants);
    const contributingSpecialists = Array.from(new Set(g.members.map((m) => m.emittedBySpecialty)));

    // Representative: the member with the highest confidenceScore. Non-array
    // fields (icd10Code, prevalence, typicalPresentation, etc.) come from this
    // entry. Arrays are merged below.
    const rep = [...g.members].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))[0];

    const supportingMerged = mergeEvidenceItems(
      g.members.map((m) => ({ items: m.supportingEvidence || [], specialty: m.emittedBySpecialty })),
    );
    const contraMerged = mergeEvidenceItems(
      g.members.map((m) => ({ items: m.contradictoryEvidence || [], specialty: m.emittedBySpecialty })),
    );
    const testsMerged = mergeStringList(g.members.map((m) => m.diagnosticTests || []));
    const cardinalMerged = mergeStringList(g.members.map((m) => m.cardinalFeatures || []));
    const ruleOutMerged = mergeStringList(g.members.map((m) => m.ruleOutFeatures || []));

    // Union of clarifying-question candidates across all specialists that proposed
    // this diagnosis, deduped by normalized question text.
    const seenQuestionKeys = new Set<string>();
    const clarifyingQuestionCandidates: NonNullable<DiagnosisHypothesis['clarifyingQuestionCandidates']> = [];
    for (const m of g.members) {
      for (const q of m.clarifyingQuestionCandidates || []) {
        const key = (q.question || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (!key || seenQuestionKeys.has(key)) continue;
        seenQuestionKeys.add(key);
        clarifyingQuestionCandidates.push(q);
      }
    }

    // domainConfidenceMap — every contributing specialist's confidence preserved.
    const domainConfidenceMap: Record<string, number> = {};
    for (const m of g.members) {
      // Carry forward any pre-existing map (e.g., from upstream merge).
      if (m.domainConfidenceMap) {
        for (const [k, v] of Object.entries(m.domainConfidenceMap)) {
          if (domainConfidenceMap[k] == null || v > domainConfidenceMap[k]) {
            domainConfidenceMap[k] = v;
          }
        }
      }
      // Plus this member's own specialty.
      if (m.emittedBySpecialty != null && m.confidenceScore != null) {
        const existing = domainConfidenceMap[m.emittedBySpecialty];
        if (existing == null || m.confidenceScore > existing) {
          domainConfidenceMap[m.emittedBySpecialty] = m.confidenceScore;
        }
      }
    }

    // Concatenate clinical reasoning prefixed with specialty name.
    const reasoningMerged = g.members
      .map((m) => {
        const r = (m.clinicalReasoning || '').trim();
        return r ? `${m.emittedBySpecialty}: ${r}` : '';
      })
      .filter(Boolean)
      .join('\n');

    // KB-match is true if any contributing specialist marked KB-match OR if the
    // canonical-name selection found a KB profile.
    const knowledgeBaseMatch = g.members.some((m) => m.knowledgeBaseMatch) || chosenBy === 'kb-anchor';
    const evaluationType: 'criteria-grounded' | 'reasoning-evaluated' =
      knowledgeBaseMatch ? 'criteria-grounded' : 'reasoning-evaluated';

    const sourceAgents = contributingSpecialists;

    merged.push({
      ...rep,
      diagnosis: canonical,
      confidenceScore: Math.max(...g.members.map((m) => m.confidenceScore || 0)),
      evidenceScore: Math.max(...g.members.map((m) => m.evidenceScore || 0)),
      supportingEvidence: supportingMerged,
      contradictoryEvidence: contraMerged,
      diagnosticTests: testsMerged.length ? testsMerged : undefined,
      cardinalFeatures: cardinalMerged.length ? cardinalMerged : undefined,
      ruleOutFeatures: ruleOutMerged.length ? ruleOutMerged : undefined,
      clarifyingQuestionCandidates: clarifyingQuestionCandidates.length ? clarifyingQuestionCandidates : undefined,
      domainConfidenceMap: Object.keys(domainConfidenceMap).length ? domainConfidenceMap : undefined,
      nameVariants: variants.length > 1 ? Array.from(new Set(variants)) : undefined,
      clinicalReasoning: reasoningMerged || rep.clinicalReasoning,
      sourceAgent: sourceAgents.join(', '),
      sourceAgents,
      knowledgeBaseMatch,
      evaluationType,
    });

    statsGroups.push({
      canonical,
      variants: Array.from(new Set(variants)),
      contributingSpecialists,
      evidenceItemsContributed: supportingMerged.length + contraMerged.length + testsMerged.length + cardinalMerged.length + ruleOutMerged.length,
      matchPath: chosenBy === 'kb-anchor' ? 'kb-anchored' : g.matchPath,
      canonicalChosenBy: chosenBy,
    });
  }

  // Suspicious-pair detection: textually close cross-group pairs that didn't
  // merge. Surfaces potential under-merging (Risk 3) for offline inspection.
  const suspiciousPairs: DedupStats['suspiciousPairs'] = [];
  const groupReps = groups.map((g) => g.members[0].diagnosis);
  for (let i = 0; i < groupReps.length; i++) {
    for (let j = i + 1; j < groupReps.length; j++) {
      const a = groupReps[i];
      const b = groupReps[j];
      const na = normalize(a);
      const nb = normalize(b);
      const d = levenshtein(na, nb);
      const ratio = d / Math.max(na.length, nb.length, 1);
      // Threshold tuned for "looks suspiciously similar but didn't merge".
      // ratio < 0.3 and absolute distance < 8 catches things like
      // "marfan syndrome" vs "marfan-syndrome-1" but not "lupus" vs "lyme".
      if (ratio < 0.3 && d < 8 && d > 0) {
        suspiciousPairs.push({ a, b, editDistance: d, reason: 'below-threshold' });
      }
    }
  }

  // Unmatched: single-member groups. Not necessarily a problem (most cases
  // produce a long tail of unique hypotheses), but useful telemetry.
  const unmatched = groups
    .filter((g) => g.members.length === 1)
    .map((g) => ({ diagnosis: g.members[0].diagnosis, specialty: g.members[0].emittedBySpecialty }));

  const evidenceItemsInput = pool.reduce((sum, h) => sum + evidenceItemCount(h), 0);
  const evidenceItemsOutput = merged.reduce((sum, h) => sum + evidenceItemCount(h), 0);
  const attributionsOutput = merged.reduce(
    (sum, h) => sum + countAttributions(h.supportingEvidence || []) + countAttributions(h.contradictoryEvidence || []),
    0,
  );

  // Validation: every (specialty, evidence-finding) attribution from input must
  // be represented in output. We approximate this via attribution count:
  // attributionsOutput should be >= the number of evidence items in input that
  // had specialty attribution available. Since every specialist-emitted item
  // has attribution = its specialty, the count of input evidence items is the
  // floor.
  const inputAttributionFloor = pool.reduce(
    (sum, h) => sum + (h.supportingEvidence?.length || 0) + (h.contradictoryEvidence?.length || 0),
    0,
  );
  const validationPassed = attributionsOutput >= inputAttributionFloor;

  return {
    merged,
    stats: {
      inputCount: pool.length,
      outputCount: merged.length,
      evidenceItemsInput,
      evidenceItemsOutput,
      attributionsOutput,
      validationPassed,
      groups: statsGroups,
      unmatched,
      suspiciousPairs,
    },
  };
}
