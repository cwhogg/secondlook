# Autonomous Loops (Loops 4–8)

Continuing from `docs/loss-loop-2026-06-16/state.md` (loops 1–3, all reverted).

## Setup
- **Case set:** `cases.txt` — 4 loss (2 NF1 + 2 DEE4) + 2 holdout. Smaller than the curated tight set for faster iteration.
- **Revert rubric:** `[[feedback-loss-loop-revert-rubric]]` — never merge to main without measurable signal. Loop branches preserve all attempts.
- **Per-loop budget:** ≤2 cohort runs (initial + 1 iteration if first showed signal). Hard cap.

## Baseline (v27.0 on these 6 cases, from prior loop measurements)

| Case | Gold | v4 v27.0 |
|---|---|---|
| L1 NF1 | NF1 | ✗ |
| L2 NF1 | NF1 | ✗ |
| L4 DEE4 | DEE4 | ✗ (rank 4) |
| L7 DEE4 | DEE4 | ✗ (rank 5) |
| H1 Fibromatosis 6 | Fibrom 6 | ✓ |
| H3 Aarskog-Scott | Aarskog | ✓ |

Loss-set v27.0 Top-1: 0/4. Holdout: 2/2. Net: 2/6.

---

## Loop entries

### Loop 4 (2026-06-17) — specialist EXPLICIT DIFFERENTIAL prompt

**Target:** DEE4 phenotype overlap class. Add a v17 OUTPUT RULE forcing the specialist to name 2-3 closest competing diagnoses for their TOP and cite a distinguishing patient feature for each.

**Rubric:** (G=5 × I=3 × S=5) / (R=2 × Cx=1) = 37.5

**Shipped:** `c9d0b7e8` on main (cherry-picked from `loss-loop/loop-4-differential-reasoning`). pipelineVersion → 27.4.0.

**Results (v4 Mondo, any-credit Top-1, n=5 — H3 errored):**

| Pipeline | Top-1 | Top-3 | Top-10 |
|---|---|---|---|
| **SL v27.4** | **0.0%** | 40.0% | 60.0% |
| OAI o3 | 80.0% | 80.0% | 80.0% |
| Claude Opus | 40.0% | 60.0% | 60.0% |

**Per case:**
- L1 NF1: `Neurofibroma` #1 → v4 ✗
- L2 NF1: `Neurofibroma` #1 → v4 ✗
- L4 DEE4: PEHO #1 → v4 ✗ (was rank 4 in v27.0; now rank 2 — minor improvement but still no Top-1)
- L7 DEE4: `Multiple Congenital Anomalies-Hypotonia-Seizures Syndrome` #1 → v4 ✗
- H1 Fibromatosis 6: `Drug-induced gingival hyperplasia` → ✗ — **HOLDOUT REGRESSION** (v27.0 was ✓ via fuzzy grounding of "Drug-induced gingival overgrowth"; the new phrasing "hyperplasia" failed fuzzy match)
- H3 Aarskog-Scott: ERROR (excluded from grading)

**Verdict:** 0 loss-set gains + holdout regression → **revert always.** `ebb3686e` on main reverts.

**Why the holdout regression?** The differential reasoning rule may have made the specialist think harder about the H1 vignette ("Few cafe-au-lait... features were excluded: ..."), shifting their top from "Hereditary Gingival Fibromatosis" (syndromic) to "Drug-induced gingival hyperplasia" (a feature/cause). The Mondo grounder's fuzzy stage credited "overgrowth" but not "hyperplasia" — that's a grader-side fragility we hit by accident.

**Loop 4 ends with 1 attempt (no within-loop iteration since reverted).** Branch `loss-loop/loop-4-differential-reasoning` preserves the work.

---

### Loop 5 (2026-06-17) — bump specialist KB candidate window 10→20

**Target:** DEE4/NF1 phenotype overlap. Hypothesis: the right syndrome may sit outside the top-10 KB matches per specialist, so it never enters the differential.

**Rubric:** (G=5 × I=3 × S=4) / (R=3 × Cx=1) = 20

**Shipped:** `f376a364` on main (cherry-picked from `loss-loop/loop-5-candidate-limit-20`). pipelineVersion → 27.5.0. One-line change: `slice(0, 10)` → `slice(0, 20)`.

