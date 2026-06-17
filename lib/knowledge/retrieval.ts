import { DiseaseProfile, DiseaseMatch, BodySystem, SymptomFrequency, SymptomMatch } from '../types/knowledge-base';
import { MappedSymptom, Demographics } from '../types';
import { loadDiseaseDatabase } from './index';
import {
  EmbeddingVector,
  EmbeddedSymptom,
  generateEmbeddings,
  cosineSimilarity,
  classifyMatch,
} from './embeddings';
import fs from 'fs';
import path from 'path';

// Tier weights for symptom matching
const TIER_WEIGHTS = {
  pathognomonic: 4.0,
  common: 2.0,
  occasional: 1.0,
  rare: 0.5,
};

// Score component weights
const SCORE_WEIGHTS = {
  symptom: 0.40,
  system: 0.20,
  demographic: 0.15,
  prevalence: 0.10,
  bm25: 0.15, // v22: BM25 lexical match — catches rare disease names, eponyms, gene symbols
};

// ===== EMBEDDINGS INDEX (binary format) =====

interface EmbeddingsMeta {
  model: string;
  dimensions: number;
  diseases: Record<string, Array<{
    symptomName: string;
    tier: string;
    vectorIndex: number;
  }>>;
}

interface EmbeddingsIndex {
  meta: EmbeddingsMeta;
  vectors: Float32Array;
}

let embeddingsIndex: EmbeddingsIndex | null = null;

function getVector(index: EmbeddingsIndex, vectorIndex: number): EmbeddingVector {
  const dims = index.meta.dimensions;
  const offset = vectorIndex * dims;
  return Array.from(index.vectors.subarray(offset, offset + dims));
}

function loadEmbeddingsIndex(): EmbeddingsIndex | null {
  if (embeddingsIndex) return embeddingsIndex;

  const metaPath = path.join(process.cwd(), 'lib', 'knowledge', 'embeddings-meta.json');
  const vectorsPath = path.join(process.cwd(), 'lib', 'knowledge', 'embeddings-vectors.bin');

  if (!fs.existsSync(metaPath) || !fs.existsSync(vectorsPath)) {
    console.warn('[Retrieval] Embeddings index not found. Falling back to string matching.');
    return null;
  }

  try {
    const metaContent = fs.readFileSync(metaPath, 'utf-8');
    const meta: EmbeddingsMeta = JSON.parse(metaContent);
    const vectorBuffer = fs.readFileSync(vectorsPath);
    const vectors = new Float32Array(vectorBuffer.buffer, vectorBuffer.byteOffset, vectorBuffer.byteLength / 4);

    embeddingsIndex = { meta, vectors };
    console.log(`[Retrieval] Loaded embeddings index: ${Object.keys(meta.diseases).length} diseases, ${meta.dimensions}d vectors`);
    return embeddingsIndex;
  } catch (err) {
    console.warn('[Retrieval] Failed to load embeddings index:', err);
    return null;
  }
}

// ===== UPSTASH VECTOR (v23, optional) =====
// When UPSTASH_VECTOR_REST_URL is set, replace the local-index semantic path
// with a Upstash Vector query. Each patient symptom embedding queries Upstash
// for top-K nearest disease-symptom vectors; results aggregate per disease with
// tier weights matching the local-index path.
//
// Fallback chain at retrieval time: Upstash → local-index → string-matching.

interface UpstashMatchedSymptom {
  symptomName: string;
  tier: string;
  score: number; // cosine similarity, ~[0, 1] for OpenAI embeddings
  patientTerm: string;
}

interface UpstashAggregated {
  // For each disease: per-symptom best-match score (across all patient symptoms),
  // grouped by tier. Used by scoreDisease for tier-weighted aggregation.
  diseaseScores: Map<string, Map<string, { score: number; symptomName: string; patientTerm: string }>>;
}

function isUpstashConfigured(): boolean {
  return !!(process.env.UPSTASH_VECTOR_REST_URL && process.env.UPSTASH_VECTOR_REST_TOKEN);
}

// v24: raised 200 → 350. v23.1's 200 over-corrected from v23's 500 — depth
// metrics (Top-5/10 VARIANT/FAMILY/ANY) regressed 5-7pp vs v20. 350 splits the
// difference, restoring some breadth without re-introducing the v23-era
// semantic-neighbor flood that out-ranked correct top-1 candidates.
const UPSTASH_TOP_K = 350;

