import type { SpecialtyReference } from "./types";

export const ENDOCRINOLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Endocrinologist",
  expertise: `Deep expertise in adrenal disorders, pituitary disease, thyroid disorders including autoimmune and rare cancers, calcium and bone metabolism, multiple endocrine neoplasia syndromes, polyglandular autoimmune syndromes, congenital adrenal hyperplasia, hypothalamic-pituitary axis dysfunction, and inborn errors of intermediary metabolism that present endocrinologically.`,

  clinicalFrameworks: [
    {
      name: "Adrenal insufficiency — primary vs secondary",
      summary: `Primary (Addison): ACTH high, cortisol low, mineralocorticoid affected (hyperkalemia, hyponatremia, salt craving, hyperpigmentation). Autoimmune most common in adults; CAH, adrenoleukodystrophy, infection (TB, fungal), hemorrhage in others. Secondary: pituitary/hypothalamic disease, ACTH low, mineralocorticoid intact. Cosyntropin (250 mcg ACTH) stimulation: peak cortisol <18 µg/dL = insufficient. 21-hydroxylase antibodies + adrenal CT confirm cause.`,
    },
    {
      name: "Cushing syndrome — workup ladder",
      summary: `Screen with: 24-hour urinary free cortisol (×2), late-night salivary cortisol (×2), 1 mg overnight dexamethasone suppression (cortisol >1.8 µg/dL = abnormal). Two positive = endogenous Cushing. Then ACTH: low → adrenal source (adenoma, carcinoma, bilateral macronodular/PPNAD). High/normal → ACTH-dependent: pituitary (Cushing disease, 80%) vs ectopic (SCLC, carcinoid, MTC, pheochromocytoma). High-dose dex suppression + CRH stim + inferior petrosal sinus sampling differentiate pituitary from ectopic.`,
    },
    {
      name: "Pheochromocytoma / paraganglioma",
      summary: `Episodic headaches + sweating + palpitations + hypertension classic but not universal. Plasma free metanephrines (most sensitive) or 24-hour urinary fractionated metanephrines. Genetics in ALL patients: ~30-40% germline (SDHx, VHL, RET, NF1, TMEM127, MAX). SDHB confers metastatic risk. Avoid β-blocker before adequate α-blockade. CT/MRI then functional imaging (MIBG, ¹⁸F-FDG, DOTATATE) for staging.`,
    },
    {
      name: "Multiple Endocrine Neoplasia (MEN) syndromes",
      summary: `MEN1 (menin): primary hyperparathyroidism + pituitary adenoma + pancreatic NETs (gastrinoma, insulinoma, glucagonoma, VIPoma, NF-pNETs). MEN2A (RET): medullary thyroid cancer + pheochromocytoma + hyperparathyroidism. MEN2B (RET): MTC + pheo + mucosal neuromas + marfanoid habitus, NO hyperparathyroidism. MEN4 (CDKN1B): MEN1-like. von Hippel-Lindau: hemangioblastomas + RCC + pheo + pancreatic cysts/NETs. Carney complex: cardiac myxomas + skin pigmentation + endocrine tumors.`,
    },
    {
      name: "Congenital adrenal hyperplasia",
      summary: `21-hydroxylase deficiency (most common, 90%): elevated 17-OHP. Classic salt-wasting (neonatal crisis, ambiguous genitalia in females), classic simple virilizing, non-classic (adolescent/adult androgen excess). 11β-hydroxylase: HTN + hypokalemia + androgen excess + elevated DOC. 17α-hydroxylase: HTN + hypokalemia + sex steroid deficiency. 3β-HSD, lipoid CAH (StAR), and POR-deficiency rarer. Genetics (CYP21A2 etc.) confirms; treat with glucocorticoid ± mineralocorticoid replacement.`,
    },
    {
      name: "Primary hyperaldosteronism",
      summary: `Screen with aldosterone:renin ratio (ARR) >20 + aldosterone >15 ng/dL. Confirm with saline suppression, oral salt loading, fludrocortisone suppression, or captopril challenge. Adrenal venous sampling differentiates unilateral adenoma (Conn) from bilateral hyperplasia. Familial: FH-I (CYP11B1/2 chimera, glucocorticoid-remediable), FH-II (clusters), FH-III (KCNJ5), FH-IV (CACNA1H). Suspect in resistant HTN, HTN with hypokalemia, HTN <40yo, adrenal incidentaloma.`,
    },
    {
      name: "Calcium and bone — primary hyperparathyroidism, FHH, secondary",
      summary: `High calcium + high (or inappropriately normal) PTH + high urinary calcium (>200 mg/24h or fractional excretion >0.01) → primary HPT. Familial hypocalciuric hypercalcemia (CASR LOF, GNA11, AP2S1): asymptomatic mild hypercalcemia + LOW urinary calcium (<100 mg/24h, FECa <0.01); avoid parathyroidectomy. Secondary HPT: CKD, vitamin D deficiency. Tertiary: long-standing secondary. Hypoparathyroidism: low Ca, high P, low PTH — DiGeorge, autoimmune (APECED), post-surgical, pseudohypoparathyroidism (PTH resistance, Albright hereditary osteodystrophy).`,
    },
    {
      name: "Polyglandular autoimmune syndromes",
      summary: `APS-1 / APECED (AIRE): chronic mucocutaneous candidiasis + hypoparathyroidism + adrenal insufficiency + multiple other autoimmunities. Childhood onset. APS-2 / Schmidt syndrome: adrenal insufficiency + autoimmune thyroid disease + T1DM; HLA-associated, adult onset. APS-3: autoimmune thyroid + another non-adrenal autoimmunity. APS-4: combinations not fitting 1-3. Always screen for additional endocrinopathies + celiac + pernicious anemia in any APS.`,
    },
    {
      name: "Hypopituitarism & growth hormone disorders",
      summary: `Pituitary apoplexy (Sheehan postpartum), traumatic brain injury, infiltrative (sarcoid, IgG4, histiocytosis), autoimmune (hypophysitis — lymphocytic, IgG4, immune checkpoint inhibitor-induced). Sequential loss: GH → gonadotropins → TSH → ACTH typically. Acromegaly (IGF-1 elevated + non-suppressible GH on OGTT, MRI pituitary, screen for cardiomyopathy, sleep apnea, colon polyps). Hyperprolactinemia: med causes (antipsychotics) before tumor.`,
    },
    {
      name: "Diabetes insipidus & SIADH",
      summary: `Hypotonic polyuria with inappropriately dilute urine in setting of high-normal/high serum sodium → DI. Water deprivation + desmopressin test distinguishes central (responds) vs nephrogenic (doesn't). Causes central: surgery, trauma, autoimmune (LCH, germinoma in young), idiopathic. Nephrogenic: lithium, hypercalcemia, hypokalemia, AVPR2/AQP2 mutations. SIADH: hyponatremia + serum hypo-osmolar + urine inappropriately concentrated + euvolemic + normal adrenal/thyroid. Causes: malignancy (SCLC), CNS, pulmonary, drugs (SSRIs, carbamazepine, MDMA).`,
    },
  ],

  differentialPatterns: [
    "Hyperpigmentation + fatigue + salt craving + hyponatremia + hyperkalemia → primary adrenal insufficiency (Addison); cosyntropin stim.",
    "Episodic HTN + headache + sweating + palpitations → pheochromocytoma; plasma metanephrines.",
    "Resistant hypertension + hypokalemia → primary aldosteronism; ARR.",
    "Young adult MTC + lump in neck + family history → MEN2 (RET); calcitonin level.",
    "Hypertension + hypokalemia + ambiguous genitalia / virilization → 11β-OH CAH; check 11-deoxycortisol + DOC.",
    "Galactorrhea + amenorrhea + headache + visual field defect → prolactinoma vs other sellar mass; check meds first.",
    "Postpartum failure to lactate + amenorrhea + adrenal-thyroid axis failure → Sheehan syndrome.",
    "New-onset hypopituitarism after immunotherapy → checkpoint-inhibitor hypophysitis.",
    "Severe early HTN + low renin + low aldosterone → consider 17α-OH CAH, AME (HSD11B2), Liddle (ENaC).",
    "Severe insulin-resistant hyperglycemia + acanthosis + ovarian features in young woman → lipodystrophy syndromes (LMNA, AGPAT2, BSCL2, PPARG) or insulin receptor mutations.",
    "Episodic flushing + diarrhea + bronchospasm + right-sided cardiac valve lesions → carcinoid; 5-HIAA + chromogranin A.",
    "Hypoglycemia in non-diabetic adult — Whipple's triad + work up for insulinoma (insulin, C-peptide, proinsulin, β-hydroxybutyrate during episode), factitious insulin, autoimmune insulin syndromes (Hirata).",
    "Bone pain + fragility fractures + low calcium + elevated alkaline phosphatase → osteomalacia; vitamin D + tumor-induced osteomalacia (FGF23, mesenchymal tumor).",
    "Newborn ambiguous genitalia + dehydration crisis → 21-hydroxylase CAH until proven otherwise.",
    "Persistent hypercalcemia with LOW urinary calcium → familial hypocalciuric hypercalcemia (CASR); do NOT operate.",
  ],

  redFlags: [
    "Adrenal crisis (hypotension + hyponatremia + hyperkalemia + hypoglycemia) — give hydrocortisone immediately; don't wait for cortisol level.",
    "Suspected pheochromocytoma + needed surgery / contrast / β-blocker — α-blockade FIRST; unopposed β-block can precipitate hypertensive crisis.",
    "Pituitary apoplexy — sudden severe headache + visual loss + cranial neuropathy + hypopituitarism — emergent stress-dose steroids + neurosurgery.",
    "Thyroid storm + myxedema coma — both have high mortality; aggressive treatment.",
    "Severe hyponatremia <125 with neurologic symptoms — correct cautiously (≤8-10 mEq/L/24h) to avoid osmotic demyelination.",
    "Hypercalcemic crisis (Ca >14) — IV fluids, calcitonin, bisphosphonate; investigate malignancy and primary HPT.",
    "Young patient with MTC — screen RET for MEN2/familial MTC; cascade testing.",
    "Adrenal mass + episodic HTN — biochemical workup BEFORE biopsy/surgery to rule out pheochromocytoma.",
    "Resistant hypertension in young patient — consider monogenic forms (Liddle, AME, GRA, FH).",
  ],

  commonMimics: [
    {
      condition: "Cushing syndrome",
      mimics: ["Pseudo-Cushing (depression, alcoholism, obesity, OSA, anorexia in recovery)", "Exogenous glucocorticoid use", "Ectopic ACTH (SCLC, carcinoid, MTC, pheo)", "PPNAD / Carney complex", "Bilateral macronodular adrenal hyperplasia"],
    },
    {
      condition: "Adrenal insufficiency",
      mimics: ["Chronic fatigue syndrome", "Depression", "Anorexia nervosa", "Hypothyroidism", "Hypopituitarism", "Tuberculosis (Addison cause)", "Adrenoleukodystrophy", "POEMS"],
    },
    {
      condition: "Pheochromocytoma",
      mimics: ["Panic disorder", "Carcinoid", "Mastocytosis", "Hyperthyroidism", "Hypoglycemia", "Renovascular hypertension", "Drugs (cocaine, MAOI interactions)"],
    },
    {
      condition: "Primary hyperparathyroidism",
      mimics: ["Familial hypocalciuric hypercalcemia", "Tertiary HPT (post-CKD)", "Vitamin D toxicity", "Milk-alkali", "Granulomatous (sarcoid, TB)", "Malignancy (PTHrP, lytic lesions, calcitriol-producing lymphoma)", "Lithium-induced HPT"],
    },
    {
      condition: "Acromegaly",
      mimics: ["McCune-Albright syndrome with GH excess", "Familial isolated pituitary adenoma", "MEN1 / Carney complex", "Ectopic GHRH (carcinoid, pancreatic NET)", "Pseudoacromegaly (insulin resistance, minoxidil)"],
    },
    {
      condition: "Hypothyroidism (autoimmune)",
      mimics: ["Central hypothyroidism", "Subclinical hypothyroidism", "Sick euthyroid", "Drug effect (amiodarone, lithium, interferon)", "Resistance to thyroid hormone (THRB)", "Allan-Herndon-Dudley (MCT8) in child"],
    },
    {
      condition: "Diabetes insipidus",
      mimics: ["Primary polydipsia", "Osmotic diuresis (uncontrolled DM)", "Drug-induced (lithium → NDI)", "Hypercalcemia/hypokalemia-induced NDI", "Hypothalamic dysfunction (LCH, germinoma)"],
    },
  ],
};
