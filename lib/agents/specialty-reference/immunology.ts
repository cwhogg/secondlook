import type { SpecialtyReference } from "./types";

export const IMMUNOLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Clinical Immunologist",
  expertise: `Deep expertise in inborn errors of immunity (primary immunodeficiencies and immune dysregulation), mast cell disorders, autoinflammatory syndromes, complement deficiencies, eosinophilic/allergic disorders, and the immunologic substrate of recurrent infection, autoimmunity, and inflammation.`,

  clinicalFrameworks: [
    {
      name: "IUIS classification of inborn errors of immunity",
      summary: `Ten-category framework: (1) combined immunodeficiencies (SCID — T-, T-low B+/B-, Omenn variant), (2) CIDs with syndromic features (DiGeorge, ataxia-telangiectasia, Wiskott-Aldrich, hyper-IgE syndromes), (3) predominantly antibody deficiencies (CVID, XLA, IgA deficiency, hyper-IgM), (4) immune dysregulation (IPEX/FOXP3, ALPS, LRBA, CTLA4, STAT3-GOF), (5) congenital phagocyte defects (CGD, leukocyte adhesion deficiency, neutropenia), (6) innate / intrinsic immunity defects (MSMD, NEMO, IRAK4, MyD88), (7) autoinflammatory disorders (FMF, TRAPS, CAPS, DADA2), (8) complement deficiencies, (9) bone marrow failure, (10) phenocopies. Newborn screening with TREC catches most SCID.`,
    },
    {
      name: "CVID — ESID criteria",
      summary: `≥4 years old + serum IgG <2 SD below mean for age + low IgA and/or IgM + poor vaccine response or absent isohemagglutinins + exclusion of secondary causes (lymphoma, drugs, protein-loss, infection). Phenotypes: infection-only; CVID + autoimmunity (cytopenias, GLILD, enteropathy); CVID + granulomatous-lymphocytic interstitial lung disease; CVID + malignancy. Increasing genetic etiologies identified (TACI, NFKB1, NFKB2, CTLA4, LRBA, PIK3CD).`,
    },
    {
      name: "Recurrent infection pattern → defect localization",
      summary: `Encapsulated bacteria (pneumococcus, H. flu) → humoral / spleen / complement. Catalase-positive organisms (Staph, Burkholderia, Aspergillus, Nocardia, Serratia) → CGD (NADPH oxidase). Mycobacteria + Salmonella → IFN-γ/IL-12 axis (MSMD). Severe HSV → UNC93B/TLR3/STAT1 axis. Recurrent Neisseria → terminal complement (C5-C9) or properdin. Chronic mucocutaneous candidiasis → STAT1-GOF, AIRE (APECED), CARD9. Severe EBV → XLP (SH2D1A, XIAP), MAGT1, CTPS1.`,
    },
    {
      name: "Mast cell disorders",
      summary: `Mastocytosis (clonal): KIT D816V mutation. Subtypes: indolent SM (most common), aggressive SM, mast cell leukemia, cutaneous (urticaria pigmentosa). Diagnose by tryptase >20 (or 11.5 if HαT excluded), KIT mutation in marrow, ≥3 minor criteria. MCAS (consensus criteria): episodic systemic symptoms across ≥2 organs + transient tryptase rise (baseline + 20% + 2 ng/mL) during episode + response to MC-directed therapy. HαT (hereditary alpha-tryptasemia): extra TPSAB1 copies, elevated baseline tryptase, amplifier of clinical symptoms.`,
    },
    {
      name: "Autoinflammatory disease pattern",
      summary: `Recurrent fevers + serositis/arthritis without infection or autoantibodies — innate immune system overactive. FMF (MEFV, Mediterranean ancestries, colchicine). TRAPS (TNFRSF1A, periorbital edema, migratory rash, prolonged fevers). HIDS/MKD (MVK, childhood onset, abdominal pain, cervical adenopathy). CAPS spectrum (NLRP3 GOF — FCAS cold-induced, MWS deafness+amyloidosis, NOMID/CINCA neonatal multisystem). PAPA (PSTPIP1). DADA2 (ADA2, livedo + vasculitis + early stroke). Newer: DADA1, SAVI, CANDLE, NLRC4-MAS, ROSAH.`,
    },
    {
      name: "Hyper-IgE syndromes",
      summary: `AD-HIES / Job syndrome (STAT3 LOF) — eczema + cold abscesses + pneumatocoeles + scoliosis + retained primary teeth + characteristic facies + IgE >2000. AR-HIES (DOCK8) — viral skin infections (HSV, HPV, MC), eczema, malignancies, vascular anomalies; no skeletal/dental features. PGM3-CDG — combined immunodeficiency + atopy + neurodevelopmental delay + dysmorphism.`,
    },
    {
      name: "ALPS — autoimmune lymphoproliferative syndrome",
      summary: `Chronic non-malignant lymphadenopathy and splenomegaly + cytopenias + elevated double-negative T cells (CD4-CD8-TCRαβ+) >2.5%. FAS most common; FASL, CASP10. Treat autoimmune cytopenias; risk of lymphoma elevated. Mimics: Evans syndrome, CVID with autoimmunity, Castleman.`,
    },
    {
      name: "Hereditary angioedema",
      summary: `Recurrent angioedema without urticaria, often triggered by trauma/stress, NOT antihistamine-responsive. Type 1 (low C1-INH antigen and function — 85%), Type 2 (normal antigen, low function), Type 3 (normal C1-INH, FXII or PLG mutations, estrogen-aggravated). Always check C4 (low between attacks). Avoid ACE-inhibitors. Acute: icatibant, ecallantide, C1-INH concentrate. Prophylaxis: lanadelumab, berotralstat.`,
    },
    {
      name: "Eosinophilic disorders",
      summary: `Persistent eosinophilia >1500: rule out parasites (Strongyloides!), drugs, allergies, malignancy. Then categorize: hypereosinophilic syndrome (HES) primary/clonal (FIP1L1-PDGFRA — responds to imatinib), idiopathic, lymphocytic variant (aberrant T-cell clone). EGPA: asthma + eosinophilia + ANCA-associated vasculitis features. Organ-specific eosinophilic disease (eosinophilic esophagitis, EGE, eosinophilic pneumonia).`,
    },
    {
      name: "Complement deficiencies",
      summary: `Classical pathway (C1q/C2/C4) → lupus-like disease, recurrent encapsulated bacterial infections. Terminal pathway (C5-C9) → recurrent Neisseria infections (especially meningococcal). Alternative pathway / regulators (factor H, factor I, MCP) → atypical HUS, C3 glomerulopathy. MBL deficiency — often subclinical. Diagnose: total hemolytic complement (CH50) screens classical pathway; AH50 screens alternative.`,
    },
  ],

  differentialPatterns: [
    "Failure to thrive + recurrent severe opportunistic infections + lymphopenia (T-cell) in infancy → SCID; emergent (transplant before infection).",
    "Generalized erythroderma + lymphadenopathy + eosinophilia + hypogammaglobulinemia + recurrent infection in infant → Omenn syndrome.",
    "Eczema + thrombocytopenia (small platelets) + recurrent infection in male infant → Wiskott-Aldrich (WAS).",
    "Recurrent sinopulmonary infections in adult + low IgG/IgA/IgM + poor vaccine response → CVID.",
    "Recurrent Neisseria (especially meningococcal) → terminal complement deficiency; check AH50/CH50.",
    "Catalase-positive organism infections + lymphadenitis + colitis + abscesses → chronic granulomatous disease (CGD); DHR test.",
    "Recurrent angioedema without urticaria + low C4 + NOT antihistamine-responsive → hereditary angioedema; C1-INH levels.",
    "Episodic flushing + diarrhea + brain fog + multi-system mediator symptoms with normal tryptase between → MCAS consensus criteria.",
    "Persistent eosinophilia >1500 + cardiac/skin involvement + male → FIP1L1-PDGFRA; trial imatinib.",
    "Chronic mucocutaneous candidiasis + adrenal insufficiency + hypoparathyroidism → APECED (AIRE).",
    "Eczema + cold abscesses + pneumatocele + characteristic facies + retained teeth + IgE >2000 → AD-HIES (STAT3).",
    "Recurrent fevers + serositis since childhood + Mediterranean ancestry + colchicine response → FMF (MEFV).",
    "Livedo racemosa + early stroke + immunodeficiency → DADA2 (ADA2).",
    "Combined immunodeficiency + atopy + dysmorphic features (prominent ear, micrognathia) → PGM3-CDG.",
    "Severe EBV-driven lymphoproliferation in male → XLP (SH2D1A, XIAP), MAGT1.",
  ],

  redFlags: [
    "Lymphopenia in an infant — never normal; SCID until proven otherwise.",
    "Severe disseminated BCG infection — STAT1, IL12RB1, IFNGR1 / MSMD axis.",
    "PJP without HIV — assume primary or acquired CMI defect; check CD4, immunoglobulins, IL-12/IFN-γ axis.",
    "Recurrent serious infections + dysmorphism — combined / syndromic immunodeficiency (DiGeorge, hyper-IgE, PGM3-CDG, CHARGE).",
    "Hyperferritinemia + cytopenias + fever + organomegaly — HLH/MAS; emergent immunosuppression.",
    "Anaphylaxis on first exposure to multiple unrelated triggers — clonal mast cell disease.",
    "Cytopenias + lymphadenopathy + splenomegaly in child — ALPS / autoimmune lymphoproliferation; risk of lymphoma.",
    "Granulomas in non-mycobacterial setting + immunodeficiency — CGD, CVID-granulomatous, or NEMO/IKK defects.",
  ],

  commonMimics: [
    {
      condition: "Common Variable Immunodeficiency (CVID)",
      mimics: ["XLA (Bruton)", "Hyper-IgM syndromes", "CTLA4/LRBA deficiency", "Activated PI3Kδ syndrome (APDS)", "Good syndrome (thymoma + immunodeficiency)", "Secondary hypogammaglobulinemia (drugs — rituximab, steroids, anticonvulsants; protein loss — nephrotic, PLE; malignancy — CLL, MM)"],
    },
    {
      condition: "Mastocytosis / MCAS",
      mimics: ["Carcinoid syndrome", "Pheochromocytoma", "VIPoma", "Hereditary alpha-tryptasemia (HαT)", "POTS / dysautonomia", "Anaphylaxis from other causes", "Idiopathic anaphylaxis", "Hyperthyroidism"],
    },
    {
      condition: "Hereditary angioedema",
      mimics: ["Acquired C1-INH deficiency (lymphoproliferative)", "ACE-inhibitor angioedema", "Histaminergic angioedema", "Idiopathic angioedema", "FXII-related angioedema"],
    },
    {
      condition: "Chronic granulomatous disease (CGD)",
      mimics: ["Hyper-IgE syndromes", "Leukocyte adhesion deficiency (LAD I/II/III)", "Specific granule deficiency", "Mendelian susceptibility to mycobacterial disease (MSMD)"],
    },
    {
      condition: "Omenn syndrome",
      mimics: ["Other SCID variants (RAG1/2 hypomorphic, IL7R, JAK3, DCLRE1C, ADA, RMRP)", "Atypical complete SCID with maternal engraftment", "IPEX/FOXP3", "Combined immunodeficiency with PGM3 / AIOLOS / DOCK8"],
    },
    {
      condition: "Autoinflammatory syndrome (e.g., FMF)",
      mimics: ["TRAPS", "HIDS/MKD", "CAPS spectrum", "PFAPA syndrome", "Behçet", "Still's disease", "Recurrent serositis from chronic infection"],
    },
    {
      condition: "Hypereosinophilic syndrome",
      mimics: ["Parasitic infection (Strongyloides!)", "Drug hypersensitivity (DRESS)", "EGPA", "T-cell lymphoma", "Hyper-IgE syndrome", "Eosinophilic leukemia", "Adrenal insufficiency (modest eosinophilia)"],
    },
  ],
};
