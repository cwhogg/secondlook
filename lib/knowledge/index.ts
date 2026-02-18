import { DiseaseProfile } from '../types/knowledge-base';
import fs from 'fs';
import path from 'path';

let diseaseCache: DiseaseProfile[] | null = null;

const DISEASES_DIR = path.join(process.cwd(), 'lib', 'knowledge', 'diseases');

export function loadDiseaseDatabase(): DiseaseProfile[] {
  if (diseaseCache) return diseaseCache;

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

export function invalidateCache(): void {
  diseaseCache = null;
}
