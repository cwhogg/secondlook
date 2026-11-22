/**
 * Lab flags come from model extraction and from other apps' records in many
 * spellings ("High", "low", "Critical"). Normalize to the pipeline's set
 * instead of rejecting the whole case on one unexpected value.
 * Returns null for "normal"/blank and for anything unrecognized.
 */
export type LabFlag = 'H' | 'L' | 'HH' | 'LL' | 'CRIT';

export function normalizeLabFlag(raw?: string | null): LabFlag | null {
  if (!raw) return null;
  const r = raw.trim().toUpperCase();
  if (r === 'H' || r === 'HIGH') return 'H';
  if (r === 'L' || r === 'LOW') return 'L';
  if (r === 'HH') return 'HH';
  if (r === 'LL') return 'LL';
  if (r === 'CRIT' || r === 'CRITICAL') return 'CRIT';
  return null;
}
