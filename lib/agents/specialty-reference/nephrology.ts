import type { SpecialtyReference } from "./types";

export const NEPHROLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Nephrologist",
  expertise: `Deep expertise in hereditary kidney disease (PKD1/2 ADPKD, ARPKD, Alport COL4A3/4/5, Fabry GLA, nephronophthisis, ADTKD-UMOD/MUC1/REN/HNF1B, nail-patella, Bardet-Biedl, tuberous sclerosis), glomerular disease (primary FSGS, IgA nephropathy, membranous, lupus nephritis, ANCA-associated glomerulonephritis, anti-GBM), tubular and tubulointerstitial disorders (RTA types 1/2/4, Bartter, Gitelman, Liddle, Dent, Lowe, cystinuria, pseudohypoaldosteronism), inherited podocytopathies (NPHS1/2/WT1/INF2), and amyloid / paraprotein-related kidney disease.`,

  clinicalFrameworks: [
    {
      name: "Hereditary cystic and tubular kidney disease",
      summary: `ADPKD (PKD1/PKD2, large kidneys, hepatic + pancreatic cysts, intracranial aneurysms, MV prolapse). ARPKD (PKHD1, neonatal/childhood, hepatic fibrosis). Nephronophthisis (NPHP1, juvenile, no proteinuria/hematuria, anemia + polyuria, retinal/cerebellar in Senior-Loken/Joubert). Medullary cystic kidney = ADTKD-UMOD/MUC1/REN/HNF1B (mild urinalysis, gout often dominant, slowly progressive, family history). HNF1B = MODY-5 + renal cysts + pancreatic hypoplasia + hypomagnesemia. TSC (TSC1/2): angiomyolipomas + cysts + RCC. von Hippel-Lindau: clear cell RCC + pheochromocytoma + hemangioblastomas.`,
    },
    {
      name: "Alport syndrome and thin basement membrane",
      summary: `Alport: COL4A3/4/5 — hematuria (microscopic + episodic gross) + sensorineural hearing loss + lenticonus + progressive CKD. X-linked (COL4A5, most common — male severe, female variable). Autosomal recessive (COL4A3/4 — both alleles, severe in both sexes). Autosomal dominant (single COL4A3/4 — milder). Thin basement membrane nephropathy = heterozygous COL4A3/4, often "benign familial hematuria" but some progress. Diagnose: genetic panel + skin biopsy (COL4A5 stain) or kidney biopsy with EM (thin/split GBM). Don't miss family with isolated microhematuria — at least 30% are Alport carriers with progression risk.`,
    },
    {
      name: "Fabry disease and metabolic nephropathy",
      summary: `Fabry (GLA, X-linked): renal (proteinuria → ESRD), cardiac (LVH, arrhythmia), CNS (small-vessel strokes in young), neuropathic pain, angiokeratomas, hypohidrosis, corneal verticillata. Female carriers symptomatic too. Diagnose: α-gal A activity (males) + GLA sequencing (all). Treat: enzyme replacement (agalsidase) ± migalastat. Other inherited metabolic: cystinosis (CTNS, pediatric Fanconi + cystine crystals), primary hyperoxaluria (oxalate stones + nephrocalcinosis + ESRD; AGXT type 1 ± liver transplant), adenine phosphoribosyltransferase deficiency (DHA stones).`,
    },
    {
      name: "Glomerular disease — minimum workup",
      summary: `Nephrotic-range proteinuria + low albumin + edema → minimal change vs FSGS vs membranous vs MPGN vs amyloid vs DM nephropathy. Workup: ANA + dsDNA + C3/C4 + ANCA + anti-PLA2R (membranous) + serum/urine free light chains + immunofixation + cryoglobulins + HBV/HCV/HIV + sFLC + kidney biopsy. Lupus nephritis class I-VI on biopsy. ANCA-associated GN: MPO (MPA) or PR3 (GPA), rapidly progressive, often pulmonary-renal. Anti-GBM (Goodpasture): linear IgG on biopsy + DAH. IgA nephropathy: most common GN globally, mesangial IgA. C3 glomerulopathy: complement dysregulation, factor H/I autoantibodies.`,
    },
    {
      name: "Tubulopathies and inherited electrolyte disorders",
      summary: `Bartter (SLC12A1 = type 1 / KCNJ1 = type 2 / CLCNKB = type 3 — loop-of-Henle, hypokalemic metabolic alkalosis, often pediatric, polyhydramnios). Gitelman (SLC12A3 — DCT, milder, adult, hypoMg + hypocalciuria). Liddle (SCNN1B/G — gain of function ENaC, hypertension + hypokalemia + low aldo). Pseudohypoaldosteronism types 1/2. Distal RTA (type 1): hypokalemia + non-anion-gap acidosis + nephrocalcinosis + stones (cystinuria/cystinosis/dRTA differential). Proximal RTA (type 2): Fanconi syndrome — multiple proximal defects (glucose, AA, phosphate, bicarbonate). Type 4 RTA: hyperkalemia + acidosis (hyporenin-hypoaldo, diabetes most common cause).`,
    },
    {
      name: "Inherited stone disease",
      summary: `Idiopathic hypercalciuria (most common). Cystinuria (SLC3A1/SLC7A9 — cystine stones, hexagonal crystals on UA). Primary hyperoxaluria (AGXT/GRHPR/HOGA1 — calcium oxalate stones + nephrocalcinosis + early ESRD). APRT deficiency (DHA stones — radiolucent, often misdiagnosed as uric acid). Xanthinuria (XDH — xanthine stones, low uric acid). Dent disease (CLCN5/OCRL — proximal tubulopathy + low-molecular-weight proteinuria + hypercalciuria + nephrocalcinosis + ESRD). Lowe syndrome (OCRL — cataracts + neuro + renal). Always send 24-h urine for stone formers + stone analysis.`,
    },
    {
      name: "Atypical hemolytic uremic syndrome and TMA",
      summary: `Triad: microangiopathic hemolytic anemia + thrombocytopenia + AKI. Differential: shiga toxin HUS (E. coli O157, pediatric); atypical HUS (complement dysregulation — CFH, CFI, CFB, C3, MCP/CD46, factor H autoantibodies); TTP (severe ADAMTS13 deficiency, often acquired autoantibody); secondary TMA (malignancy, drugs, scleroderma renal crisis, antiphospholipid syndrome, calcineurin inhibitors, gemcitabine, mitomycin, bone marrow transplant). Workup: ADAMTS13 + complement panel + Shiga toxin if diarrhea + autoimmune. Treat aHUS with eculizumab.`,
    },
  ],

  differentialPatterns: [
    "Family history of renal disease + bilateral renal cysts on imaging → ADPKD; PKD1/2 panel.",
    "Microscopic hematuria + sensorineural hearing loss in young male → Alport (X-linked COL4A5).",
    "LVH + small-vessel CNS strokes + corneal verticillata in young person → Fabry (GLA).",
    "Hypokalemic metabolic alkalosis + low BP + family history → Bartter or Gitelman.",
    "Hypokalemic alkalosis + HYPERtension + low renin/aldo → Liddle.",
    "Calcium oxalate stones + early-onset CKD + nephrocalcinosis → primary hyperoxaluria.",
    "Refractory hypertension + bilateral renal artery stenosis pattern + young female → fibromuscular dysplasia.",
    "Gout + slowly progressive CKD + bland UA + family history → ADTKD-UMOD.",
    "Pulmonary-renal syndrome (DAH + AKI) → ANCA-associated vasculitis vs anti-GBM vs lupus.",
    "Membranous pattern on biopsy + anti-PLA2R positive → primary (idiopathic) membranous.",
    "Cysts + pancreatic atrophy + MODY-5 → HNF1B (17q12 deletion).",
    "Polyuria + polydipsia in young adult with normal sodium + family history → nephrogenic DI (AVPR2 X-linked or AQP2).",
  ],

  redFlags: [
    "Rapidly progressive glomerulonephritis (RPGN) → biopsy + immunosuppression urgently; don't miss anti-GBM (lung hemorrhage).",
    "Hyperkalemia >6.5 with EKG changes → emergent calcium + insulin/glucose + dialysis assessment.",
    "Scleroderma renal crisis (sudden severe HTN + AKI in scleroderma) → ACE-i immediately (avoid in other AKI but lifesaving here).",
    "Acute oxalate nephropathy with crystalluria → consider primary hyperoxaluria, ethylene glycol, malabsorption.",
    "TMA pattern + AKI → aHUS / TTP / malignant HTN / scleroderma crisis; emergent ADAMTS13 + complement panel.",
    "Intracranial aneurysm screening in ADPKD with family history of SAH.",
  ],

  commonMimics: [
    {
      condition: "Diabetic nephropathy",
      mimics: ["Fabry disease", "Amyloidosis", "Hypertensive nephrosclerosis", "FSGS (especially APOL1)", "Membranous", "IgA nephropathy"],
    },
    {
      condition: "ADPKD",
      mimics: ["Tuberous sclerosis with PKD", "Acquired cystic kidney disease (dialysis)", "Medullary sponge kidney", "ARPKD (childhood)", "von Hippel-Lindau cysts", "BHD-associated cysts", "HNF1B / MODY-5"],
    },
    {
      condition: "Lupus nephritis",
      mimics: ["IgA nephropathy", "MPGN", "C3 glomerulopathy", "ANCA vasculitis", "Membranous (primary or lupus class V)", "Anti-GBM"],
    },
    {
      condition: "ANCA-associated GN",
      mimics: ["Anti-GBM (Goodpasture)", "Lupus nephritis", "Cryoglobulinemic GN", "Infective endocarditis-associated GN", "IgA vasculitis"],
    },
    {
      condition: "Membranous nephropathy",
      mimics: ["Lupus class V", "Hepatitis B/C-associated", "Solid tumor paraneoplastic", "Drug-induced (gold, NSAIDs, captopril)", "Sarcoidosis", "IgG4-related"],
    },
  ],
};
