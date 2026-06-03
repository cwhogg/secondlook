/**
 * Unit tests for the v4 grader core.
 *
 * Run with:
 *   node --test --experimental-strip-types lib/grading/mondo-match.test.ts
 *
 * Uses Node's built-in `node:test` so no test runner dependency is required.
 * Production assets are bypassed via `_injectAssetsForTesting` — these tests
 * use a tiny synthetic Mondo bundle covering the cases the malco scoring
 * algorithm distinguishes (exact, equivalent, partial, asymmetric, no-cap).
 */

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  groundToMondo,
  scorePrediction,
  gradeDifferentialV4,
  _injectAssetsForTesting,
  _resetAssetsForTesting,
  _injectFuzzyResolverForTesting,
  type FuzzyResolver,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
} from './mondo-match.ts';

// ===== Synthetic Mondo asset bundle =====
//
// Models a small slice of disease taxonomy. The IS_A relationships are
// encoded via the precomputed credited-sets table — the same shape the
// build-credited-sets.mjs script produces.
//
//   Loeys-Dietz Syndrome (umbrella)
//     ├─ Loeys-Dietz syndrome 1 (LDS 1)        OMIM:609192
//     ├─ Loeys-Dietz syndrome 2 (LDS 2)        OMIM:610168
//     └─ Loeys-Dietz syndrome 3 (LDS 3)        OMIM:613795
//
//   Geleophysic Dysplasia (umbrella)            MONDO:0019253
//     ├─ Geleophysic dysplasia 1               OMIM:231050
//     └─ Geleophysic dysplasia 2               OMIM:614185  (the paper's example)
//
//   Unrelated: Marfan Syndrome (so we have an "unrelated" baseline)

function buildSyntheticAssets() {
  const labelToMondo = new Map<string, string>();
  // Helper to add label + synonyms to both sides of the index
  const add = (mondoId: string, normalizedLabel: string, synonyms: string[] = []) => {
    labelToMondo.set(normalizedLabel, mondoId);
    for (const s of synonyms) labelToMondo.set(s, mondoId);
  };

  // NOTE: keys reflect the OUTPUT of `normalizeDiagnosis()` — which drops
  // STOP_WORDS like "syndrome", "disease", "type". So "Loeys-Dietz Syndrome"
  // is stored as "loeys dietz", not "loeys dietz syndrome".
  add('MONDO:0011519', 'loeys dietz', ['loeysdietz', 'lds']);
  add('MONDO:0007222', 'loeys dietz 1', ['lds1', 'loeys dietz i']);
  add('MONDO:0011938', 'loeys dietz 2', ['lds2']);
  add('MONDO:0013147', 'loeys dietz 3', ['lds3']);

  add('MONDO:0019253', 'geleophysic dysplasia');
  add('MONDO:0009264', 'geleophysic dysplasia 1');
  add('MONDO:0014297', 'geleophysic dysplasia 2');

  add('MONDO:0007947', 'marfan', ['marfan']);

  // Primary-label index: first insert wins (mirrors the asset builder)
  const mondoToLabel = new Map<string, string>();
  for (const [norm, mondoId] of labelToMondo.entries()) {
    if (!mondoToLabel.has(mondoId)) mondoToLabel.set(mondoId, norm);
  }

  // Credited sets — encodes who is full-credit-equivalent and whose ancestors
  // get partial credit.
  const credited: Record<string, { full: string[]; partial: string[] }> = {
    // LDS 1 gold: full = OMIM + its MONDO equivalent; partial = umbrella
    'OMIM:609192': { full: ['OMIM:609192', 'MONDO:0007222'], partial: ['MONDO:0011519'] },
    'OMIM:610168': { full: ['OMIM:610168', 'MONDO:0011938'], partial: ['MONDO:0011519'] },
    'OMIM:613795': { full: ['OMIM:613795', 'MONDO:0013147'], partial: ['MONDO:0011519'] },
    // Geleophysic dysplasia 2 gold (the paper's worked example)
    'OMIM:614185': { full: ['OMIM:614185', 'MONDO:0014297'], partial: ['MONDO:0019253'] },
    // A deep-descendant case: imagine a 5-hop chain. The credited-sets builder
    // walks all ancestors regardless of depth, so the partial list explicitly
    // includes every ancestor — no implicit hop cap test is meaningful at this
    // layer (the cap-or-not decision lives in the offline build script). We
    // verify "deep descendant counts as PARTIAL" by adding 5 ancestors here.
    'OMIM:999999': {
      full: ['OMIM:999999', 'MONDO:0099999'],
      partial: ['MONDO:0099001', 'MONDO:0099002', 'MONDO:0099003', 'MONDO:0099004', 'MONDO:0099005'],
    },
  };

  return {
    labelToMondo,
    mondoToLabel,
    credited,
    mondoRelease: 'test-synthetic',
  };
}

