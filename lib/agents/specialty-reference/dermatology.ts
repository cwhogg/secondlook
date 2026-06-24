import type { SpecialtyReference } from "./types";

export const DERMATOLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Dermatologist",
  expertise: `Deep expertise in genodermatoses (epidermolysis bullosa simplex/junctional/dystrophic, ichthyoses including Netherton/lamellar/harlequin, pachyonychia congenita, ectodermal dysplasias, Darier, Hailey-Hailey), neurocutaneous syndromes (NF1, NF2, tuberous sclerosis, Sturge-Weber, ataxia-telangiectasia, xeroderma pigmentosum, Cowden, Birt-Hogg-Dubé), autoimmune blistering disease (pemphigus vulgaris/foliaceus, bullous pemphigoid, mucous membrane pemphigoid, EBA, linear IgA, dermatitis herpetiformis), paraneoplastic skin findings, vasculitis with skin manifestations, and the systemic diseases with reliable dermatologic clues.`,

  clinicalFrameworks: [
    {
      name: "Inherited blistering — epidermolysis bullosa spectrum",
      summary: `EB simplex (intraepidermal cleavage, KRT5/14, milder, palmoplantar blistering with heat). EB junctional (lamina lucida cleavage, LAMA3/B3/C2, COL17A1, severe Herlitz form fatal in infancy, milder generalized intermediate). EB dystrophic (sublamina densa, COL7A1; dominant or recessive — recessive RDEB severe with mutilating scarring, SCC risk in adults, mitten deformity). Kindler syndrome (FERMT1). EBA = acquired autoimmune anti-collagen VII (NOT inherited — differentiate). Always send EM + immunofluorescence mapping + genetic panel for inherited blistering. Treat with wound care + nutrition + SCC surveillance.`,
    },
    {
      name: "Ichthyoses",
      summary: `Ichthyosis vulgaris (FLG): mild fine scaling, association with atopic dermatitis. X-linked recessive (STS, steroid sulfatase deficiency): male, dark large polygonal scales sparing flexures, corneal opacities. Lamellar (TGM1, etc.): plate-like scales at birth, collodion baby. Congenital ichthyosiform erythroderma (NIPAL4, ALOXE3, etc.): erythroderma + finer scaling. Harlequin (ABCA12): rigid hyperkeratotic plates at birth, often fatal. Netherton (SPINK5): ichthyosis linearis circumflexa + atopy + bamboo hair (trichorrhexis invaginata on shaft microscopy). Sjögren-Larsson (ALDH3A2): ichthyosis + spasticity + intellectual impairment. Refsum: ichthyosis + retinitis pigmentosa + neuropathy + cardiac (TREATABLE — phytanic-restricted diet). Chanarin-Dorfman.`,
    },
    {
      name: "Neurocutaneous syndromes",
      summary: `NF1 (NF1 gene): ≥2 of — ≥6 café-au-lait (≥5 mm prepubertal, ≥15 mm postpubertal), axillary/inguinal freckling, ≥2 neurofibromas or 1 plexiform, optic glioma, ≥2 Lisch nodules, sphenoid dysplasia/long-bone bowing, 1st-degree NF1 relative. NF2 (NF2): bilateral vestibular schwannomas, meningiomas, ependymomas. Tuberous sclerosis (TSC1/2): hypopigmented macules ("ash-leaf"), facial angiofibromas, shagreen patch, periungual fibromas, cortical tubers, SEGAs, lymphangioleiomyomatosis, renal angiomyolipomas. Sturge-Weber (GNAQ mosaic): port-wine V1 + leptomeningeal angiomatosis + glaucoma + seizures. Ataxia-telangiectasia (ATM): conjunctival + cutaneous telangiectasias + progressive cerebellar ataxia + immunodeficiency + lymphoma risk. Xeroderma pigmentosum (XP genes): UV hypersensitivity + extreme skin cancer risk. Bloom (RECQL3), Cockayne (CSA/CSB).`,
    },
    {
      name: "Autoimmune blistering disease",
      summary: `Pemphigus vulgaris (anti-Dsg3 ± Dsg1, intraepidermal): mucosal erosions + flaccid bullae, Nikolsky positive. Pemphigus foliaceus (anti-Dsg1): superficial flaccid blisters, no mucosa. Paraneoplastic pemphigus (anti-plakins, lymphoproliferative malignancy — Castleman, NHL, CLL): severe mucositis + polymorphic skin. Bullous pemphigoid (anti-BP180/230, subepidermal): elderly tense bullae on erythematous base, eosinophil-rich. Mucous membrane pemphigoid: chronic mucosal scarring (eye → blindness). Linear IgA (vancomycin-induced common): subepidermal, "string of pearls". Dermatitis herpetiformis (anti-tTG/eTG, IgA, celiac disease): symmetric extensor pruritic vesicles + gluten-sensitive enteropathy (TREATABLE with gluten-free + dapsone). EBA (anti-collagen VII).`,
    },
    {
      name: "Paraneoplastic dermatoses",
      summary: `Acanthosis nigricans (sudden adult-onset non-obese): gastric (signet ring), other GI. Sweet syndrome (acute febrile neutrophilic dermatosis): AML, MDS, solid tumors. Erythema gyratum repens: lung. Necrolytic migratory erythema: glucagonoma. Tripe palms: gastric. Sign of Leser-Trélat (sudden eruptive seborrheic keratoses): GI adenocarcinoma. Hypertrophic osteoarthropathy + clubbing: lung cancer + intrathoracic disease. Erythroderma in adult: cutaneous T-cell lymphoma (Sézary) until proven otherwise. Paraneoplastic pemphigus: lymphoproliferative. Dermatomyositis with anti-TIF1γ / anti-NXP-2: occult malignancy screen. Pyoderma gangrenosum: IBD, hematologic malignancy. Scleromyxedema: paraproteinemia.`,
    },
    {
      name: "Cutaneous vasculitis",
      summary: `Small-vessel (palpable purpura): IgA vasculitis (HSP — IgA + arthritis + abdominal + renal), cryoglobulinemic vasculitis (HCV most common; type 1 mono, type 2/3 mixed), hypersensitivity vasculitis (drug, infection), urticarial vasculitis (lasts >24h + purpura on resolution → consider hypocomplementemic + lupus). Medium-vessel: PAN (livedo + ulcers + neuropathy + renal + GI), cutaneous PAN (limited to skin). Large-vessel: GCA, Takayasu (rarely skin findings). ANCA-associated: GPA (saddle nose + lung + renal), MPA, EGPA (asthma + eosinophilia + neuropathy). Anti-phospholipid syndrome: livedo + DVTs + miscarriages. Septic vasculitis (gonorrhea, meningococcus, endocarditis).`,
    },
    {
      name: "Genodermatoses with cancer predisposition",
      summary: `Gorlin (basal cell nevus, PTCH1): multiple BCCs + palmoplantar pits + odontogenic keratocysts + medulloblastoma in children. Birt-Hogg-Dubé (FLCN): fibrofolliculomas + lung cysts + spontaneous pneumothorax + renal tumors. Cowden (PTEN): trichilemmomas + acral keratoses + breast + thyroid + endometrial cancer. Muir-Torre (Lynch variant): sebaceous neoplasms + visceral cancers. Brooke-Spiegler (CYLD): cylindromas + trichoepitheliomas + spiradenomas. Xeroderma pigmentosum: extreme skin cancer. Familial atypical multiple mole melanoma (CDKN2A): multiple atypical nevi + melanoma + pancreatic cancer. Howel-Evans (TOC1, RHBDF2): focal palmoplantar keratoderma + esophageal cancer.`,
    },
  ],

  differentialPatterns: [
    "Multiple café-au-lait + axillary freckling + neurofibromas → NF1.",
    "Hypopigmented macules + facial angiofibromas + seizures → tuberous sclerosis.",
    "Port-wine in V1 + seizures + glaucoma → Sturge-Weber.",
    "Severe blistering with mutilating scarring + family history → recessive dystrophic EB; surveillance for SCC.",
    "Collodion baby + ichthyosis evolution → lamellar vs CIE; gene panel.",
    "Ichthyosis + bamboo hair + atopy → Netherton (SPINK5).",
    "Mucosal erosions + flaccid skin bullae + adult → pemphigus vulgaris (anti-Dsg3).",
    "Tense bullae + pruritus + elderly → bullous pemphigoid (anti-BP180).",
    "Symmetric pruritic vesicles on extensors + IgA + celiac → dermatitis herpetiformis (TREATABLE).",
    "Sudden eruptive seborrheic keratoses (Leser-Trélat) → GI adenocarcinoma workup.",
    "Adult erythroderma → CTCL (Sézary) until proven otherwise.",
    "Severe mucositis + polymorphic skin + lymphoproliferative malignancy → paraneoplastic pemphigus.",
    "Palpable purpura + arthritis + abdominal pain + nephritis in child → IgA vasculitis (HSP).",
    "Livedo racemosa + DVT + miscarriage → antiphospholipid syndrome.",
    "Multiple basal cell carcinomas + palmar pits + medulloblastoma history → Gorlin (PTCH1).",
  ],

  redFlags: [
    "Stevens-Johnson syndrome / TEN — emergent stop offending drug + supportive care + ophtho + burn-unit-level care.",
    "DRESS syndrome — eosinophilia + lymphadenopathy + organ involvement + drug exposure 2-8 weeks prior.",
    "Necrotizing fasciitis — rapidly spreading erythema + pain out of proportion + crepitus + systemic toxicity; emergent debridement.",
    "Purpura fulminans — palpable purpura + DIC + sepsis; meningococcemia, protein C/S deficiency.",
    "Erythroderma — TEN, SJS, drug, CTCL (Sézary), psoriatic flare, eczematous; ICU-level monitoring for fluid/temp.",
    "Suspected melanoma — biopsy promptly; ABCDE features.",
    "Calciphylaxis — painful violaceous reticular skin necrosis in dialysis patient; high mortality.",
  ],

  commonMimics: [
    {
      condition: "Bullous pemphigoid",
      mimics: ["EBA", "Linear IgA bullous dermatosis", "Bullous lupus", "Pemphigoid gestationis", "Drug-induced (vancomycin)", "Mucous membrane pemphigoid"],
    },
    {
      condition: "Psoriasis",
      mimics: ["Cutaneous T-cell lymphoma (mycosis fungoides)", "Pityriasis rubra pilaris", "Seborrheic dermatitis", "Tinea (KOH)", "Subacute cutaneous lupus", "Reactive arthritis-associated keratoderma"],
    },
    {
      condition: "Erythema multiforme / SJS",
      mimics: ["Bullous mycoplasma-associated mucositis", "Staphylococcal scalded skin", "Acute generalized exanthematous pustulosis (AGEP)", "DRESS", "Paraneoplastic pemphigus", "Bullous fixed drug eruption"],
    },
    {
      condition: "Vasculitis (palpable purpura)",
      mimics: ["IgA vasculitis (HSP)", "Cryoglobulinemic vasculitis", "ANCA-associated", "Drug-induced", "Infective endocarditis", "Levamisole-induced (cocaine)", "Sweet syndrome (variant)"],
    },
    {
      condition: "Erythroderma",
      mimics: ["Drug reaction (DRESS, others)", "Cutaneous T-cell lymphoma (Sézary)", "Psoriasis flare", "Atopic dermatitis flare", "Pityriasis rubra pilaris", "Paraneoplastic", "Idiopathic"],
    },
  ],
};
