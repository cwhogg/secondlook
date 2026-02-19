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
  symptom: 0.50,
  system: 0.20,
  demographic: 0.15,
  prevalence: 0.15,
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
  }
): Promise<DiseaseMatch[]> {
  const db = loadDiseaseDatabase();
  const maxResults = options?.maxResults ?? 30;
  const minScore = options?.minScore ?? 0.05;
  const index = loadEmbeddingsIndex();

  let candidates = db;

  // Optional pre-filtering
  if (options?.filterSystems?.length) {
    candidates = candidates.filter((d) =>
      d.systemsAffected.some((s) => options.filterSystems!.includes(s))
    );
  }
  if (options?.filterSpecialists?.length) {
    candidates = candidates.filter((d) =>
      d.specialistType.some((s) =>
        options.filterSpecialists!.some((fs) => s.toLowerCase().includes(fs.toLowerCase()))
      )
    );
  }

  // Generate patient symptom embeddings if index is available
  let patientEmbeddings: Map<string, EmbeddingVector> | null = null;

  if (index) {
    patientEmbeddings = await embedPatientSymptoms(symptoms);
  }

  const matches: DiseaseMatch[] = candidates
    .map((disease) => scoreDisease(disease, symptoms, demographics, index, patientEmbeddings))
    .filter((m) => m.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, maxResults);

  return matches;
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
  patientEmbeddings: Map<string, EmbeddingVector> | null
): DiseaseMatch {
  const { symptomScore, matchedSymptoms } = index && patientEmbeddings && patientEmbeddings.size > 0
    ? computeSymptomScoreSemantic(disease, symptoms, index, patientEmbeddings)
    : computeSymptomScoreFallback(disease, symptoms);

  const systemOverlap = computeSystemOverlap(disease, symptoms);
  const demographicFit = computeDemographicFit(disease, demographics);
  const prevalenceBonus = computePrevalenceBonus(disease);

  const matchScore =
    SCORE_WEIGHTS.symptom * symptomScore +
    SCORE_WEIGHTS.system * (systemOverlap.length / Math.max(disease.systemsAffected.length, 1)) +
    SCORE_WEIGHTS.demographic * demographicFit +
    SCORE_WEIGHTS.prevalence * prevalenceBonus;

  return {
    disease,
    matchScore,
    matchedSymptoms,
    systemOverlap,
    demographicFit,
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
    embedding: EmbeddingVector | null;
  }> = [];

  for (const [tier, weight] of Object.entries(TIER_WEIGHTS)) {
    const tierSymptoms = disease.symptoms[tier as keyof typeof disease.symptoms] || [];
    for (const s of tierSymptoms) {
      // Find the matching embedding entry and read its vector from binary
      const embEntry = diseaseEmbeddings.find(
        (e) => e.symptomName === s.symptomName && e.tier === tier
      );
      allDiseaseSymptoms.push({
        symptom: s,
        weight,
        tier,
        embedding: embEntry != null ? getVector(index, embEntry.vectorIndex) : null,
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

      const { symptom: diseaseSymptom, embedding: diseaseEmbedding } = allDiseaseSymptoms[dIdx];

      // First try string matching (cheap, handles exact matches well)
      const stringMatch = matchSymptomTermsString(patientTerms, diseaseSymptom);
      if (stringMatch === 'exact') {
        bestMatchIdx = dIdx;
        bestSimilarity = 1.0;
        bestMatchType = 'exact';
        break; // Can't do better than exact
      }

      // Then try semantic matching via embeddings
      if (diseaseEmbedding) {
        for (const term of patientTerms) {
          const patientEmb = patientEmbeddings.get(term);
          if (!patientEmb) continue;

          const similarity = cosineSimilarity(patientEmb, diseaseEmbedding);
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

  return {
    symptomScore: Math.min(matchedWeight / totalWeight, 1.0),
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

  return {
    symptomScore: Math.min(matchedWeight / totalWeight, 1.0),
    matchedSymptoms,
  };
}

// ===== SHARED HELPERS =====

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
 */
function matchSymptomTermsString(
  patientTerms: string[],
  diseaseSymptom: SymptomFrequency
): 'exact' | 'partial' | 'semantic' | null {
  const diseaseName = diseaseSymptom.symptomName.toLowerCase();
  const diseaseWords = new Set(diseaseName.split(/\s+/));

  for (const term of patientTerms) {
    if (term === diseaseName) return 'exact';
    if (term.includes(diseaseName) || diseaseName.includes(term)) return 'partial';

    const termWords = new Set(term.split(/\s+/));
    const overlap = [...termWords].filter((w) => diseaseWords.has(w)).length;
    const overlapRatio = overlap / Math.max(diseaseWords.size, 1);
    if (overlapRatio >= 0.5 && overlap >= 1) return 'semantic';
  }

  return null;
}

function computeSystemOverlap(disease: DiseaseProfile, symptoms: MappedSymptom[]): BodySystem[] {
  const categoryToSystem: Record<string, BodySystem> = {
    motor: 'neurological',
    sensory: 'neurological',
    cognitive: 'neurological',
    pain: 'musculoskeletal',
    autonomic: 'cardiovascular',
    constitutional: 'constitutional',
  };

  const patientSystems = new Set<BodySystem>();
  for (const s of symptoms) {
    if (s.category && categoryToSystem[s.category]) {
      patientSystems.add(categoryToSystem[s.category]);
    }
  }

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

function computePrevalenceBonus(disease: DiseaseProfile): number {
  switch (disease.prevalence.classification) {
    case 'common': return 0.8;
    case 'uncommon': return 0.6;
    case 'rare': return 0.4;
    case 'ultra-rare': return 0.2;
    default: return 0.3;
  }
}
