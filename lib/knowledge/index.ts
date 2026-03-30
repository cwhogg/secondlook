import { DiseaseProfile } from '../types/knowledge-base';
import fs from 'fs';
import path from 'path';

let diseaseCache: DiseaseProfile[] | null = null;

const DISEASES_DIR = path.join(process.cwd(), 'lib', 'knowledge', 'diseases');
const COMPILED_FILE = path.join(process.cwd(), 'lib', 'knowledge', 'diseases-compiled.json');

export function loadDiseaseDatabase(): DiseaseProfile[] {
  if (diseaseCache) return diseaseCache;

  // Try compiled single-file database first (fast path)
  if (fs.existsSync(COMPILED_FILE)) {
    try {
      const content = fs.readFileSync(COMPILED_FILE, 'utf-8');
      const diseases = JSON.parse(content) as DiseaseProfile[];
      console.log(`[KB] Loaded ${diseases.length} disease profiles from compiled database`);
      diseaseCache = diseases;
      return diseaseCache;
    } catch (err) {
      console.warn('[KB] Failed to load compiled database, falling back to per-file loading:', err);
    }
  }

  // Fall back to per-file loading (dev convenience)
  if (!fs.existsSync(DISEASES_DIR)) {
    console.warn('[KB] Diseases directory not found:', DISEASES_DIR);
    return [];
  }

  const files = fs.readdirSync(DISEASES_DIR).filter((f) => f.endsWith('.json'));
  const diseases: DiseaseProfile[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(DISEASES_DIR, file), 'utf-8');
      const parsed = JSON.parse(content) as DiseaseProfile;
      diseases.push(parsed);
    } catch (err) {
      errors.push(`Failed to load ${file}: ${err}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`[KB] ${errors.length} disease files failed to load:`, errors);
  }

  console.log(`[KB] Loaded ${diseases.length} disease profiles`);
  diseaseCache = diseases;
  return diseaseCache;
}

export function getDiseaseById(id: string): DiseaseProfile | undefined {
  const db = loadDiseaseDatabase();
  return db.find((d) => d.id === id);
}

export function getDiseasesBySystem(system: string): DiseaseProfile[] {
  const db = loadDiseaseDatabase();
  return db.filter((d) => d.systemsAffected.includes(system as any));
}

export function getDiseasesBySpecialist(specialistType: string): DiseaseProfile[] {
  const db = loadDiseaseDatabase();
  return db.filter((d) =>
    d.specialistType.some((s) => s.toLowerCase().includes(specialistType.toLowerCase()))
  );
}

export function getDiseaseCount(): number {
  return loadDiseaseDatabase().length;
}

/**
 * Find all KB diseases whose name or aliases contain the given family name.
 */
export function getDiseasesByFamily(familyName: string, limit = 10): DiseaseProfile[] {
  const db = loadDiseaseDatabase();
  const normalized = familyName.toLowerCase();
  if (normalized.length < 5) return [];
  return db
    .filter(
      (d) =>
        d.name.toLowerCase().includes(normalized) ||
        d.aliases.some((a) => a.toLowerCase().includes(normalized))
    )
    .slice(0, limit);
}

/**
 * For a given diagnosis name, find sibling diseases from the same family in the KB.
 * Tries contiguous multi-word substrings of the name to identify the family.
 * Returns siblings ranked by symptom-word overlap with the patient, excluding
 * any disease that is an exact/substring name match to the input diagnosis.
 */
export function findFamilySiblings(
  diagnosisName: string,
  patientSymptomTerms: string[],
  limit = 10
): { familyName: string; totalInFamily: number; siblings: DiseaseProfile[] } | null {
  const db = loadDiseaseDatabase();
  const words = diagnosisName
    .replace(/[,\-()\/]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length < 2) return null;

  let bestFamily: string | null = null;
  let bestMatches: DiseaseProfile[] = [];

  // Try contiguous 2+ word substrings, picking the one with the most KB matches
  for (let len = words.length; len >= 2; len--) {
    for (let start = 0; start <= words.length - len; start++) {
      const candidate = words.slice(start, start + len).join(' ').toLowerCase();
      if (candidate.length < 5) continue;

      const matches = db.filter(
        (d) =>
          d.name.toLowerCase().includes(candidate) ||
          d.aliases.some((a) => a.toLowerCase().includes(candidate))
      );

      if (matches.length > 1 && matches.length > bestMatches.length) {
        bestFamily = candidate;
        bestMatches = matches;
      }
    }
  }

  if (!bestFamily || bestMatches.length <= 1) return null;

  const totalInFamily = bestMatches.length;

  // Remove the hypothesis itself from siblings
  const diagNorm = diagnosisName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const siblings = bestMatches.filter((d) => {
    const nameNorm = d.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return nameNorm !== diagNorm && !nameNorm.includes(diagNorm) && !diagNorm.includes(nameNorm);
  });

  if (siblings.length === 0) return null;

  // Rank siblings by symptom-word overlap with the patient
  const patientWords = new Set(
    patientSymptomTerms
      .join(' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  const ranked = siblings
    .map((d) => {
      const symptomText = [
        ...d.symptoms.pathognomonic.map((s) => s.symptomName),
        ...d.symptoms.common.map((s) => s.symptomName),
      ]
        .join(' ')
        .toLowerCase();
      const symptomWords = symptomText.split(/\s+/).filter((w) => w.length > 3);

      let overlap = 0;
      for (const w of symptomWords) {
        if (patientWords.has(w)) overlap++;
      }

      return { disease: d, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .map((r) => r.disease);

  return {
    familyName: bestFamily,
    totalInFamily,
    siblings: ranked.slice(0, limit),
  };
}

// ===== FAMILY DIFFERENTIATING TESTS =====

export interface DifferentiatingTestResult {
  modality: 'genetic' | 'imaging' | 'laboratory' | 'other';
  modalityLabel: string;
  convergenceRatio: number;
  perSubtype: Array<{
    diseaseName: string;
    uniqueFindings: string[];
  }>;
  sharedFindings: string[];
}

/**
 * Given a set of sibling disease profiles from the same family, identify
 * the single test modality that best differentiates between them.
 * Returns null if no single category accounts for ≥80% of unique findings.
 */
export function computeDifferentiatingTests(
  siblings: DiseaseProfile[]
): DifferentiatingTestResult | null {
  if (siblings.length < 2) return null;

  const categories = ['laboratory', 'imaging', 'genetic', 'other'] as const;

  // Collect all findings per sibling, keyed by category
  const perSibling = siblings.map((d) => ({
    name: d.name,
    findings: {
      laboratory: new Set(d.keyFindings.laboratory.map(f => f.toLowerCase().trim()).filter(Boolean)),
      imaging: new Set(d.keyFindings.imaging.map(f => f.toLowerCase().trim()).filter(Boolean)),
      genetic: new Set(d.keyFindings.genetic.map(f => f.toLowerCase().trim()).filter(Boolean)),
      other: new Set(d.keyFindings.other.map(f => f.toLowerCase().trim()).filter(Boolean)),
    },
  }));

  // Find shared findings (present in ALL siblings) and unique findings (present in only ONE sibling)
  const sharedAll: string[] = [];
  const uniqueByCategory: Record<string, number> = { laboratory: 0, imaging: 0, genetic: 0, other: 0 };
  const uniquePerSubtype: Map<string, Map<string, string[]>> = new Map(); // diseaseName -> category -> findings

  for (const s of perSibling) {
    uniquePerSubtype.set(s.name, new Map());
    for (const cat of categories) {
      uniquePerSubtype.get(s.name)!.set(cat, []);
    }
  }

  for (const cat of categories) {
    // All findings across all siblings in this category
    const allFindings = new Set<string>();
    for (const s of perSibling) {
      for (const f of s.findings[cat]) allFindings.add(f);
    }

    for (const finding of allFindings) {
      const presentIn = perSibling.filter(s => s.findings[cat].has(finding));
      if (presentIn.length === perSibling.length) {
        sharedAll.push(finding);
      } else if (presentIn.length === 1) {
        uniqueByCategory[cat]++;
        uniquePerSubtype.get(presentIn[0].name)!.get(cat)!.push(finding);
      }
    }
  }

  const totalUnique = Object.values(uniqueByCategory).reduce((a, b) => a + b, 0);
  if (totalUnique === 0) return null;

  // Find the dominant category
  let bestCat: typeof categories[number] = 'genetic';
  let bestCount = 0;
  for (const cat of categories) {
    if (uniqueByCategory[cat] > bestCount) {
      bestCount = uniqueByCategory[cat];
      bestCat = cat;
    }
  }

  const convergenceRatio = bestCount / totalUnique;
  if (convergenceRatio < 0.8) return null;

  // Build modality label
  const modalityLabels: Record<string, string> = {
    genetic: 'Genetic testing',
    imaging: 'Imaging studies (MRI/CT)',
    laboratory: 'Laboratory testing',
    other: 'Specialized testing',
  };

  // For "other", try to derive a more specific label from the findings
  let modalityLabel = modalityLabels[bestCat];
  if (bestCat === 'other') {
    const allOtherFindings = perSibling.flatMap(s => uniquePerSubtype.get(s.name)!.get('other')!);
    if (allOtherFindings.some(f => f.includes('biopsy'))) modalityLabel = 'Tissue biopsy';
    else if (allOtherFindings.some(f => f.includes('electro') || f.includes('emg') || f.includes('ncs')))
      modalityLabel = 'Electrodiagnostic testing (EMG/NCS)';
  }

  const perSubtype = perSibling.map(s => ({
    diseaseName: s.name,
    uniqueFindings: uniquePerSubtype.get(s.name)!.get(bestCat)!.map(
      f => f.charAt(0).toUpperCase() + f.slice(1) // re-capitalize
    ),
  }));

  return {
    modality: bestCat,
    modalityLabel,
    convergenceRatio,
    perSubtype,
    sharedFindings: sharedAll.map(f => f.charAt(0).toUpperCase() + f.slice(1)),
  };
}

export function invalidateCache(): void {
  diseaseCache = null;
}
