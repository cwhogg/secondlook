import type { SpecialtyReference } from "./types";

export const PSYCHIATRY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Psychiatrist",
  expertise: `Deep expertise in the medical-neurologic-metabolic causes of psychiatric presentations, autoimmune and paraneoplastic encephalitis, neuropsychiatric SLE and Wilson's disease, functional neurological disorder and somatic symptom disorder, catatonia and its medical mimics, chronic fatigue and central sensitization syndromes, mast cell-mediated psychiatric symptoms, and the differential between primary psychiatric illness and an underlying neurologic/metabolic cause.`,

  clinicalFrameworks: [
    {
      name: "Red flags for psychiatric mimics of organic disease",
      summary: `New-onset psychosis or major mood/behavioral change with: (1) atypical age (first psychosis >40 or <14), (2) movement disorder, seizures, autonomic instability, focal deficit; (3) altered consciousness or fluctuating cognition; (4) abnormal exam (delirium features, frontal release, gait); (5) constitutional symptoms (fever, weight loss); (6) failure to respond to expected first-line therapy. ANY of these triggers a medical workup before locking in a psychiatric diagnosis.`,
    },
    {
      name: "Autoimmune & paraneoplastic encephalitis",
      summary: `Subacute psychiatric/cognitive change + seizures + movement disorder + dysautonomia + sleep disruption → suspect AIE. Anti-NMDAR (young women, ovarian teratoma, orofacial dyskinesias, agitation, language regression). LGI1 (faciobrachial dystonic seizures, hyponatremia). CASPR2 (Morvan, neuromyotonia, insomnia). GABA-B (small cell lung cancer, seizures). Ma2 (testicular). Hashimoto encephalopathy (steroid-responsive encephalopathy associated with autoimmune thyroiditis — SREAT). Workup: MRI, EEG, CSF (oligoclonal bands, cell-bound antibody panel), serum antibody panel, paraneoplastic screen.`,
    },
    {
      name: "Catatonia & its medical mimics",
      summary: `Catatonia: motor + behavioral syndrome (mutism, stupor, posturing, waxy flexibility, negativism, echolalia/echopraxia, stereotypies). Bush-Francis catatonia rating scale. Causes equally distributed across psychiatric (mood disorders, schizophrenia) and medical (autoimmune encephalitis especially anti-NMDAR, neuroleptic malignant syndrome, serotonin syndrome, encephalopathies, basal ganglia disease). Lorazepam challenge: 1-2 mg IV → resolution within 15 min supports catatonia. ECT for refractory.`,
    },
    {
      name: "Movement and behavioral changes from Wilson's disease",
      summary: `Wilson's commonly presents psychiatrically in young adults (~25%): personality change, depression, anxiety, psychosis, executive dysfunction. Often misdiagnosed as primary psychiatric. ALWAYS exclude Wilson's in any movement disorder <40 + psychiatric symptoms: slit lamp for Kayser-Fleischer rings, ceruloplasmin, 24-hour urinary copper, liver function. Penicillamine/trientine/zinc — disease is treatable.`,
    },
    {
      name: "Anti-NMDAR encephalitis — clinical phenotype",
      summary: `Five-stage clinical evolution: (1) viral prodrome, (2) psychiatric (psychosis, agitation, mania, catatonia, language disorder), (3) seizures, (4) movement disorder (orofacial dyskinesias, dystonia, choreoathetosis), (5) dysautonomia + decreased consciousness. Young women > men; ovarian teratoma in ~50% of women. CSF lymphocytic pleocytosis ± oligoclonal bands; anti-NMDAR antibody. Treat: tumor removal + first-line (steroids/IVIG/PLEX), second-line (rituximab/cyclophosphamide). 75% recover with treatment.`,
    },
    {
      name: "Psychiatric manifestations of metabolic/endocrine disease",
      summary: `Thyroid: hyperthyroid → anxiety, mania, agitation; hypothyroid → depression, cognitive slowing, frank dementia ("myxedema madness"). Cushing → depression, mania, anxiety, psychosis. Addison → fatigue, apathy, depression, psychosis. Hypercalcemia → depression, psychosis, delirium. Pheochromocytoma → panic-like episodes. Acute intermittent porphyria → psychiatric symptoms during attacks + autonomic + abdominal + neuropathic. Vitamin B12 deficiency → cognitive decline + psychiatric symptoms. Niacin / pellagra → dementia + diarrhea + dermatitis. Pancreatic islet tumors (insulinoma) → episodic neuroglycopenia mimicking anxiety/seizure/personality change.`,
    },
    {
      name: "Catatonia / movement / psychiatric in neurodegenerative & prion disease",
      summary: `Rapidly progressive dementia + myoclonus + visual or cerebellar features + behavioral change → CJD (sporadic, familial, variant, iatrogenic). MRI cortical ribboning + basal ganglia; CSF 14-3-3, RT-QuIC; EEG periodic complexes (late). FTD behavioral variant: disinhibition, apathy, hyperorality, perseverative behavior; spares memory early. Huntington: chorea + cognitive + psychiatric. Lewy body dementia: fluctuating cognition + visual hallucinations + parkinsonism + REM sleep behavior disorder. Don't misdiagnose as primary psychiatric.`,
    },
    {
      name: "Functional neurological / somatic symptom disorders",
      summary: `Functional neurological symptom disorder (FND, formerly conversion): positive rule-in signs (Hoover sign, dragging gait, tremor entrainment, give-way weakness, normal NCS in 'paralysis', PNES vs epileptic seizures by features) — diagnosis is positive, not exclusionary. Comorbid with anxiety, depression, trauma. Somatic symptom disorder: distressing somatic symptoms + disproportionate thoughts/anxiety. Illness anxiety disorder (formerly hypochondriasis). Factitious disorder (Munchausen, by proxy). Must be diagnosed positively, not by exclusion alone — and must coexist with appropriate medical workup for missed organic disease.`,
    },
    {
      name: "Drug-induced and toxic psychiatric syndromes",
      summary: `Neuroleptic malignant syndrome: rigidity + hyperthermia + autonomic instability + altered mental status; CK markedly elevated. Serotonin syndrome: mental status + autonomic + neuromuscular (clonus, hyperreflexia); SSRI/MAOI/tramadol/triptans/linezolid interactions. Anticholinergic toxicity: "red as beet, dry as bone, hot as Hades, mad as a hatter, blind as a bat". Steroid psychosis. Levetiracetam → irritability/psychosis. Hallucinogen-induced psychosis. Stimulant-induced psychosis (amphetamine, cocaine). Cannabis-induced psychosis especially with high THC. Withdrawal: alcohol DT, benzodiazepine withdrawal.`,
    },
    {
      name: "Central sensitization, dysautonomia and overlap with psychiatric",
      summary: `Fibromyalgia, ME/CFS, POTS, MCAS, hEDS — frequently overlap (so-called HEDS-MCAS-POTS triad), often dismissed as primary psychiatric. Common features: chronic fatigue, cognitive dysfunction ("brain fog"), pain, sleep disturbance, dysautonomia, GI dysfunction. Validate the somatic experience; pursue organic workup (orthostatic vitals, tilt table, tryptase, autoimmune panel if indicated); avoid premature anchoring on functional/psychiatric label. CRPS: pain + sensory + sudomotor + motor/trophic changes after limb injury; Budapest criteria.`,
    },
  ],

  differentialPatterns: [
    "First-episode psychosis with abnormal movements + autonomic instability + recent viral illness → anti-NMDAR encephalitis; do not wait for antibody to treat.",
    "Faciobrachial dystonic seizures + new-onset psychiatric/cognitive change + hyponatremia in older adult → LGI1 encephalitis.",
    "Personality change + movement disorder + young adult → Wilson's until proven otherwise; check ceruloplasmin + slit lamp.",
    "Rapidly progressive dementia + myoclonus + ataxia → prion / autoimmune mimics (SREAT, AIE).",
    "Catatonia in young woman with ovarian mass → anti-NMDAR encephalitis.",
    "Recurrent psychiatric crises with abdominal pain + hyponatremia + reddish urine → acute intermittent porphyria.",
    "New psychiatric symptoms + cardiomyopathy + cognitive decline + photophobia → late-onset metabolic / mitochondrial disease.",
    "Depression that doesn't respond to antidepressants + cognitive symptoms + family history of similar → consider Huntington / FTD / Wilson / B12.",
    "Postpartum psychosis — emergent; high suicide/infanticide risk; bipolar I or organic (autoimmune thyroiditis, encephalitis) must be excluded.",
    "Panic attacks with sustained tachycardia + HTN + sweating + headache → pheochromocytoma; check metanephrines.",
    "Anxiety + tremor + weight loss + heat intolerance → hyperthyroidism.",
    "Cognitive slowing + cold intolerance + weight gain + alopecia + depression → hypothyroidism.",
    "Recurrent severe episodes triggered by fasting/illness → IEM (urea cycle, MSUD, porphyria, organic acidemia) — even in adults with partial deficiencies.",
    "Patient labeled as 'somatization' for years with multi-system symptoms + dysautonomia + skin/joint findings → reassess for hEDS, MCAS, POTS, autoimmune disease, small fiber neuropathy.",
    "ICU patient with rigidity + hyperthermia + autonomic instability + recent neuroleptic → NMS; emergent.",
    "Confusion + clonus + diaphoresis + recent serotonergic medication change → serotonin syndrome.",
  ],

  redFlags: [
    "First-episode psychosis with focal neurologic signs / seizures / autonomic instability — autoimmune encephalitis until proven otherwise.",
    "Catatonia without prior psychiatric history — pursue medical workup before assuming primary mood disorder.",
    "Postpartum psychosis — emergent; high recurrence in subsequent pregnancies.",
    "Wilson's disease in any young adult with neuropsychiatric symptoms — treatable; missing it is catastrophic.",
    "Steroid response in 'functional' presentation — reconsider Hashimoto encephalopathy, AIE.",
    "New-onset psychiatric symptoms in older adult — paraneoplastic, AIE, neurodegenerative, metabolic; primary late-onset psychiatric illness is uncommon.",
    "Patient with mast-cell-pattern symptoms + dysautonomia + connective tissue features labeled 'anxiety' — pursue MCAS, POTS, hEDS.",
    "Suicidality requires acute safety assessment regardless of underlying medical cause.",
    "Serotonin syndrome and NMS can be lethal — recognize early.",
  ],

  commonMimics: [
    {
      condition: "Major depressive disorder",
      mimics: ["Hypothyroidism", "Cushing's", "Addison's", "B12 deficiency", "Anemia", "OSA", "Subcortical vascular disease", "Early Parkinson's / DLB", "FTD behavioral variant", "Anti-NMDAR encephalitis (in young women)", "Pseudo-bulbar affect (post-stroke, MS, ALS)"],
    },
    {
      condition: "Generalized anxiety / panic disorder",
      mimics: ["Hyperthyroidism", "Pheochromocytoma", "Hypoglycemia (insulinoma, reactive)", "Carcinoid syndrome", "Mastocytosis / MCAS", "Cardiac arrhythmia (especially SVT)", "POTS", "Pulmonary embolism (intermittent dyspnea)", "Substance use / withdrawal", "Hypoparathyroidism (tetany-related anxiety)"],
    },
    {
      condition: "Schizophrenia / first-episode psychosis",
      mimics: ["Anti-NMDAR encephalitis", "Other autoimmune encephalitis (LGI1, GABA-B)", "Substance-induced psychosis (especially amphetamines, cannabis)", "Steroid psychosis", "Wilson's disease", "Acute intermittent porphyria", "Niemann-Pick C (adult)", "Late-onset metabolic disease", "Temporal lobe epilepsy", "Hashimoto encephalopathy"],
    },
    {
      condition: "Bipolar disorder",
      mimics: ["Cushing's", "Hyperthyroidism", "Steroid-induced mood", "Stimulant-induced mania", "Frontal-lobe disease (FTD, tumor, stroke)", "Anti-NMDAR encephalitis", "Substance use disorder"],
    },
    {
      condition: "Functional neurological disorder",
      mimics: ["Autoimmune encephalitis", "Stiff-person spectrum", "Paroxysmal kinesigenic dyskinesia", "Acute intermittent porphyria", "POTS / dysautonomia", "Episodic ataxia / hemiplegic migraine syndromes", "Mitochondrial disease with stroke-like episodes"],
    },
    {
      condition: "Somatic symptom disorder / 'medically unexplained symptoms'",
      mimics: ["Small fiber neuropathy", "hEDS / connective tissue disorders", "MCAS", "POTS", "Sjögren's", "Early connective tissue disease", "Hereditary periodic fevers", "Mitochondrial disease", "Lyme + post-treatment Lyme", "Chronic fatigue syndrome / ME-CFS", "Adrenal insufficiency"],
    },
    {
      condition: "Delirium / acute confusional state",
      mimics: ["Catatonia (especially excited)", "Non-convulsive status epilepticus", "Autoimmune encephalitis", "Neuroleptic malignant syndrome", "Serotonin syndrome", "Wernicke's encephalopathy", "Hepatic / uremic encephalopathy", "Drug toxicity"],
    },
  ],
};
