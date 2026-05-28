import type { SpecialtyReference } from "./types";

export const GENETICS_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Medical Geneticist",
  expertise: `Deep expertise in syndromology, inborn errors of metabolism, chromosomal disorders, mitochondrial diseases, hereditary connective tissue disorders, skeletal dysplasias, neurogenetic conditions including repeat-expansion disorders, neurocutaneous syndromes, hereditary cancer predisposition, and the diagnostic odyssey of undiagnosed multi-system rare disease. Strong emphasis on the pattern recognition that distinguishes one ultra-rare entity from its phenocopies, and on knowing when WES/WGS is the right next test.`,

  clinicalFrameworks: [
    {
      name: "When to send WES/WGS",
      summary: `Send whole-exome or whole-genome sequencing when the patient has: multiple affected organ systems without unifying acquired explanation, dysmorphic features + developmental delay, suspected mendelian disease with negative panel, intellectual disability of unknown cause, congenital malformation syndromes, suspected mitochondrial disease, undiagnosed atypical metabolic presentation, or hereditary multi-system disease in a child or young adult. Trio (proband + parents) increases yield ~10-15 percentage points by clarifying inheritance and segregation. WGS captures structural variants, repeat expansions (when validated), deep intronic variants WES misses.`,
    },
    {
      name: "Inborn errors of metabolism — onset categories",
      summary: `Neonatal acute: organic acidemias (propionic, methylmalonic, isovaleric), urea cycle (OTC, CPS1, NAGS, ASS1, ASL, ARG1), fatty acid oxidation (MCAD, LCHAD, VLCAD, CPT-II), MSUD, glycine encephalopathy — present with encephalopathy + acidosis ± hyperammonemia ± hypoglycemia. Intermittent / late-onset: ornithine transcarbamylase deficiency, partial enzyme deficiencies, mitochondrial disease, glycogen storage. Adult-onset IEMs: late-onset OTC (women), adult-onset Pompe, late-onset Tay-Sachs, NPC, mucopolysaccharidoses with attenuated phenotypes, Wilson's. Lysosomal storage: progressive multi-system + coarse features + organomegaly + skeletal dysplasia.`,
    },
    {
      name: "Repeat expansion disorders",
      summary: `CAG-polyQ (Huntington, SCA1/2/3/6/7/17, DRPLA, SBMA/Kennedy). CTG (myotonic dystrophy DM1 — facial weakness + myotonia + cataracts + cardiac conduction + endocrine). CCTG (DM2). GAA (Friedreich — autosomal recessive ataxia + cardiomyopathy + diabetes + areflexia). CGG (fragile X FXTAS in older males + premature ovarian failure in carriers; FRAXE). GGGGCC (C9orf72 — ALS/FTD; familial ataxia/parkinsonism overlap). NIID (NOTCH2NLC CGG — white matter U-fiber DWI signal). RFC1 CANVAS (cerebellar ataxia + neuropathy + vestibular areflexia). Many require specialized testing — short-read NGS may miss; PCR/Southern/long-read.`,
    },
    {
      name: "Neurocutaneous syndromes",
      summary: `NF1: ≥2 of café-au-lait, neurofibromas, axillary/inguinal freckling, optic glioma, Lisch nodules, bony lesion, first-degree relative. NF2: vestibular schwannomas, meningiomas, ependymomas. Tuberous sclerosis (TSC1, TSC2): cortical tubers, SEGA, cardiac rhabdomyoma, renal AML, lymphangioleiomyomatosis (LAM), facial angiofibromas, ash-leaf macules, shagreen patch, ungual fibromas. VHL: hemangioblastomas (CNS + retinal) + RCC + pheochromocytoma + pancreatic NETs + endolymphatic sac tumor. Sturge-Weber (GNAQ mosaic): port-wine stain + leptomeningeal angioma + glaucoma. PHTS (PTEN): macrocephaly + hamartomas + cancer. Schwannomatosis (SMARCB1, LZTR1).`,
    },
    {
      name: "Mitochondrial disease patterns",
      summary: `Multi-system involvement out of proportion to single-organ disease. Maternally inherited (mtDNA): MELAS (m.3243A>G — stroke-like, lactic acidosis, short stature, diabetes-deafness MIDD overlap), MERRF (m.8344 — myoclonic epilepsy, ragged red fibers), LHON (vision loss). Nuclear-encoded (autosomal): POLG (Alpers, MIRAS, PEO + ataxia + neuropathy), SURF1 (Leigh), NDUFS-family, TYMP (MNGIE). Diagnose: lactate (blood + CSF), urine organic acids, plasma amino acids, acylcarnitine profile, muscle biopsy (RRF, COX-negative, biochemistry), genetic testing (mtDNA + nuclear panel).`,
    },
    {
      name: "Skeletal dysplasias",
      summary: `Achondroplasia (FGFR3 G380R), thanatophoric dysplasia (FGFR3), osteogenesis imperfecta (COL1A1/2 — types I-IV most common; recessive types V-XV), spondyloepiphyseal dysplasia spectrum (COL2A1), Pseudoachondroplasia (COMP), multiple epiphyseal dysplasia (COMP, MATN3, etc.), Stickler (COL2A1/11A1/11A2 — ocular + cleft + arthropathy + hearing), Marshall syndrome, mucopolysaccharidoses with skeletal involvement (dysostosis multiplex pattern). Disproportionate short stature → radiographic survey to classify, then genetic confirmation.`,
    },
    {
      name: "Heritable connective tissue & vascular disease",
      summary: `Marfan (FBN1 — aortic root dilation + ectopia lentis + tall stature; Ghent 2010 nosology). Loeys-Dietz (TGFBR1/2, SMAD3, TGFB2/3 — hypertelorism + bifid uvula + multi-vessel arteriopathy + dissection at smaller diameters). Vascular EDS (COL3A1 — arterial/intestinal/uterine rupture, thin translucent skin, characteristic facies). Classical EDS (COL5A1/2). Hypermobile EDS (clinical 2017 criteria — Beighton ≥5 + systemic features + family history). Kyphoscoliotic EDS (PLOD1, FKBP14). Periodontal EDS (C1R, C1S). Cutis laxa syndromes. Williams (ELN microdeletion 7q11.23). Arterial tortuosity (SLC2A10).`,
    },
    {
      name: "Hereditary cancer syndromes",
      summary: `Lynch (MMR — MLH1, MSH2, MSH6, PMS2, EPCAM): colon + endometrial + ovarian + ureteral + small bowel + gastric + sebaceous. HBOC (BRCA1/2). Li-Fraumeni (TP53): early breast + sarcoma + brain + adrenocortical + leukemia. PJS (STK11). Cowden / PHTS (PTEN). FAP (APC). MAP (MUTYH biallelic). HDGC (CDH1). MEN1 (MEN1), MEN2 (RET). VHL. NF1. PTEN-Hamartoma. Hereditary paraganglioma (SDHx). Ataxia-telangiectasia heterozygotes (breast). DICER1. Constitutional mismatch repair deficiency (CMMRD) — biallelic MMR — pediatric brain tumors + GI + heme.`,
    },
    {
      name: "Chromosomal & copy-number disorders",
      summary: `Karyotype, FISH, chromosomal microarray (CMA) — first-tier for unexplained ID/DD/multiple congenital anomalies. Common: Down (T21), Edwards (T18), Patau (T13), Turner (45,X), Klinefelter (47,XXY), 22q11.2 deletion (DiGeorge / velocardiofacial — conotruncal heart, palatal, hypocalcemia, immune, learning, psychiatric), 22q11.2 duplication, Williams (7q11.23 del), Smith-Magenis (17p11.2 del — RAI1), Phelan-McDermid (22q13.3 del — SHANK3), 16p11.2 del/dup, Angelman (15q11-q13 maternal, UBE3A), Prader-Willi (15q11-q13 paternal). Methylation-sensitive testing for imprinting disorders.`,
    },
    {
      name: "Phenotype-first ontology — HPO and pattern recognition",
      summary: `Use HPO terms when possible (e.g., hypotonia HP:0001252, microcephaly HP:0000252). Rare diseases manifest through stereotyped combinations: "What syndromes feature X + Y + Z?" — tools like Face2Gene, PhenomeCentral, GeneMatcher, OMIM Clinical Synopsis. Beware variable expression and incomplete penetrance — a normal-appearing parent can transmit a severe disease. Mosaicism (somatic, gonadal) explains negative blood test in clearly affected patient. Always reconsider WES re-analysis 1-2 years later — new gene discoveries and re-annotation improve yield.`,
    },
  ],

  differentialPatterns: [
    "Stroke-like episode + short stature + diabetes + sensorineural deafness + lactic acidosis → MELAS (mtDNA m.3243A>G).",
    "Progressive cerebellar ataxia + cardiomyopathy + diabetes + areflexia in young adult → Friedreich ataxia (GAA × 2).",
    "Café-au-lait + freckling + Lisch nodules + neurofibromas → NF1; screen for plexiform, optic glioma, MPNST.",
    "Hypertelorism + bifid uvula + cleft palate + multi-vessel arteriopathy → Loeys-Dietz.",
    "Aortic root dilation + ectopia lentis + tall stature + arachnodactyly → Marfan; FBN1.",
    "Cortical tubers + facial angiofibromas + cardiac rhabdomyoma + ash-leaf macules → TSC.",
    "Hemangioblastoma + clear-cell RCC + pheochromocytoma → VHL.",
    "Coarse features + organomegaly + dysostosis multiplex + corneal clouding + ID → MPS (MPS I Hurler/Scheie, MPS II Hunter, MPS VI Maroteaux-Lamy etc.).",
    "Adult-onset proximal weakness + respiratory + cardiac → adult Pompe; check acid α-glucosidase.",
    "Hypotonic infant + macroglossia + cardiomyopathy → infantile Pompe.",
    "Congenital cataract + cardiomyopathy + intellectual disability + Coombs-negative hemolytic anemia in newborn → galactosemia (GALT) or galactokinase / GALE.",
    "Episodic vomiting + ataxia + lethargy + hyperammonemia (without acidosis) in male → ornithine transcarbamylase deficiency.",
    "Macrocephaly + intellectual disability + hamartomas + mucocutaneous lesions → Cowden / PHTS (PTEN).",
    "Multiple bilateral vestibular schwannomas in young adult → NF2.",
    "Late-onset cerebellar ataxia + sensory neuropathy + bilateral vestibular failure → CANVAS (RFC1 AAGGG expansion).",
    "Rapidly progressive infant + acute encephalopathy + metabolic acidosis + ketosis + hyperammonemia → organic acidemia (PA, MMA, IVA).",
    "Hypoglycemia + hepatomegaly + lactic acidosis + hyperuricemia + hyperlipidemia in infant → GSD I (von Gierke).",
    "Severe progressive infantile hypotonia + macroglossia + cardiomegaly + early death → Pompe (infantile-onset).",
    "Hypotonia + cataract + hypogonadism + intellectual disability + cardiac conduction + myotonia → myotonic dystrophy.",
    "Marfanoid habitus + intellectual disability + ectopia lentis (downward) + thromboembolism → homocystinuria (CBS).",
  ],

  redFlags: [
    "Acute encephalopathy in a newborn — always check ammonia, lactate, urine ketones, glucose; treatable IEM until proven otherwise.",
    "Hyperammonemia in a male child with neuropsychiatric crisis on high-protein meal → late-onset OTC.",
    "Sudden cardiac death + neuromuscular symptoms in young patient — consider Pompe, Danon, mitochondrial.",
    "Aortic dissection at small diameter in young patient — Loeys-Dietz, vascular EDS, FTAAD genes (ACTA2, MYH11, MYLK).",
    "Recurrent miscarriage / unexplained fetal demise — parental balanced translocation, antiphospholipid, monogenic conditions.",
    "Sibling with same unexplained presentation — autosomal recessive disease until proven otherwise; cascade testing.",
    "Negative gene panel but high clinical suspicion — proceed to WES/WGS; consider mosaicism, deep intronic, structural, repeat expansion.",
    "Treatable IEM (PKU, biotinidase, ASL, OTC partial, galactosemia, Wilson, Pompe, MSUD, urea cycle) — confirmation must not delay treatment trial.",
    "Family history of unexplained early death — pursue genetic etiology aggressively.",
  ],

  commonMimics: [
    {
      condition: "Marfan syndrome",
      mimics: ["Loeys-Dietz syndrome", "Vascular EDS", "MASS phenotype", "Homocystinuria (CBS)", "Lujan-Fryns", "Beals (CCA, FBN2)", "Stickler", "Familial TAA (ACTA2, MYH11, MYLK, PRKG1)"],
    },
    {
      condition: "Neurofibromatosis type 1",
      mimics: ["Legius syndrome (SPRED1)", "Mosaic / segmental NF1", "Constitutional mismatch repair deficiency", "McCune-Albright", "Watson syndrome", "LEOPARD/Noonan with multiple lentigines"],
    },
    {
      condition: "Tuberous sclerosis",
      mimics: ["Birt-Hogg-Dubé", "Cowden / PHTS", "Other genodermatoses with cutaneous tumors"],
    },
    {
      condition: "Friedreich ataxia",
      mimics: ["Vitamin E deficiency (AVED — TTPA)", "Refsum disease", "Ataxia with oculomotor apraxia (AOA1, AOA2)", "Other autosomal recessive cerebellar ataxias", "Mitochondrial ataxias (POLG)", "SCAs presenting with sensory features"],
    },
    {
      condition: "Pompe disease (late-onset)",
      mimics: ["LGMD spectrum", "Polymyositis", "IBM (older onset)", "ALS (early respiratory)", "Other glycogen storage myopathies"],
    },
    {
      condition: "MELAS",
      mimics: ["Recurrent stroke in young (vasculopathy, hypercoagulability)", "MERRF / other mtDNA", "Leigh syndrome variants", "Hashimoto encephalopathy", "Anti-NMDAR encephalitis", "CADASIL"],
    },
    {
      condition: "Mucopolysaccharidoses",
      mimics: ["Mucolipidoses", "Multiple sulfatase deficiency", "Fucosidosis", "α-mannosidosis", "GM1 gangliosidosis", "Sialic acid storage disease"],
    },
  ],
};
