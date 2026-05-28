import type { SpecialtyReference } from "./types";

export const GASTROENTEROLOGY_REFERENCE: SpecialtyReference = {
  title: "Board-Certified Gastroenterologist",
  expertise: `Deep expertise in inflammatory bowel disease, eosinophilic GI disorders, motility disorders, autoimmune liver disease, biliary disease, microbiome-associated and immune-mediated enteropathy, malabsorption syndromes, hereditary GI conditions, monogenic IBD, and gut manifestations of systemic disease.`,

  clinicalFrameworks: [
    {
      name: "Inflammatory bowel disease — Crohn's vs UC vs indeterminate",
      summary: `UC: continuous colonic inflammation from rectum, mucosal/submucosal involvement, crypt abscesses, friability, bloody diarrhea. Crohn's: skip lesions, transmural, granulomas, ileal/perianal involvement, strictures/fistulas. Indeterminate colitis when features overlap. Severity scores: Mayo for UC, CDAI / Harvey-Bradshaw for Crohn's. Extraintestinal: erythema nodosum, pyoderma gangrenosum, episcleritis/uveitis, peripheral and axial arthritis, PSC. Suspect monogenic IBD in very-early-onset (<6yo): IL10/IL10R, NEMO, XIAP, XLP, CGD, etc.`,
    },
    {
      name: "Microscopic colitis & autoimmune enteropathy",
      summary: `Microscopic colitis (lymphocytic, collagenous): chronic watery diarrhea, normal endoscopy, characteristic histology. Triggers: NSAIDs, PPIs, SSRIs. Autoimmune enteropathy: intractable diarrhea + anti-enterocyte / anti-goblet cell antibodies + villous atrophy refractory to gluten-free diet. IPEX (FOXP3) is the classic monogenic form in male infants — eczema + endocrinopathy + enteropathy.`,
    },
    {
      name: "Celiac disease & differential of villous atrophy",
      summary: `Celiac: serology (tissue transglutaminase IgA + total IgA; if IgA deficient → IgG-DGP / IgG-tTG) + duodenal biopsy showing Marsh ≥2 + HLA-DQ2/DQ8 supportive. Always do biopsy on gluten-containing diet. Other causes of villous atrophy: tropical sprue, common variable immunodeficiency, Whipple's (T. whipplei, PAS-positive macrophages), autoimmune enteropathy, refractory celiac (consider EATL/MEITL), olmesartan-induced, eosinophilic enteritis.`,
    },
    {
      name: "Eosinophilic GI disorders",
      summary: `Eosinophilic esophagitis (EoE): symptoms of esophageal dysfunction + ≥15 eos/HPF + exclusion of mimics + persistence after PPI trial (PPI-REE no longer separate). Dietary elimination, swallowed topical steroids, dupilumab. Eosinophilic gastroenteritis (EGE) / colitis: mucosal/muscular/serosal patterns; high eosinophilia in blood may be absent. Always rule out parasitic infection (Strongyloides!) before steroids.`,
    },
    {
      name: "Motility disorders",
      summary: `Gastroparesis: delayed gastric emptying scintigraphy without obstruction. Causes: diabetic, post-viral, post-surgical, idiopathic, scleroderma, autoimmune (anti-GAD, paraneoplastic), Parkinson, amyloid. Chronic intestinal pseudo-obstruction: severe motility failure mimicking obstruction; rare hereditary forms (POLG, MNGIE [TYMP — leukoencephalopathy + neuropathy], mitochondrial). Achalasia: aperistalsis + non-relaxing LES; types I-III by Chicago classification. Pseudoachalasia from malignancy must be excluded.`,
    },
    {
      name: "Autoimmune liver disease",
      summary: `AIH: ANA, anti-smooth muscle (anti-actin), anti-LKM-1 / SLA, elevated IgG, interface hepatitis on biopsy. Type 1 (adult, ANA/SMA) vs type 2 (child, LKM-1). PBC: anti-mitochondrial antibody (M2), pruritus + cholestasis, IgM elevated, ductular destruction. PSC: cholangiogram (MRCP) with multifocal strictures, strong IBD (especially UC) association, increased cholangiocarcinoma risk. IgG4-related sclerosing cholangitis can mimic PSC — IgG4 levels + tissue. Overlap syndromes exist.`,
    },
    {
      name: "Hereditary GI conditions",
      summary: `Familial adenomatous polyposis (APC): hundreds of polyps, near-100% colon cancer if untreated; check duodenum, thyroid, desmoid. Attenuated FAP, MAP (MUTYH-AP — recessive). Lynch syndrome (MMR — MLH1, MSH2, MSH6, PMS2, EPCAM): colon + endometrial + others, microsatellite instability/IHC loss. Peutz-Jeghers (STK11): hamartomas + perioral pigmentation. Juvenile polyposis (SMAD4, BMPR1A; SMAD4 also HHT). Cowden (PTEN). Hereditary diffuse gastric cancer (CDH1). Hereditary pancreatitis (PRSS1, SPINK1, CFTR, CTRC).`,
    },
    {
      name: "Wilson disease",
      summary: `Hepatic (any liver presentation under 40 — acute hepatitis, fulminant failure with Coombs-negative hemolysis, cirrhosis) + neurologic (movement disorder, dysarthria, dystonia) + psychiatric + Kayser-Fleischer rings. Low ceruloplasmin (<20), elevated 24-hour urinary copper (>40 µg or >100), liver biopsy copper >250 µg/g dry weight, ATP7B mutations. Penicillamine, trientine, zinc. Treatable — missing it is catastrophic.`,
    },
    {
      name: "Hemochromatosis and iron-overload syndromes",
      summary: `HFE (C282Y homozygous, ~70% Northern European) classic adult HC. Non-HFE forms: TFR2, hemojuvelin (HJV — juvenile), HAMP (hepcidin — juvenile), SLC40A1 (ferroportin disease — autosomal dominant with mixed phenotype). Ferritin >300 (men) / >200 (women) + transferrin saturation >45% → confirm with genetic testing. Treat with phlebotomy. Secondary iron overload: transfusional, thalassemia, ineffective erythropoiesis.`,
    },
    {
      name: "Pancreatic and biliary syndromes",
      summary: `Recurrent acute pancreatitis: alcohol/gallstones first, then hypertriglyceridemia, hypercalcemia, drugs, divisum, autoimmune (type 1 AIP = IgG4-RD; type 2 = idiopathic duct-centric), hereditary (PRSS1 — high lifetime CA risk), CFTR-related, SPINK1, CTRC. Cystic fibrosis as adult — bronchiectasis + recurrent pancreatitis + male infertility + clubbing — check sweat chloride + CFTR. Chronic diarrhea ± steatorrhea: differentiate maldigestion (pancreatic exocrine insufficiency) vs malabsorption (mucosal — celiac, IBD).`,
    },
  ],

  differentialPatterns: [
    "Bloody diarrhea + tenesmus + continuous rectal involvement → ulcerative colitis.",
    "Right lower quadrant pain + non-bloody diarrhea + perianal fistula + skip lesions → Crohn's.",
    "Very early onset IBD (<6yo) + severe perianal disease + family history → monogenic IBD; gene panel including IL10/IL10R, XIAP, CGD, NEMO.",
    "Chronic watery diarrhea + normal endoscopy + NSAID/PPI/SSRI exposure → microscopic colitis; biopsy confirms.",
    "Pruritus + cholestasis + AMA-positive + IgM elevation → PBC.",
    "Cholestasis + IBD (especially UC) + multifocal biliary strictures on MRCP → PSC; check cholangiocarcinoma surveillance.",
    "Acute hepatitis + Coombs-negative hemolysis + neuropsychiatric symptoms in young patient → Wilson's; treatable, can't miss.",
    "Iron overload + diabetes + cardiomyopathy + arthropathy + bronze skin → hereditary hemochromatosis.",
    "Chronic diarrhea + endocrinopathy + autoimmunity in male infant → IPEX.",
    "Diarrhea + arthritis + neurologic symptoms + lymphadenopathy in middle-aged man → Whipple's disease (T. whipplei).",
    "Recurrent pancreatitis in young patient without alcohol/stones → hereditary (PRSS1) or CFTR-related; gene panel + cancer surveillance.",
    "Severe constipation + dysmotility + leukoencephalopathy + neuropathy → MNGIE (TYMP).",
    "Hamartomatous polyps + mucocutaneous pigmentation → Peutz-Jeghers (STK11); colon, GI, breast, gynecologic cancer surveillance.",
    "Recurrent angioedema + abdominal pain mimicking surgical abdomen → hereditary angioedema (gut wall edema).",
    "Severe dysphagia + atopy + young/adult male + esophageal rings on endoscopy → eosinophilic esophagitis.",
  ],

  redFlags: [
    "Toxic megacolon (transverse colon >6 cm + systemic toxicity) — emergent surgical consult; risk perforation.",
    "Fulminant hepatic failure in young patient — consider Wilson's, autoimmune hepatitis, drug (acetaminophen), HBV reactivation; transplant evaluation.",
    "Acute mesenteric ischemia — out-of-proportion abdominal pain, lactic acidosis; CT angiography emergent.",
    "Lower GI bleed in patient on anticoagulants + telangiectasias → HHT (SMAD4/ENG/ACVRL1).",
    "Pancreatic mass + new diabetes + painless jaundice in older adult — pancreatic adenocarcinoma until proven otherwise.",
    "Recurrent diarrhea + hypokalemia + dehydration → VIPoma (pancreatic NET) or factitious laxative abuse — both must be excluded.",
    "Diarrhea + flushing + right heart valve disease → carcinoid syndrome.",
    "Severe acute hepatitis in pregnancy → AFLP, HELLP, viral hepatitis E (worse in pregnancy).",
    "Persistent C. difficile in IBD patient — pseudomembranous colitis + IBD flare; address both.",
    "Familial colorectal cancer with MSI / loss of MMR proteins → Lynch syndrome; cascade testing.",
  ],

  commonMimics: [
    {
      condition: "Ulcerative colitis",
      mimics: ["Crohn's colitis", "Infectious colitis (C. difficile, CMV, amebic, E. histolytica, Salmonella)", "Microscopic colitis", "Ischemic colitis", "Radiation colitis", "Behçet colitis", "GVHD", "Monogenic IBD"],
    },
    {
      condition: "Crohn's disease",
      mimics: ["Intestinal TB", "Yersinia ileitis", "Behçet", "Lymphoma", "GI sarcoid", "Eosinophilic gastroenteritis", "Vasculitis (PAN, Henoch-Schönlein, EGPA)", "Chronic granulomatous disease"],
    },
    {
      condition: "Celiac disease",
      mimics: ["Tropical sprue", "Common variable immunodeficiency enteropathy", "Whipple's disease", "Autoimmune enteropathy", "Eosinophilic enteritis", "Olmesartan-induced", "Giardia", "Refractory celiac (consider EATL/MEITL)"],
    },
    {
      condition: "Primary sclerosing cholangitis",
      mimics: ["IgG4-related sclerosing cholangitis", "Recurrent pyogenic cholangitis", "Hepatobiliary lymphoma", "Cholangiocarcinoma with secondary stricturing", "HIV cholangiopathy", "Ischemic cholangiopathy", "Histiocytic disorders"],
    },
    {
      condition: "Autoimmune hepatitis",
      mimics: ["Viral hepatitis (B, C, E)", "Drug-induced liver injury", "Wilson's", "α1-antitrypsin deficiency", "Hemochromatosis", "Nonalcoholic steatohepatitis", "PBC/PSC overlap"],
    },
    {
      condition: "Gastroparesis",
      mimics: ["Mechanical gastric outlet obstruction", "Chronic pseudo-obstruction", "Cyclic vomiting syndrome", "Cannabinoid hyperemesis", "Eating disorder", "Autoimmune gastric autonomic neuropathy", "Adrenal insufficiency", "Migraine equivalent"],
    },
    {
      condition: "Irritable bowel syndrome",
      mimics: ["Celiac disease", "Lactose / fructose intolerance", "Bile acid malabsorption", "Small intestinal bacterial overgrowth", "Microscopic colitis", "Early IBD", "Endometriosis", "Chronic pancreatic insufficiency"],
    },
  ],
};
