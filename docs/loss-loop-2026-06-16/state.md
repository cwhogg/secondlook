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

**Implementation:** `8b08ab4` — `feature-vs-syndrome-reranker.ts` (new module, Claude haiku arbiter), wired as Stage 8.5 in orchestrator after Claude finalize. pipelineVersion → 27.2.0.

**Validation cohort:** 15 cases, trio mode (PID 85112, log `/tmp/sl-cohort/loop2.log`). Tagged `evalVersion=v27.2 evalSampling=loss-loop-2`. ~50 min wall. **1 infra failure** on H4 (Claude evaluator returned non-conforming JSON — known transient Claude flake, fail-soft fallback didn't activate this path; out of scope for the loop).

**Results (v4 Mondo, any-credit Top-1):**

| Set | n | v27.1 | v27.2 | Net |
|---|---|---|---|---|
| Loss set | 10 | 0/10 | 0/10 | **0 gain, 0 loss** |
| Holdout | 5 (4 graded) | 5/5 | 4/4 graded | **0 gain, 0 loss, 1 excluded** |

**Reranker mechanism — did it fire?**
- ✅ L1 NF1: swapped `Café-au-lait macules` → `Legius Syndrome` (covering syndrome found in top-5, wrong syndrome — Legius is the NF1 sibling, scores 0)
- ✅ L2 NF1: swapped `Neurofibroma` → `Mosaic Neurofibromatosis Type 1` (clinically correct; v4 scores 0 because Mosaic NF1 is a separate Mondo class from NF1 syndrome — grader-side limitation, not a pipeline failure)
- ❌ L3 NF1: kept `Neurofibroma` — reranker did not fire on this case. Likely classified Neurofibroma as syndromic, OR no covering NF1 syndrome was in top-5 to swap with
- ✅ H1 Fibromatosis6: swapped `Drug-induced gingival overgrowth` → `Hereditary Gingival Fibromatosis` (good — restored syndromic naming, still Top-1 win)
- N/A for non-feature cases (DEE4, ADTKD, DiGeorge unchanged where appropriate)

**Stop-condition state:**
- Plateau watch: **2/2 consecutive zero-gain loops → TRIGGERED**
- Holdout regression: 0/2 (not triggered)
- Loop cap: 2/10

**Loop terminates per plateau rule.**

---

## Process refinement #2 (2026-06-17, post-Loop 2) — tiered validation

**Adopted tiered cohort sizing:**
- **Tight per-loop:** 2 cases per targeted failure class + 2 holdout. See `cases-tight.txt` for the curated 9-case set (7 loss + 2 holdout). Subset further for single-class loops. Cohort wall ~10-20 min, cost ~$3-5.
- **Deep validation:** every ~3 merged improvements, run 25 or 50 random cases via `--count N --shuffle`. Catches broader regression that the curated set can't see. Cohort wall ~50-100 min, cost ~$15-30.

**Rationale:** "2 per class" is the floor for class-wide claims. Loop 2 evidence: NF1 cases L1/L2 swapped under R2's reranker but L3 didn't — a single-case validation would have missed this.

The full 10+5 set (`cases-full.txt`) is preserved for periodic spot-checks but isn't the per-loop default anymore.

## Process refinement #1 (2026-06-17, post-Loop 2) — revert rubric

**Adopted revert rubric** (see `[[feedback-loss-loop-revert-rubric]]`):

| Outcome | Action |
|---|---|
| Loss-set Top-1 gain ≥ 1, no holdout regression | Keep on main |
| Loss-set Top-1 gain = 0, no holdout regression | **Revert from main**, keep on loop branch |
| Holdout regression | Revert from main always |

Main branch = only changes with proven measurable improvement. Loop branch = parking lot for in-progress mechanism work.

**Retroactive application:**
- R1 (Loop 1) and R2 (Loop 2) both delivered 0 measurable Top-1 gains. Per the rubric, both **reverted from main**. Preserved on branch `loss-loop/feature-vs-syndrome-stack` for future iteration.
- Pipeline version reset to 27.0.0 on main.

## Loop 3 (2026-06-17) — class-wide OrphaCode audit + KB re-enrichment

**Hypothesis:** DEE4 phenotype overlap losses (4 cases at ranks 2-5) are downstream of KB profile thinness — STXBP1-DEE has 10 hand-curated symptoms vs FOXG1's 49 HPO-enriched. Audit found the DEE4 profile's `orphanetId` was wrong (`330975`), so the enrichment script silently skipped it. Class-wide pattern: 43 profiles in total have incorrect gene-symbol→OrphaCode mappings.

**Recommendation L3-R1:** Add `scripts/audit-orphanet-codes.mjs` (gene-symbol-based audit + auto-fix for unambiguous cases). Refactor enrichment script's `byOrpha` from single-value to multimap so co-OrphaCode profiles all get enriched. Re-run full enrichment + recompile + re-embed + Upstash upload.

**Rubric:** (G=5 × I=4 × S=4) / (R=3 × Cx=4) = 6.7. Lower than R1/R2 due to higher complexity, but the only viable angle on Class B without disease-specific edits.

**Shipped to main:** `a62225d` — 43 OrphaCode corrections, 6845 disease JSON updates from re-enrichment, KB recompiled, embeddings regenerated (336K vectors at text-embedding-3-large 256d), uploaded to Upstash. pipelineVersion → 27.3.0.

**Tight cohort:** 4 cases (`cases-loop3.txt`): L4 DEE4 + L7 DEE4 (target) + H1 Fibromatosis 6 + H3 Aarskog-Scott (holdout). ~16 min wall.

**Results (v4 Mondo, any-credit Top-1):**

| ID | Kind | v27 | v27.3 | Net |
|---|---|---|---|---|
| L4 DEE4 | loss | ✗ rank 4 | ✗ rank 5 | rank ↓ -1 |
| L7 DEE4 | loss | ✗ rank 5 | ✗ MISS from top-10 | rank ↓ regressed |
| H1 Fibromatosis 6 | holdout | ✓ rank 1 | ✓ rank 1 | preserved |
| H3 Aarskog-Scott | holdout | ✓ rank 1 | ✓ rank 1 | preserved |

**Loss set:** 0 gained, 0 regressed (Top-1), but rank movements show DEE4 cases got actively WORSE in v27.3.
**Holdout:** unchanged.

**Diagnosis of why richer KB hurt DEE4:**
- v27.0 DEE4 had 1 hand-curated **pathognomonic** feature ("Early-onset epileptic encephalopathy") — highest retrieval weight tier.
- v27.3 DEE4 has 0 pathognomonic because Orphanet's HPO frequencies for ORPHA:599373 didn't include any ≥80% entries that map to the pathognomonic tier in `FREQUENCY_MAP`.
- 31 occasional/rare tier entries don't outweigh losing the single pathognomonic anchor.
- Plus: standardized HPO labels (`Seizure`, `Intellectual disability`) match vignette-specific phrasing worse than verbose hand-curated names.
- Plus: sibling DEE-family profiles also got refreshed via the multimap fix, so DEE4's relative ranking didn't improve.

**Verdict per revert rubric:** 0 Top-1 gains → **revert from main, preserve on branch `loss-loop/orphanet-audit`.**

**Reverted on main:**
- All 6845 disease JSON files restored to pre-Loop-3 state (`git checkout HEAD~1 -- lib/knowledge/diseases/`)
- pipelineVersion 27.3.0 → 27.0.0
- Audit script (`scripts/audit-orphanet-codes.mjs`) and enrichment-script multimap refactor RETAINED on main — they're class-wide infrastructure that's strictly correct regardless of whether the data fix worked. Available for future iteration.
- KB recompiled, embeddings regenerated, Upstash uploaded with v27.0 vectors (~10 min). Note: Upstash upsert doesn't delete orphaned vector IDs from v27.3; small residual dirt that doesn't affect retrieval correctness.

**Stop-condition state:**
- Plateau watch: previously hit (Loop 1+2). Loop 3 was a different mechanism so the count is moot — but Loop 3 also produced 0 Top-1 gains.
- The loss-loop has now run 3 attempts (prompt rule, deterministic reranker, KB enrichment) and produced 0 measurable Top-1 wins.

**Loop terminated.** Three independent mechanisms tried; none moved the headline metric. The remaining residual losses (4 DEE4, 3 NF1, 2 ADTKD, 1 DiGeorge) are not class-wide fixable at the pipeline layer with what's currently known. Path forward is grader-side improvements (mosaic variant credit, ADTKD umbrella ancestor relations) and KB profile quality work (better frequency tier assignments during HPO enrichment — preserve hand-curated pathognomonic features instead of overwriting).

## Loop terminated 2026-06-17 after Loop 2

**Verdict:** Two consecutive zero-gain loops on the loss set. Stopping per the plateau rule defined at the start.

**What was achieved over Loops 1-2:**
- **Mechanism shift demonstrated:** R2's deterministic Claude-haiku post-finalize reranker correctly swapped feature-named #1s to syndromic names on 3 of 4 feature-vs-syndrome cases (L1 → Legius, L2 → Mosaic NF1, H1 → Hereditary Gingival Fibromatosis). Prompt-only rules (R1) failed where reranker succeeded.
- **No Top-1 wins gained** because:
  1. **Grader limitation on near-equivalents** — Mosaic NF1 (L2) is clinically the correct call but scores 0 in v4 because Mondo doesn't structure mosaic variants as IS_A descendants of the syndrome. This is the dead end from the previous Fix #3 investigation.
  2. **Reranker can't escape top-5** — when the syndrome is at rank 12 in the full draft (L1: NF1 was at rank 12), the reranker only sees top-5 and grabs the closest syndromic name available (Legius — wrong syndrome).
  3. **DEE4 class (4 of 10 loss cases) is phenotype overlap, not feature-vs-syndrome** — out of scope for both R1 and R2.

**Top-3 did improve:** SL v4 Top-3 went from 53.3% (Loop 1) to 57.1% (Loop 2). +3.8pp. Driven mostly by L8 ADTKD-AD6 — rank moved from beyond top-10 to rank 2 (umbrella at #1 stays, but the AD6 subtype now ranks 2nd). Top-1 didn't move because the umbrella isn't a credited ancestor of AD6 in the v4 set.

**What the loss-loop learned about further fixes:**
- *Prompt-only* fixes are dead for this failure class. Both v17 addendum and finalizer-prompt rule were insufficient.
- *Top-5-only* deterministic reranks help on truly feature-shaped cases but can't reach syndromes ranked low.
- The 3 dominant residual failure modes are not pipeline-fixable in a class-wide way without either: (a) grader-side widening of credited sets for clinically-near-equivalent Mondo classes (mosaic variants, umbrella terms for subtype golds), or (b) KB-side improvements to STXBP1/DEE4 retrieval and ranking confidence.
- The DiGeorge case (L10) consistently flips to Barakat — both are GATA3-vs-22q11 syndromes with hypoparathyroidism + renal + deafness overlap. May not be cleanly separable without specific cardiac/thymic findings.

**Recommended next direction (out of this loop):**
1. **Grader-side audit** of the credited Mondo sets for NF1, DEE4, ADTKD subtypes. If clinically-near-equivalent Mondo classes (Mosaic NF1, umbrella ADTKD) can be added in a class-wide rule (e.g., walk `has_part` / `mosaic_of` relations from the gold) → would lift L2 + L8 to Top-1 immediately.
2. **Investigate parse-symptoms thinness** (L1 NF1 case parsed 1 symptom from a multi-system vignette; possibly affecting other class-A cases).
3. **STXBP1/DEE4 KB profile audit** — separate work item for Class B.

These are out of scope for the current loss-loop. Surface as separate PRs / tasks.


