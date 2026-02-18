import { DiseaseProfile, DiseaseMatch, BodySystem, SymptomFrequency, SymptomMatch } from '../types/knowledge-base';
import { MappedSymptom, Demographics } from '../types';
import { loadDiseaseDatabase } from './index';

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

/**
 * Find diseases matching a set of patient symptoms.
 * Returns ranked DiseaseMatch[] sorted by matchScore descending.
 */
export function findMatchingDiseases(
  symptoms: MappedSymptom[],
  demographics: Demographics,
  options?: {
    maxResults?: number;
    minScore?: number;
    filterSystems?: BodySystem[];
    filterSpecialists?: string[];
  }
): DiseaseMatch[] {
  const db = loadDiseaseDatabase();
  const maxResults = options?.maxResults ?? 30;
  const minScore = options?.minScore ?? 0.05;

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

  const matches: DiseaseMatch[] = candidates
    .map((disease) => scoreDisease(disease, symptoms, demographics))
    .filter((m) => m.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, maxResults);

  return matches;
}

function scoreDisease(
  disease: DiseaseProfile,
  symptoms: MappedSymptom[],
  demographics: Demographics
): DiseaseMatch {
  const { symptomScore, matchedSymptoms } = computeSymptomScore(disease, symptoms);
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

function computeSymptomScore(
  disease: DiseaseProfile,
  symptoms: MappedSymptom[]
): { symptomScore: number; matchedSymptoms: SymptomMatch[] } {
  const matchedSymptoms: SymptomMatch[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  // Build a flat list of all disease symptoms with their tier weights
  const allDiseaseSymptoms: Array<{ symptom: SymptomFrequency; weight: number; tier: string }> = [];

  for (const [tier, weight] of Object.entries(TIER_WEIGHTS)) {
    const tierSymptoms = disease.symptoms[tier as keyof typeof disease.symptoms] || [];
    for (const s of tierSymptoms) {
      allDiseaseSymptoms.push({ symptom: s, weight, tier });
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return { symptomScore: 0, matchedSymptoms: [] };

  // Match patient symptoms against disease symptoms
  for (const patientSymptom of symptoms) {
    const patientTerms = getSearchTerms(patientSymptom);

    for (const { symptom: diseaseSymptom, weight } of allDiseaseSymptoms) {
      const matchType = matchSymptomTerms(patientTerms, diseaseSymptom);
      if (matchType) {
        matchedSymptoms.push({
          patientSymptom: patientSymptom.medicalTerm || patientSymptom.originalPhrase,
          diseaseSymptom,
          matchType,
        });
        matchedWeight += weight * (matchType === 'exact' ? 1.0 : matchType === 'partial' ? 0.7 : 0.4);
        break; // Each patient symptom matches at most one disease symptom
      }
    }
  }

  return {
    symptomScore: Math.min(matchedWeight / totalWeight, 1.0),
    matchedSymptoms,
  };
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

function matchSymptomTerms(
  patientTerms: string[],
  diseaseSymptom: SymptomFrequency
): 'exact' | 'partial' | 'semantic' | null {
  const diseaseName = diseaseSymptom.symptomName.toLowerCase();
  const diseaseWords = new Set(diseaseName.split(/\s+/));

  for (const term of patientTerms) {
    // Exact match
    if (term === diseaseName) return 'exact';

    // Partial match: one term contains the other
    if (term.includes(diseaseName) || diseaseName.includes(term)) return 'partial';

    // Word overlap: >50% of words match
    const termWords = new Set(term.split(/\s+/));
    const overlap = [...termWords].filter((w) => diseaseWords.has(w)).length;
    const overlapRatio = overlap / Math.max(diseaseWords.size, 1);
    if (overlapRatio >= 0.5 && overlap >= 1) return 'semantic';
  }

  return null;
}

function computeSystemOverlap(disease: DiseaseProfile, symptoms: MappedSymptom[]): BodySystem[] {
  // Map symptom categories to body systems
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

  // Age fit
  if (!isNaN(age)) {
    const { min, max } = disease.demographics.typicalOnsetAge;
    if (age >= min && age <= max) {
      score += 0.5;
    } else {
      // Partial credit for being close
      const distance = Math.min(Math.abs(age - min), Math.abs(age - max));
      if (distance <= 10) score += 0.25;
    }
  } else {
    score += 0.25; // Unknown age, neutral
  }

  // Sex fit
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
  // Slight bonus for more common diseases (Bayesian prior)
  // But don't over-penalize rare ones — that's the whole point of this app
  switch (disease.prevalence.classification) {
    case 'common': return 0.8;
    case 'uncommon': return 0.6;
    case 'rare': return 0.4;
    case 'ultra-rare': return 0.2;
    default: return 0.3;
  }
}
