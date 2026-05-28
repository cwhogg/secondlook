import type { SpecialtyReference } from "./types";

/**
 * The general-internist is the un-anchored diagnostician. Unlike domain
 * specialists, they receive no KB profiles and are intentionally pushed to
 * think broadly across systems. The reference here is light on framework
 * specifics and heavy on pattern recognition heuristics that cut across
 * specialty boundaries.
 */
export const GENERAL_INTERNAL_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Internal Medicine Specialist (Diagnostician)",
  expertise: `Deep expertise in cross-specialty diagnostic reasoning, undifferentiated multi-system presentations, recognition of the "diagnosis between specialties" that domain experts miss because of tunnel vision, hereditary multi-system disease, environmental and drug-induced causes of complex presentations, and the discipline of asking "what is everyone else's framing missing?"`,

  clinicalFrameworks: [
    {
      name: "Multi-system rare disease — pattern thinking",
      summary: `Rare diseases manifest through stereotyped combinations of features that cross specialty lines. Train yourself to ask: "What single etiology explains the constellation, not just the dominant symptom?" Three-system rule: when ≥3 organ systems are involved without obvious unifying acquired cause, consider hereditary multi-system disease (mitochondrial, lysosomal, peroxisomal, CDG, primary immunodeficiency, connective tissue, ciliopathy). Two-system rule: when 2 unusual systems coincide (e.g., hearing loss + kidney; cataract + cardiomyopathy; dysmorphism + immunodeficiency), think syndrome before coincidence.`,
    },
    {
      name: "Diagnostic odyssey patient",
      summary: `Profile: years of symptoms across specialists, multiple normal "routine" workups, sometimes a "functional" or "psychosomatic" label, frequently a treatable disease being missed. Don't accept previous specialist conclusions as exclusionary. Re-examine for findings the patient may have dismissed or that have evolved. Ask family history exhaustively. Consider WES/WGS as a hypothesis-generating tool when phenotype is multi-system and pre-test probability of monogenic disease is non-trivial.`,
    },
    {
      name: "Treatable masquerades — diseases that must not be missed",
      summary: `Wilson disease (any movement/psychiatric/hepatic presentation <40). Adult Pompe (limb-girdle weakness + early respiratory). Fabry (acroparesthesia + heart/kidney). Hemochromatosis (arthritis + diabetes + cardiac). Autoimmune encephalitis (psychiatric + seizures + movement disorder). MS / NMOSD / MOG-AD (demyelination spectrum). MG (fatigable weakness). Adrenal insufficiency (fatigue + hyponatremia + hyperkalemia + pigmentation). Pheochromocytoma (episodic hypertension). Hypothyroidism (any chronic fatigue/cognitive presentation). Vitamin B12 deficiency. HAE (recurrent angioedema). TTR amyloid (now treatable). All present commonly enough that missing them costs years.`,
    },
    {
      name: "Drug- and environmental-induced syndromes",
      summary: `Always reconcile FULL medication list (including OTC, supplements, recreational, recent additions, recent discontinuations). PPI → hypomagnesemia + B12 + osteoporosis. Statins → myopathy ± autoimmune necrotizing myopathy (anti-HMGCR). Amiodarone → thyroid + lung + liver + neuropathy + photosensitivity. Hydroxychloroquine → retinopathy + cardiomyopathy. Olmesartan → enteropathy mimicking celiac. Lithium → DI, thyroid, hyperparathyroidism. Levetiracetam → psychiatric. Tacrolimus/cyclosporine → TMA, hypertension. Checkpoint inhibitors → multi-organ autoimmunity (hypophysitis, hepatitis, colitis, pneumonitis, myocarditis). Heavy metals (lead, mercury, arsenic). Solvent exposure. Mold-related (controversial). Lyme + co-infection (Babesia, Anaplasma, Borrelia miyamotoi).`,
    },
    {
      name: "Functional vs organic — the diagnostic process",
      summary: `Functional disorders are positive diagnoses, not exclusionary. Pursue both: identify positive features (Hoover sign, give-way weakness, tremor entrainment, normal NCS in 'paralysis') AND maintain humility about missed organic disease. Common organic conditions misclassified as functional/psychosomatic: small fiber neuropathy, mast cell activation, hEDS / connective tissue disease, POTS, autoimmune encephalitis, IBD (especially Crohn's terminal ileum), endometriosis, hereditary periodic fevers, Sjögren without classic sicca, adrenal insufficiency, mitochondrial disease. Re-examine when new findings emerge or treatment fails.`,
    },
    {
      name: "Constitutional symptoms differential",
      summary: `Fatigue: hypothyroid, adrenal insufficiency, anemia, sleep disorders (OSA), depression, malignancy, chronic infection (TB, HIV, HCV, endocarditis), autoimmune (SLE, RA, sarcoid), CKD, CHF, OSA, deconditioning, mitochondrial, chronic fatigue syndrome / ME-CFS. Weight loss: malignancy, hyperthyroid, diabetes, malabsorption, depression, eating disorder, adrenal, chronic infection. Fever of unknown origin: classic categories — infection (TB, endocarditis, abscess), malignancy (lymphoma especially), autoimmune (Still's, vasculitis, periodic fevers), drug. Night sweats: lymphoma, TB, endocarditis, menopause, GERD, sleep disorders, drug.`,
    },
    {
      name: "Hereditary disease patterns crossing specialties",
      summary: `EDS + POTS + MCAS: triad pattern in young women, multi-system, dismissed as anxiety. Look for hypermobility (Beighton), atypical bruising/scarring, recurrent subluxation, dysautonomia, mast-cell-pattern symptoms, GI dysmotility. Marfan/Loeys-Dietz: tall + arachnodactyly + ectopia lentis + aortic root (Marfan); + hypertelorism + bifid uvula + multi-vessel arteriopathy (Loeys-Dietz). Mitochondrial disease: maternal inheritance + multi-system (deafness, diabetes, short stature, cardiomyopathy, stroke-like episodes, GI dysmotility, ptosis, ophthalmoparesis). NF1: café-au-lait + neurofibromas + Lisch + bony lesions. APS-1/APECED: candidiasis + hypoparathyroidism + adrenal insufficiency.`,
    },
    {
      name: "Infections that mimic everything",
      summary: `Lyme disease: arthritis, neuropathy, carditis, neurologic syndromes, fatigue. TB: pulmonary + extrapulmonary (CNS, GU, skeletal, GI). HIV: any unusual presentation in undiagnosed patient. Syphilis (great imitator): cardiovascular, neurologic, dermatologic, rheumatologic. Whipple disease (T. whipplei): chronic diarrhea + arthritis + neurologic + lymphadenopathy. Brucella: zoonosis + fevers + arthritis + endocarditis. Bartonella: lymphadenopathy + endocarditis + neuroretinitis. Endocarditis (culture-negative possibilities — HACEK, Bartonella, Coxiella, fungal). Strongyloides: hyperinfection in immunocompromised. Chagas (T. cruzi): cardiomyopathy + megacolon/megaesophagus.`,
    },
    {
      name: "Body system overlap — when symptoms cross domains",
      summary: `Neuro + autonomic + GI + skin: small fiber neuropathy spectrum (diabetes/prediabetes, Sjögren, amyloid, sarcoid, paraneoplastic, hereditary including TTR, SCN9A/10A/11A). Cardiac + neurologic + skin + kidney in young patient: Fabry. Skin + lung + joint: sarcoidosis, IgG4-RD, vasculitis. Mucocutaneous + ocular + vascular: Behçet. Eye + ear + kidney: Alport (COL4A3/4/5), Cogan syndrome. Liver + neuro + psychiatric in young: Wilson's.`,
    },
    {
      name: "The internist's discipline — questions to ask in every case",
      summary: `"What is the working diagnosis missing?" — Note contradictory evidence explicitly. "What treatable condition could this be?" — Pursue even less-likely treatable diagnoses (cost of missing is asymmetric). "What family history might unlock this?" — Ask about consanguinity, ancestry, early deaths, multiple relatives with the same vague symptoms. "What did the patient's prior workup leave out?" — Most patients lack: full immune workup, autoimmune panel, mitochondrial labs, copper studies, B12/folate/copper/zinc, complement, complement function, paraneoplastic panel, exome sequencing. "What does the patient think it is?" — patient hypotheses sometimes encode information no specialist asked about.`,
    },
  ],

  differentialPatterns: [
    "Multi-system symptoms in young patient labeled 'anxiety/somatization' for years → re-examine for hEDS-POTS-MCAS, small fiber neuropathy, hereditary periodic fevers, mitochondrial disease, primary immunodeficiency.",
    "Recurrent infections + autoimmunity + dysmorphism → primary immunodeficiency (CVID, CTLA4/LRBA, PGM3-CDG, etc.); send IUIS-style workup.",
    "Chronic fatigue + unexplained anemia + GI symptoms → celiac disease, IBD, IBS, microscopic colitis, parasitic, autoimmune gastritis, occult malignancy.",
    "Episodic flushing + diarrhea + multi-system mediator symptoms → MCAS or carcinoid; check tryptase, 5-HIAA.",
    "Recurrent unexplained syncope + dysautonomia + connective tissue features → POTS / autonomic failure / vasovagal in hEDS context.",
    "Persistent symptoms across multiple specialists' negative workups → don't anchor on prior conclusions; restart history; consider WES/WGS.",
    "New-onset autoimmune disease in older adult → trigger malignancy screen (paraneoplastic).",
    "Multi-organ disease evolving over years in a young patient → think hereditary (mitochondrial, lysosomal storage, CDG, immune dysregulation).",
    "Recurrent unexplained hospitalizations with normal labs → autoinflammatory syndromes (FMF, TRAPS, CAPS, etc.).",
    "Constellation that fits no single specialty cleanly → that's the point — call the geneticist or rare disease center.",
    "Treatable mimic of an untreatable disease (Wilson's, late-onset Pompe, Fabry, autoimmune encephalitis, amyloid) should be the FIRST consideration, not the LAST.",
    "Family history of unexplained early death or hereditary disease — cascade testing.",
    "Patient is a child of consanguineous parents → autosomal recessive disease is far more likely.",
    "Symptom onset coincides with specific exposure (drug, occupation, environment) → consider drug-induced, occupational, environmental etiology.",
    "Patient's own hypothesis ('I think it could be X') — take it seriously; they often have access to information no specialist asked about.",
  ],

  redFlags: [
    "A patient labeled 'functional' or 'psychosomatic' with new or evolving findings — re-examine; the cost of a missed organic diagnosis is asymmetric.",
    "Multi-system disease in someone <40 → push harder for unifying genetic etiology.",
    "Treatable masquerades (Wilson's, Pompe, Fabry, AIE, amyloid, HAE) — never lock in untreatable diagnosis without excluding these.",
    "Patient's presentation worsening on apparent best therapy — reconsider primary diagnosis.",
    "Family history of similar unexplained illness — autosomal pattern likely.",
    "Recurrent same-symptom hospitalizations with normal workup — autoinflammatory, hereditary angioedema, factitious, or missed structural cause.",
    "Drug-induced organ disease — check timeline against medication start dates carefully.",
    "Symptoms that don't fit any single specialty's framework — the diagnosis is between specialties.",
    "Patient ages dramatically faster than expected → progeroid syndromes (HGPS LMNA, Werner WRN, Cockayne ERCC6/8, restrictive dermopathy).",
  ],

  commonMimics: [
    {
      condition: "Chronic fatigue syndrome / ME-CFS",
      mimics: ["Adrenal insufficiency", "Hypothyroidism", "Sleep apnea", "Mitochondrial disease", "Postural orthostatic tachycardia syndrome", "Sjögren's", "Lyme + post-treatment Lyme", "HIV", "Chronic infections (EBV, CMV, Q fever)", "Anemia", "Cardiac (HF preserved, valvulopathy)", "Occult malignancy"],
    },
    {
      condition: "Fibromyalgia",
      mimics: ["Small fiber neuropathy", "Hypothyroidism", "Early connective tissue disease", "Polymyalgia rheumatica", "Sjögren's", "Mast cell activation", "Sleep disorders", "Depression", "Vitamin D / B12 deficiency", "Hemochromatosis arthropathy"],
    },
    {
      condition: "Anxiety / panic disorder",
      mimics: ["Hyperthyroidism", "Pheochromocytoma", "Carcinoid", "Mastocytosis / MCAS", "Hypoglycemia (insulinoma, reactive)", "Cardiac arrhythmia", "PE (intermittent)", "POTS", "Substance use/withdrawal"],
    },
    {
      condition: "Depression",
      mimics: ["Hypothyroidism", "Adrenal insufficiency", "B12 / folate deficiency", "OSA", "Vascular cognitive impairment", "Early Parkinson / DLB", "FTD behavioral variant", "Anti-NMDAR encephalitis (young women)", "Wilson's"],
    },
    {
      condition: "Irritable bowel syndrome",
      mimics: ["Celiac", "IBD", "Microscopic colitis", "Bile acid malabsorption", "SIBO", "Pancreatic insufficiency", "Endometriosis", "Eosinophilic GI disease", "Mast cell activation in GI"],
    },
    {
      condition: "Fever of unknown origin",
      mimics: ["Lymphoma / leukemia (especially T-cell)", "Endocarditis (culture-negative)", "TB (especially extrapulmonary)", "Adult-onset Still's", "Vasculitis (giant cell, PAN)", "Hereditary periodic fevers", "Granulomatous disease (sarcoid)", "Drug fever", "Factitious"],
    },
    {
      condition: "Multi-system 'somatoform' patient",
      mimics: ["hEDS + POTS + MCAS triad", "Mitochondrial disease", "Primary immunodeficiency (CVID)", "Autoimmune disease (SLE without classic features)", "Sjögren's without sicca", "Lyme / coinfections", "Heavy metal toxicity", "Mast cell disease", "Small fiber neuropathy", "Hereditary periodic fevers"],
    },
  ],
};