**Results (v4 Mondo, any-credit Top-1, n=6):**

| Pipeline | Top-1 | Top-3 | Top-10 |
|---|---|---|---|
| SL v27.5 | **50.0%** | 66.7% | 83.3% |
| OAI o3 | 50.0% | 66.7% | 66.7% |
| Claude Opus | 50.0% | 66.7% | 83.3% |

**Per case (authoritative from v4Grading):**

| ID | Gold | v27.0 SL #1 | v27.5 SL #1 | Delta |
|---|---|---|---|---|
| L1 NF1 | NF1 | Neurofibroma ✗ | Neurofibroma ✗ | same |
| L2 NF1 | NF1 | Neurofibroma ✗ | **Neurofibromatosis Type 1 ✓** | 🟢 **GAIN** |
| L4 DEE4 | DEE4 | PEHO ✗ rank 4 | PEHO-like ✗ rank 4 | same (rank preserved) |
| L7 DEE4 | DEE4 | DDX3X ✗ rank 5 | GNAO1 ✗ rank 2 | same Top-1, gold rank ↑ |
| H1 Fibromatosis 6 | Fibrom 6 | Hereditary Gingival Fibromatosis ✓ | Drug-induced gingival overgrowth ✓ (fuzzy) | preserved |
| H3 Aarskog-Scott | Aarskog | Aarskog ✓ | Aarskog ✓ | preserved |

**Verdict:** +1 loss-set gain (L2), 0 regression. **First measurable Top-1 win in the entire loss-loop investigation.** Per rubric → **KEEP on main + iterate within Loop 5.**

### Loop 5a — iterate: extend candidate window 20→30

**Hypothesis:** if 10→20 flipped L2, maybe 20→30 also flips L1 (still naming `Neurofibroma`).

**Shipped:** `37360c21` on main. Single-line change.

**Loop 5a result:** SL Top-1 = **33.3%** (2/6) — regressed to baseline. The L2 win from Loop 5 is lost. Hypothesis: bumping to 30 candidates dilutes signal (more competing siblings in the differential, harder to distill the right one).

**Verdict:** revert Loop 5a, keep Loop 5 (candidate=20). Reverted via `git revert 37360c21`.

**Loop 5 final state:** kept +1 gain (L2 NF1) on main at candidate=20. Within-loop iteration cap = 1 (tried, regressed).

---

### Loop 6 (2026-06-17) — bump specialist hypothesis count 3-7 → 5-10

**Rubric:** (G=5 × I=3 × S=4) / (R=3 × Cx=1) = 20
**Shipped:** `b85e5f58` on main (on top of Loop 5).

**Results:** SL Top-1 = **33.3%** (2/6) — **regressed.** L2 NF1 win lost (back to `Neurofibroma` at #1). H1+H3 preserved.

**Diagnosis:** more hypotheses flooded synth/finalize with NF1-adjacent options (Legius, Neurofibroma, NF1, Café-au-lait); signal got diluted.

**Verdict:** revert. `844f7bb5` on main reverts. Branch `loss-loop/loop-6-hypothesis-count` preserves work.

---

### Loop 7 (2026-06-17) — expand specialist panel 5 → 7

**Rubric:** (G=5 × I=3 × S=4) / (R=3 × Cx=1) = 20
**Shipped:** `e02b29fb` on main (on top of Loop 5).

**Results:** SL Top-1 = **33.3%** (2/6) — **regressed.** L2 NF1 win lost again.

**Diagnosis:** more specialists → more options for synth/finalize → same dilution as Loop 6.

**Verdict:** revert. `1c2428a3` reverts. Branch `loss-loop/loop-7-7-specialists` preserves work.

---

### Loop 8 (2026-06-17) — lower retrieval threshold 0.55 → 0.45

**Hypothesis:** the right syndrome (e.g. NF1 for L1) may fall below the 0.55 similarity floor for some patient inputs, getting filtered before kb-rerank.
**Rubric:** (G=5 × I=3 × S=4) / (R=3 × Cx=1) = 20
**Shipped:** `06730caf` on main.

**Validation in flight** (PID 10935).

