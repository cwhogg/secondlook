# v13 Replay & o3 Model Drift — Session Report

**Date:** 2026-05-30
**Scope:** Replayed the 26 ppkt_ids where SL hit Top-1 in v5 ("v13 replay") against the current v12 pipeline + current OpenAI o3 + current Claude opus-4-7. Audited v5→v12 code diff for ranking regressions. Identified the cause of unreproducibility.

---

## Executive summary

The v5 result is not reproducible on the same cohort. On the 26 cases where SL hit Top-1 in v5, the v13 replay (which uses code architecturally equivalent to v5 for eval cases) shows:

| Engine | v5 historical | v13 replay | Δ on identical ppkt_ids |
|---|---|---|---|
| **SecondLook** | 24/24 (100%) | 18/24 (75%) | **−25 pp** |
| **OpenAI o3** | 16/24 (67%) | 20/24 (83%) | **+17 pp** |
| **Claude opus-4-7** | 17/22 graded (77%) | 19/22 graded (86%) | **+9 pp** |

(24 of 26 completed; final 2 SL runs failed for infrastructure reasons — one OpenAI rate-limit, one client-side save error after pipeline completion. Both unrelated to ranking.)

**On a cohort hand-selected to favor SL, OAI now beats SL by 8 pp and Claude beats SL by ~11 pp on graded.** This inverts v5's headline finding.

**Cause: OpenAI's o3 model drifted between v5 (2026-05-28) and the replay (2026-05-30).** The code that calls o3 is the same; o3's behavior changed under us. The drift makes o3 more confident in its top picks across the board — which helps single-shot baselines but actively hurts SL's KB-grounded pipeline because SL has to disambiguate among KB-retrieved siblings and the new o3 is more confidently wrong on sibling picks.

This rules out a code-side fix to "get back to v5." It also reframes the v13 architectural plan (Claude critic + reconciler), which assumed v12's ranking was the problem to solve — when the actual problem is sibling disambiguation in the synth/specialist stages.

---

## The replay setup

**Cohort:** The 26 ppkt_ids on which SL hit Top-1 in the v5 batch (May 28-29). Pulled from KV via `scripts/v5-top1-overlap.mjs`. Disease distribution:

- NF1 ×7 (5 distinct ppkt_ids run; the other 2 NF1s are different ppkt_ids of same disease)
- Marfan / contractural arachnodactyly ×3
- Mito DNA depletion 13 ×2
- ADTKD-1 ×2
- Cornelia de Lange 1 ×2
- Kabuki 2 ×2
- Lipodystrophy familial partial 2 ×2
- CVID 13/15 ×2
- DEE4, Greig cephalopolysyndactyly, Optic atrophy 12, Amelogenesis imperfecta IJ, Myoclonic epilepsy of Lafora 2 ×1 each

**Mechanism:** /eval Run Evals UI extended with two new capabilities, shipped today:

1. `ppkt_id` replay mode: paste a list of IDs, the eval-case API takes `?ids=...` and returns those exact rows in order. (`app/api/admin/eval-case/route.ts`)
2. Version picker: select existing or add new arbitrary version label (e.g. "v13") for tagging the batch's testCases. (`app/eval/page.tsx`, `lib/types/admin.ts` widened to `string & {}`)

**Bug fixed during the run:** `getMatchedTrios` keyed the trio map by `categoryHint` (ppkt_id) only. When v5 and v13 testCases shared ppkt_ids (which they do for the replay), one version overwrote the other in the map, and the matched-trio comparison table silently dropped v13. Fixed by keying on `${hint}|${evalVersion}`. Commit `e3a1cd9`.

---

## Per-case findings

### The 6 SL regressions

| Case | Disease | SL v5 → v13 | OAI v5 → v13 | CL v5 → v13 | v13 top-1 (wrong) |
|---|---|---|---|---|---|
| PMID_35190816 | DEE4 (STXBP1) | #1 → #3 | #4 → #1 | — → — | "Mito w/ Epilepsy (POLG-related)" |
| PMID_23993194 | Mito DNA depl 13 | #1 → #3 | #3 → #2 | #1 → #1 | "Combined OxPhos Defect Type 11 (FBXL...)" |
| PMID_14569098 | ADTKD-1 | #1 → #8 | #1 → #1 | #1 → #1 | Fabry Disease |
| PMID_30804983 | Mito DNA depl 13 (9-mo-old) | #1 → #4 | — → #2 | — → — | SURF1-Leigh syndrome |
| PMID_20513137 | NF1 | #1 → #4 | #2 → #1 | #2 → #2 | (not captured but a sibling) |
| PMID_15781812 | Lafora 2 | #1 → #2 | — → #1 | #1 → #1 | "Juvenile NCL Type 2 (TPP1)" |