async function queryUpstashOnce(vector: number[]): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) return [];
  try {
    const resp = await fetch(`${url}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, topK: UPSTASH_TOP_K, includeMetadata: true }),
    });
    if (!resp.ok) {
      console.warn(`[Retrieval] Upstash query failed: HTTP ${resp.status}`);
      return [];
    }
    const body = await resp.json();
    return body.result || [];
  } catch (err) {
    console.warn(`[Retrieval] Upstash query exception:`, err);
    return [];
  }
}

async function buildUpstashAggregated(
  symptoms: MappedSymptom[],
  patientEmbeddings: Map<string, EmbeddingVector>,
): Promise<UpstashAggregated> {
  const diseaseScores: UpstashAggregated['diseaseScores'] = new Map();
  if (patientEmbeddings.size === 0) return { diseaseScores };

  // Build query list: one query per unique (patient term, embedding) pair.
  const queries: Array<{ term: string; vector: number[] }> = [];
  for (const [term, vec] of patientEmbeddings) {
    queries.push({ term, vector: vec });
  }

  // Parallel Upstash queries (Upstash free tier handles ~10/sec comfortably).
  const PARALLEL = 6;
  const allResults: Array<{ query: { term: string; vector: number[] }; results: Awaited<ReturnType<typeof queryUpstashOnce>> }> = [];
  for (let i = 0; i < queries.length; i += PARALLEL) {
    const batch = queries.slice(i, i + PARALLEL);
    const batchResults = await Promise.all(batch.map(async (q) => ({ query: q, results: await queryUpstashOnce(q.vector) })));
    allResults.push(...batchResults);
  }

  // Aggregate: per (disease, symptom-within-disease), keep the BEST similarity
  // score across all patient symptoms. Symptom-within-disease is identified by
  // the symptomName+tier combo so the same disease symptom doesn't get
  // double-counted across multiple patient symptoms.
  for (const { query, results } of allResults) {
    for (const r of results) {
      const diseaseId = (r.metadata?.diseaseId as string) || '';
      const tier = (r.metadata?.tier as string) || 'common';
      const symptomName = (r.metadata?.symptomName as string) || '';
      if (!diseaseId) continue;
      if (!diseaseScores.has(diseaseId)) diseaseScores.set(diseaseId, new Map());
      const diseaseMap = diseaseScores.get(diseaseId)!;
      const key = `${tier}:${symptomName}`;
      const existing = diseaseMap.get(key);
      if (!existing || r.score > existing.score) {
        diseaseMap.set(key, { score: r.score, symptomName, patientTerm: query.term });
      }
    }
  }
  console.log(`[Retrieval] Upstash query complete: ${queries.length} symptoms queried, ${diseaseScores.size} diseases matched`);
  return { diseaseScores };
}

// Score a disease's symptom-match component using the Upstash-aggregated
// per-symptom scores. Mirrors computeSymptomScoreSemantic's tier weighting but
// scores against the disease's actual KB symptom list (not just whatever
// Upstash returned — that ensures we account for the disease's full symptom
// inventory, including unmatched symptoms which lower the score).
function computeSymptomScoreFromUpstash(
  disease: DiseaseProfile,
  upstashAgg: UpstashAggregated,
): { symptomScore: number; matchedSymptoms: SymptomMatch[] } {
  const diseaseMatches = upstashAgg.diseaseScores.get(disease.id);
  if (!diseaseMatches || diseaseMatches.size === 0) {
    return { symptomScore: 0, matchedSymptoms: [] };
  }
  let totalWeight = 0;
  let matchedWeight = 0;
  const matchedSymptoms: SymptomMatch[] = [];
  for (const [tier, weight] of Object.entries(TIER_WEIGHTS)) {
    const tierSymptoms = (disease.symptoms[tier as keyof typeof disease.symptoms] || []);
    for (const s of tierSymptoms) {
      totalWeight += weight;
      const matchKey = `${tier}:${s.symptomName}`;
      const match = diseaseMatches.get(matchKey);
      if (!match) continue;
      // v24: lowered threshold 0.60 → 0.55 to widen the long tail back toward
      // v22-level coverage on Top-5/10 metrics. The matchType multiplier already
      // down-weights semantic-tier matches (0.50-0.68) by 0.4×, so admitting
      // 0.55-0.60 matches contributes to depth without dominating top-1
      // ranking. v23.1's 0.60 floor was a useful overcorrection that's no
      // longer needed once top-K is also widened to 350.
      if (match.score < 0.45) continue;
      const matchType = classifyMatch(match.score);
      if (!matchType) continue; // safety: should never trigger after explicit gate above
      const multiplier = matchType === 'exact' ? 1.0 : matchType === 'partial' ? 0.7 : 0.4;
      matchedWeight += weight * multiplier;
      matchedSymptoms.push({
        patientSymptom: match.patientTerm,
        diseaseSymptom: s,
        matchType,
      });
    }
  }
  if (totalWeight === 0) return { symptomScore: 0, matchedSymptoms };
  return { symptomScore: matchedWeight / totalWeight, matchedSymptoms };
}

// ===== BM25 LEXICAL INDEX (v22) =====
// Complements semantic retrieval by catching exact term matches that
// embeddings miss — rare disease names, eponyms (Lafora, Skraban-Deardorff),
// gene symbols (SMAD3, TGFBR2), and recently-described conditions whose
// embeddings may be stale. Built once on first use, cached for process lifetime.

interface BM25Index {
  docs: Array<{ diseaseId: string; tokens: string[] }>;
  docFreq: Map<string, number>; // term → number of docs containing it
  docLengths: number[];
  avgDocLength: number;
  idByIndex: string[]; // diseaseId at each doc position
  indexById: Map<string, number>; // reverse lookup
}

let bm25Index: BM25Index | null = null;

function bm25Tokenize(s: string): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length >= 2);
}

function buildBM25Index(db: DiseaseProfile[]): BM25Index {
  const docs: Array<{ diseaseId: string; tokens: string[] }> = [];
  const docFreq = new Map<string, number>();
  const idByIndex: string[] = [];
  const indexById = new Map<string, number>();
  for (const disease of db) {
    // Document = name + aliases + key findings + pathognomonic symptoms.
    // Deliberately narrow: NOT all symptoms, because rare-name matching is the
    // value-add. The full-symptom signal is already in the semantic path.
    const parts: string[] = [disease.name];
    if (disease.aliases) parts.push(...disease.aliases);
    const kf = disease.keyFindings;
    if (kf) {
      for (const cat of ['laboratory', 'imaging', 'genetic', 'other'] as const) {
        const items = (kf as Record<string, unknown>)[cat];
        if (Array.isArray(items)) {
          for (const f of items) {
            if (typeof f === 'string') parts.push(f);
            else if (f && typeof f === 'object') {
              const obj = f as Record<string, unknown>;
              if (typeof obj.finding === 'string') parts.push(obj.finding);
              if (typeof obj.gene === 'string') parts.push(obj.gene);
              if (typeof obj.name === 'string') parts.push(obj.name);
            }
          }
        }
      }
    }
    const patho = disease.symptoms?.pathognomonic || [];
    for (const s of patho) {
      parts.push(s.symptomName);
      if (s.searchTerms) parts.push(...s.searchTerms);
    }
    if (disease.omimId) parts.push(`omim ${disease.omimId}`);
    const tokens = bm25Tokenize(parts.filter(Boolean).join(' '));
    docs.push({ diseaseId: disease.id, tokens });
    idByIndex.push(disease.id);
    indexById.set(disease.id, docs.length - 1);
    const uniqueTokens = new Set(tokens);
    for (const t of uniqueTokens) {
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    }
  }
  const docLengths = docs.map((d) => d.tokens.length);
  const avgDocLength = docLengths.length > 0
    ? docLengths.reduce((s, n) => s + n, 0) / docLengths.length
    : 0;
  return { docs, docFreq, docLengths, avgDocLength, idByIndex, indexById };
}

function loadBM25Index(): BM25Index {
  if (bm25Index) return bm25Index;
  const db = loadDiseaseDatabase();
  bm25Index = buildBM25Index(db);
  console.log(`[Retrieval] Built BM25 index: ${db.length} diseases, avg doc length ${bm25Index.avgDocLength.toFixed(1)} tokens`);
  return bm25Index;
}

function computeAllBM25Scores(queryTokens: string[], index: BM25Index): Map<string, number> {
  // Classic Okapi BM25 — k1=1.5, b=0.75 (literature defaults).
  const k1 = 1.5;
  const b = 0.75;
  const N = index.docs.length;
  // Pre-compute query term IDFs once.
  const queryUnique = Array.from(new Set(queryTokens));
  const idfs = queryUnique.map((t) => {
    const df = index.docFreq.get(t) || 0;
    if (df === 0) return 0;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  });
  const scores = new Map<string, number>();
  let maxScore = 0;
  for (let i = 0; i < index.docs.length; i++) {
    const doc = index.docs[i];
    const docLen = index.docLengths[i];
    // Term-frequency map for this doc.
    const tf = new Map<string, number>();
    for (const t of doc.tokens) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (let j = 0; j < queryUnique.length; j++) {
      const idf = idfs[j];
      if (idf === 0) continue;
      const f = tf.get(queryUnique[j]) || 0;
      if (f === 0) continue;
      const num = f * (k1 + 1);
      const denom = f + k1 * (1 - b + (b * docLen) / (index.avgDocLength || 1));
      score += idf * (num / denom);
    }
    if (score > 0) {
      scores.set(index.idByIndex[i], score);
      if (score > maxScore) maxScore = score;
    }
  }
  // Normalize to [0,1] by dividing by the max observed score so the BM25
  // component is on the same scale as other components.
  if (maxScore > 0) {
    for (const [id, s] of scores) scores.set(id, s / maxScore);
  }
  return scores;
}

// ===== FAMILY ENUMERATION (v22) =====
// When triage retrieves a disease whose name matches `<family> <number>`
// (e.g., "Developmental and epileptic encephalopathy 4", "Coffin-Siris
// syndrome 8"), look up all other members of the same family in KB and add
// them as candidates. Addresses the failure pattern where the right answer
// is a numbered subtype of an umbrella that DID get retrieved but the
// specific number did NOT.

const FAMILY_NUMBER_RE = /^(.+?)[\s,]+(\d+)\s*$/i;

function parseFamilyMember(name: string): { family: string; number: number } | null {
  const m = name.match(FAMILY_NUMBER_RE);
  if (!m) return null;
  const family = m[1].trim();
  // Avoid spurious matches on things like "Type 1 diabetes" — family must be
  // at least 8 characters and contain at least one alphabetic word.
  if (family.length < 8 || !/[a-z]{4}/i.test(family)) return null;
  return { family, number: parseInt(m[2], 10) };
}

// v24: extract the distinctive (non-stopword) tokens from a disease name to
// use as the matching signature for upstream variant injection. Strips generic
// medical terms ("syndrome", "disease") so the remaining tokens are the
// disease-identifying words (e.g., "Loeys-Dietz Syndrome" → ["loeys", "dietz"];
// "Hereditary Spastic Paraplegia" → ["spastic", "paraplegia"]).
const DISEASE_NAME_STOPWORDS = new Set([
  'syndrome', 'syndromes', 'disease', 'disorder', 'disorders', 'deficiency',
  'dystrophy', 'with', 'and', 'or', 'the', 'of', 'in', 'on', 'an', 'for',
  'type', 'types', 'complex', 'related', 'variant', 'variants', 'familial',
  'hereditary', 'autosomal', 'dominant', 'recessive', 'x-linked', 'congenital',
  'progressive', 'idiopathic', 'sporadic', 'primary', 'secondary',
]);

function getDistinctiveTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length >= 4 && !DISEASE_NAME_STOPWORDS.has(t));
}

// v24: KB-variant enumeration for umbrella names. Fires when a retrieved
// candidate is an umbrella (NOT a numbered family member — those are handled
// by enumerateFamilySiblings). For each umbrella, finds KB entries whose
// names share ALL of the umbrella's distinctive tokens (e.g., umbrella
// "Hereditary Spastic Paraplegia" surfaces "Autosomal Dominant Spastic
// Paraplegia Type 10" via the shared "spastic"+"paraplegia" tokens). Only
// keeps variants whose own match score against the patient is above a
// modest floor — symptom-relevance is the gate, not just name similarity.
//
// Closes the v23.1 gap where retrieval surfaced only the umbrella for cases
// like Loeys-Dietz syndrome 1, Cone-Rod Dystrophy 13, etc. — the synth never
// saw the numbered/specialized variants as candidates and so could not name
// them at top-1 even when patient evidence supported a specific subtype.
function enumerateKbVariants(
  retrievedMatches: DiseaseMatch[],
  db: DiseaseProfile[],
  scoreFn: (d: DiseaseProfile) => DiseaseMatch,
  alreadyIncluded: Set<string>,
  maxVariantsPerUmbrella: number,
  scoreThreshold: number,
): DiseaseMatch[] {
  const additions: DiseaseMatch[] = [];
  const seenUmbrellaSigs = new Set<string>();
  for (const m of retrievedMatches) {
    const umbrella = m.disease;
    // Skip numbered family members — enumerateFamilySiblings covers those
    if (parseFamilyMember(umbrella.name)) continue;
    const tokens = getDistinctiveTokens(umbrella.name);
    if (tokens.length === 0) continue;
    const sig = [...tokens].sort().join(' ');
    if (seenUmbrellaSigs.has(sig)) continue;
    seenUmbrellaSigs.add(sig);

    const candidates: DiseaseProfile[] = [];
    for (const d of db) {
      if (d.id === umbrella.id) continue;
      if (alreadyIncluded.has(d.id)) continue;
      const nameLower = d.name.toLowerCase();
      if (tokens.every((t) => nameLower.includes(t))) candidates.push(d);
    }
    if (candidates.length === 0) continue;

    const scored = candidates
      .map((d) => scoreFn(d))
      .filter((s) => s.matchScore >= scoreThreshold)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, maxVariantsPerUmbrella);

    for (const s of scored) {
      additions.push(s);
      alreadyIncluded.add(s.disease.id);
    }
    if (scored.length > 0) {
      console.log(
        `[Retrieval] KB-variant enumeration: "${umbrella.name}" → ${scored.length} variants (${scored.map((v) => v.disease.name).slice(0, 3).join(', ')}${scored.length > 3 ? '…' : ''})`,
      );
    }
  }
  return additions;
}

function enumerateFamilySiblings(
  retrievedMatches: DiseaseMatch[],
  db: DiseaseProfile[],
  scoreFn: (d: DiseaseProfile) => DiseaseMatch,
  alreadyIncluded: Set<string>,
  maxSiblingsPerFamily: number,
): DiseaseMatch[] {
  // Group by family root, dedupe.
  const familyRoots = new Map<string, { root: string; existingNumbers: Set<number> }>();
  for (const m of retrievedMatches) {
    const parsed = parseFamilyMember(m.disease.name);
    if (!parsed) continue;
    const key = parsed.family.toLowerCase();
    if (!familyRoots.has(key)) {
      familyRoots.set(key, { root: parsed.family, existingNumbers: new Set([parsed.number]) });
    } else {
      familyRoots.get(key)!.existingNumbers.add(parsed.number);
    }
  }
  if (familyRoots.size === 0) return [];

  const additions: DiseaseMatch[] = [];
  for (const [key, { root, existingNumbers }] of familyRoots) {
    // Find all KB diseases with names of the form "<root> <number>" with a
    // number NOT already in the pool.
    const rootLower = key;
    const found: DiseaseProfile[] = [];
    for (const d of db) {
      if (alreadyIncluded.has(d.id)) continue;
      const parsed = parseFamilyMember(d.name);
      if (!parsed) continue;
      if (parsed.family.toLowerCase() !== rootLower) continue;
      if (existingNumbers.has(parsed.number)) continue;
      found.push(d);
    }
    if (found.length === 0) continue;
    // Score and keep top N by matchScore — gives priority to siblings whose
    // symptoms still match the patient (not blind enumeration of every member).
    const scored = found.map((d) => scoreFn(d)).sort((a, b) => b.matchScore - a.matchScore);
    for (const s of scored.slice(0, maxSiblingsPerFamily)) {
      additions.push(s);
      alreadyIncluded.add(s.disease.id);
    }
    console.log(`[Retrieval] Family enumeration: "${root}" expanded with ${Math.min(maxSiblingsPerFamily, scored.length)} siblings (existing: ${[...existingNumbers].join(',')})`);
  }
  return additions;
}

/**
 * Find diseases matching a set of patient symptoms using semantic search.
 * Returns ranked DiseaseMatch[] sorted by matchScore descending.
 *
 * If embeddings index is available, uses cosine similarity for symptom matching.
 * Falls back to string matching if embeddings are not available.
 */
export async function findMatchingDiseases(
  symptoms: MappedSymptom[],
  demographics: Demographics,
  options?: {
    maxResults?: number;
    minScore?: number;
    filterSystems?: BodySystem[];
    filterSpecialists?: string[];
    excludedFindings?: string[];
  }
): Promise<DiseaseMatch[]> {
  const db = loadDiseaseDatabase();
  const maxResults = options?.maxResults ?? 30;
  const minScore = options?.minScore ?? 0.05;
  const index = loadEmbeddingsIndex();
  const patientBodySystems: BodySystem[] = options?.filterSystems ?? [];
  const normalizedExclusions = (options?.excludedFindings ?? [])
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 2);

  // Generate patient symptom embeddings if EITHER the local index OR Upstash
  // Vector is available — we need embeddings to query either path.
  const upstashEnabled = isUpstashConfigured();
  let patientEmbeddings: Map<string, EmbeddingVector> | null = null;
  if (index || upstashEnabled) {
    patientEmbeddings = await embedPatientSymptoms(symptoms);
  }

  // v23: if Upstash configured AND we got patient embeddings, query Upstash
  // for per-disease symptom-match scores. Takes priority over local-index path
  // because Upstash holds the full embedding set in prod (local file may be
  // missing or stale in deployed environments).
  let upstashAgg: UpstashAggregated | null = null;
  if (upstashEnabled && patientEmbeddings && patientEmbeddings.size > 0) {
    upstashAgg = await buildUpstashAggregated(symptoms, patientEmbeddings);
  }

  // v22: Build patient query tokens + compute BM25 scores against all diseases.
  // We tokenize medicalTerm + selectedConcept.name + alternativeSearchTerms +
  // originalPhrase per symptom — the union is the BM25 query. Cheap (~50ms for
  // 9k diseases) and runs in parallel with the semantic path.
  const bm25Idx = loadBM25Index();
  const queryTokens: string[] = [];
  for (const s of symptoms) {
    queryTokens.push(...bm25Tokenize(s.medicalTerm || s.originalPhrase || ''));
    if (s.selectedConcept?.name) queryTokens.push(...bm25Tokenize(s.selectedConcept.name));
    if (s.alternativeSearchTerms) {
      for (const a of s.alternativeSearchTerms) queryTokens.push(...bm25Tokenize(a));
    }
  }
  const bm25Scores = computeAllBM25Scores(queryTokens, bm25Idx);

  const scoreFn = (disease: DiseaseProfile) =>
    applyExclusionPenalty(
      scoreDisease(disease, symptoms, demographics, index, patientEmbeddings, patientBodySystems, bm25Scores, upstashAgg),
      normalizedExclusions,
    );

  // --- Pass 1: Filtered by body systems / specialists ---
  let filteredCandidates = db;
  if (options?.filterSystems?.length) {
    filteredCandidates = filteredCandidates.filter((d) =>
      d.systemsAffected.some((s) => options.filterSystems!.includes(s))
    );
  }
  if (options?.filterSpecialists?.length) {
    filteredCandidates = filteredCandidates.filter((d) =>
      d.specialistType.some((s) =>
        options.filterSpecialists!.some((fs) => s.toLowerCase().includes(fs.toLowerCase()))
      )
    );
  }

  const filteredMatches: DiseaseMatch[] = filteredCandidates
    .map(scoreFn)
    .filter((m) => m.matchScore >= minScore);

  // --- Pass 2: Unfiltered second pass (catches triage misclassification) ---
  const UNFILTERED_MIN_SCORE = 0.10;
  const filteredIds = new Set(filteredCandidates.map((d) => d.id));
  const unfilteredCandidates = db.filter((d) => !filteredIds.has(d.id));
  const unfilteredMatches: DiseaseMatch[] = unfilteredCandidates
    .map(scoreFn)
    .filter((m) => m.matchScore >= UNFILTERED_MIN_SCORE);

  // Merge filtered + unfiltered
  let allMatches = [...filteredMatches, ...unfilteredMatches]
    .sort((a, b) => b.matchScore - a.matchScore);

  // --- Pass 3: Differential-graph expansion ---
  const resultIds = new Set(allMatches.map((m) => m.disease.id));
  const diffIds = new Set<string>();
  for (const match of allMatches.slice(0, 20)) {
    for (const diff of match.disease.differentialDiagnoses) {
      if (!resultIds.has(diff.diseaseId) && !diffIds.has(diff.diseaseId)) {
        diffIds.add(diff.diseaseId);
      }
    }
  }

  if (diffIds.size > 0) {
    const diffDiseases = db.filter((d) => diffIds.has(d.id));
    const diffMatches = diffDiseases
      .map(scoreFn)
      .filter((m) => m.matchScore >= minScore);
    allMatches = [...allMatches, ...diffMatches]
      .sort((a, b) => b.matchScore - a.matchScore);
  }

  // --- Pass 4 (v22): Family enumeration. Catches the recurring failure
  // where the umbrella subtype was retrieved but the specific numbered
  // member that's the GT was missed. Examines the current pool for
  // "<family-name> <number>" patterns and enumerates siblings from KB.
  const inPool = new Set(allMatches.map((m) => m.disease.id));
  const familyAdds = enumerateFamilySiblings(
    allMatches.slice(0, 40), // only check the top-40 to keep enumeration focused
    db,
    scoreFn,
    inPool,
    /* maxSiblingsPerFamily */ 8,
  );
  if (familyAdds.length > 0) {
    allMatches = [...allMatches, ...familyAdds].sort((a, b) => b.matchScore - a.matchScore);
  }

  // --- Pass 5 (v24): KB-variant enumeration on UMBRELLA names. Pass 4 only
  // fires when a retrieved candidate has a numbered name ("X 3"). This pass
  // handles the opposite case: when only the umbrella ("X") was retrieved.
  // Surfaces KB profiles that share the umbrella's distinctive tokens (e.g.,
  // "Spastic Paraplegia Type 10" via "spastic"+"paraplegia"), filtered to
  // those whose own matchScore against the patient is meaningful.
  const inPool2 = new Set(allMatches.map((m) => m.disease.id));
  const variantAdds = enumerateKbVariants(
    allMatches.slice(0, 20), // top-20 umbrellas; deeper anchors aren't worth scanning
    db,
    scoreFn,
    inPool2,
    /* maxVariantsPerUmbrella */ 5,
    /* scoreThreshold */ 0.20, // v24.1: raised from 0.10. v24 surfaced too many
                                // low-confidence variants that synth committed
                                // to over the correct umbrella/family. Higher
                                // floor keeps high-symptom-match variants only.
  );
  if (variantAdds.length > 0) {
    allMatches = [...allMatches, ...variantAdds].sort((a, b) => b.matchScore - a.matchScore);
  }

  return allMatches.slice(0, maxResults);
}

/**
 * Embed all patient symptom terms in a single batched API call.
 * Returns a map from term text → embedding vector.
 */
async function embedPatientSymptoms(
  symptoms: MappedSymptom[]
): Promise<Map<string, EmbeddingVector>> {
  const termsToEmbed: string[] = [];
  const termSet = new Set<string>();

  for (const symptom of symptoms) {
    const terms = getSearchTerms(symptom);
    for (const term of terms) {
      if (!termSet.has(term)) {
        termSet.add(term);
        termsToEmbed.push(term);
      }
    }
  }

  if (termsToEmbed.length === 0) return new Map();

  try {
    const embeddings = await generateEmbeddings(termsToEmbed);
    const map = new Map<string, EmbeddingVector>();
    for (let i = 0; i < termsToEmbed.length; i++) {
      map.set(termsToEmbed[i], embeddings[i]);
    }
    return map;
  } catch (err) {
    console.warn('[Retrieval] Failed to generate patient symptom embeddings:', err);
    return new Map();
  }
}

function scoreDisease(
  disease: DiseaseProfile,
  symptoms: MappedSymptom[],
  demographics: Demographics,
  index: EmbeddingsIndex | null,
  patientEmbeddings: Map<string, EmbeddingVector> | null,
  patientBodySystems: BodySystem[],
  bm25Scores?: Map<string, number>,
  upstashAgg?: UpstashAggregated | null,
): DiseaseMatch {
  // v23 priority: Upstash → local-index → string-matching.
  const { symptomScore, matchedSymptoms } = upstashAgg
    ? computeSymptomScoreFromUpstash(disease, upstashAgg)
    : index && patientEmbeddings && patientEmbeddings.size > 0
    ? computeSymptomScoreSemantic(disease, symptoms, index, patientEmbeddings)
    : computeSymptomScoreFallback(disease, symptoms);

  const systemOverlap = computeSystemOverlap(disease, patientBodySystems);
  const demographicFit = computeDemographicFit(disease, demographics);
  const prevalenceBonus = computePrevalenceBonus(disease);
  const bm25Score = bm25Scores?.get(disease.id) ?? 0;

  const systemScore = systemOverlap.length / Math.max(disease.systemsAffected.length, 1);

  const matchScore =
    SCORE_WEIGHTS.symptom * symptomScore +
    SCORE_WEIGHTS.system * systemScore +
    SCORE_WEIGHTS.demographic * demographicFit +
    SCORE_WEIGHTS.prevalence * prevalenceBonus +
    SCORE_WEIGHTS.bm25 * bm25Score;

  return {
    disease,
    matchScore,
    matchedSymptoms,
    systemOverlap,
    demographicFit,
    componentScores: {
      symptom: symptomScore,
      system: systemScore,
      demographic: demographicFit,
      prevalence: prevalenceBonus,
      bm25: bm25Score,
    },
  };
}

// ===== SEMANTIC SYMPTOM MATCHING (primary) =====

function computeSymptomScoreSemantic(
  disease: DiseaseProfile,
  symptoms: MappedSymptom[],
  index: EmbeddingsIndex,
  patientEmbeddings: Map<string, EmbeddingVector>
): { symptomScore: number; matchedSymptoms: SymptomMatch[] } {
  const matchedSymptoms: SymptomMatch[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  // Get embeddings for this disease's symptoms
  const diseaseEmbeddings = index.meta.diseases[disease.id];
  if (!diseaseEmbeddings || diseaseEmbeddings.length === 0) {
    // Fall back to string matching for diseases without embeddings
    return computeSymptomScoreFallback(disease, symptoms);
  }

  // Build the flat list of disease symptoms with tier weights (same as before)
  const allDiseaseSymptoms: Array<{
    symptom: SymptomFrequency;
    weight: number;
    tier: string;
    embeddings: EmbeddingVector[]; // symptomName + searchTerms embeddings
  }> = [];

  for (const [tier, weight] of Object.entries(TIER_WEIGHTS)) {
    const tierSymptoms = disease.symptoms[tier as keyof typeof disease.symptoms] || [];
    for (const s of tierSymptoms) {
      // Collect all embedding entries for this symptom: symptomName + searchTerms
      const textsToMatch = [s.symptomName];
      if (s.searchTerms) textsToMatch.push(...s.searchTerms);

      const embeddings: EmbeddingVector[] = [];
      for (const text of textsToMatch) {
        const embEntry = diseaseEmbeddings.find(
          (e) => e.symptomName === text && e.tier === tier
        );
        if (embEntry != null) {
          embeddings.push(getVector(index, embEntry.vectorIndex));
        }
      }

      allDiseaseSymptoms.push({
        symptom: s,
        weight,
        tier,
        embeddings,
      });
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return { symptomScore: 0, matchedSymptoms: [] };

  // For each patient symptom, find the best matching disease symptom
  const usedDiseaseSymptoms = new Set<number>();

  for (const patientSymptom of symptoms) {
    const patientTerms = getSearchTerms(patientSymptom);

    let bestMatchIdx = -1;
    let bestSimilarity = -1;
    let bestMatchType: 'exact' | 'partial' | 'semantic' | null = null;

    for (let dIdx = 0; dIdx < allDiseaseSymptoms.length; dIdx++) {
      if (usedDiseaseSymptoms.has(dIdx)) continue;

      const { symptom: diseaseSymptom, embeddings: diseaseEmbeddings2 } = allDiseaseSymptoms[dIdx];

      // First try string matching (cheap, handles exact matches well)
      const stringMatch = matchSymptomTermsString(patientTerms, diseaseSymptom);
      if (stringMatch === 'exact') {
        bestMatchIdx = dIdx;
        bestSimilarity = 1.0;
        bestMatchType = 'exact';
        break; // Can't do better than exact
      }

      // Then try semantic matching via embeddings (all embeddings for this symptom)
      for (const diseaseEmb of diseaseEmbeddings2) {
        for (const term of patientTerms) {
          const patientEmb = patientEmbeddings.get(term);
          if (!patientEmb) continue;

          const similarity = cosineSimilarity(patientEmb, diseaseEmb);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatchIdx = dIdx;
            bestMatchType = classifyMatch(similarity);
          }
        }
      }

      // Also check string partial/overlap as fallback
      if (stringMatch && !bestMatchType) {
        const stringSimScore = stringMatch === 'partial' ? 0.78 : 0.60;
        if (stringSimScore > bestSimilarity) {
          bestSimilarity = stringSimScore;
          bestMatchIdx = dIdx;
          bestMatchType = stringMatch;
        }
      }
    }

    if (bestMatchIdx >= 0 && bestMatchType) {
      const { symptom: diseaseSymptom, weight } = allDiseaseSymptoms[bestMatchIdx];
      usedDiseaseSymptoms.add(bestMatchIdx);

      matchedSymptoms.push({
        patientSymptom: patientSymptom.medicalTerm || patientSymptom.originalPhrase,
        diseaseSymptom,
        matchType: bestMatchType,
      });

      const matchMultiplier =
        bestMatchType === 'exact' ? 1.0 :
        bestMatchType === 'partial' ? 0.7 :
        0.4;

      matchedWeight += weight * matchMultiplier;
    }
  }

  // Blend disease-centric score with patient coverage ratio (Bug 3 fix)
  const diseaseScore = matchedWeight / totalWeight;
  const coverageScore = matchedSymptoms.length / Math.max(symptoms.length, 1);
  const blendedScore = 0.6 * diseaseScore + 0.4 * coverageScore;
  const pathFloor = applyPathognomonicFloor(disease, matchedSymptoms, blendedScore);

  return {
    symptomScore: Math.min(pathFloor, 1.0),
    matchedSymptoms,
  };
}

// ===== STRING MATCHING FALLBACK =====

function computeSymptomScoreFallback(
  disease: DiseaseProfile,
  symptoms: MappedSymptom[]
): { symptomScore: number; matchedSymptoms: SymptomMatch[] } {
  const matchedSymptoms: SymptomMatch[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  const allDiseaseSymptoms: Array<{ symptom: SymptomFrequency; weight: number }> = [];

  for (const [tier, weight] of Object.entries(TIER_WEIGHTS)) {
    const tierSymptoms = disease.symptoms[tier as keyof typeof disease.symptoms] || [];
    for (const s of tierSymptoms) {
      allDiseaseSymptoms.push({ symptom: s, weight });
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return { symptomScore: 0, matchedSymptoms: [] };

  for (const patientSymptom of symptoms) {
    const patientTerms = getSearchTerms(patientSymptom);

    for (const { symptom: diseaseSymptom, weight } of allDiseaseSymptoms) {
      const matchType = matchSymptomTermsString(patientTerms, diseaseSymptom);
      if (matchType) {
        matchedSymptoms.push({
          patientSymptom: patientSymptom.medicalTerm || patientSymptom.originalPhrase,
          diseaseSymptom,
          matchType,
        });
        matchedWeight += weight * (matchType === 'exact' ? 1.0 : matchType === 'partial' ? 0.7 : 0.4);
        break;
      }
    }
  }

  // Blend disease-centric score with patient coverage ratio (Bug 3 fix)
  const diseaseScore = matchedWeight / totalWeight;
  const coverageScore = matchedSymptoms.length / Math.max(symptoms.length, 1);
  const blendedScore = 0.6 * diseaseScore + 0.4 * coverageScore;
  const pathFloor = applyPathognomonicFloor(disease, matchedSymptoms, blendedScore);

  return {
    symptomScore: Math.min(pathFloor, 1.0),
    matchedSymptoms,
  };
}

// ===== SHARED HELPERS =====

/**
 * Pathognomonic floor: when a disease has ≥2 pathognomonic symptoms and ≥50%
 * of them match the patient with strength 'exact' or 'partial', floor the
 * blended symptom score at 0.80. Prevents pathognomonic-rich cases from being
 * buried because the disease has many additional common/occasional/rare
 * symptoms inflating its total weight denominator.
 *
 * Pathognomonic means >90% of patients with the disease present with this
 * finding; an exact or partial match on multiple such features is strong
 * evidence of the disease and should not be diluted by symptom-count math.
 *
 * Only triggers on 'exact' and 'partial' matches (not 'semantic'), since
 * semantic matches at 0.50-0.68 cosine similarity are too loose to anchor
 * a high-confidence floor.
 */
function applyPathognomonicFloor(
  disease: DiseaseProfile,
  matchedSymptoms: SymptomMatch[],
  currentScore: number,
): number {
  const pathognomonic = disease.symptoms.pathognomonic || [];
  if (pathognomonic.length < 2) return currentScore;
  const pathNames = new Set(pathognomonic.map((s) => s.symptomName));
  let strongPathMatches = 0;
  for (const m of matchedSymptoms) {
    if (!pathNames.has(m.diseaseSymptom.symptomName)) continue;
    if (m.matchType === 'exact' || m.matchType === 'partial') strongPathMatches++;
  }
  const ratio = strongPathMatches / pathognomonic.length;
  if (ratio < 0.5) return currentScore;
  return Math.max(currentScore, 0.80);
}

function getSearchTerms(symptom: MappedSymptom): string[] {
  const terms: string[] = [];
  if (symptom.medicalTerm) terms.push(symptom.medicalTerm.toLowerCase());
  if (symptom.originalPhrase) terms.push(symptom.originalPhrase.toLowerCase());
  if (symptom.alternativeSearchTerms) {
    terms.push(...symptom.alternativeSearchTerms.map((t) => t.toLowerCase()));
  }
  if (symptom.selectedConcept?.name) {
    terms.push(symptom.selectedConcept.name.toLowerCase());
  }
  return terms;
}

/**
 * String-based symptom matching (used as fallback and for exact match detection).
 * Checks both symptomName and searchTerms for the best match.
 */
function matchSymptomTermsString(
  patientTerms: string[],
  diseaseSymptom: SymptomFrequency
): 'exact' | 'partial' | 'semantic' | null {
  // Build list of disease terms to match against: symptomName + searchTerms
  const diseaseTerms = [diseaseSymptom.symptomName];
  if (diseaseSymptom.searchTerms) {
    diseaseTerms.push(...diseaseSymptom.searchTerms);
  }

  let bestMatch: 'exact' | 'partial' | 'semantic' | null = null;

  for (const diseaseTerm of diseaseTerms) {
    const diseaseNameLower = diseaseTerm.toLowerCase();
    const diseaseWords = new Set(diseaseNameLower.split(/\s+/));

    for (const term of patientTerms) {
      if (term === diseaseNameLower) return 'exact'; // Can't beat exact
      if (term.includes(diseaseNameLower) || diseaseNameLower.includes(term)) {
        if (!bestMatch || bestMatch === 'semantic') bestMatch = 'partial';
      }

      const termWords = new Set(term.split(/\s+/));
      const overlap = [...termWords].filter((w) => diseaseWords.has(w)).length;
      const overlapRatio = overlap / Math.max(diseaseWords.size, 1);
      if (overlapRatio >= 0.5 && overlap >= 1) {
        if (!bestMatch) bestMatch = 'semantic';
      }
    }
  }

  return bestMatch;
}

function computeSystemOverlap(disease: DiseaseProfile, patientBodySystems: BodySystem[]): BodySystem[] {
  const patientSystems = new Set<BodySystem>(patientBodySystems);
  return disease.systemsAffected.filter((sys) => patientSystems.has(sys));
}

function computeDemographicFit(disease: DiseaseProfile, demographics: Demographics): number {
  let score = 0;
  const age = parseInt(demographics.age, 10);

  if (!isNaN(age)) {
    const { min, max } = disease.demographics.typicalOnsetAge;
    if (age >= min && age <= max) {
      score += 0.5;
    } else {
      const distance = Math.min(Math.abs(age - min), Math.abs(age - max));
      if (distance <= 10) score += 0.25;
    }
  } else {
    score += 0.25;
  }

  const sexMap: Record<string, number> = {
    equal: 0.5,
    'slight-female': demographics.sex === 'female' ? 0.5 : 0.4,
    'slight-male': demographics.sex === 'male' ? 0.5 : 0.4,
    female: demographics.sex === 'female' ? 0.5 : 0.2,
    male: demographics.sex === 'male' ? 0.5 : 0.2,
  };
  score += sexMap[disease.demographics.sexPredilection] ?? 0.25;

  return score;
}

function computePrevalenceBonus(_disease: DiseaseProfile): number {
  return 0.5;
}

/**
 * Penalize a disease match when the patient's excluded findings list
 * contains symptoms the disease lists as pathognomonic (>90%) or common
 * (>50%). One excluded pathognomonic feature is a major contradiction;
 * an excluded common feature is a minor one.
 *
 * Multiplicative penalty applied to the existing matchScore in place. No
 * effect when no exclusions are present.
 */
function applyExclusionPenalty(
  match: DiseaseMatch,
  normalizedExclusions: string[],
): DiseaseMatch {
  if (normalizedExclusions.length === 0) return match;

  const findingNormalized = (s: string) => s.toLowerCase().trim();
  const isPresent = (target: string) =>
    normalizedExclusions.some(
      (ex) => ex === target || ex.includes(target) || target.includes(ex),
    );

  let penalty = 1.0;
  for (const s of match.disease.symptoms.pathognomonic) {
    if (isPresent(findingNormalized(s.symptomName))) penalty *= 0.4;
  }
  for (const s of match.disease.symptoms.common) {
    if (isPresent(findingNormalized(s.symptomName))) penalty *= 0.7;
  }

  if (penalty === 1.0) return match;
  return { ...match, matchScore: match.matchScore * penalty };
}
