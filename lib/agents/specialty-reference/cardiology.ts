import type { SpecialtyReference } from "./types";

export const CARDIOLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Cardiologist",
  expertise: `Deep expertise in inherited cardiomyopathies and channelopathies (HCM, DCM, ARVC, LQTS, Brugada, CPVT), dysautonomia (POTS, neurocardiogenic syncope, autonomic failure), cardiac infiltrative/storage diseases (amyloidosis, sarcoidosis, Fabry), inherited aortopathies, pulmonary hypertension, and cardiac manifestations of systemic disease.`,

  clinicalFrameworks: [
    {
      name: "Inherited cardiomyopathy gene-phenotype map",
      summary: `HCM (asymmetric septal hypertrophy, SAM, dynamic LVOT obstruction): MYH7, MYBPC3 most common. DCM with conduction disease: LMNA (early AV block, high SCD risk, ICD threshold lowered). DCM with skeletal myopathy: dystrophinopathy (DMD/BMD), Emery-Dreifuss. ARVC: PKP2, DSP, DSG2, DSC2 (RV-predominant, exercise-aggravated, epsilon waves, terminal activation delay). Restrictive: TTR amyloid, hereditary transthyretin, Fabry (GLA), Danon (LAMP2 — males, Wolff-Parkinson-White overlap), Pompe.`,
    },
    {
      name: "2010 Task Force Criteria — ARVC",
      summary: `Major + minor across categories: RV dysfunction/structural, tissue characterization (fibrofatty replacement on biopsy), repolarization (T-wave inversion V1-V3), depolarization (epsilon waves, terminal activation delay >55 ms), arrhythmias (LBBB-morphology VT), family history, genetics. 2 major / 1 major + 2 minor / 4 minor = definite. Hot phase: myocarditis-like presentation with troponin elevation.`,
    },
    {
      name: "Long QT Syndrome — Schwartz score + subtype triggers",
      summary: `QTc corrected by Bazett/Fridericia; >480 ms (M) / >500 ms (F) high-risk. Subtypes: LQT1 (KCNQ1, exercise-triggered, swimming), LQT2 (KCNH2, auditory/emotional, postpartum), LQT3 (SCN5A, sleep/rest events, β-blocker less effective). Treatment: β-blocker first line (esp. nadolol/propranolol); avoid QT-prolonging drugs; ICD if syncope on therapy or aborted SCA. Always exclude acquired causes (electrolytes, drugs).`,
    },
    {
      name: "Brugada syndrome",
      summary: `Type 1 pattern: coved ST elevation ≥2 mm + T-wave inversion in V1-V3, spontaneous or after sodium-channel blocker challenge. SCN5A most common gene (~20%). Triggers: fever, alcohol, sodium-channel blockers, vagal stimuli. Risk stratify by syncope history, spontaneous type 1 ECG, programmed stimulation. ICD if symptomatic.`,
    },
    {
      name: "CPVT (catecholaminergic polymorphic VT)",
      summary: `Bidirectional or polymorphic VT triggered by exercise/emotion with structurally normal heart. RYR2 (autosomal dominant), CASQ2 (recessive). Exercise stress test reproduces VT pattern. β-blocker (nadolol) + flecainide + left cardiac sympathetic denervation; ICD for those with breakthrough events on therapy.`,
    },
    {
      name: "Cardiac amyloidosis",
      summary: `Low-voltage QRS in limb leads + LV thickening on echo (especially apical sparing on strain) is suspicious. ATTR (wild-type → elderly men with HFpEF + carpal tunnel + lumbar stenosis; hereditary → TTR variants). AL (light chain) — proteinuria, hepatic involvement, easy bruising, macroglossia. PYP scintigraphy grade 2-3 with negative serum/urine immunofixation + free light chains → ATTR (biopsy can be skipped). Tafamidis treats ATTR-CM.`,
    },
    {
      name: "POTS, neurocardiogenic syncope, autonomic failure",
      summary: `POTS: sustained HR rise ≥30 bpm (or to ≥120) within 10 min standing, no orthostatic hypotension, chronic symptoms ≥3 months. Subtypes: hyperadrenergic, neuropathic, hypovolemic. Associations: hEDS, MCAS, post-COVID, post-EBV. Neurocardiogenic syncope: vasovagal trigger, prodrome, recovery; tilt table confirms. Autonomic failure: orthostatic hypotension without HR rise → MSA, PAF, diabetic, amyloid.`,
    },
    {
      name: "Fabry disease (GLA, X-linked)",
      summary: `Triad: angiokeratomas + acroparesthesias + corneal verticillata. Cardiac: concentric LVH that mimics HCM but with often-preserved EF, late gadolinium enhancement in basal inferolateral wall. Renal: progressive proteinuria → ESRD. CNS: TIA/stroke at young age. Diagnose: α-galactosidase A activity (men), genetic testing (women have variable expression). Enzyme replacement / chaperone (migalastat) available.`,
    },
    {
      name: "Pulmonary hypertension classification",
      summary: `Group 1 (PAH — idiopathic, heritable BMPR2/ALK1, CTD-associated especially SSc, congenital heart disease, drugs, HIV, schistosomiasis). Group 2 (left heart). Group 3 (lung disease/hypoxia). Group 4 (CTEPH). Group 5 (multifactorial). RHC for confirmation: mPAP >20 mmHg, PVR ≥2 WU, PCWP ≤15 for precapillary. Specific therapy only for groups 1 and 4 (after PEA assessment for CTEPH).`,
    },
    {
      name: "Aortopathy — when to screen for genetic disease",
      summary: `Aortic root dilation in young adult or any first-degree relative → screen Marfan (FBN1), Loeys-Dietz (TGFBR1/2/SMAD3/TGFB2/3), vascular EDS (COL3A1), bicuspid valve-related TAA, familial TAA panel (ACTA2, MYH11, MYLK). Loeys-Dietz: more aggressive — dissection at smaller diameters; tortuosity throughout arterial tree. Vascular EDS: avoid invasive vascular procedures.`,
    },
  ],

  differentialPatterns: [
    "Young athlete with sudden cardiac arrest + structurally normal heart → channelopathy: LQTS (exercise/swimming), CPVT (exercise/emotion), Brugada (sleep/fever), or commotio cordis.",
    "Asymmetric septal hypertrophy + dynamic LVOT obstruction + family history → HCM (MYH7, MYBPC3); screen family.",
    "DCM with conduction disease (early AV block, prolonged PR) → LMNA cardiomyopathy; high SCD risk, ICD lower threshold.",
    "DCM in young man + Gowers, calf hypertrophy, family history → dystrophinopathy.",
    "RV-predominant cardiomyopathy + LBBB-morphology VT + exercise → ARVC.",
    "Elderly man with HFpEF + bilateral carpal tunnel + lumbar stenosis + low-voltage ECG → ATTR-CM; order PYP scan.",
    "HCM-like LVH + acroparesthesias + corneal verticillata + young stroke → Fabry; check α-galactosidase A.",
    "Sinus tachycardia on standing without orthostatic drop + brain fog + multi-system symptoms → POTS (consider hEDS, MCAS associations).",
    "Recurrent syncope with prodrome + tilt-table reproducible → vasovagal/neurocardiogenic.",
    "Orthostatic hypotension WITHOUT HR rise → autonomic failure — pursue MSA, amyloid, diabetic autonomic, PAF.",
    "Symmetric LVH + WPW pattern + male predominance + cognitive impairment → Danon (LAMP2).",
    "Bidirectional VT triggered by exercise in child with structurally normal heart → CPVT (RYR2).",
    "Sudden cardiac death in family with multiple young deaths → genetic counseling + cascade screening; obtain ECG/echo/Holter on relatives.",
    "Aortic root dilation + tall stature + ectopia lentis → Marfan; if multi-vessel arteriopathy + hypertelorism → Loeys-Dietz.",
  ],

  redFlags: [
    "Syncope during exertion in young patient — never benign; HCM, ARVC, LQTS, CPVT, anomalous coronary, aortic dissection.",
    "First-degree heart block in DCM under 50 — think LMNA; lower ICD threshold.",
    "Aortic dissection in young/middle-aged patient — genetic aortopathy until proven otherwise; immediate family screening.",
    "Cardiac amyloid masquerading as HCM — missed diagnosis costs years; PYP scan or biopsy if suspected.",
    "Post-partum cardiomyopathy that doesn't recover by 6 months — peripartum (TTN truncation) vs LMNA vs other DCM gene.",
    "Recurrent stroke in young patient — paradoxical embolus, cardiac source, Fabry, hypercoagulable workup.",
    "Endocarditis in IVDU OR with HACEK organism — culture-negative possibilities (Bartonella, Q fever, T. whipplei) require special media.",
    "PAH with positive ANA / Raynaud's — CTD-PAH; treat both immunologically and with PAH-targeted therapy.",
  ],

  commonMimics: [
    {
      condition: "Hypertrophic Cardiomyopathy",
      mimics: ["Cardiac amyloidosis (ATTR or AL)", "Fabry disease", "Danon disease", "PRKAG2 glycogen storage", "Athletic heart", "Hypertensive heart disease", "Hereditary mitochondrial cardiomyopathy"],
    },
    {
      condition: "Dilated Cardiomyopathy",
      mimics: ["LMNA cardiomyopathy", "Dystrophinopathy (DMD/BMD)", "Titin (TTN) truncations", "Tachycardia-induced", "Hemochromatosis", "Sarcoidosis", "Giant cell myocarditis", "Peripartum cardiomyopathy", "Chemotherapy/RT-induced"],
    },
    {
      condition: "Long QT Syndrome",
      mimics: ["Acquired QT prolongation (drug, electrolytes, hypothyroidism)", "Andersen-Tawil syndrome (LQT7 + periodic paralysis)", "Timothy syndrome (LQT8 + syndactyly + autism)", "Jervell-Lange-Nielsen (LQT + deafness)"],
    },
    {
      condition: "Brugada syndrome",
      mimics: ["Pseudo-Brugada (lead misplacement)", "RV ischemia/infarct", "Pericarditis", "Hyperkalemia", "Drug effect (TCA, cocaine)", "ARVC overlap (SCN5A)"],
    },
    {
      condition: "POTS",
      mimics: ["Inappropriate sinus tachycardia", "Hyperthyroidism", "Anemia", "Volume depletion", "Pheochromocytoma", "MCAS with cardiovascular features", "Anxiety/panic"],
    },
    {
      condition: "Cardiac amyloidosis",
      mimics: ["HCM", "Hypertensive cardiomyopathy", "Restrictive cardiomyopathy (sarcoid, hemochromatosis, Fabry, idiopathic)", "Constrictive pericarditis"],
    },
    {
      condition: "Pulmonary arterial hypertension",
      mimics: ["Left heart disease (group 2)", "Chronic thromboembolic PH (CTEPH, group 4)", "Hypoxic lung disease PH (group 3)", "Pulmonary veno-occlusive disease", "Schistosomiasis-associated PH"],
    },
  ],
};
