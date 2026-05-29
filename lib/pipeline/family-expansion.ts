import { DiagnosisHypothesis } from '../types';
import { findDiseaseByName, getDiseaseById } from '../knowledge';

/**
 * For each ranked diagnosis, look up its KB profile and append up to
 * `perDiagnosisCap` of its `differentialDiagnoses` entries to the output —
 * deterministic, no LLM calls. The output is intended to be appended after
 * the synthesizer-ranked list at positions N+1..N+maxExpansions.
 *
 * Each expansion carries `expansionSource: 'family'` so callers can render
 * them distinctly. A variant is skipped if its KB name normalizes to the
 * same key as any already-ranked diagnosis or any already-added expansion.
 */
export function expandFamilyVariants(
  rankedHypotheses: DiagnosisHypothesis[],
  maxExpansions = 5,
  perDiagnosisCap = 3,
): DiagnosisHypothesis[] {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const seenKeys = new Set<string>(rankedHypotheses.map((h) => normalize(h.diagnosis)));
  const expansions: DiagnosisHypothesis[] = [];

  for (const h of rankedHypotheses) {
    if (expansions.length >= maxExpansions) break;

    const kbDisease = findDiseaseByName(h.diagnosis);
    if (!kbDisease || kbDisease.differentialDiagnoses.length === 0) continue;

    let addedForThisParent = 0;
    for (const diff of kbDisease.differentialDiagnoses) {
      if (addedForThisParent >= perDiagnosisCap) break;
      if (expansions.length >= maxExpansions) break;

      const variantDisease = getDiseaseById(diff.diseaseId);
      if (!variantDisease) continue;

      const variantKey = normalize(variantDisease.name);
      if (seenKeys.has(variantKey)) continue;
      seenKeys.add(variantKey);

      expansions.push({
        diagnosis: variantDisease.name,
        icd10Code: variantDisease.icd10Codes[0],
        orphanetId: variantDisease.orphanetId,
        // Real scores are filled in by applyFamilyExpansionScoring after
        // ranking is complete (inherits half the parent's evidenceScore).
        confidenceScore: 0,
        evidenceScore: 0,
        rareDisease: true,
        prevalence: variantDisease.prevalence.estimate,
        supportingEvidence: [],
        contradictoryEvidence: [],
        clinicalReasoning: `KB-linked variant of ${h.diagnosis}.${
          diff.distinguishingFeatures.length > 0
            ? ' Distinguishing features: ' + diff.distinguishingFeatures.join('; ')
            : ''
        }`,
        typicalPresentation: '',
        specialistRequired: variantDisease.specialistType[0] || '',
        diagnosticCriteria: {
          criteriaName: 'Clinical assessment',
          totalCriteria: 0,
          metCriteria: 0,
          criteriaDetails: [],
          fulfillmentPercentage: 0,
        },
        sourceAgent: 'family-expansion',
        parentDiagnosis: h.diagnosis,
        evaluationType: 'reasoning-evaluated',
        knowledgeBaseMatch: true,
        expansionSource: 'family',
      });

      addedForThisParent++;
    }
  }

  return expansions;
}
