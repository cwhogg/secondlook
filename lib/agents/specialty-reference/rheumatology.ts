import type { SpecialtyReference } from "./types";

export const RHEUMATOLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Rheumatologist",
  expertise: `Deep expertise in systemic autoimmune disease (SLE, Sjögren, scleroderma, inflammatory myopathies), vasculitis across vessel sizes, connective-tissue disorders (EDS, Marfan, Loeys-Dietz, MCTD), inflammatory and autoinflammatory arthropathies, IgG4-related disease, sarcoidosis, Behçet, and overlap/undifferentiated syndromes. Strong emphasis on serologic patterns, ANA-subtypes, complement, and biopsy interpretation.`,

  clinicalFrameworks: [
    {
      name: "2019 EULAR/ACR — Systemic Lupus Erythematosus",
      summary: `Entry criterion: ANA ≥1:80 ever. Then weighted criteria across domains (clinical: constitutional, hematologic, neuropsychiatric, mucocutaneous, serosal, musculoskeletal, renal; immunologic: antiphospholipid, complement, SLE-specific antibodies). ≥10 points + ≥1 clinical = classification. SLE-specific: anti-dsDNA, anti-Smith. Low complement (C3/C4) + active disease supports flare.`,
    },
    {
      name: "2016 ACR/EULAR — Primary Sjögren's Syndrome",
      summary: `Requires ≥3 points from: anti-SSA/Ro positive (3 pts), focal lymphocytic sialadenitis with focus score ≥1 on minor salivary gland biopsy (3 pts), ocular staining score ≥5 (1 pt), Schirmer ≤5 mm/5 min (1 pt), unstimulated whole salivary flow ≤0.1 mL/min (1 pt). Exclude head/neck radiation, HCV, HIV, sarcoid, amyloid, GVHD, IgG4-RD.`,
    },
    {
      name: "2013 ACR/EULAR — Systemic Sclerosis",
      summary: `Skin thickening of fingers extending proximal to MCPs = sufficient alone (9 pts). Additive: puffy fingers (2), sclerodactyly (4), digital tip ulcers (2)/pitting scars (3), telangiectasia (2), abnormal nailfold capillaries (2), PAH and/or ILD (2 each), Raynaud's (3), scleroderma-related antibodies (anti-centromere/Scl-70/RNAP3, 3 pts). Score ≥9 = definite SSc.`,
    },
    {
      name: "Inflammatory myopathies — ACR/EULAR 2017 + serologic subtypes",
      summary: `Probability-based score combining age of onset, symmetric proximal weakness, neck-flexor>extensor weakness, rash (heliotrope, Gottron), CK elevation, anti-Jo-1, biopsy features. Myositis-specific antibodies define syndromes: anti-Jo-1/PL-7/PL-12 (antisynthetase: ILD, mechanic's hands, Raynaud's), anti-Mi-2 (classic DM), anti-MDA5 (rapidly progressive ILD, often skin-predominant DM), anti-TIF1γ/NXP-2 (cancer-associated DM), anti-HMGCR (statin-triggered IMNM), anti-SRP (necrotizing). Inclusion body myositis is the great mimic — finger flexor + quadriceps weakness, rimmed vacuoles.`,
    },
    {
      name: "Chapel Hill vasculitis nomenclature",
      summary: `Large-vessel: giant cell arteritis (>50yo, jaw claudication, scalp tenderness, ↑ESR/CRP, halo on US/MRI; biopsy), Takayasu (<50yo, pulseless disease). Medium-vessel: PAN (mesenteric/renal microaneurysms, mononeuritis multiplex, HBV-associated), Kawasaki. ANCA-associated small-vessel: GPA (c-ANCA/PR3, granulomas, sino-pulmonary-renal), MPA (p-ANCA/MPO, pulm-renal), EGPA (asthma + eosinophilia + neuropathy). Immune-complex small-vessel: IgA vasculitis, cryoglobulinemia, anti-GBM, hypocomplementemic urticarial vasculitis.`,
    },
    {
      name: "2010 ACR/EULAR — Rheumatoid Arthritis",
      summary: `Joint involvement (count + size — small joints weighted higher), serology (RF and/or anti-CCP), acute phase reactants (CRP/ESR), duration ≥6 weeks. ≥6/10 = definite. Note: adult RA is COMMON (~1% prevalence) and is the principal common differential for symmetric polyarthritis with morning stiffness. Don't suppress it because it's common — name it when it fits.`,
    },
    {
      name: "Adult-onset Still's & autoinflammatory syndromes",
      summary: `Yamaguchi criteria for AOSD: quotidian high fever, evanescent salmon rash, arthralgia/arthritis, leukocytosis with neutrophilia, ferritin often >1000 (glycosylated <20%). Hereditary periodic fevers: FMF (MEFV, Sephardic Jewish/Turkish/Armenian, serositis, colchicine-responsive), TRAPS (TNFRSF1A, periorbital edema, migratory myalgia), HIDS/MKD (MVK), CAPS spectrum (NLRP3 — FCAS, MWS, NOMID/CINCA with urticaria + hearing loss + CNS).`,
    },
    {
      name: "Connective tissue disorders / heritable",
      summary: `Marfan (FBN1, aortic root dilation, ectopia lentis, tall+arachnodactyly, Ghent 2010 nosology). Loeys-Dietz (TGFBR1/2, SMAD3, TGFB2/3 — hypertelorism, bifid uvula, aggressive arteriopathy, more vessels involved than Marfan). Vascular EDS (COL3A1 — arterial/intestinal/uterine rupture, thin translucent skin). Classical EDS (COL5A1/2 — skin hyperextensibility, atrophic scarring). Hypermobile EDS (clinical diagnosis, 2017 criteria — Beighton + systemic features + family history).`,
    },
    {
      name: "IgG4-Related Disease",
      summary: `Tumefactive lesions across organs (pancreas → AIP type 1, salivary glands → Mikulicz, retroperitoneal fibrosis, orbital pseudotumor, sclerosing cholangitis, tubulointerstitial nephritis). Diagnosis: 2019 ACR/EULAR classification — exclusion criteria + organ-specific weighted features. Histology: storiform fibrosis + obliterative phlebitis + IgG4:IgG ratio >40% + dense IgG4+ plasma cell infiltrate. Elevated serum IgG4 is suggestive but not specific.`,
    },
    {
      name: "Behçet & sarcoidosis",
      summary: `Behçet: recurrent oral ulcers + 2 of: genital ulcers, eye involvement (uveitis), skin (erythema nodosum, pseudofolliculitis, pathergy), neurologic, vascular. HLA-B51 association. Sarcoidosis: noncaseating granulomas + bilateral hilar adenopathy ± erythema nodosum + arthritis = Löfgren (good prognosis). Heerfordt: parotid + uveitis + facial palsy + fever. Always check ACE, calcium, vitamin D, ECG (cardiac sarcoid is high-mortality).`,
    },
  ],

  differentialPatterns: [
    "Symmetric MCP/PIP synovitis + morning stiffness >1h + RF/anti-CCP positive → RA. Name it; don't reach for rarer overlap syndromes when this fits.",
    "Sicca + arthralgia + fatigue + anti-SSA/Ro → Sjögren — biopsy minor salivary gland if equivocal.",
    "Raynaud + puffy hands + abnormal nailfold capillaries → early SSc; antibodies (centromere, Scl-70, RNAP3) refine subtype + cancer risk (RNAP3 → renal crisis).",
    "Proximal weakness + rash + ILD → antisynthetase syndrome (anti-Jo-1/PL-7/PL-12); check mechanic's hands.",
    "Rapidly progressive ILD + amyopathic DM-skin → anti-MDA5 — treat aggressively; high mortality.",
    "New-onset cancer-associated dermatomyositis pattern (older patient, anti-TIF1γ/NXP-2) → trigger malignancy screen.",
    "Older patient + headache + jaw claudication + visual symptoms + ↑ESR → start steroids before biopsy; treat-on-suspicion.",
    "Sinopulmonary disease + renal involvement + saddle-nose / nasal septal perforation → GPA; c-ANCA/PR3.",
    "Asthma + eosinophilia + mononeuritis multiplex → EGPA; p-ANCA/MPO sometimes negative.",
    "Recurrent oral + genital ulcers + uveitis along Silk Road origin → Behçet — pathergy positive supports.",
    "Symmetric polyarthritis in HCV-infected patient + palpable purpura + low C4 → mixed cryoglobulinemia.",
    "Aortic root dilation + tall stature + ectopia lentis → Marfan; if hypertelorism + bifid uvula + multi-vessel arteriopathy → Loeys-Dietz instead.",
    "Severe joint hypermobility + tissue fragility + family history of dissection/rupture → vascular EDS; do not delay genetics.",
    "Tumefactive lesions in multiple organs + storiform fibrosis on biopsy → IgG4-RD.",
    "Episodic fevers since childhood + serositis + Mediterranean ancestry + responsive to colchicine → FMF (MEFV).",
  ],

  redFlags: [
    "Anti-MDA5 dermatomyositis — rapidly progressive ILD; treat early and aggressively or risk death within weeks.",
    "Anti-RNAP3 systemic sclerosis — high risk of scleroderma renal crisis; ACE-i ready.",
    "Acute monoarthritis — always tap to exclude septic arthritis before treating presumed crystal arthritis.",
    "GCA with visual symptoms — irreversible blindness within hours if untreated; high-dose steroids first, biopsy second.",
    "Catastrophic antiphospholipid syndrome — multi-organ thromboses; aggressive anticoagulation + immunosuppression + plasmapheresis.",
    "Adult-onset Still's with extreme ferritin (>10,000) — consider macrophage activation syndrome (MAS/HLH overlap).",
    "Cardiac sarcoidosis with conduction disease — ICD evaluation; cardiac MRI/PET indicated.",
    "Vascular EDS — avoid arterial puncture, colonoscopy, contact sports; screen family.",
    "Behçet with CNS or major vessel involvement — high morbidity; aggressive immunosuppression.",
  ],

  commonMimics: [
    {
      condition: "Systemic Lupus Erythematosus",
      mimics: ["Mixed connective tissue disease", "Sjögren's", "Drug-induced lupus", "Undifferentiated CTD", "Chronic viral hepatitis (HCV, HBV)", "HIV", "Lyme", "Antiphospholipid syndrome", "Vasculitis"],
    },
    {
      condition: "Rheumatoid Arthritis",
      mimics: ["Psoriatic arthritis", "Reactive arthritis", "Polyarticular gout", "Polymyalgia rheumatica with synovitis", "Hepatitis C-associated arthritis", "Parvovirus B19 arthritis", "Hemochromatosis arthropathy", "Calcium pyrophosphate deposition"],
    },
    {
      condition: "Polymyositis",
      mimics: ["Inclusion body myositis", "Immune-mediated necrotizing myopathy (anti-HMGCR, anti-SRP)", "Limb-girdle muscular dystrophy", "Pompe disease (adult)", "Hypothyroid myopathy", "Statin-related myopathy", "Mitochondrial myopathy"],
    },
    {
      condition: "Systemic Sclerosis",
      mimics: ["Eosinophilic fasciitis", "Scleromyxedema", "Nephrogenic systemic fibrosis", "Chronic GVHD", "Scleredema (Buschke)", "POEMS"],
    },
    {
      condition: "ANCA-associated vasculitis",
      mimics: ["IgG4-related disease", "Cocaine-induced midline destructive lesions (levamisole)", "Lymphomatoid granulomatosis", "Goodpasture", "Cryoglobulinemia"],
    },
    {
      condition: "Adult-onset Still's disease",
      mimics: ["Hemophagocytic lymphohistiocytosis (HLH)", "Hereditary periodic fever syndromes", "Lymphoma", "Subacute bacterial endocarditis", "Drug fever / DRESS"],
    },
    {
      condition: "Fibromyalgia",
      mimics: ["Early connective tissue disease", "Hypothyroidism", "Small fiber neuropathy", "Polymyalgia rheumatica", "Sjögren without classic sicca", "Mast cell activation syndrome", "ME/CFS"],
    },
  ],
};
