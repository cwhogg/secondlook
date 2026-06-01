/**
 * Standard eval regression sets — STABLE, do not re-randomize.
 *
 * Two curated subsets of the Phenopacket2Prompt corpus used as
 * regression test fixtures. The cases are chosen to include:
 *   1. KNOWN WINS — cases the pipeline has gotten right in prior runs.
 *      Regression detection: if SL stops getting these, we know something
 *      broke.
 *   2. NEAR MISSES — cases where engines surfaced the right disease at
 *      suboptimal rank, or named a sibling/family-tier diagnosis. Target
 *      for improvement.
 *   3. HARD CASES — all-miss across SL/OAI/Claude in prior runs. Tracks
 *      whether architectural changes ever crack open the genuinely hard
 *      end of the distribution.
 *
 * The 25-case set is the headline regression set. The 50-case set adds
 * 25 more cases (from the v18 random-sample cohort) for additional
 * statistical power.
 *
 * Updating these lists: DO NOT change the case order or drop entries
 * silently. Adding cases is fine; removing or reordering breaks
 * comparability across runs. If you must remove, document why in this
 * file's comment block.
 */

// ===== STANDARD-25 =====
// 22 v17 matched-trio cohort cases (curated, fully benchmarked across SL/OAI/Claude
// under both v2 and v3 graders) + 3 v18 cases for failure-mode coverage.
export const STANDARD_25_PPKT_IDS: readonly string[] = [
  // --- v17 cohort (22 cases) ---
  // KNOWN WINS (10) — engines have gotten these and should keep getting them.
  'PMID_10580070_Family_D_individual_II_1',         // Cardiomyopathy, dilated 1A
  'PMID_11841556_5',                                 // Netherton syndrome (the v17 motivation case)
  'PMID_16965330_Sibling_of_patient_11',             // APS-1 / APECED (v3-grader-only catch)
  'PMID_18616706_Case_15',                           // APS-1 / APECED (v3-grader-only catch)
  'PMID_20513137_individual_NF00886_GSM_GSM492682',  // NF1 (mosaic)
  'PMID_21217753_Fam_2_III_1',                       // Loeys-Dietz syndrome 3
  'PMID_22772368_4_III_1',                           // Loeys-Dietz syndrome 4
  'PMID_26178382_UAB_R7444',                         // NF1 (rich-feature presentation)
  'PMID_27250695_Family_14_patient_19',              // Microcephaly 5, primary
  'PMID_30099644_V_9',                               // Retinitis pigmentosa 11

  // NEAR MISSES (7) — engines surface right family at suboptimal rank or with wrong subtype.
  'PMID_12920066_IV_7_Family_1CRD',                  // Cone-rod dystrophy 13 (umbrella-vs-subtype)
  'PMID_22219643_II_4',                              // Ectopia lentis, familial
  'PMID_26178382_UAB_R278',                          // NF1 (CALMs-dominant presentation, harder)
  'PMID_26981933_Family_C_individual_C3',            // CVID 13 (right family, wrong subtype)
  'PMID_28673863_Case_report',                       // MTDPS6 (mitochondrial DNA depletion family)
  'PMID_36917008_P1',                                // Immunodeficiency 131 / NFKB1
  'PMID_40409267_Family_C_individual_II_2',          // Cardiac conduction disease 2

  // HARD CASES (5) — all-miss in v17/v18 prior runs. Track if any architectural change cracks these.
  'PMID_26942287_EE8',                               // White-Sutton syndrome
  'PMID_28886341_Individual_F4_II_2',                // Al Kaissi syndrome
  'PMID_35190816_STX_31130284_UPN_0657',             // Developmental and epileptic encephalopathy 4
  'PMID_37951597_Family_21_Subject_1',               // NDD with progressive movement abnormalities
  'PMID_39753114_F8_II_3',                           // NDD with progressive spasticity

  // --- v18 additions (3) for failure-mode coverage ---
  'PMID_36446582_Low_2016_P26_23',                   // KBG syndrome — all 3 baselines hit rank 1 (clean regression signal)
  'PMID_31085352_Family_1_sister_III_3',             // ADO subtype confusion (ADO type II named for ADO 4) — tests subtype-restraint prompt
  'PMID_35150594_G_II_1',                            // Spastic paraplegia 91 (SPG7 named for SPG91) — tests subtype-restraint prompt
];

