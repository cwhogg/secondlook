import type { SpecialtyReference } from "./types";

export const PULMONOLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Pulmonologist",
  expertise: `Deep expertise in interstitial lung disease, hereditary pulmonary disorders (α1-antitrypsin deficiency, primary ciliary dyskinesia, hereditary hemorrhagic telangiectasia with pulmonary AVMs), pulmonary hypertension (idiopathic, heritable BMPR2/ALK1/ENG, drug-induced, connective-tissue-disease-associated), eosinophilic lung diseases, hypersensitivity pneumonitis, sarcoidosis pulmonary phenotypes, cystic lung diseases (LAM, Birt-Hogg-Dubé, PLCH, LIP), and rare pediatric-onset chronic lung disease (surfactant disorders SP-B/SP-C/ABCA3, NEHI, congenital pulmonary airway malformation).`,

  clinicalFrameworks: [
    {
      name: "Interstitial lung disease classification (ATS/ERS)",
      summary: `IPF (definite UIP pattern on HRCT — basal/subpleural reticulation + honeycombing + traction bronchiectasis, no inconsistent features); NSIP (uniform ground-glass + reticulation, often CTD-associated); HP (centrilobular nodules + air trapping + mid-upper lung predominance); sarcoid (perilymphatic nodules + adenopathy); LCH (cysts + nodules in smoker, upper lobe predominant); LAM (thin-walled cysts, female); PAP (crazy-paving). Family history of pulmonary fibrosis + short telomeres → telomere disorder (TERT, TERC, RTEL1, PARN). MUC5B polymorphism in familial IPF.`,
    },
    {
      name: "Pulmonary hypertension WSPH groups",
      summary: `Group 1 (PAH): idiopathic, heritable (BMPR2, ALK1/ENG = HHT, SMAD9, CAV1, KCNK3), drug/toxin (anorexigens, methamphetamine, dasatinib), CTD-PAH (scleroderma highest risk), congenital shunts, portal hypertension, HIV, schistosomiasis. Group 2 (left heart). Group 3 (lung disease/hypoxia — ILD, COPD, sleep-disordered breathing). Group 4 (CTEPH — workup with V/Q scan, not just CTPA). Group 5 (multifactorial — sarcoid, fibrosing mediastinitis, sickle, gaucher, glycogen storage). Always RHC for confirmation. mPAP ≥20, PCWP ≤15, PVR ≥3 WU defines pre-capillary PH.`,
    },
    {
      name: "Eosinophilic lung diseases",
      summary: `EGPA (Churg-Strauss, ANCA-positive in ~40%, asthma + eosinophilia + multisystem). Idiopathic chronic eosinophilic pneumonia (upper lobe peripheral consolidation, "photographic negative of pulmonary edema"). Acute eosinophilic pneumonia (febrile, hypoxic, often smokers/new exposures, BAL eosinophils >25%). Allergic bronchopulmonary aspergillosis (asthma/CF + central bronchiectasis + IgE >1000 + Aspergillus IgE/IgG). Hypereosinophilic syndromes (clonal FIP1L1-PDGFRA, lymphocytic, idiopathic). Parasites (Loeffler, tropical pulmonary eosinophilia, strongyloides hyperinfection). Drug-induced (nitrofurantoin, sulfas, daptomycin).`,
    },
    {
      name: "Cystic lung diseases",
      summary: `LAM: women, TSC2 mutations (sporadic or syndromic with TSC), thin-walled cysts throughout lung, chylothorax, abdominal angiomyolipomas, VEGF-D elevated; rapamycin treatment. Birt-Hogg-Dubé: FLCN mutations, basal cysts + fibrofolliculomas + renal tumors + spontaneous pneumothorax. PLCH (pulmonary Langerhans cell histiocytosis): smokers, upper lobe cysts + nodules, BRAF V600E in some. LIP (lymphocytic interstitial pneumonia): Sjögren, HIV, common variable ID. Light-chain deposition disease. α1-antitrypsin: panacinar emphysema basal predominant, PiZZ phenotype, send AAT level + Pi typing in any COPD <50 or non-smoker.`,
    },
    {
      name: "Hereditary pulmonary disorders",
      summary: `Primary ciliary dyskinesia (PCD): chronic wet cough from birth, situs inversus in ~50% (Kartagener), recurrent otitis/sinusitis, male infertility; nasal nitric oxide screen + ciliary EM + genetic panel (DNAH5 most common). Cystic fibrosis (CFTR): consider in any adult with bronchiectasis, recurrent pancreatitis, infertility, or atypical phenotype; sweat chloride + genetic panel. α1-antitrypsin deficiency (SERPINA1): early emphysema, neonatal cholestasis, panniculitis. HHT (osler-weber-rendu, ENG/ACVRL1): epistaxis + telangiectasias + visceral AVMs (pulmonary, cerebral, hepatic) + family history. Surfactant disorders (SFTPB, SFTPC, ABCA3): pediatric/infantile respiratory failure or chronic ILD.`,
    },
    {
      name: "Sarcoidosis pulmonary phenotypes",
      summary: `Stage 0 (normal CXR) to IV (fibrosis). Löfgren syndrome (acute, bilateral hilar adenopathy + erythema nodosum + arthritis + fever, often self-limited). Heerfordt (uveitis + parotitis + fever + facial palsy). Imaging: bilateral hilar/mediastinal adenopathy + perilymphatic nodules along fissures + bronchovascular bundles. ACE/lysozyme nonspecific. Diagnose by EBUS-TBNA of accessible lymph nodes; non-caseating granulomas + exclude alternatives (TB, fungal, berylliosis). Treat indication = symptoms or organ dysfunction. Cardiac/neuro/severe pulmonary sarcoid → immunosuppression. Don't miss cardiac sarcoid (PET-CT, MRI, monitor for arrhythmia).`,
    },
    {
      name: "Hypersensitivity pneumonitis",
      summary: `Inhalation antigen (avian — bird fancier's; thermophilic actinomycetes — farmer's; mold — humidifier/water-damaged building; chemicals — isocyanates). Acute: 4-12h post-exposure fever + cough + hypoxia. Subacute/chronic: insidious cough + DOE + weight loss. HRCT: centrilobular ground-glass nodules + mosaic attenuation + air trapping (mid-upper > lower lung); chronic forms develop fibrosis indistinguishable from IPF/NSIP. BAL: lymphocytosis. Diagnosis = exposure + compatible HRCT + supportive BAL/biopsy. Removal of exposure is essential; steroids for acute/severe.`,
    },
    {
      name: "Bronchiectasis differential — adult onset",
      summary: `Post-infectious (most common — TB, NTM, pertussis, severe pneumonia). CF (sweat chloride + CFTR sequencing — adult CF can present as recurrent sinopulmonary). Primary ciliary dyskinesia. Allergic bronchopulmonary aspergillosis. Immune deficiency (CVID — total Ig low + impaired vaccine response; specific antibody deficiency; PIDs). α1-AT. Inflammatory bowel disease (IBD-associated). Rheumatoid arthritis. Yellow nail syndrome (lymphedema + yellow nails + bronchiectasis). Williams-Campbell, Mounier-Kuhn (tracheobronchomegaly). Localized bronchiectasis → endobronchial obstruction (carcinoid, FB).`,
    },
  ],

  differentialPatterns: [
    "Bibasal reticulation + traction bronchiectasis + honeycombing in a patient over 60 → IPF; check family history + telomere disorder workup if pulmonary fibrosis in relatives.",
    "Recurrent sinopulmonary infections + male infertility + chronic wet cough → primary ciliary dyskinesia or atypical CF.",
    "Recurrent epistaxis + GI bleeding + skin telangiectasias + family history → HHT; screen for pulmonary AVMs (echo bubble study).",
    "Adult-onset emphysema + non-smoker (or basal predominance) → α1-antitrypsin deficiency.",
    "Childbearing-age woman + cystic lung disease + chylothorax → LAM; check VEGF-D, abdominal AMLs.",
    "Asthma + eosinophilia + neuropathy/skin nodules/sinusitis → EGPA; ANCA + biopsy.",
    "Pulmonary hypertension + scleroderma → annual TTE screening; if elevated, RHC.",
    "Idiopathic PAH in young person + family history → BMPR2/ALK1/ENG genetic panel.",
    "Chronic productive cough + bronchiectasis + low immunoglobulins → CVID; check IgG/IgA/IgM + vaccine response.",
    "Bilateral hilar adenopathy + erythema nodosum + ankle arthritis → Löfgren (acute sarcoidosis), often self-resolves.",
  ],

  redFlags: [
    "Massive hemoptysis in HHT → embolization of bronchial/pulmonary AVMs.",
    "Acute eosinophilic pneumonia in young patient with new smoking or vape exposure → ICU-level support, urgent steroids.",
    "Tension pneumothorax in spontaneous pneumothorax with cystic lung disease → emergent decompression.",
    "Rapidly progressive ILD with severe acute exacerbation pattern → AE-IPF, very high mortality.",
    "ANCA-positive pulmonary-renal syndrome → MPA / GPA with DAH; emergent immunosuppression.",
    "Right heart failure in WHO group 1 PAH not on therapy → urgent escalation; consider prostacyclin.",
  ],

  commonMimics: [
    {
      condition: "IPF",
      mimics: ["Chronic HP (especially fibrotic)", "CTD-ILD (RA-UIP, scleroderma)", "NSIP", "Smoking-related interstitial fibrosis", "Pneumoconiosis", "Telomere disorder ILD"],
    },
    {
      condition: "Asthma",
      mimics: ["EGPA", "ABPA", "Vocal cord dysfunction", "Tracheobronchomalacia", "Carcinoid", "Tracheal tumors", "Hypereosinophilic syndrome"],
    },
    {
      condition: "COPD",
      mimics: ["α1-antitrypsin deficiency", "Bronchiectasis", "Constrictive bronchiolitis", "Tracheobronchomegaly", "Cardiac asthma"],
    },
    {
      condition: "Sarcoidosis",
      mimics: ["Tuberculosis", "Lymphoma", "Berylliosis (CBD)", "Hypersensitivity pneumonitis", "Common variable ID with granulomas", "IgG4-related disease", "Mycobacterial / fungal infection"],
    },
    {
      condition: "PAH",
      mimics: ["CTEPH (DON'T MISS — V/Q is the screen)", "PVOD/PCH (pulmonary veno-occlusive)", "PH from left heart disease", "PH from lung disease (group 3)", "Schistosomiasis (in endemic areas)"],
    },
  ],
};