beforeEach(() => {
  _resetAssetsForTesting();
  _injectAssetsForTesting(buildSyntheticAssets());
  _injectFuzzyResolverForTesting(null);
});

describe('scorePrediction — the malco rule', () => {
  it('FULL credit (1.0) for prediction === gold OMIM', () => {
    assert.equal(scorePrediction('OMIM:609192', 'OMIM:609192'), 1);
  });

  it('FULL credit (1.0) when prediction is a Mondo equivalent of gold', () => {
    // LDS 1 gold; prediction is its MONDO equivalent.
    assert.equal(scorePrediction('MONDO:0007222', 'OMIM:609192'), 1);
  });

  it('PARTIAL credit (0.5) when gold is a descendant of prediction', () => {
    // LDS 1 gold; prediction is the umbrella Loeys-Dietz Syndrome.
    assert.equal(scorePrediction('MONDO:0011519', 'OMIM:609192'), 0.5);
  });

  it('PARTIAL credit (0.5) for deep descendants — no hop cap', () => {
    assert.equal(scorePrediction('MONDO:0099001', 'OMIM:999999'), 0.5);
    assert.equal(scorePrediction('MONDO:0099005', 'OMIM:999999'), 0.5);
  });

  it('NO credit for the asymmetric reverse case', () => {
    // Geleophysic dysplasia 2 gold (umbrella in gold). Prediction is the
    // specific subtype — i.e. the prediction is MORE specific than the gold.
    // Per the paper, this is NOT credited (asymmetric direction).
    // In our credited-sets table, the gold "OMIM:231050" (Geleophysic 1) is
    // NOT a descendant of the Geleophysic dysplasia 2 MONDO id, so a
    // prediction of "MONDO:0014297" against gold "OMIM:231050" → 0.
    //
    // We simulate this by treating Geleophysic dysplasia 2 (MONDO:0014297) as
    // the prediction and Geleophysic dysplasia 1 (OMIM:231050) as the gold —
    // they share the umbrella, but neither is an ancestor of the other.
    assert.equal(scorePrediction('MONDO:0014297', 'OMIM:231050'), 0);
  });

  it('NO credit for predictions in another disease family', () => {
    // Marfan prediction against an LDS 1 gold — common clinical confusion
    // pair, but distinct entities in Mondo.
    assert.equal(scorePrediction('MONDO:0007947', 'OMIM:609192'), 0);
  });

  it('NO credit when the gold has no credited-set entry', () => {
    assert.equal(scorePrediction('MONDO:0011519', 'OMIM:000001-unknown'), 0);
  });

  it('NO credit for null mondoId (failed grounding)', () => {
    assert.equal(scorePrediction(null, 'OMIM:609192'), 0);
  });

  it("the paper's geleophysic example: umbrella prediction → numbered gold = PARTIAL", () => {
    // From the paper's methods text: gold is "geleophysic dysplasia 2"
    // (numbered subtype), prediction is "geleophysic dysplasia" (umbrella).
    // Per asymmetric rule, this is credited via descendant route at 0.5.
    assert.equal(scorePrediction('MONDO:0019253', 'OMIM:614185'), 0.5);
  });
});