// ===== STANDARD-50 =====
// STANDARD_25 + 25 additional v18 cases for statistical power. The extras
// are sampled from the v18 random-sample cohort the user ran from /eval,
// preserving the original random sample's mix of difficulties.
export const STANDARD_50_PPKT_IDS: readonly string[] = [
  ...STANDARD_25_PPKT_IDS,
  // --- v18 cohort extras (25 cases) ---
  'PMID_35190816_STX_26514728_Patient_12',
  'PMID_37761890_50',
  'PMID_23364397_Patient_2',
  'PMID_35190816_STX_P_38',
  'PMID_35190816_STX_26648591_Patient_4',
  'PMID_35190816_STX_27184330_Patient_III',
  'PMID_15911822_Patient_5',
  'PMID_18000979_OX2877_III_3',
  'PMID_30701076_patient',
  'PMID_31643139_Patient_3',
  'PMID_37703920_Family_1_Patient_1',
  'PMID_30580808_Patient_8',
  'PMID_28966590_patient',
  'PMID_37421948_Individual_1',
  'PMID_33633439_17413_II_1',
  'PMID_27939403_C_II_2',
  'PMID_27250695_Family_1_patient_1',
  'PMID_37352860_Individual_6',
  'PMID_8825048_index_case',
  'PMID_38441608_Patient_2',
  'PMID_31450277_13_year_old_boy',
  'PMID_15534187_proband',
  'PMID_15781812_individual_127',
  'PMID_35190816_STX_P_06',
  'PMID_36446582_KBG43',
];

// Lightweight metadata for the UI tooltip / hover. Maps each ppkt_id to its
// categorization so users can see what the set contains without leaving /eval.
export const STANDARD_SET_CATEGORIES: Record<string, 'known-win' | 'near-miss' | 'hard' | 'v18-random'> = {
  // KNOWN WINS
  'PMID_10580070_Family_D_individual_II_1': 'known-win',
  'PMID_11841556_5': 'known-win',
  'PMID_16965330_Sibling_of_patient_11': 'known-win',
  'PMID_18616706_Case_15': 'known-win',
  'PMID_20513137_individual_NF00886_GSM_GSM492682': 'known-win',
  'PMID_21217753_Fam_2_III_1': 'known-win',
  'PMID_22772368_4_III_1': 'known-win',
  'PMID_26178382_UAB_R7444': 'known-win',
  'PMID_27250695_Family_14_patient_19': 'known-win',
  'PMID_30099644_V_9': 'known-win',
  'PMID_36446582_Low_2016_P26_23': 'known-win',
  // NEAR MISSES
  'PMID_12920066_IV_7_Family_1CRD': 'near-miss',
  'PMID_22219643_II_4': 'near-miss',
  'PMID_26178382_UAB_R278': 'near-miss',
  'PMID_26981933_Family_C_individual_C3': 'near-miss',
  'PMID_28673863_Case_report': 'near-miss',
  'PMID_36917008_P1': 'near-miss',
  'PMID_40409267_Family_C_individual_II_2': 'near-miss',
  'PMID_31085352_Family_1_sister_III_3': 'near-miss',
  'PMID_35150594_G_II_1': 'near-miss',
  // HARD
  'PMID_26942287_EE8': 'hard',
  'PMID_28886341_Individual_F4_II_2': 'hard',
  'PMID_35190816_STX_31130284_UPN_0657': 'hard',
  'PMID_37951597_Family_21_Subject_1': 'hard',
  'PMID_39753114_F8_II_3': 'hard',
};
// All entries in STANDARD_50 not in STANDARD_25 default to 'v18-random'.
