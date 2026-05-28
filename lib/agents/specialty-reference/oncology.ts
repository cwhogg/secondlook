import type { SpecialtyReference } from "./types";

export const ONCOLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Medical Oncologist",
  expertise: `Deep expertise in paraneoplastic syndromes across organ systems, hereditary cancer predisposition, occult malignancy presenting with constitutional or rheumatologic features, neuroendocrine tumors, lymphoproliferative and histiocytic disorders, Castleman disease, and the malignancy-mimicking inflammatory and infectious entities that share the cancer differential.`,

  clinicalFrameworks: [
    {
      name: "Paraneoplastic neurologic syndromes",
      summary: `Subacute onset + multifocal + classical phenotype + onconeural antibody. Limbic encephalitis (Ma2, ANNA-1/Hu, AMPA, GABA-B; SCLC, testicular, breast, thymoma). Cerebellar degeneration (Yo — gynecologic; Tr — Hodgkin). Sensory neuronopathy (ANNA-1/Hu — SCLC). LEMS (P/Q-type VGCC; SCLC). Stiff person spectrum (anti-GAD high titer, anti-amphiphysin — breast). Anti-NMDAR with ovarian teratoma. Always image for malignancy: CT chest/abdomen/pelvis, mammogram, testicular US, FDG-PET if antibody-positive but no tumor.`,
    },
    {
      name: "Paraneoplastic dermatomyositis and vasculitis",
      summary: `Adult-onset dermatomyositis (especially anti-TIF1γ, anti-NXP-2): up to ~25% paraneoplastic — ovarian, lung, GI, breast, lymphoma. Trigger malignancy screen at diagnosis and yearly for 3 years. Trousseau syndrome (migratory thrombophlebitis): pancreatic, gastric, lung, ovarian. Acanthosis nigricans (sudden onset in adult, not obesity-related): gastric (signet ring). Sweet syndrome (acute febrile neutrophilic dermatosis): AML, MDS. Erythema gyratum repens: lung. Necrolytic migratory erythema: glucagonoma. Hypertrophic osteoarthropathy: lung cancer, intrathoracic disease.`,
    },
    {
      name: "Paraneoplastic endocrine syndromes",
      summary: `SIADH: SCLC (most common cause), head/neck. Ectopic ACTH: SCLC, bronchial carcinoid, MTC, pheochromocytoma, pancreatic NET. Hypercalcemia of malignancy: PTHrP (squamous lung, breast, RCC, head/neck), 1,25-OH vitamin D (lymphoma, granulomatous), local osteolysis (myeloma, breast met), ectopic PTH (rare). Hypoglycemia: insulinoma (Whipple's triad + insulin/C-peptide), non-islet cell tumor (IGF-2, large mesenchymal/hepatic). Carcinoid: serotonin + tachykinins → flushing + diarrhea + bronchospasm + right-sided heart valve disease; 5-HIAA + chromogranin A.`,
    },
    {
      name: "Hereditary cancer syndromes — clinical triggers",
      summary: `Send genetics for: breast cancer <50 / male / bilateral / TNBC <60 (BRCA1/2, PALB2, ATM, CHEK2, TP53). Colorectal <50 / multiple primaries / endometrial + colon / family history meeting Amsterdam/Bethesda (Lynch). Diffuse gastric ± lobular breast (CDH1). Multiple sebaceous neoplasms (Muir-Torre / Lynch). Pediatric brain tumors + sarcoma + adrenocortical + leukemia (Li-Fraumeni TP53). Pheochromocytoma at any age (SDHx, VHL, NF1, RET, TMEM127, MAX). Bilateral RCC / multifocal (VHL, BHD, HLRCC, MITF). Pediatric / multifocal renal — DICER1, others. Constitutional MMR deficiency (CMMRD): biallelic, pediatric brain + GI + heme.`,
    },
    {
      name: "Histiocytic and lymphoproliferative disorders",
      summary: `Langerhans cell histiocytosis (LCH): BRAF V600E in ~60%, MAP2K1 in many — single-system (bone, skin) to multi-system (liver, spleen, marrow, lung, hypothalamic-pituitary, CNS). Erdheim-Chester (ECD): bilateral symmetric lower extremity bone lesions + retroperitoneal fibrosis + xanthogranulomatous infiltrates + CNS/cardiac involvement; BRAF V600E common. Rosai-Dorfman: massive lymphadenopathy + emperipolesis; can mimic lymphoma. Castleman disease: unicentric (lymphoma mimic) vs idiopathic multicentric vs HHV-8-associated MCD; TAFRO subtype (thrombocytopenia, anasarca, fever, reticulin fibrosis, organomegaly). IPL/EATL post-celiac. Hyper-CD30 lymphomas vs reactive.`,
    },
    {
      name: "Neuroendocrine tumors",
      summary: `Functional vs non-functional. Carcinoid (well-differentiated NET): GI/lung primary, may secrete serotonin → carcinoid syndrome (especially with hepatic metastases). Pancreatic NETs: insulinoma, gastrinoma (Zollinger-Ellison — refractory PUD + diarrhea + high gastrin), glucagonoma (necrolytic migratory erythema + diabetes + DVT), VIPoma (Verner-Morrison — secretory diarrhea + hypokalemia), somatostatinoma. Pheochromocytoma/paraganglioma (covered in endocrine). MEN1 (parathyroid + pituitary + pancreatic NET) and MEN2 (MTC + pheo + parathyroid in 2A). Workup: chromogranin A, 5-HIAA, 24-h urine catecholamines/metanephrines, ⁶⁸Ga-DOTATATE PET.`,
    },
    {
      name: "Cancer of unknown primary",
      summary: `Metastatic disease without identifiable primary after CT chest/abdomen/pelvis, mammogram (women), testicular US (men), EGD/colonoscopy if symptomatic, PSA, AFP/β-hCG/LDH. Histology + IHC + molecular profiling guides treatment. Favorable subsets: women with isolated axillary nodes (treat as breast), peritoneal carcinomatosis women (treat as ovarian), squamous cervical adenopathy (treat as head/neck), midline poorly differentiated in young men (germ cell), single resectable site, neuroendocrine. Molecular tumor profiling increasingly tissue-of-origin-suggestive.`,
    },
    {
      name: "Constitutional symptoms suggesting malignancy",
      summary: `Unintentional weight loss >5% body weight in 6-12 months + fatigue + night sweats + drenching fevers (B symptoms classic for lymphoma) → trigger malignancy workup. Drenching night sweats, hectic fever pattern, weight loss → lymphoma, leukemia, TB, endocarditis, occult solid tumor. Persistent unexplained anemia (esp. iron-deficiency in adult male or postmenopausal female) → GI/GU malignancy screen with endoscopy. New-onset venous thromboembolism in older patient without provoking factor → screen-age-appropriate (lung, pancreas, GI especially).`,
    },
    {
      name: "Tumor-induced osteomalacia and oncogenic metabolic syndromes",
      summary: `TIO: small mesenchymal tumor (often phosphaturic mesenchymal tumor, PMT) secretes FGF23 → hypophosphatemia + renal phosphate wasting + low calcitriol + osteomalacia + bone pain + muscle weakness. Localize: ⁶⁸Ga-DOTATATE PET. Cured by resection. Differential: X-linked hypophosphatemia (PHEX), autosomal-dominant HR (FGF23), McCune-Albright. Other oncogenic metabolic: ectopic Cushing, SIADH, hypercalcemia (above).`,
    },
    {
      name: "Inflammatory mimics of malignancy",
      summary: `IgG4-related disease tumefactive lesions across organs. Sarcoidosis with bulky adenopathy. Reactive lymphadenopathy from infection (EBV, CMV, HIV, TB, Bartonella, Kikuchi). Castleman. Granulomatosis with polyangiitis (Wegener) with lung masses. Inflammatory pseudotumor (now IMT, ALK-rearranged in many). Splenic sarcoidosis vs lymphoma. Mediastinal mass differential: lymphoma, thymoma (myasthenia, pure red cell aplasia, hypogammaglobulinemia — Good syndrome), germ cell, neurogenic, thyroid. Always seek tissue diagnosis before treatment.`,
    },
  ],

  differentialPatterns: [
    "Adult-onset DM with anti-TIF1γ → trigger malignancy screen (ovarian, lung, GI, breast).",
    "Migratory thrombophlebitis + new VTE in older adult → Trousseau syndrome; pancreatic/gastric/lung/ovarian.",
    "Acute small-cell lung cancer + Cushing's habitus → ectopic ACTH; check ACTH + cortisol + dex test.",
    "Hyponatremia in SCLC patient → SIADH (paraneoplastic).",
    "Refractory peptic ulcer disease + diarrhea + elevated gastrin → ZES; pancreatic NET workup.",
    "Painful flushing + diarrhea + tricuspid/pulmonic valve lesions → carcinoid; 5-HIAA.",
    "Cerebellar degeneration in middle-aged woman + ovarian/breast cancer → anti-Yo.",
    "LEMS pattern (proximal weakness + autonomic features + post-tetanic facilitation) → SCLC screen.",
    "Pediatric brain tumor + sarcoma + adrenocortical + leukemia in family → Li-Fraumeni (TP53).",
    "Multiple sebaceous neoplasms + colon cancer → Muir-Torre variant of Lynch.",
    "Lobular breast cancer + diffuse gastric in family → CDH1; consider prophylactic gastrectomy.",
    "Histiocytic infiltrates + diabetes insipidus + bilateral lower-extremity bone lesions → Erdheim-Chester.",
    "Bilateral symmetric pulmonary infiltrates + bone pain in patient with pituitary disease → LCH multisystem.",
    "Massive painless cervical lymphadenopathy + emperipolesis on biopsy → Rosai-Dorfman.",
    "Phosphate wasting + osteomalacia + bone pain in adult → tumor-induced osteomalacia; ⁶⁸Ga-DOTATATE PET.",
    "Severe diabetes + necrolytic migratory erythema + DVT + weight loss → glucagonoma.",
    "Recurrent secretory diarrhea + hypokalemia + dehydration → VIPoma (Verner-Morrison).",
  ],

  redFlags: [
    "Spinal cord compression from metastatic disease — emergent steroids + RT + neurosurgery.",
    "SVC syndrome — facial/upper extremity edema + JVD + headache; treat malignancy aggressively, often lymphoma or lung.",
    "Tumor lysis syndrome — hyperuricemia + hyperkalemia + hyperphosphatemia + hypocalcemia + AKI; rasburicase + hydration.",
    "Febrile neutropenia — empirical broad-spectrum within 1 hour.",
    "Hypercalcemia of malignancy with delirium → emergent hydration + bisphosphonate ± calcitonin ± denosumab.",
    "Pheochromocytoma in patient about to undergo surgery — α-blockade FIRST.",
    "Neutropenic typhlitis — RLQ pain in neutropenic patient; surgical consult.",
    "Suspected APL (PML-RARA) — emergent ATRA; coagulopathy is life-threatening.",
    "Brain mass in immunocompromised patient — CNS lymphoma vs toxoplasmosis vs PML; HIV/transplant context.",
    "Unintentional weight loss + new lymphadenopathy + B symptoms — exclude lymphoma promptly.",
  ],

  commonMimics: [
    {
      condition: "Lymphoma",
      mimics: ["Castleman disease (especially TAFRO)", "Rosai-Dorfman", "Kikuchi-Fujimoto", "Reactive lymphadenopathy (EBV, CMV, HIV, TB, Bartonella, Toxoplasma)", "IgG4-related disease", "Sarcoidosis", "Drug-induced (phenytoin)", "Autoimmune (RA, SLE, Sjögren)"],
    },
    {
      condition: "Cancer of unknown primary",
      mimics: ["Lymphoma with extranodal presentation", "Carcinosarcoma", "Mesothelioma", "Melanoma", "Sarcoma with epithelioid features", "GCT in young men (midline)", "Neuroendocrine carcinoma"],
    },
    {
      condition: "Paraneoplastic limbic encephalitis",
      mimics: ["HSV-1 encephalitis", "Other AIE (anti-NMDAR, LGI1)", "Hashimoto encephalopathy", "Wernicke's encephalopathy", "Bickerstaff brainstem encephalitis"],
    },
    {
      condition: "Carcinoid syndrome",
      mimics: ["Mastocytosis / MCAS", "Pheochromocytoma", "Hyperthyroidism", "Medullary thyroid cancer (calcitonin-mediated diarrhea + flushing)", "VIPoma", "Hyper-IgE flush", "Idiopathic flushing", "Menopausal"],
    },
    {
      condition: "Histiocytic disorder (LCH/ECD/RDD)",
      mimics: ["Lymphoma", "Sarcoid", "IgG4-RD", "Metastatic carcinoma", "Multifocal infection (TB, fungal)", "Multifocal vasculitis"],
    },
    {
      condition: "Multiple myeloma",
      mimics: ["MGUS / smoldering myeloma", "Waldenström", "AL amyloidosis", "POEMS", "Heavy-chain disease", "Plasmacytoma (solitary)", "Reactive plasmacytosis (HIV, autoimmune)"],
    },
    {
      condition: "Adenopathy + B symptoms",
      mimics: ["Lymphoma", "Tuberculosis (especially mediastinal/abdominal)", "HIV / acute retroviral", "Disseminated histoplasmosis / coccidioidomycosis", "Cat scratch / bartonellosis", "Adult-onset Still's disease", "HLH", "Lymphoproliferative manifestation of IEI (XLP, ALPS, CTLA4/LRBA)"],
    },
  ],
};