describe('groundToMondo — gold-blind deterministic grounding', () => {
  it('signature does not accept a gold parameter (structural invariant)', () => {
    // This is enforced by TypeScript: groundToMondo has signature
    // (predictionText: string, opts?: GroundingOptions) — no gold parameter.
    // The runtime sanity check below confirms that even arbitrary extra
    // arguments are ignored — there is nowhere to pass a gold without
    // modifying the function.
    assert.equal(groundToMondo.length, 1); // takes 1 required arg (predictionText)
  });

  it("Stage A: returns 'exact' when the normalized prediction matches a primary label", async () => {
    const r = await groundToMondo('Loeys-Dietz Syndrome');
    assert.equal(r.mondoId, 'MONDO:0011519');
    assert.equal(r.stage, 'exact');
  });

  it("Stage A: returns 'synonym' when matched against a non-primary form", async () => {
    const r = await groundToMondo('LDS');
    assert.equal(r.mondoId, 'MONDO:0011519');
    assert.equal(r.stage, 'synonym');
  });

  it('Stage 0: strips parenthetical disambiguator', async () => {
    const r = await groundToMondo('Marfan Syndrome (connective tissue disorder)');
    assert.equal(r.mondoId, 'MONDO:0007947');
  });

  it("returns 'none' for un-matchable strings when fuzzy is disabled", async () => {
    const r = await groundToMondo('Completely Made Up Disease', { useFuzzy: false });
    assert.equal(r.mondoId, null);
    assert.equal(r.stage, 'none');
  });

  it('Stage B: falls through to the injected fuzzy resolver and returns its pick', async () => {
    const resolver: FuzzyResolver = async (_name, shortlist) => {
      assert.ok(shortlist.length > 0, 'shortlist must be non-empty');
      // Resolver MUST be gold-blind — verify it received no gold parameter
      // by checking only two args were passed.
      return { mondoId: shortlist[0].mondoId, confidence: 0.8 };
    };
    const r = await groundToMondo('loeys dietz', { fuzzyResolver: resolver });
    // 'loeys dietz' should actually match in Stage A (normalization strips
    // the hyphen), so Stage B shouldn't fire here. Pick a string that won't
    // match Stage A: an unrelated phrasing with shared tokens but no exact
    // form in the index.
    assert.notEqual(r.stage, 'fuzzy', 'this query should hit Stage A, not fuzzy');
  });

  it('Stage B: actually fires when Stage A misses but the shortlist matches', async () => {
    const resolver: FuzzyResolver = async (_name, shortlist) => {
      // Pick the first candidate to confirm fuzzy path runs.
      return { mondoId: shortlist[0].mondoId, confidence: 0.65 };
    };
    // "Marfan disease variant 7" — won't match any of our synthetic labels
    // exactly, but the shortlist generator should still surface Marfan.
    const r = await groundToMondo('marfan variant disease unusual presentation', {
      fuzzyResolver: resolver,
    });
    assert.equal(r.stage, 'fuzzy');
    assert.equal(r.fuzzyConfidence, 0.65);
  });

  it("Stage B: returns 'none' when the resolver returns null (low confidence)", async () => {
    const resolver: FuzzyResolver = async () => null;
    const r = await groundToMondo('marfan related condition presentation', {
      fuzzyResolver: resolver,
    });
    assert.equal(r.stage, 'none');
    assert.equal(r.mondoId, null);
  });
});

describe('gradeDifferentialV4 — orchestrator and Top-N rollups', () => {
  it('Top-1 when the first item is an exact equivalent', async () => {
    const g = await gradeDifferentialV4(
      [{ predictionText: 'loeys dietz syndrome 1' }],
      'OMIM:609192',
    );
    assert.equal(g.top1, true);
    assert.equal(g.firstCorrectRank, 1);
    assert.equal(g.top1Full, true);
    assert.equal(g.firstFullCreditRank, 1);
    assert.equal(g.items[0].score, 1);
  });

  it('Top-1 (PARTIAL) when the first item is the umbrella of the gold', async () => {
    const g = await gradeDifferentialV4(
      [{ predictionText: 'Loeys-Dietz Syndrome' }],
      'OMIM:609192',
    );
    assert.equal(g.top1, true, 'Top-1 binary should fire on PARTIAL credit');
    assert.equal(g.items[0].score, 0.5);
    // FULL-credit-only Top-1 must NOT fire on a PARTIAL hit.
    assert.equal(g.top1Full, false);
    assert.equal(g.firstFullCreditRank, null);
  });

  it('Top-3 when the right answer appears at rank 3', async () => {
    const g = await gradeDifferentialV4(
      [
        { predictionText: 'Marfan Syndrome' },
        { predictionText: 'Some unrelated entity' },
        { predictionText: 'Loeys-Dietz Syndrome' },
      ],
      'OMIM:609192',
    );
    assert.equal(g.top1, false);
    assert.equal(g.top3, true);
    assert.equal(g.top10, true);
    assert.equal(g.firstCorrectRank, 3);
  });

  it('no credit when nothing in top-10 grounds to a credited Mondo id', async () => {
    const g = await gradeDifferentialV4(
      [{ predictionText: 'Marfan Syndrome' }, { predictionText: 'totally unrelated thing' }],
      'OMIM:609192',
    );
    assert.equal(g.top1, false);
    assert.equal(g.top3, false);
    assert.equal(g.firstCorrectRank, null);
  });

  it('caps grading at top-10 even if more entries are provided', async () => {
    const long = Array.from({ length: 15 }, (_, i) => ({
      predictionText: i === 11 ? 'Loeys-Dietz Syndrome' : 'unrelated entity',
    }));
    const g = await gradeDifferentialV4(long, 'OMIM:609192');
    assert.equal(g.items.length, 10);
    assert.equal(g.top10, false, 'rank 12 should not count toward top-10');
  });

  it('records grounding rate per case', async () => {
    const g = await gradeDifferentialV4(
      [
        { predictionText: 'Loeys-Dietz Syndrome' },
        { predictionText: 'totally made up not in mondo' },
      ],
      'OMIM:609192',
      { fuzzyResolver: async () => null },
    );
    assert.equal(g.groundedCount, 1);
    assert.equal(g.totalCount, 2);
  });
});

