# Loss-Loop Loss Set — Locked 2026-06-16

Source cohort: **v27 random-25** (PID 79528, run 2026-06-16, log `/tmp/sl-cohort/v27-random25-v4.log`).
Grader: **v4 Mondo paper-faithful (any-credit Top-1, score > 0 at rank 1)**.

## Loss set (10 cases)

Selected from 19 SL v4 Top-1 misses on v27 random-25. Chosen to represent recurring class-wide failure patterns, not one-offs.

### Class A — NF1 feature-vs-syndrome (3 cases)
SL specialists named a feature/lesion of NF1 at #1 instead of the syndrome itself. Fix #1 (FEATURE-VS-SYNDROME v17 prompt addendum) did not catch these.

| # | Case ID | Gold | SL #1 |
|---|---|---|---|
| 1 | PMID_26178382_UAB_R9216_I2 | NF1 | Isolated café-au-lait macules |
| 2 | PMID_29290338_Family_ROT_R02233_individual_PrS | NF1 | Neurofibroma |
| 3 | PMID_29290338_Family_ROT_R21382_individual_F | NF1 | Neurofibroma |

### Class B — DEE4 / STXBP1 phenotype overlap (4 cases)
SL picks a sibling encephalopathy at #1; gold STXBP1-DEE at rank 4-5 or absent.

| # | Case ID | Gold | SL #1 | gold rank |
|---|---|---|---|---|
| 4 | PMID_35190816_STX_29896790_P5 | DEE4 | PEHO syndrome | 4 |
| 5 | PMID_35190816_STX_26865513_Patient_44 | DEE4 | GNAO1-related ND | beyond top-10 |
| 6 | PMID_35190816_STX_23409955_Patient_B | DEE4 | Kabuki | beyond top-10 |
| 7 | PMID_35190816_STX_26865513_Patient_30 | DEE4 | FOXG1 | 5 |

### Class C — ADTKD umbrella below credited descendants (2 cases)
SL #1 is the umbrella term; gold subtype's credited-set ancestors don't include SL's named umbrella.

| # | Case ID | Gold | SL #1 |
|---|---|---|---|
| 8 | PMID_38096951_Family_1_III_12 | Tubulointerstitial kidney disease AD 6 | Autosomal Dominant Tubulointerstitial Kidney Disease |
| 9 | PMID_17245395_Family_A214_II_1 | Tubulointerstitial kidney disease AD 1 | HNF1B-associated disorder |

### Class A' — feature-vs-syndrome anchor (1 case)
| # | Case ID | Gold | SL #1 |
|---|---|---|---|
| 10 | PMID_32110744_III_C | DiGeorge syndrome | Hypoparathyroidism |

## Holdout (5 cases)
Randomly sampled (mulberry32 seed 16062026) from the 11 SL v4 Top-1 wins. Frozen — used each loop to detect regressions without overlapping with the loss set.

| # | Case ID | Gold |
|---|---|---|
| H1 | PMID_35142290_III_2 | Fibromatosis, gingival 6 |
| H2 | PMID_36446582_Ockeloen2015_P13 | KBG syndrome |
| H3 | PMID_20082460_case_11 | Aarskog-Scott syndrome |
| H4 | PMID_36446582_Miyatake_2017_P3 | KBG syndrome |
| H5 | PMID_36446582_Ockeloen2015_P11 | KBG syndrome |

3 of 5 holdout cases are KBG — narrower than ideal, but the win set is KBG-heavy (5 of 11 wins). Accepting this skew; alternative is to hand-stratify which violates the random-sample property.

## Rules
- Loss set is **frozen**. No additions, no removals, even if v27 numbers change later.
- Holdout is **frozen**. Same rule.
- Per-loop validation re-runs all 10 loss cases + all 5 holdout cases via trio mode against the deployed pipeline, graded with v4.
- Loop stops on: 10-cap, plateau (2 consecutive zero-gain loops on loss set), OR regression (2 consecutive loops with net holdout Top-1 drop).
