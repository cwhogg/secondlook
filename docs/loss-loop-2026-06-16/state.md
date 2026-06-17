# Loss-Loop State

Source-of-truth file. Appended each loop with: failure-category analysis, recommendations + rubric scores, fixes shipped, post-loop deltas.

Frozen inputs: see `loss-set.md` for the 10 loss cases + 5 holdout cases. Both lists are unchangeable for the duration of the loop.

## Baseline measurement (v27, pre-loop)

v4 Mondo grader, any-credit Top-1.

| Set | n | SL Top-1 (any) | SL Top-3 (any) | SL Top-10 (any) | SL Top-1 (FULL) |
|---|---|---|---|---|---|
| Loss set | 10 | 0/10 = **0%** | 1/10 = 10% (case 4 at rank 4 → no Top-3) — actually need to recount | TBD | 0/10 |
| Holdout | 5 | 5/5 = **100%** | 5/5 = 100% | 5/5 = 100% | 4/5 = 80% (case 7 had no FULL) |

Holdout baseline is the regression watermark. Drops in any cell are warning signals; 2 consecutive loops with net Top-1 drop ends the loop.

## Rubric

`Score = (G × I × S) / (R × Cx)`

| Factor | 1-5 | Meaning | Gate |
|---|---|---|---|
| **G** Generalizability | high = class-wide | applies across multiple diseases / patterns | **≥3 required** |
| **I** Impact | high = many losses | # of loss-set cases plausibly affected | — |
| **S** Soundness | high = fits architecture | reuses v17 primitives, minimal divergence | — |
| **R** Regression risk | high = risky | probability of hurting non-loss cases (hot path edits) | **≤3 required** |
| **Cx** Complexity | high = big change | size/structural footprint (500-line refactor = 5) | — |

Self-check `[[feedback-no-specific-fixes-vigilance]]` before scoring G > 2.

## Stop conditions

1. 10 loops elapsed
2. **Plateau:** 2 consecutive loops with zero new loss-set Top-1 wins
3. **Regression:** 2 consecutive loops with net holdout Top-1 drop (any-credit)

---

## Loop entries

### Loop 1 (2026-06-17) — R1 ineffective

**Recommendation R1:** Add hard FEATURE-VS-SYNDROME rule to Claude finalizer system prompt; harden the same rule in v17 specialist annotation addendum.

**Rubric score:** (G=5 × I=4 × S=5) / (R=2 × Cx=1) = 50

**Shipped:** `29d51e7` — `claude-finalizer.ts`, `specialist-v17.ts`, `orchestrator.ts` pipelineVersion → 27.1.0

**Validation cohort:** 15 cases (10 loss + 5 holdout), trio mode, ~46 min wall (PID 84358, log `/tmp/sl-cohort/loop1.log`). Tagged `evalVersion=v27.1 evalSampling=loss-loop-1`.

**Results (v4 Mondo, any-credit Top-1):**

| Set | n | v27 | v27.1 | Net |
|---|---|---|---|---|
| Loss set | 10 | 0/10 | 0/10 | **0 gain, 0 loss** |
| Holdout | 5 | 5/5 | 5/5 | **0 change** |

**Per-case rank shifts on loss set:**
- L4 DEE4: rank 4 → 3
- L5 DEE4: MISS → MISS (different sibling syndrome at #1)
- L6 DEE4: MISS → rank 6 (gold entered top-10)
- L7 DEE4: rank 5 → 2
- L10 DiGeorge: `Hypoparathyroidism` (raw feature) → `Barakat syndrome` (a syndrome containing hypoparathyroidism — rule fired but picked wrong syndrome)
- L1-L3 NF1: unchanged. SL #1 = `Neurofibroma` / `Café-au-lait macules` despite NF1 being in full draft ranking (L2: at rank 12).

**Diagnosis of R1 failure mode:**
Pulled L2 pipeline trace. The Claude finalizer DID receive Neurofibromatosis Type 1 in its draft ranking but did not promote it. Hypothesis: finalizer's lexical reading treats disease-shaped feature names (`Neurofibroma`, `Café-au-lait macules`, `Hypoparathyroidism`) as syndromes, so the rule's antecedent ("if your top-1 names a feature") doesn't fire. The rule only worked on L10 (DiGeorge — `Hypoparathyroidism` IS feature-shaped enough that Claude classified it as one), but Claude picked the wrong syndrome that also contains the feature.

**Stop-condition state:**
- Plateau watch: 1/2 consecutive zero-gain loops
- Holdout regression: 0/2 consecutive net Top-1 drops
- Loop cap: 1/10
- **Continuing to Loop 2.**

**Key learning:** Prompt-only fixes cannot override the LLM's lexical bias when feature names look like disease names. Loop 2 must change the mechanism, not push prompt-rule harder.

---

### Loop 2 (2026-06-17) — in progress

**Hypothesis from L1 evidence:** A deterministic post-finalize step that ASKS Claude haiku to explicitly classify each top-K as "syndromic disease entity" vs "single feature/finding/lesion" — and then enforce syndrome-over-feature ordering — bypasses the lexical-bias problem in the Claude finalizer.

**Recommendation L2-R1:** New post-finalize stage `feature-vs-syndrome-reranker`. Single Claude haiku call. Sees top-5 + brief patient context. Output: reordered top-5 with the most syndromic entity at #1, only when a feature is at #1 AND a covering syndrome is below. Otherwise pass-through.

**Rubric:** (G=5 × I=4 × S=4) / (R=2 × Cx=3) = 13.3
**L2-R2 considered (rejected):** Even-stronger prompt rule. (G=4 × I=1 × S=5) / (R=2 × Cx=1) = 10. L1 evidence says prompt-only is at I≈0.
**L2-R3 considered (deferred):** Parse-symptoms robustness audit (NF1 L1 had 1 parsed symptom, L2 case ran with 5; thin parsing may be related but isn't load-bearing for the NF1-naming bug since NF1 was in the ranking anyway).

**Implementation:** see commit (TBD).