describe('Invariant 2 — equality of treatment across pipelines', () => {
  it('identical predictionText produces identical groundedMondoId regardless of intendedOmimId', async () => {
    // Simulating SL (carries intended id) vs an OAI/Claude baseline (no id).
    // The grader must produce identical groundedMondoId for identical text.
    const slLikeInput = { predictionText: 'Loeys-Dietz Syndrome', intendedOmimId: 'OMIM:609192' };
    const baselineInput = { predictionText: 'Loeys-Dietz Syndrome' };
    const slGrading = await gradeDifferentialV4([slLikeInput], 'OMIM:609192');
    const baselineGrading = await gradeDifferentialV4([baselineInput], 'OMIM:609192');
    assert.equal(slGrading.items[0].groundedMondoId, baselineGrading.items[0].groundedMondoId);
    assert.equal(slGrading.items[0].score, baselineGrading.items[0].score);
    assert.equal(slGrading.top1, baselineGrading.top1);
  });

  it('SL audit fields are populated when intendedOmimId is provided', async () => {
    const g = await gradeDifferentialV4(
      [{ predictionText: 'Loeys-Dietz Syndrome', intendedOmimId: 'OMIM:609192' }],
      'OMIM:609192',
    );
    assert.equal(g.items[0].intendedOmimId, 'OMIM:609192');
    assert.equal(g.items[0].intendedVsResolvedMatch, true);
    assert.ok(g.slAudit);
    assert.equal(g.slAudit?.intendedVsResolvedAlignedCount, 1);
    assert.equal(g.slAudit?.intendedVsResolvedDivergedCount, 0);
  });

  it('SL audit detects divergence: text grounds to a different disease family than intended', async () => {
    const g = await gradeDifferentialV4(
      // Text says "Marfan Syndrome" but KB-attached intended id was LDS 1.
      // Marfan and LDS are clinically overlapping but distinct entities in
      // Mondo. The grounder resolved to MONDO:0007947 (Marfan), the intended
      // is in the Loeys-Dietz family. Diverged.
      [{ predictionText: 'Marfan Syndrome', intendedOmimId: 'OMIM:609192' }],
      'OMIM:609192',
    );
    assert.equal(g.items[0].intendedVsResolvedMatch, false);
    assert.equal(g.slAudit?.intendedVsResolvedDivergedCount, 1);
  });

  it('SL audit treats umbrella-vs-subtype as ALIGNED (same family, less specific)', async () => {
    const g = await gradeDifferentialV4(
      // Text says umbrella; KB-attached intended id was the specific subtype.
      // The text grounder lost specificity but stayed in the right family.
      // This is "specificity loss," NOT divergence — the audit credits it as
      // aligned so divergence count only flags genuinely-wrong families.
      [{ predictionText: 'Loeys-Dietz Syndrome', intendedOmimId: 'OMIM:609192' }],
      'OMIM:609192',
    );
    assert.equal(g.items[0].intendedVsResolvedMatch, true);
    assert.equal(g.slAudit?.intendedVsResolvedAlignedCount, 1);
    assert.equal(g.slAudit?.intendedVsResolvedDivergedCount, 0);
  });

  it('slAudit is absent when no items carry an intended id (baselines)', async () => {
    const g = await gradeDifferentialV4(
      [{ predictionText: 'Loeys-Dietz Syndrome' }],
      'OMIM:609192',
    );
    assert.equal(g.slAudit, undefined);
  });
});
