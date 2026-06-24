import type { SpecialtyReference } from "./types";

export const OPHTHALMOLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Ophthalmologist",
  expertise: `Deep expertise in inherited retinal dystrophies (retinitis pigmentosa, Leber congenital amaurosis, Stargardt, cone-rod, choroideremia, X-linked retinoschisis), syndromic eye disease (Usher, Bardet-Biedl, Alström, Senior-Loken, Joubert), congenital corneal dystrophies, inherited optic neuropathies (Leber hereditary optic neuropathy, autosomal dominant optic atrophy, Wolfram), ocular oncology, neuro-ophthalmology (paraneoplastic retinopathies, autoimmune optic neuritis spectrum), and the systemic diseases with reliable ocular findings (Marfan, Sturge-Weber, NF1/NF2, von Hippel-Lindau, Fabry, mucopolysaccharidoses, Wilson).`,

  clinicalFrameworks: [
    {
      name: "Inherited retinal dystrophies",
      summary: `RP (rod-cone dystrophy): nyctalopia first, progressive peripheral field loss, bone-spicule pigmentation, attenuated arterioles, waxy disc pallor. Genes: ≥80 known; common — RPGR (X-linked), USH2A (Usher type 2 — RP + hearing loss), RHO (autosomal dominant), RPE65 (treatable with voretigene). LCA (severe infantile): nystagmus + flat ERG by 6 mo. Stargardt (ABCA4): juvenile macular dystrophy, bull's-eye maculopathy, "silent choroid" on FA. Cone-rod: photophobia + central vision loss first. Choroideremia (CHM, X-linked): scalloped choroidal atrophy. Best disease (BEST1): macular vitelliform lesion. X-linked retinoschisis (RS1): foveal schisis on OCT.`,
    },
    {
      name: "Syndromic retinal dystrophies",
      summary: `Usher (RP + sensorineural hearing loss): type 1 (profound deafness + vestibular dysfunction + childhood RP), type 2 (moderate-severe hearing loss + later RP), type 3 (progressive hearing loss + variable RP); send MYO7A, USH2A, CDH23. Bardet-Biedl (BBS genes): RP + polydactyly + obesity + cognitive impairment + renal dysplasia + hypogonadism. Alström (ALMS1): RP + sensorineural hearing loss + obesity + diabetes + cardiomyopathy (NO polydactyly, distinguishes from BBS). Refsum (PHYH, AGXT): RP + ichthyosis + cardiac + neuropathy + elevated phytanic acid (TREATABLE — phytanic-restricted diet). Senior-Loken (NPHP genes): RP + nephronophthisis. Joubert (NPHP/MKS overlap): molar tooth sign + retinal + renal.`,
    },
    {
      name: "Hereditary optic neuropathies and Wolfram",
      summary: `LHON (MT-ND1/4/6, mitochondrial): subacute painless sequential central vision loss in young males, no spontaneous recovery in untreated, idebenone may help if early. Autosomal dominant optic atrophy (OPA1 most common): childhood-onset, slowly progressive, can have OPA1-plus (deafness, neuropathy, ataxia). Wolfram (WFS1): DIDMOAD = diabetes insipidus + diabetes mellitus + optic atrophy + deafness. Autosomal recessive optic atrophy. Differential of any young person with bilateral optic atrophy: hereditary > demyelinating > toxic/nutritional (B12, copper, methanol, ethambutol) > tumor (chiasmal glioma, craniopharyngioma) > infiltrative (sarcoid).`,
    },
    {
      name: "Inherited corneal and anterior segment disorders",
      summary: `Fuchs endothelial dystrophy (TCF4 trinucleotide expansion in many): late-adult corneal edema. Keratoconus (sporadic + connective tissue association with EDS, Marfan, Down, Leber). Granular/lattice/macular stromal dystrophies (TGFBI / various). Lattice type 2 = Meretoja (gelsolin amyloidosis, systemic). Wilson disease: Kayser-Fleischer ring at limbus (copper deposition in Descemet's), sunflower cataract — always look on slit lamp for any unexplained liver disease + neuropsychiatric features. Cystinosis: corneal crystals + nephropathic Fanconi syndrome. Mucopolysaccharidoses (Hurler/Hunter/etc): corneal clouding + retinal dystrophy + glaucoma.`,
    },
    {
      name: "Ocular findings as systemic disease clues",
      summary: `Marfan (FBN1): ectopia lentis (lens dislocation up-and-out) — order TTE for aortic root. Homocystinuria (CBS): ectopia lentis down-and-in + thromboembolism + intellectual disability (TREATABLE — pyridoxine + diet). Loeys-Dietz: arterial tortuosity + hypertelorism + bifid uvula. Cogan syndrome: interstitial keratitis + Meniere-like vestibuloauditory dysfunction (vasculitis, may overlap with PAN). VKH: bilateral uveitis + vitiligo + meningitis + dysacusis. Behcet: oral/genital ulcers + uveitis (hypopyon) + skin pathergy. Sturge-Weber (GNAQ): port-wine + glaucoma + leptomeningeal. NF1: Lisch nodules + optic glioma. NF2: cataract + retinal hamartomas + vestibular schwannoma. VHL: retinal hemangioblastoma → CNS hemangioblastoma + RCC + pheo.`,
    },
    {
      name: "Paraneoplastic and autoimmune retinopathies",
      summary: `CAR (cancer-associated retinopathy): subacute bilateral visual loss + photopsias + scotomata + ERG suppression + anti-recoverin or anti-α-enolase antibodies; SCLC, breast, gynecologic, prostate. MAR (melanoma-associated retinopathy): shimmering photopsias + nyctalopia in melanoma patient; anti-bipolar cell antibodies. Autoimmune retinopathy (no malignancy): consider sarcoid, lupus, MS-spectrum. Acute zonal occult outer retinopathy (AZOOR): young woman with photopsias + ERG abnormality. NMOSD (AQP4-IgG): bilateral or sequential optic neuritis + transverse myelitis. MOG-IgG: similar phenotype, better prognosis. Susac syndrome: branch retinal artery occlusions + encephalopathy + sensorineural hearing loss.`,
    },
    {
      name: "Pediatric and congenital — key diagnoses not to miss",
      summary: `Retinoblastoma (RB1): leukocoria in young child — emergent referral. Persistent fetal vasculature. Congenital cataract: TORCH, galactosemia (Gal-1-PUT), Lowe syndrome (OCRL), Down. Aniridia (PAX6) → screen for Wilms (WAGR). Anterior segment dysgenesis (PITX2/3, FOXC1/2). Coloboma → CHARGE association (CHD7). Microphthalmia: ophthalmic + craniofacial + brain workup. Norrie disease (NDP) + FEVR (NDP, FZD4, LRP5, TSPAN12): tractional retinal detachment. Glaucoma in infants (PCG — CYP1B1).`,
    },
  ],

  differentialPatterns: [
    "Nyctalopia + peripheral field constriction + bone-spicule pigmentation → RP; consider Usher (hearing loss), Bardet-Biedl (polydactyly + obesity), Refsum (TREATABLE).",
    "Leukocoria in infant → retinoblastoma until proven otherwise.",
    "Bilateral sequential subacute optic neuropathy in young male → LHON.",
    "DM + DI + optic atrophy + deafness → Wolfram (WFS1).",
    "Ectopia lentis up-and-out + tall + arachnodactyly → Marfan (FBN1) — order TTE.",
    "Ectopia lentis down-and-in + thrombosis + intellectual disability → homocystinuria (CBS) — TREATABLE.",
    "Kayser-Fleischer ring on slit lamp → Wilson disease (don't miss in any unexplained chronic liver or neuropsychiatric presentation).",
    "Subacute bilateral vision loss + photopsias + history of cancer → CAR — check for SCLC.",
    "Branch retinal artery occlusions + encephalopathy + hearing loss → Susac syndrome.",
    "Optic glioma + Lisch nodules + café-au-lait → NF1.",
    "Retinal hemangioblastoma → screen for VHL (CNS, RCC, pheo).",
    "Recurrent painful corneal erosions in family → epithelial basement membrane dystrophy vs Meesmann vs Lisch.",
  ],

  redFlags: [
    "Acute painless monocular vision loss in elderly + headache + jaw claudication → giant cell arteritis — emergent steroids, ESR/CRP, TA biopsy.",
    "Leukocoria in child → retinoblastoma.",
    "Bilateral optic disc edema → increased ICP (IIH, mass, venous sinus thrombosis); emergency neuroimaging + LP.",
    "New unilateral painful visual loss + central scotoma in young woman → optic neuritis; screen for NMOSD/MOG/MS.",
    "Retinal detachment with associated systemic disease (Stickler, Marfan, FEVR) — urgent surgical referral.",
    "Uveitis + B-symptoms in adult → masquerade syndrome (intraocular lymphoma).",
  ],

  commonMimics: [
    {
      condition: "Retinitis pigmentosa",
      mimics: ["Usher syndrome", "Bardet-Biedl", "Alström", "Refsum (TREATABLE)", "Cone-rod dystrophy", "Drug-induced (hydroxychloroquine, thioridazine, vigabatrin)", "Paraneoplastic (CAR/MAR)", "Vitamin A deficiency", "Syphilitic / congenital rubella"],
    },
    {
      condition: "Optic neuritis",
      mimics: ["MS", "NMOSD (AQP4)", "MOG-IgG associated", "LHON", "Compressive (mass, IIH)", "Infiltrative (sarcoid, lymphoma)", "Infectious (Bartonella, syphilis, Lyme)", "Toxic/nutritional"],
    },
    {
      condition: "Uveitis",
      mimics: ["Sarcoidosis", "Behçet", "VKH", "HLA-B27-spondyloarthropathies", "Tubulointerstitial nephritis + uveitis (TINU)", "Multifocal choroiditis", "Infectious (TB, syphilis, toxoplasmosis, CMV, HSV)", "Masquerade (primary intraocular lymphoma)"],
    },
    {
      condition: "Optic atrophy",
      mimics: ["Hereditary (LHON, ADOA, Wolfram)", "Demyelinating", "Toxic (methanol, B12, copper, ethambutol)", "Compressive", "Infiltrative (sarcoid, lymphoma)", "Glaucomatous", "Post-traumatic"],
    },
    {
      condition: "Macular dystrophy",
      mimics: ["Stargardt (ABCA4)", "Best disease (BEST1)", "Pattern dystrophy", "Cone dystrophy", "Adult-onset vitelliform", "Hydroxychloroquine maculopathy", "AMD", "Sorsby fundus dystrophy"],
    },
  ],
};
