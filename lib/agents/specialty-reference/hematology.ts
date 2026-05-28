import type { SpecialtyReference } from "./types";

export const HEMATOLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Hematologist",
  expertise: `Deep expertise in inherited and acquired anemias, hemoglobinopathies, bone marrow failure syndromes, hemolytic anemias including PNH and complement-mediated TMAs, myeloproliferative and myelodysplastic disorders, monoclonal gammopathies and amyloidoses, coagulation disorders and thrombophilias, hemophagocytic lymphohistiocytosis, and rare hematologic features of systemic disease.`,

  clinicalFrameworks: [
    {
      name: "Anemia workup — MCV / reticulocyte ladder",
      summary: `Microcytic: iron deficiency, thalassemia, sideroblastic, anemia of chronic disease (occasional), lead. Check ferritin first, then TSAT, hemoglobin electrophoresis for thalassemia/structural; consider sideroblastic if RDW high + Pappenheimer bodies. Macrocytic: B12/folate, hypothyroid, liver, alcohol, drugs (methotrexate, hydroxyurea), MDS (especially with cytopenias, dysplasia), reticulocytosis (hemolysis, blood loss). Normocytic: bone marrow examination earlier if reticulocyte index <2 + unexplained.`,
    },
    {
      name: "Hemolytic anemia workup",
      summary: `LDH↑, indirect bilirubin↑, haptoglobin↓, reticulocytosis. Direct antiglobulin test (Coombs): positive → autoimmune (warm IgG → CLL/lymphoma/SLE/drugs; cold IgM → mycoplasma, EBV, lymphoma, cold agglutinin disease). Coombs-negative: hereditary spherocytosis (ankyrin, band 3, spectrin), elliptocytosis, pyruvate kinase deficiency, G6PD (oxidative stress, episodic), PNH (flow cytometry CD55/CD59 absent), microangiopathic (TTP, HUS, DIC, valve, malignant HTN), thalassemia. Hemoglobinopathies: SS, SC, HbE/β-thal.`,
    },
    {
      name: "Inherited bone marrow failure syndromes",
      summary: `Fanconi anemia (FA): chromosomal breakage with diepoxybutane / mitomycin C; many genes (FANCA most common). Short stature, café-au-lait, radial-ray defects (absent thumb/radius), genitourinary anomalies, progressive marrow failure, leukemia, head/neck SCC. Dyskeratosis congenita (DC): nail dystrophy + leukoplakia + reticulated skin + telomere shortening; TERC, TERT, DKC1, TINF2, others. Diamond-Blackfan anemia: ribosomopathy (RPS19 and others). Shwachman-Diamond (SBDS, EFL1, DNAJC21, SRP54): exocrine pancreatic insufficiency + neutropenia + marrow failure + skeletal. Severe congenital neutropenia: ELANE most common; HAX1 (Kostmann), G6PC3, WAS, GATA2.`,
    },
    {
      name: "Coagulation disorders & thrombophilias",
      summary: `PT and aPTT screen extrinsic and intrinsic; mixing studies distinguish factor deficiency (corrects) from inhibitor (doesn't). Hemophilia A (FVIII, X-linked) and B (FIX). vWD types 1/2/3 — most common bleeding disorder, often missed in mild cases. Inherited thrombophilias: Factor V Leiden, prothrombin G20210A, antithrombin / protein C / protein S deficiency, dysfibrinogenemia. Acquired: antiphospholipid syndrome (LAC, anti-cardiolipin, anti-β2GPI; 12-week confirmation), HIT, PNH-associated thrombosis (atypical sites), JAK2-mutated MPN thrombosis. CAPS = catastrophic APS.`,
    },
    {
      name: "Microangiopathic hemolytic anemia spectrum",
      summary: `MAHA + thrombocytopenia + end-organ damage. TTP: ADAMTS13 activity <10%, congenital (Upshaw-Schulman) or acquired (autoantibody). Diagnose clinically — PLASMIC score guides. Atypical HUS (aHUS): complement dysregulation (factor H/I, MCP, C3, factor B); eculizumab. Typical HUS: Shiga toxin-producing E. coli (O157:H7). Drug-induced TMA: quinine, gemcitabine, ticlopidine, calcineurin inhibitors, immune checkpoint inhibitors. Pregnancy: HELLP, AFLP, severe preeclampsia, postpartum aHUS, TTP. Always exclude DIC (PT/PTT prolonged, fibrinogen low).`,
    },
    {
      name: "Plasma cell dyscrasias",
      summary: `MGUS → smoldering MM → MM. CRAB: hyperCalcemia, Renal insufficiency, Anemia, Bone lesions. Diagnose with SPEP/IFE/sFLC + bone marrow + skeletal survey/MRI/PET. AL amyloidosis: free light-chain dyscrasia + organ deposition (cardiac restrictive, nephrotic, hepatic, neuropathy, macroglossia, easy bruising). Waldenström macroglobulinemia: IgM gammopathy + lymphoplasmacytic infiltrate + MYD88 L265P; hyperviscosity. Heavy-chain disease (rare). Light-chain deposition disease. POEMS: polyneuropathy + organomegaly + endocrinopathy + monoclonal gammopathy + skin changes, VEGF elevated.`,
    },
    {
      name: "MPN / MDS / acute leukemia diagnostics",
      summary: `Polycythemia vera: JAK2 V617F (>95%), JAK2 exon 12. ET: JAK2, CALR, MPL. Primary myelofibrosis: similar driver mutations + marrow fibrosis. Eosinophilic with rearrangement: FIP1L1-PDGFRA → imatinib. CML: BCR-ABL (Philadelphia). AML: WHO/ELN classification — recurrent genetic abnormalities (t(8;21), inv(16), t(15;17) APML — emergent ATRA + idarubicin), TP53, FLT3, NPM1, CEBPA. MDS-defining: ≥10% dysplasia in one lineage + cytogenetics; SF3B1 ring sideroblasts; del(5q). Aplastic anemia: pancytopenia + hypocellular marrow; check PNH clone, telomeres, FA testing.`,
    },
    {
      name: "Hemophagocytic lymphohistiocytosis",
      summary: `HLH-2004 criteria: fever + splenomegaly + cytopenias (≥2 lineages) + hypertriglyceridemia and/or hypofibrinogenemia + hemophagocytosis + low/absent NK activity + hyperferritinemia (often >10,000) + elevated sIL-2R. Primary (familial HLH — PRF1, UNC13D, STX11, STXBP2; XLP1 SH2D1A, XLP2 XIAP; CHS LYST; GS2 RAB27A) → triggered by infection (EBV especially). Secondary / MAS — autoimmune disease (Still's, SLE), malignancy (T/NK lymphoma), HIV, transplant. Etoposide + dexamethasone, then BMT for primary.`,
    },
    {
      name: "Iron-overload and porphyria",
      summary: `Hereditary hemochromatosis: HFE (C282Y homozygous most common in NW European), TFR2, HJV (juvenile), HAMP (juvenile), SLC40A1 (ferroportin disease). Acquired iron overload: transfusional (thalassemia, sickle cell, MDS). Porphyrias: acute hepatic (AIP — porphobilinogen elevated in urine during attack, neuropsychiatric, abdominal pain, hyponatremia), variegate, hereditary coproporphyria, ALA dehydratase deficiency. Cutaneous: PCT (most common — UROD, association with HCV, alcohol, iron), EPP (FECH — childhood photosensitivity, painful), CEP. Acute porphyria attack triggers: drugs (CYP450 inducers — barbiturates), fasting, hormonal cycle.`,
    },
    {
      name: "Hereditary anemias / hemoglobinopathies",
      summary: `Sickle cell disease: HbSS, HbSC, HbS/β-thal. Recurrent vaso-occlusive episodes, acute chest syndrome, stroke, splenic infarction. Hydroxyurea + L-glutamine + crizanlizumab + voxelotor. Thalassemia: α-thal (HBA1/2 deletions; silent → trait → HbH → Bart's), β-thal (HBB; minor, intermedia, major). Hereditary spherocytosis: most common inherited hemolysis in northern Europeans; ANK1, SPTB, SPTA1, SLC4A1, EPB42 — splenectomy benefits. PNH: PIGA somatic mutation in HSC → loss of GPI anchor → complement-mediated lysis + thrombosis (atypical: hepatic, mesenteric, cerebral veins) + cytopenias; eculizumab/ravulizumab.`,
    },
  ],

  differentialPatterns: [
    "Pancytopenia + short stature + radial-ray defects + café-au-lait → Fanconi anemia; chromosomal breakage.",
    "Pancytopenia + nail dystrophy + leukoplakia + pulmonary fibrosis → Dyskeratosis congenita (telomere disease).",
    "Pancytopenia + exocrine pancreatic insufficiency + neutropenia + skeletal abnormalities → Shwachman-Diamond (SBDS).",
    "Coombs-negative hemolysis + thrombosis in unusual sites (hepatic, mesenteric, cerebral veins) + hemoglobinuria → PNH; flow CD55/CD59.",
    "MAHA + thrombocytopenia + neurologic symptoms + fever + renal dysfunction → TTP; ADAMTS13 + plex emergent.",
    "MAHA + AKI + complement consumption + atypical post-diarrheal context → atypical HUS; eculizumab.",
    "Episodic hemolysis triggered by oxidative drug / fava bean / infection → G6PD deficiency.",
    "Severe early-onset cutaneous photosensitivity + painful skin → EPP (FECH).",
    "Acute abdominal pain + neuropsychiatric symptoms + hyponatremia + reddish urine → acute intermittent porphyria; urine PBG.",
    "Iron overload + diabetes + cardiomyopathy + arthropathy + skin pigmentation → HFE hemochromatosis.",
    "Polyneuropathy + organomegaly + endocrinopathy + M-protein + skin changes → POEMS; VEGF elevation supports.",
    "Cytopenia + hyperferritinemia + fever + splenomegaly + hypertriglyceridemia → HLH; emergent.",
    "Adult with unexplained thromboses + livedo + miscarriages + positive aPL → antiphospholipid syndrome (confirm at 12 weeks).",
    "JAK2 V617F + elevated red cells/platelets/marrow fibrosis → Philadelphia-negative MPN.",
    "Hypereosinophilia + cardiac involvement + responds to imatinib → FIP1L1-PDGFRA.",
    "Recurrent thrombosis + headaches + hyperviscosity + IgM gammopathy → Waldenström.",
    "Macroglossia + carpal tunnel + nephrotic syndrome + cardiomyopathy → AL amyloidosis.",
    "Bilateral foot drop + ataxia + macrocytic anemia + smooth tongue → vitamin B12 deficiency (subacute combined degeneration).",
  ],

  redFlags: [
    "APML (acute promyelocytic leukemia, t(15;17)) — emergent ATRA before confirmatory cytogenetics if suspected; coagulopathy risks fatal hemorrhage.",
    "Hyperviscosity (Waldenström, MM, hyperleukocytosis) — emergent plasmapheresis / leukopheresis.",
    "TTP — emergent plasma exchange; don't transfuse platelets (worsens microthrombi) except life-threatening bleeding.",
    "Catastrophic APS — multi-organ thromboses; aggressive anticoagulation + immunosuppression + plasmapheresis.",
    "HLH with rapidly rising ferritin / falling counts — emergent etoposide + dex; consider trigger (EBV).",
    "PNH with new thrombosis — atypical sites, especially Budd-Chiari; need anticoagulation + eculizumab.",
    "Severe immune thrombocytopenia (<10) + wet purpura — emergent steroids ± IVIG.",
    "Suspected leukemic involvement + tumor lysis labs — pre-emptive hydration + allopurinol/rasburicase.",
    "Fever + neutropenia — empirical broad-spectrum antibiotics within 1 hour.",
  ],

  commonMimics: [
    {
      condition: "Aplastic anemia (acquired)",
      mimics: ["Hypoplastic MDS", "Fanconi anemia / DC presenting as AA", "PNH-associated AA", "Drug-induced (chloramphenicol, antiepileptics, NSAIDs)", "Hepatitis-associated", "Parvovirus B19 (pure red cell)", "T-LGL leukemia", "Hairy cell"],
    },
    {
      condition: "Myelodysplastic syndrome",
      mimics: ["B12/folate deficiency", "Aplastic anemia", "Copper deficiency (zinc excess)", "Drug effect", "Acquired sideroblastic anemia (alcohol, lead)", "Hypothyroidism", "T-LGL", "Constitutional BMF (DC, FA — must exclude in young patients)"],
    },
    {
      condition: "Immune thrombocytopenia (ITP)",
      mimics: ["TTP / HUS / DIC", "Drug-induced thrombocytopenia (heparin, quinine, others)", "Hereditary thrombocytopenia (MYH9, ANKRD26, ETV6, RUNX1, Wiskott-Aldrich)", "Bernard-Soulier (giant platelets, GP Ib/IX)", "Pseudothrombocytopenia (EDTA clumping)", "Sequestration (splenomegaly)"],
    },
    {
      condition: "Polycythemia vera",
      mimics: ["Secondary erythrocytosis (hypoxia, EPO-producing tumor, congenital — HBB high-affinity Hb, VHL, PHD2, HIF2A)", "Stress erythrocytosis (Gaisböck)", "Relative (dehydration)"],
    },
    {
      condition: "Hereditary hemochromatosis",
      mimics: ["Secondary iron overload (transfusional, MDS, thalassemia)", "Alcohol", "Hepatitis C", "African iron overload", "Aceruloplasminemia (low ceruloplasmin + iron deposition in brain)", "Atransferrinemia", "Friedreich (mitochondrial iron)"],
    },
    {
      condition: "Sickle cell disease — vaso-occlusive crisis",
      mimics: ["Acute chest syndrome", "Splenic sequestration", "Aplastic crisis (parvovirus)", "Hemolytic crisis", "Osteomyelitis (Salmonella!)", "Avascular necrosis (chronic)", "Pulmonary hypertension (chronic)"],
    },
    {
      condition: "Hereditary spherocytosis",
      mimics: ["Hereditary elliptocytosis / pyropoikilocytosis", "Hereditary stomatocytosis", "Autoimmune hemolytic anemia (warm IgG)", "G6PD / pyruvate kinase deficiency", "Wilson's hemolytic crisis"],
    },
  ],
};
