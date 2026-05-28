import type { SpecialtyReference } from "./types";

export const NEUROLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Neurologist",
  expertise: `Deep expertise in localization-first reasoning across the neuraxis (cortex, white matter, basal ganglia, cerebellum, brainstem, cord, root, plexus, peripheral nerve, neuromuscular junction, muscle), demyelinating disease, neuromuscular disorders, movement disorders, hereditary ataxias and spastic paraplegias, autoimmune encephalitis, headache, autonomic disorders, and rare neurogenetic conditions presenting with atypical neurologic phenotypes.`,

  clinicalFrameworks: [
    {
      name: "McDonald 2017 criteria — Multiple Sclerosis",
      summary: `Diagnosis requires dissemination in space (≥1 T2 lesion in ≥2 of: periventricular, cortical/juxtacortical, infratemporal/infratentorial, spinal cord) and dissemination in time (new T2/enhancing lesion on follow-up MRI, or simultaneous enhancing + non-enhancing, or oligoclonal bands in CSF substituting for DIT). Optic neuritis history can substitute for one DIS lesion. Always exclude NMOSD (AQP4-IgG), MOG-AD (MOG-IgG), and structural mimics.`,
    },
    {
      name: "Brighton criteria & GBS subtypes",
      summary: `Guillain-Barré: progressive bilateral limb weakness reaching nadir within 4 weeks + areflexia/hyporeflexia + albuminocytological dissociation (CSF protein high, cells <50). Variants: AIDP (demyelinating), AMAN (axonal motor, Campylobacter), Miller Fisher (ophthalmoplegia + ataxia + areflexia, anti-GQ1b). CIDP if progression >8 weeks. Beware spinal cord lesion mimics (bowel/bladder + sensory level argue against GBS).`,
    },
    {
      name: "Awaji & El Escorial — ALS",
      summary: `Clinically definite when UMN + LMN signs in 3 regions (bulbar, cervical, thoracic, lumbosacral); probable in 2 regions; possible in 1 region with progression. EMG fasciculations count as LMN involvement at that level. Always exclude treatable mimics: cervical myelopathy, multifocal motor neuropathy (anti-GM1, conduction block), Kennedy disease (X-linked, gynecomastia, sensory involvement), inclusion body myositis.`,
    },
    {
      name: "Movement disorder phenotyping",
      summary: `Parkinsonism = bradykinesia + rest tremor / rigidity / postural instability. Atypical features that argue against idiopathic PD: early falls (PSP), autonomic failure (MSA), apraxia/alien limb (CBD), early dementia + visual hallucinations (DLB), Kayser-Fleischer rings (Wilson), pyramidal signs (HSP variants). Chorea: rule out Huntington (HTT CAG repeats), Wilson, neuroacanthocytosis, autoimmune (Sydenham, anti-NMDA), drug-induced.`,
    },
    {
      name: "Hereditary spastic paraplegia & ataxia panels",
      summary: `HSP: progressive lower-limb spasticity > weakness; pure (SPG4 most common) vs complex (cerebellar, neuropathy, ID, thin corpus callosum SPG11/15). Hereditary ataxias: SCA panel (SCA1/2/3/6/7/17), Friedreich (early-onset, areflexia, cardiomyopathy, diabetes, GAA repeat), episodic ataxia (EA1/2), late-onset cerebellar with autonomic failure → consider MSA-C vs SCA17/27.`,
    },
    {
      name: "Autoimmune & paraneoplastic encephalitis",
      summary: `Subacute psychiatric/cognitive changes + seizures + movement disorder + dysautonomia → suspect AIE. Antibody syndromes: anti-NMDAR (young women, ovarian teratoma, orofacial dyskinesias), LGI1 (faciobrachial dystonic seizures, hyponatremia), CASPR2 (Morvan, neuromyotonia), GAD65, AMPA, GABA-B (small cell lung), Ma2 (testicular). Treat empirically when clinical suspicion is high — don't wait for antibody result.`,
    },
    {
      name: "Stroke / TIA — ABCD2 & secondary prevention triggers",
      summary: `Acute focal deficit + imaging-confirmed infarction = stroke; transient and imaging-negative = TIA. Young/atypical stroke triggers genetics/autoimmune workup: CADASIL (NOTCH3), Fabry, MELAS, antiphospholipid syndrome, vasculitis (PACNS, Susac), arterial dissection. In recurrent unexplained stroke, search for cardioembolic source (PFO, ESUS) and hypercoagulable states.`,
    },
    {
      name: "Headache red flags (SNNOOP10)",
      summary: `Systemic symptoms (fever, weight loss), Neurologic signs, Onset sudden (thunderclap → SAH, RCVS), Older onset, Pattern change, Positional, Precipitated by Valsalva, Papilledema, Progressive, Pregnancy/postpartum (CVST, eclampsia). Any of these mandates imaging ± CSF before diagnosing primary headache.`,
    },
    {
      name: "Neuromuscular localization",
      summary: `Distal-symmetric sensorimotor → peripheral neuropathy (axonal vs demyelinating on NCS). Proximal weakness, normal sensation, high CK → myopathy (consider dystrophy, inflammatory, metabolic). Fatigable weakness → NMJ disorder (myasthenia, LEMS). Asymmetric, predominantly distal, finger-flexor weakness in older adult + biopsy rimmed vacuoles → IBM. Always check thyroid, vitamin B12, glucose, and screen for paraproteinemia in unexplained polyneuropathy.`,
    },
    {
      name: "Small fiber neuropathy & autonomic disorders",
      summary: `Burning pain, allodynia, length-dependent autonomic symptoms with normal NCS → SFN. Diagnose with skin punch biopsy (reduced intra-epidermal nerve fiber density) or QSART. Causes: diabetes/prediabetes, Sjögren, sarcoid, hereditary (SCN9A/10A/11A, TTR amyloid), B6 toxicity, paraproteinemia. POTS: sustained HR rise ≥30 bpm (or to ≥120) within 10 min of standing, no orthostatic hypotension.`,
    },
  ],

  differentialPatterns: [
    "Subacute ascending sensorimotor weakness + areflexia + albuminocytological dissociation → GBS spectrum (AIDP, AMAN, MFS).",
    "Asymmetric ophthalmoparesis + ataxia + areflexia → Miller Fisher; check anti-GQ1b.",
    "Progressive lower-limb spasticity with intact sensation in a young adult → HSP — order full panel; don't anchor on MS.",
    "Cerebellar ataxia + cardiomyopathy + diabetes + areflexia → Friedreich ataxia (GAA repeat).",
    "Early-onset rigidity + tremor + behavioral change in <40yo → consider Wilson disease before idiopathic PD.",
    "Subacute confusion + new seizures + movement disorder in a previously well young patient → anti-NMDAR encephalitis until disproven; treat empirically.",
    "Faciobrachial dystonic seizures in older adult → LGI1 encephalitis; check sodium.",
    "Recurrent demyelinating events with severe optic neuritis/transverse myelitis + lesion >3 vertebral segments → NMOSD over MS; test AQP4-IgG.",
    "Bilateral facial weakness → Lyme, sarcoid, GBS variant, Möbius — not Bell's palsy.",
    "Length-dependent burning pain with normal NCS → small fiber neuropathy; pursue Sjögren, amyloid, sodium-channel mutations.",
    "Distal weakness + early respiratory involvement out of proportion to limb weakness → think Pompe, myofibrillar myopathy, ALS bulbar onset.",
    "Polyneuropathy + organomegaly + endocrinopathy + monoclonal gammopathy + skin changes → POEMS syndrome.",
    "Stepwise stroke-like episodes + lactic acidosis + short stature + seizures → MELAS (mtDNA m.3243A>G).",
    "Vertical gaze palsy + axial rigidity + early falls in older adult → PSP, not PD.",
    "Rapidly progressive dementia + myoclonus + ataxia → prion disease (sCJD) vs autoimmune mimic (Hashimoto encephalopathy, AIE).",
  ],

  redFlags: [
    "Acute headache with maximal intensity at onset (thunderclap) — image and consider SAH/RCVS/CVST before any primary diagnosis.",
    "New focal neurologic deficit lasting >24h with no imaging — never diagnose migraine with aura without ruling out stroke.",
    "Rapidly progressive weakness reaching respiratory muscles — assess NIF/FVC serially, not just SpO2.",
    "Bulbar weakness + ophthalmoplegia + areflexia — Miller Fisher or brainstem encephalitis; do NOT delay IVIG/plex.",
    "Subacute psychiatric symptoms + movement disorder in a young patient — autoimmune encephalitis is treatable; psychosis-first framing risks irreversible deterioration.",
    "Treatable ALS mimics MUST be excluded before accepting ALS: cervical myelopathy, MMN, Kennedy disease, IBM, structural lesion.",
    "Wilson disease in any movement disorder under 40 — copper studies + slit lamp; missing this is catastrophic.",
    "Polyneuropathy with autonomic features in middle age — TTR amyloid is now treatable; missing it costs years.",
    "Bilateral foot drop + back/buttock pain → cauda equina; image emergently.",
  ],

  commonMimics: [
    {
      condition: "Multiple Sclerosis",
      mimics: ["NMOSD (AQP4-IgG)", "MOG-AD", "CADASIL", "Susac syndrome", "Neurosarcoidosis", "B12 deficiency", "HIV-related leukoencephalopathy", "PML"],
    },
    {
      condition: "Idiopathic Parkinson's Disease",
      mimics: ["Progressive supranuclear palsy", "Multiple system atrophy", "Corticobasal degeneration", "Dementia with Lewy bodies", "Wilson disease", "Drug-induced parkinsonism", "Vascular parkinsonism"],
    },
    {
      condition: "ALS",
      mimics: ["Cervical/lumbosacral myelopathy", "Multifocal motor neuropathy", "Kennedy disease (SBMA)", "Inclusion body myositis", "Hexosaminidase A deficiency", "Hereditary spastic paraplegia with ALS phenotype"],
    },
    {
      condition: "Guillain-Barré Syndrome",
      mimics: ["Acute transverse myelitis", "Tick paralysis", "Hypokalemic periodic paralysis", "Botulism", "Heavy metal poisoning", "Porphyria", "Spinal cord compression"],
    },
    {
      condition: "Myasthenia gravis",
      mimics: ["LEMS", "Botulism", "Congenital myasthenic syndromes", "Mitochondrial CPEO", "Thyroid eye disease", "Functional weakness"],
    },
    {
      condition: "Migraine with aura",
      mimics: ["TIA/stroke", "Focal seizure", "CADASIL", "MELAS stroke-like episode", "RCVS", "Hemiplegic migraine syndromes (CACNA1A, ATP1A2, SCN1A)"],
    },
    {
      condition: "Functional neurological disorder",
      mimics: ["Autoimmune encephalitis", "Stiff person syndrome", "Paroxysmal dyskinesia", "Movement disorder of organic origin", "NEDA (non-epileptic but with epileptic comorbidity)"],
    },
  ],
};
