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
(appended below as loops run)