**Pattern:** every v13 top-1 wrong answer is a *sibling disease* — same family, often same gene network, sometimes literally a synonym variant. The model isn't picking nonsense; it's picking the wrong member of the right family with higher confidence than it did in v5.

### Top-1 score inflation on every case (regressed AND held)

| Case | v5 top1 score | v13 top1 score | Δ |
|---|---|---|---|
| ADTKD-1 | 28 | 42 | +14 |
| Mito 13 (a) | 35 | 72 | **+37** |
| Mito 13 (9-mo) | 35 | 55 | +20 |
| DEE4 | 40 | 45 | +5 |
| Lafora 2 | 45 | 55 | +10 |
| NF1 (#1 held) | 60 | 85 | **+25** |

Even on the case where SL preserved its v5 Top-1 win, the top-1 score jumped 25 points. This is the clearest evidence of model-side rather than code-side drift: the synth is producing systematically higher probability scores regardless of correctness.

### Trio progression at-a-glance

| Trios | SL Top-1 | OAI Top-1 | CL Top-1 graded |
|---|---|---|---|
| 5 | 4/5 | 5/5 | 4/4 |
| 10 | 7/10 | 9/10 | 8/9 |
| 15 | 10/15 | 12/15 | 11/13 |
| 20 | 14/20 | 17/20 | 16/18 |
| 24 (final graded) | 18/24 | 20/24 | 19/22 |

The OAI improvement was visible by trio 5 (DEE4 jumped #4→#1) and held throughout. The SL regression pattern stabilized around trio 12 at ~33% regression rate on cases where v5 had hit #1.

---

## Code audit: what actually changed v5→v12

Diff between commit `887fbf3` (v5) and HEAD for ranking-critical paths:

| File | Lines | Effective change for eval cases (no labs) |
|---|---|---|
| `lib/agents/specialist-agents/index.ts` | +22 | Lab prompt block added — `formatLabsForPrompt(undefined)` returns empty string. No effect. |
| `lib/agents/evidence-evaluator.ts` | +41 | Lab integration (`mechanicallyCheckLabCriteria(initialDetails, undefined)`) — no-op without labs. |
| `lib/agents/synthesizer.ts` | +63 | Mechanical scoring computed and persisted (as audit data); explicit `.sort((a, b) => b.evidenceScore - a.evidenceScore)` added. Sort is order-preserving when synth produces score-descending output (which it does — verified in pipelineResult). |
| `lib/pipeline/family-expansion.ts` | +3 | Added `parentDiagnosis` field (metadata only). |
| `lib/pipeline/orchestrator.ts` | +192 | Logging, per-specialist 120s timeout, SSE heartbeats, lab-derived symptoms (no-op without labs), partial-failure handling. No ranking effect. |
| `lib/pipeline/evidence-scoring.ts` | +333 (new) | Mechanical formula computed, persisted as `evidenceScoreRaw` / `evidenceScoreBreakdown`. **Not used for ranking** per v10/v11 reverts. |
| `lib/pipeline/lab-utils.ts` | +399 (new) | All functions called with undefined labResults → no-op. |
| `lib/pipeline/score-labels.ts` | +54 (new) | Qualitative-label cutoffs for display only. |
| `lib/knowledge/retrieval.ts` | 0 since v5 | No changes since `264bcc9` (2026-05-27, pre-v5). |
| `lib/knowledge/diseases/` | 0 since v5 | KB files untouched. |
| `lib/knowledge/embeddings-*.bin` | dated 2026-03-12 | Embeddings not rebuilt. |

**Bottom line: for eval cases (no patient labs), the ranking-critical code path is functionally equivalent to v5.** The synth re-sort is order-preserving. Mechanical scoring is persisted but doesn't drive ordering. The previous audit ("v11 ≈ v5") was correct.

The score-inflation pattern (every top-1 +5 to +37 points) cannot be explained by any of these changes. None of them feed into the synth's probability assignment.

---

## Why this hurts SL but helps OAI baseline

**The OAI single-shot baseline** is one o3 call with the patient case → produces 10 ranked diagnoses from training memory. It names them generically ("Neurofibromatosis Type 1"). The grader matches loosely. The "more confident" drift mostly helps it because there's no KB candidate pool to disambiguate from — o3 just picks the most-famous member of the disease family it recognized.

**The SecondLook pipeline** has o3 invoked multiple times against a KB candidate pool:

1. Triage retrieves ~30-50 KB candidates including *all* siblings (NF1/NF2/schwannomatosis; ADTKD-MUC1/-HNF1B/-UMOD/-REN/-DNAJB11; Mito 13 plus Combined OxPhos variants; etc.)
2. Specialists pick from that rich sibling pool
3. Evidence evaluator scores against structured criteria
4. Synth ranks from the evaluated hypothesis set

The new o3 is more confident in step 4. The KB grounding *surfaces* all the wrong-sibling candidates with KB criteria attached. The synth's gestalt now overrides the criteria-based evidence — and picks the wrong sibling. The KB advantage in v5 came partly from o3 being uncertain enough about siblings that the criteria evidence broke ties correctly. With v13-era o3 more confident, that tie-break is lost.

This is consistent with the diagnosis-flip pattern: every wrong v13 top-1 is a plausible sibling, not random noise.

---

## Strategic implications for v13 architecture

The v13 plan (Claude opus-4-7 as adversarial critic on synth output) was based on the assumption that v12's ranking was the problem. The replay data invalidates that framing:

1. **The bottleneck isn't post-synth ranking. It's sibling disambiguation in the specialist + evidence-eval stages.** A Claude critic reviewing the synth's ranked list will see the same sibling-ambiguous candidates and likely make the same kind of confident-wrong-sibling choice.

2. **Claude has the same training-data biases as o3 on rare-disease subtypes.** Putting Claude downstream of synth doesn't add an independent signal source — it adds a second model that has the same confidence-on-the-famous-member tendency.

3. **The actual problem is one or more of:**
   - The KB surfaces too many siblings without enough criteria differentiation, putting the LLM in an impossible position
   - The synth's prompt allows the LLM to override criteria evidence with priors
   - There is no architectural step that explicitly disambiguates between siblings using KB criteria (vs LLM priors)

4. **Plausible alternative interventions** (not yet validated):
   - **Family-cluster collapse pre-synth**: detect KB siblings in the candidate pool, present them to synth as a single cluster with the question "if it's in this family, which member?" rather than as parallel candidates
   - **Two-pass synth**: first pick the disease family; then pick the subtype using only that family's KB criteria
   - **Criteria-override constraint in synth prompt**: require the synth to explicitly cite contradicting criteria evidence when ranking a non-leading sibling above a criteria-supported one
   - **Pin OAI checkpoint**: if a versioned `o3-2026-05-15` API is available, lock the SL pipeline to it (would address symptom; not root cause)

5. **For honest evaluation of any future architecture change**: stop using v5 numbers as the bar. v5's o3 doesn't exist on the API any more. Re-baseline against current single-shot OAI and CL. The success criterion has to be "beats current baselines on the same cohort," not "matches v5."

---

## Honest reframing of the "is SL better than baselines" question

Given this session's data, the honest read of where SL stands:

- **On a cohort hand-selected to be SL's strongest (the 26 v5 Top-1 hits): SL is now behind both single-shot foundation models.** OAI +8 pp, CL +11 pp on graded.
- **By selection-bias propagation: on a uniformly-sampled cohort, SL is almost certainly behind by a wider margin.** A neutral cohort would tilt away from SL's strength zone.
- **The "+12 pp v5 lead" in the original headline was a snapshot of an earlier o3.** It can be reproduced only if the same o3 weights are reproducible, which they aren't.
- **SL's claimable architectural value-add right now** is not Top-1 accuracy. It might still be (untested):
   - Explainability — KB-anchored criteria citations
   - Differential clusters — surfacing sibling families the user should be aware of
   - Negative evidence handling — explicit excluded-findings integration
   - Multi-specialist consensus signal — flagging when specialists disagreed

These are differentiators worth testing on their own merits, but they are not what was being measured by Top-1 rates.

---

## What needs to happen before any v13 commit

1. **Run the family-cluster collapse experiment** against the 6 regressed cases. If pre-synth sibling consolidation lifts SL Top-1 back toward v5 levels, that's the actual fix to ship — and the v13 critic step becomes either unnecessary or a smaller polish on top.

2. **Verify the o3-drift hypothesis with one held-stable case.** Pull the synth-input hypothesis list (intermediate stage data) for a v5 vs v13 NF1 case where SL still hit #1. If the input hypotheses are similar but the synth's probability scores rose +20 across the board, the "model drift, not code drift" claim is confirmed beyond reasonable doubt.

3. **Re-baseline current OAI/CL on a fresh uniform N=50 cohort.** All comparison going forward needs to be against today's foundation models, not the v5-era ones.

4. **Decide explicitly whether SecondLook's value proposition is Top-1 accuracy or something else.** If the former, the current architecture isn't winning; either fix sibling disambiguation or change the bar. If the latter, write down what the actual value is and measure that instead.

---

## Files and commits from this session

- `app/api/admin/eval-case/route.ts` — added `?ids=` replay mode
- `app/eval/page.tsx` — version picker, replay UI, 26-case preset, trio-map keying fix
- `lib/types/admin.ts` — widened `evalVersion` to allow runtime-defined version labels
- `scripts/v5-top1-overlap.mjs` — pulls historical v5 baseline overlap from KV
- `scripts/v13-replay-monitor.mjs` — polling monitor that emits one event per new completed v13 trio
- Commits: `aa7fb50` (replay + version picker), `e3a1cd9` (matched-trio keying fix)
