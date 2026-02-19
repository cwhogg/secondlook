#!/usr/bin/env node

/**
 * Expand the SecondLook knowledge base to ~1,500 rare diseases.
 *
 * Phase 1: Generate disease name lists per medical domain using GPT-4.1-mini
 * Phase 2: Generate full disease profiles for each disease (10 concurrent)
 * Phase 3: Summary and stats
 *
 * Usage: OPENAI_API_KEY=sk-... node scripts/expand-knowledge-base.js
 *
 * The script is restartable — it skips diseases that already have profiles on disk.
 * Progress is saved to scripts/expansion-progress.json.
 */

const fs = require('fs');
const path = require('path');

const DISEASES_DIR = path.join(__dirname, '..', 'lib', 'knowledge', 'diseases');
const DISEASE_LIST_FILE = path.join(__dirname, 'expansion-disease-list.json');
const PROGRESS_FILE = path.join(__dirname, 'expansion-progress.json');
const MODEL = 'gpt-4.1-mini';
const CONCURRENCY = 10;

// ===== DOMAIN DEFINITIONS =====
// Each domain has a target count of NEW diseases to add and a description to guide generation.

const DOMAINS = [
  {
    name: 'neurological',
    target: 182,
    description: 'Neurological rare diseases including: neuromuscular diseases (muscular dystrophies — Duchenne, Becker, limb-girdle subtypes, facioscapulohumeral, myotonic dystrophy type 2, oculopharyngeal; myopathies — nemaline, centronuclear, mitochondrial myopathies; congenital myasthenic syndromes), movement disorders (Huntington disease, various dystonias — DYT1 generalized, cervical, dopa-responsive; progressive supranuclear palsy, corticobasal degeneration, dementia with Lewy bodies, pantothenate kinase-associated neurodegeneration, neuroacanthocytosis), epilepsy syndromes (Dravet syndrome, Lennox-Gastaut, West syndrome, progressive myoclonus epilepsies — Lafora, Unverricht-Lundborg; KCNQ2 encephalopathy, CDKL5 deficiency, PCDH19 epilepsy, ring chromosome 20, Angelman-related seizures), neuropathies (Charcot-Marie-Tooth subtypes — CMT1A, CMT2, CMTX; HNPP, giant axonal neuropathy, familial amyloid polyneuropathy), leukodystrophies (metachromatic, Krabbe, adrenoleukodystrophy, Alexander, Canavan, Pelizaeus-Merzbacher, vanishing white matter), neurodegenerative (frontotemporal dementia variants, prion diseases — fatal familial insomnia, Gerstmann-Straussler-Scheinker; neuronal ceroid lipofuscinoses, Niemann-Pick type C), headache disorders (hemiplegic migraine, SUNCT/SUNA, new daily persistent headache), other (spinal muscular atrophy types, Rett syndrome, MECP2 duplication, Aicardi syndrome, lissencephaly, polymicrogyria, Joubert syndrome, ataxia-telangiectasia, episodic ataxias)',
  },
  {
    name: 'genetic-syndromes',
    target: 163,
    description: 'Genetic and chromosomal syndromes including: chromosomal (Down syndrome, Williams syndrome, Cri du Chat, Wolf-Hirschhorn, Jacobsen, Smith-Magenis, Potocki-Lupski, 1p36 deletion, 5p deletion, trisomy 13, trisomy 18, ring chromosomes), RASopathies (Costello syndrome, cardiofaciocutaneous syndrome, Legius syndrome, Noonan-like syndromes), ciliopathies (Bardet-Biedl, Joubert spectrum, Meckel-Gruber, Senior-Loken, oral-facial-digital syndromes), skeletal dysplasias (achondroplasia, hypochondroplasia, thanatophoric dysplasia, spondyloepiphyseal dysplasia, diastrophic dysplasia, Ellis-van Creveld, Jeune syndrome, campomelic dysplasia, cleidocranial dysplasia), overgrowth syndromes (Sotos, Weaver, Beckwith-Wiedemann, Simpson-Golabi-Behmel, Proteus, CLOVES, PIK3CA-related overgrowth), undergrowth (Silver-Russell, Seckel, Meier-Gorlin, Cornelia de Lange, Rubinstein-Taybi), neurocutaneous (Sturge-Weber, incontinentia pigmenti, epidermal nevus syndromes, Gorlin syndrome), connective tissue (Stickler variants, cutis laxa, pseudoxanthoma elasticum), imprinting disorders (Prader-Willi already covered, maternal UPD14, paternal UPD14), cohesinopathies (Cornelia de Lange spectrum), other recognizable syndromes (Kabuki, CHARGE, Alagille, Holt-Oram, Treacher Collins, Pierre Robin sequence, Goldenhar, DiGeorge spectrum, Coffin-Siris, Coffin-Lowry, Smith-Lemli-Opitz, Zellweger spectrum, Cockayne, xeroderma pigmentosum)',
  },
  {
    name: 'autoimmune-rheumatologic',
    target: 138,
    description: 'Autoimmune and rheumatologic rare diseases including: systemic autoimmune (anti-synthetase syndrome, overlap syndromes, undifferentiated connective tissue disease, IgG4-related disease subtypes), organ-specific autoimmune (autoimmune hemolytic anemia, autoimmune neutropenia, autoimmune thrombocytopenia — ITP, autoimmune inner ear disease, autoimmune retinopathy, autoimmune gastritis/pernicious anemia, autoimmune oophoritis, autoimmune orchitis, autoimmune lymphoproliferative syndrome — ALPS, autoimmune polyendocrinopathy types 1 and 2), vasculitis subtypes (primary CNS vasculitis, cutaneous polyarteritis nodosa, hypersensitivity vasculitis, urticarial vasculitis, Kawasaki disease, Buerger disease, retinal vasculitis), autoinflammatory (PFAPA syndrome, Blau syndrome, DADA2 — deficiency of ADA2, CANDLE syndrome, Schnitzler syndrome, VEXAS syndrome, Majeed syndrome, chronic recurrent multifocal osteomyelitis — CRMO), myositis subtypes (anti-MDA5 dermatomyositis, anti-SRP necrotizing myopathy, immune-mediated necrotizing myopathy, juvenile dermatomyositis, orbital myositis), scleroderma spectrum (morphea/localized scleroderma, eosinophilic fasciitis, systemic sclerosis sine scleroderma, CREST syndrome), other (palindromic rheumatism, RS3PE syndrome, adult-onset Still subtypes, multicentric reticulohistiocytosis, pachydermoperiostosis, relapsing polychondritis variants, remitting seronegative symmetrical synovitis, secondary vasculitis)',
  },
  {
    name: 'metabolic-endocrine',
    target: 129,
    description: 'Metabolic and endocrine rare diseases including: lysosomal storage (Niemann-Pick A/B, Niemann-Pick C already partially covered, Tay-Sachs, Sandhoff, GM1 gangliosidosis, mucopolysaccharidoses — MPS I/Hurler, MPS II/Hunter, MPS III/Sanfilippo, MPS IV/Morquio, MPS VI/Maroteaux-Lamy, MPS VII/Sly; mucolipidoses, fucosidosis, mannosidosis, aspartylglucosaminuria, Wolman/CESD, Farber disease, cystinosis), mitochondrial diseases (MELAS, MERRF, Leigh syndrome, Kearns-Sayre, LHON, NARP, Pearson syndrome, mitochondrial complex I-V deficiencies, CoQ10 deficiency), amino acid disorders (MSUD already covered, tyrosinemia types, alkaptonuria, hartnup disease, cystinuria, non-ketotic hyperglycinemia, histidinemia), organic acidemias (methylmalonic acidemia, propionic acidemia, isovaleric acidemia, glutaric aciduria types I and II, 3-methylglutaconic aciduria), fatty acid oxidation (MCAD, VLCAD, LCHAD, carnitine palmitoyltransferase deficiencies, carnitine transporter deficiency), glycogen storage diseases (types I-IX, Pompe already covered), peroxisomal (Zellweger spectrum, Refsum disease, rhizomelic chondrodysplasia punctata, X-linked adrenoleukodystrophy), urea cycle defects (OTC deficiency, citrullinemia, argininosuccinic aciduria, arginase deficiency), endocrine tumors (MEN1, MEN2, Carney complex, McCune-Albright), metal metabolism (Wilson already covered, Menkes disease, aceruloplasminemia), CDG syndromes (congenital disorders of glycosylation), other (galactosemia, hereditary fructose intolerance, biotinidase deficiency, Smith-Lemli-Opitz)',
  },
  {
    name: 'hematologic',
    target: 91,
    description: 'Hematologic rare diseases including: hemoglobinopathies (sickle cell disease, thalassemia major/intermedia, Hb C disease, Hb E disease, unstable hemoglobin variants, methemoglobinemia), red blood cell disorders (hereditary elliptocytosis, hereditary pyropoikilocytosis, G6PD deficiency, pyruvate kinase deficiency, Diamond-Blackfan anemia, congenital dyserythropoietic anemias types I-III, hereditary stomatocytosis), bone marrow failure (Fanconi anemia, dyskeratosis congenita/telomere biology disorders, Shwachman-Diamond syndrome, severe congenital neutropenia/Kostmann, aplastic anemia, amegakaryocytic thrombocytopenia), coagulopathies (hemophilia A and B, von Willebrand disease types, rare factor deficiencies — VII, X, XI, XIII; antithrombin deficiency, protein C deficiency, protein S deficiency, factor V Leiden, prothrombin gene mutation, heparin-induced thrombocytopenia), platelet disorders (Glanzmann thrombasthenia, Bernard-Soulier syndrome, Wiskott-Aldrich syndrome, gray platelet syndrome, Hermansky-Pudlak syndrome, Scott syndrome, Quebec platelet disorder), lymphoproliferative (hairy cell leukemia, T-cell large granular lymphocyte leukemia, primary effusion lymphoma, Castleman already covered), myeloid (chronic myeloid leukemia, systemic mastocytosis already covered, chronic eosinophilic leukemia, hypereosinophilic syndrome), histiocytic (Rosai-Dorfman disease, juvenile xanthogranuloma), other (paroxysmal cold hemoglobinuria, cold agglutinin disease, Evans syndrome, hemolytic uremic syndrome — typical and atypical)',
  },
  {
    name: 'gastrointestinal-hepatic',
    target: 69,
    description: 'Gastrointestinal and hepatic rare diseases including: motility (esophageal achalasia already covered, chronic intestinal pseudo-obstruction already covered, Hirschsprung disease, colonic inertia, rumination disorder), malabsorption (tropical sprue, Whipple already covered, abetalipoproteinemia, lymphangiectasia already covered, autoimmune enteropathy, tufting enteropathy, microvillous inclusion disease), inflammatory (collagenous colitis, lymphocytic colitis — microscopic already covered, eosinophilic colitis, diversion colitis, radiation enteritis, graft-versus-host disease of GI), hepatic (Wilson already covered, alpha-1-antitrypsin already covered, Alagille syndrome, progressive familial intrahepatic cholestasis types 1-3, hereditary hemorrhagic telangiectasia, Budd-Chiari syndrome, hepatic veno-occlusive disease, Caroli disease, congenital hepatic fibrosis, glycogen storage disease hepatic forms, neonatal hemochromatosis, biliary atresia, choledochal cysts), pancreatic (Shwachman-Diamond pancreatic insufficiency, hereditary pancreatitis already covered, autoimmune pancreatitis already covered, pancreatic divisum, annular pancreas), other GI (Gardner syndrome, Peutz-Jeghers syndrome, juvenile polyposis, Cronkhite-Canada syndrome, blue rubber bleb nevus syndrome, small bowel diverticulosis, pneumatosis intestinalis, protein-losing enteropathy, short bowel syndrome)',
  },
  {
    name: 'immunologic',
    target: 73,
    description: 'Immunologic and immunodeficiency rare diseases including: combined immunodeficiencies (severe combined immunodeficiency — SCID types: X-linked, ADA-SCID, RAG1/2, Artemis, IL-7R; Omenn syndrome, reticular dysgenesis, MHC class I and II deficiency), predominantly antibody deficiencies (X-linked agammaglobulinemia, CVID already covered, selective IgA already covered, selective IgM deficiency, IgG subclass deficiency, specific antibody deficiency, transient hypogammaglobulinemia of infancy, WHIM syndrome), phagocyte defects (chronic granulomatous disease, leukocyte adhesion deficiency types I-III, Chediak-Higashi syndrome, specific granule deficiency, myeloperoxidase deficiency, Papillon-Lefevre syndrome), complement deficiencies (C1q/C1r/C1s deficiency, C2 deficiency, C3 deficiency, C4 deficiency, terminal complement — C5-C9, C1 esterase inhibitor already covered as hereditary angioedema, properdin deficiency, MBL deficiency, paroxysmal nocturnal hemoglobinuria already covered), immune dysregulation (IPEX syndrome, ALPS already mentioned, CTLA-4 haploinsufficiency, LRBA deficiency, STAT3 gain-of-function, activated PI3K delta syndrome — APDS, Kabuki immune aspects, hemophagocytic syndromes), innate immunity (IRAK4 deficiency, MyD88 deficiency, STAT1 gain-of-function, chronic mucocutaneous candidiasis, mendelian susceptibility to mycobacterial disease, TLR3 deficiency), other (Good syndrome — thymoma with immunodeficiency, hyper-IgE syndromes — STAT3 and DOCK8, Wiskott-Aldrich already mentioned in hematologic, ataxia-telangiectasia immune aspects)',
  },
  {
    name: 'cardiovascular',
    target: 73,
    description: 'Cardiovascular rare diseases including: cardiomyopathies (hypertrophic cardiomyopathy, dilated cardiomyopathy — familial, arrhythmogenic right ventricular cardiomyopathy — ARVC, left ventricular non-compaction, restrictive cardiomyopathy, Takotsubo cardiomyopathy, peripartum cardiomyopathy, cardiac amyloidosis — ATTR and AL, cardiac sarcoidosis, endomyocardial fibrosis, Danon disease), channelopathies (long QT syndromes — types 1-3, Brugada syndrome, catecholaminergic polymorphic VT — CPVT, short QT syndrome, early repolarization syndrome, progressive cardiac conduction disease — Lenegre), structural/congenital (Ebstein anomaly, tetralogy of Fallot in adults, Eisenmenger syndrome, bicuspid aortic valve, cor triatriatum, single ventricle physiology, Uhl anomaly, anomalous coronary arteries, cardiac tumors — myxoma, rhabdomyoma, fibroma), vascular (pulmonary arterial hypertension — idiopathic, heritable BMPR2; pulmonary veno-occlusive disease, fibromuscular dysplasia, hereditary hemorrhagic telangiectasia, aortic dissection syndromes, Takayasu already covered, moyamoya disease, thoracic aortic aneurysm syndromes, medium vessel vasculitis, spontaneous coronary artery dissection — SCAD), aortopathies (bicuspid aortic valve aortopathy, familial thoracic aortic aneurysm, Loeys-Dietz already covered, Marfan already covered), other (cardiac fibroma, Lyme carditis, Chagas cardiomyopathy, cardiac hemochromatosis, pericardial diseases — constrictive, recurrent)',
  },
  {
    name: 'pulmonary',
    target: 70,
    description: 'Pulmonary and respiratory rare diseases including: interstitial lung diseases (idiopathic pulmonary fibrosis, nonspecific interstitial pneumonia, cryptogenic organizing pneumonia, lymphoid interstitial pneumonia, desquamative interstitial pneumonia, respiratory bronchiolitis-ILD, acute interstitial pneumonia, pleuroparenchymal fibroelastosis), granulomatous (sarcoidosis already covered, hypersensitivity pneumonitis — chronic, berylliosis, silicosis), eosinophilic lung diseases (chronic eosinophilic pneumonia, acute eosinophilic pneumonia, allergic bronchopulmonary aspergillosis — ABPA, hypereosinophilic syndrome pulmonary, tropical pulmonary eosinophilia), pulmonary vascular (pulmonary hypertension types, pulmonary veno-occlusive disease, pulmonary capillary hemangiomatosis, pulmonary arteriovenous malformations, hepatopulmonary syndrome), alveolar (pulmonary alveolar proteinosis, pulmonary alveolar microlithiasis, diffuse alveolar hemorrhage syndromes — Goodpasture, anti-GBM, idiopathic pulmonary hemosiderosis), airway (bronchiolitis obliterans, diffuse panbronchiolitis, tracheobronchopathia osteochondroplastica, relapsing polychondritis airway, primary ciliary dyskinesia, Williams-Campbell syndrome, Mounier-Kuhn syndrome), other (lymphangioleiomyomatosis — LAM, pulmonary Langerhans cell histiocytosis, congenital pulmonary airway malformation, pulmonary sequestration, bronchogenic cyst, hereditary alpha-1-antitrypsin lung disease, mesothelioma, surfactant deficiency syndromes, Birt-Hogg-Dube pulmonary)',
  },
  {
    name: 'renal',
    target: 60,
    description: 'Renal and urological rare diseases including: glomerular (IgA nephropathy, membranous nephropathy — primary, focal segmental glomerulosclerosis — FSGS genetic forms, minimal change disease, membranoproliferative glomerulonephritis, C3 glomerulopathy, anti-GBM disease/Goodpasture, lupus nephritis as separate entity, ANCA-associated renal vasculitis, fibronectin glomerulopathy, lipoprotein glomerulopathy, collapsing glomerulopathy), tubulopathies (Bartter syndrome types, Gitelman syndrome, Liddle syndrome, nephrogenic diabetes insipidus, renal tubular acidosis types I-IV, Dent disease, Lowe/oculocerebrorenal syndrome, Fanconi syndrome — hereditary, pseudohypoaldosteronism), cystic (autosomal dominant polycystic kidney disease — ADPKD, autosomal recessive — ARPKD, nephronophthisis, medullary cystic kidney disease, medullary sponge kidney, tuberous sclerosis renal, von Hippel-Lindau renal), other genetic (Alport syndrome, thin basement membrane disease, nail-patella syndrome, Fabry renal already covered, cystinosis renal, primary hyperoxaluria types 1-3, xanthinuria, adenine phosphoribosyltransferase deficiency), obstructive/structural (posterior urethral valves, ureteropelvic junction obstruction, duplex kidney/ureters, horseshoe kidney), other (renal cell carcinoma — hereditary forms including VHL, Birt-Hogg-Dube; Wilms tumor, congenital nephrotic syndrome — Finnish type, atypical hemolytic uremic syndrome, thrombotic microangiopathies)',
  },
  {
    name: 'dermatologic',
    target: 57,
    description: 'Dermatologic rare diseases including: genodermatoses (epidermolysis bullosa — simplex, junctional, dystrophic subtypes; Netherton syndrome, Hailey-Hailey disease, Darier disease, lamellar ichthyosis, X-linked ichthyosis, ichthyosis vulgaris, harlequin ichthyosis, Sjogren-Larsson syndrome, KID syndrome), autoimmune bullous (pemphigus vulgaris, pemphigus foliaceus, bullous pemphigoid, mucous membrane pemphigoid, epidermolysis bullosa acquisita, dermatitis herpetiformis, linear IgA bullous dermatosis, paraneoplastic pemphigus), vascular anomalies (infantile hemangioma — PHACE syndrome, Kasabach-Merritt, Klippel-Trenaunay syndrome, capillary malformation-AV malformation, blue rubber bleb nevus), pigmentary (vitiligo, piebaldism, Waardenburg syndrome, albinism — oculocutaneous types, Hermansky-Pudlak, Chediak-Higashi), connective tissue (pseudoxanthoma elasticum, cutis laxa syndromes, focal dermal hypoplasia/Goltz syndrome, Werner syndrome, progeroid syndromes), inflammatory (Sweet syndrome, pyoderma gangrenosum, hidradenitis suppurativa, granuloma annulare, necrobiosis lipoidica, morphea, lichen sclerosus), tumors (dermatofibrosarcoma protuberans, Merkel cell carcinoma, mycosis fungoides/Sezary, xeroderma pigmentosum-related skin cancers), other (mastocytosis skin, porphyria cutanea tarda already covered, calciphylaxis, confluent and reticulated papillomatosis)',
  },
  {
    name: 'musculoskeletal',
    target: 56,
    description: 'Musculoskeletal rare diseases including: bone disorders (osteogenesis imperfecta subtypes beyond what is covered, fibrous dysplasia/McCune-Albright, Paget disease of bone, osteopetrosis, melorheostosis, progressive osseous heteroplasia, fibrodysplasia ossificans progressiva — FOP, hypophosphatasia, X-linked hypophosphatemia, tumor-induced osteomalacia, cherubism, Gorham-Stout disease/vanishing bone, Camurati-Engelmann disease), muscle disorders (central core disease, multi-minicore disease, congenital fiber type disproportion, Bethlem myopathy, Ullrich congenital muscular dystrophy, Emery-Dreifuss muscular dystrophy, laminopathies, GNE myopathy/Nonaka, McArdle disease, Brody myopathy, rippling muscle disease, myotonia congenita — Thomsen and Becker types, paramyotonia congenita, hyperkalemic periodic paralysis, hypokalemic periodic paralysis), joint/cartilage (multiple epiphyseal dysplasia, pseudoachondroplasia, metaphyseal chondrodysplasia — Schmid and McKusick types, spondylometaphyseal dysplasia, nail-patella syndrome, arthrogryposis multiplex congenita, camptodactyly-arthropathy-coxa vara-pericarditis syndrome), other (Langerhans cell histiocytosis bone, chronic recurrent multifocal osteomyelitis, diffuse idiopathic skeletal hyperostosis, pigmented villonodular synovitis)',
  },
  {
    name: 'ophthalmologic',
    target: 50,
    description: 'Ophthalmologic rare diseases including: retinal dystrophies (retinitis pigmentosa, Stargardt disease, Best vitelliform macular dystrophy, cone-rod dystrophy, Leber congenital amaurosis, choroideremia, X-linked retinoschisis, achromatopsia, congenital stationary night blindness, enhanced S-cone syndrome, Bietti crystalline corneoretinal dystrophy), anterior segment (Axenfeld-Rieger syndrome, Peters anomaly, aniridia — PAX6, congenital glaucoma, iridocorneal endothelial syndrome, Fuchs endothelial corneal dystrophy, keratoconus, posterior polymorphous corneal dystrophy, lattice corneal dystrophy, granular corneal dystrophy), optic nerve (Leber hereditary optic neuropathy already in mitochondrial, dominant optic atrophy — Kjer, optic nerve hypoplasia, papilledema from IIH already covered, neuromyelitis optica optic already covered), uveitis (Vogt-Koyanagi-Harada disease, birdshot chorioretinopathy, sympathetic ophthalmia, serpiginous choroiditis, multifocal choroiditis, punctate inner choroidopathy), lens (Marfan ectopia lentis already covered, homocystinuria ectopia lentis already covered, Weill-Marchesani syndrome, microspherophakia), other (retinoblastoma, persistent fetal vasculature, Norrie disease, familial exudative vitreoretinopathy — FEVR, Coats disease, Morning Glory disc anomaly, albinism ocular, ocular motor apraxia — Cogan type)',
  },
  {
    name: 'ent-otolaryngologic',
    target: 40,
    description: 'ENT and otolaryngologic rare diseases including: hearing loss (Connexin 26/GJB2 hearing loss, Pendred syndrome, Usher syndrome types I-III, Waardenburg syndrome, branchio-oto-renal syndrome, CHARGE syndrome hearing aspects, Treacher Collins hearing, enlarged vestibular aqueduct, otosclerosis, auditory neuropathy spectrum disorder, Alport hearing loss, mitochondrial hearing loss — m.1555A>G, Norrie disease hearing), vestibular (superior semicircular canal dehiscence, Meniere disease, bilateral vestibulopathy, vestibular schwannoma/NF2), nasal/sinus (Wegener/GPA nasal already covered, relapsing polychondritis nasal, primary ciliary dyskinesia nasal, hereditary hemorrhagic telangiectasia nasal, nasal NK/T-cell lymphoma, inverting papilloma, olfactory neuroblastoma, Samter triad/AERD), laryngeal (recurrent respiratory papillomatosis, laryngeal amyloidosis, vocal fold paralysis syndromes, subglottic stenosis — idiopathic, GPA-related, post-intubation; spasmodic dysphonia, laryngomalacia, cricoarytenoid arthritis), other (Eagle syndrome/elongated styloid, Rosai-Dorfman of head and neck, IgG4-related sialadenitis, mucocele, ranula, branchial cleft anomalies, thyroglossal duct cyst, cholesteatoma, glomus tumors)',
  },
  {
    name: 'psychiatric-behavioral',
    target: 30,
    description: 'Psychiatric and neurobehavioral rare diseases with genetic or autoimmune basis including: neuropsychiatric genetics (22q11.2-associated psychosis, Huntington psychiatric, Wilson psychiatric, Prader-Willi behavioral, Smith-Magenis behavioral, Angelman behavioral, fragile X tremor-ataxia syndrome — FXTAS, Phelan-McDermid syndrome, ADNP syndrome, Kleefstra syndrome, Rett behavioral), autoimmune psychiatric (PANDAS/PANS, anti-NMDA receptor encephalitis psychiatric, Hashimoto encephalopathy/SREAT, autoimmune psychosis, limbic encephalitis psychiatric, neurosarcoidosis psychiatric, CNS lupus psychiatric), metabolic psychiatric (acute intermittent porphyria already covered psychiatric aspects, homocystinuria psychiatric, cerebrotendinous xanthomatosis, Niemann-Pick C psychiatric, metachromatic leukodystrophy adult psychiatric, adrenoleukodystrophy adult psychiatric, Wilson psychiatric), other (DYRK1A syndrome, SYNGAP1-related disorder, SCN2A-related disorder, KBG syndrome, Mowat-Wilson syndrome, Pitt-Hopkins syndrome, Tatton-Brown-Rahman syndrome, FOXP1 syndrome, STXBP1 encephalopathy, DYRK1A syndrome, catatonia-related genetic syndromes)',
  },
  {
    name: 'multi-system-other',
    target: 76,
    description: 'Multi-system and other rare diseases including: telomere biology (dyskeratosis congenita, Hoyeraal-Hreidarsson syndrome, Revesz syndrome, Coats plus), storage/infiltrative (Erdheim-Chester already covered, Rosai-Dorfman, xanthogranulomatous diseases), vascular malformation syndromes (CLOVES, Klippel-Trenaunay, Parkes Weber, Proteus, Maffucci, Ollier, Kasabach-Merritt), mitochondrial multi-system (Barth syndrome, Alpers syndrome, MNGIE, thiamine-responsive megaloblastic anemia), cancer predisposition (Li-Fraumeni, Lynch syndrome, familial adenomatous polyposis, MYH-associated polyposis, Cowden/PTEN hamartoma, Birt-Hogg-Dube, hereditary paraganglioma-pheochromocytoma, hereditary breast-ovarian — BRCA, hereditary diffuse gastric cancer, Gorlin, retinoblastoma hereditary, multiple endocrine neoplasia already mentioned, Bloom syndrome cancer, Fanconi anemia cancer, ataxia-telangiectasia cancer), premature aging (Werner, Hutchinson-Gilford progeria, Cockayne, Bloom, Rothmund-Thomson), infectious-associated rare (Whipple already covered, chronic Q fever, leprosy, Chagas), environmental/toxic (porphyria cutanea tarda already covered, lead poisoning chronic, Wilson already covered), other multi-system (VATER/VACTERL association, Aicardi-Goutieres syndrome, Singleton-Merten, interferonopathies, STING-associated vasculopathy, SAVI, Nakajo-Nishimura syndrome, CANDLE syndrome already mentioned, TRAPS already mentioned, Schnitzler already mentioned, adult-onset autoinflammatory)',
  },
];

// ===== BODY SYSTEM MAPPING =====
const VALID_BODY_SYSTEMS = [
  'neurological', 'musculoskeletal', 'cardiovascular', 'respiratory',
  'gastrointestinal', 'dermatological', 'ophthalmological', 'endocrine',
  'hematological', 'immunological', 'renal', 'reproductive',
  'psychiatric', 'constitutional', 'otolaryngological',
];

// ===== API HELPERS =====

async function callOpenAI(messages, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const body = {
    model: options.model || MODEL,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens || 4000,
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ===== PHASE 1: DISEASE LIST GENERATION =====

async function generateDiseaseList(existingIds) {
  if (fs.existsSync(DISEASE_LIST_FILE)) {
    console.log('[Phase 1] Disease list already exists. Loading from file...');
    return JSON.parse(fs.readFileSync(DISEASE_LIST_FILE, 'utf-8'));
  }

  console.log('[Phase 1] Generating disease lists per domain...');
  const allDiseases = [];
  const seenIds = new Set(existingIds);

  for (const domain of DOMAINS) {
    // Split large domains into sub-batches of 50 to stay within output limits
    const BATCH_SIZE = 50;
    const numBatches = Math.ceil(domain.target / BATCH_SIZE);
    let domainTotal = 0;

    for (let batch = 0; batch < numBatches; batch++) {
      const batchTarget = Math.min(BATCH_SIZE, domain.target - domainTotal);
      const batchNum = batch + 1;
      console.log(`  [${domain.name}] Batch ${batchNum}/${numBatches}: requesting ${batchTarget} diseases...`);

      // Include already-generated diseases for this domain to avoid duplicates
      const domainExisting = allDiseases.filter(d => d.domain === domain.name).map(d => d.id);
      const allExcluded = [...existingIds, ...domainExisting];

      const prompt = `You are a medical expert. Generate a list of exactly ${batchTarget} rare diseases for the "${domain.name}" medical domain.

CONTEXT: ${domain.description}

DISEASES TO EXCLUDE (already in database or already listed):
${allExcluded.join(', ')}

For each disease provide: "name" (full medical name), "id" (kebab-case, lowercase, hyphens only), "brief" (one sentence).

REQUIREMENTS:
- Do NOT include any disease whose id matches an excluded one above
- Focus on well-documented rare diseases with established diagnostic criteria
- Mix of prevalence: uncommon, rare, ultra-rare
- Mix of onset: pediatric and adult
- Prioritize commonly misdiagnosed conditions and those with long diagnostic delays
- Each disease must be distinct
${batch > 0 ? '- Generate DIFFERENT diseases than the previous batches. Focus on less common conditions.' : ''}

Respond with a JSON object: { "diseases": [ { "name": "...", "id": "...", "brief": "..." }, ... ] }`;

      try {
        const result = await callOpenAI(
          [{ role: 'user', content: prompt }],
          { maxTokens: 8000, temperature: 0.4 + (batch * 0.05), responseFormat: { type: 'json_object' } }
        );

        const parsed = JSON.parse(result);
        // Extract diseases array from various possible formats
        let diseases = parsed.diseases || parsed.list || parsed.data;
        if (!diseases && Array.isArray(parsed)) diseases = parsed;
        if (!diseases) {
          // Try to find any array in the response
          for (const val of Object.values(parsed)) {
            if (Array.isArray(val) && val.length > 0 && val[0].id) {
              diseases = val;
              break;
            }
          }
        }

        if (!Array.isArray(diseases)) {
          console.error(`  [${domain.name}] Batch ${batchNum}: Could not find diseases array in response`);
          continue;
        }

        let batchAdded = 0;
        for (const d of diseases) {
          if (!d.id || !d.name) continue;
          d.id = d.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          if (seenIds.has(d.id)) continue;
          seenIds.add(d.id);
          allDiseases.push({ name: d.name, id: d.id, brief: d.brief || '', domain: domain.name });
          batchAdded++;
        }

        domainTotal += batchAdded;
        console.log(`  [${domain.name}] Batch ${batchNum}: +${batchAdded} diseases (domain total: ${domainTotal}/${domain.target})`);
      } catch (err) {
        console.error(`  [${domain.name}] Batch ${batchNum} error:`, err.message?.substring(0, 200));
      }

      // Brief delay between batches
      if (batch < numBatches - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    console.log(`  [${domain.name}] Complete: ${domainTotal} diseases`);
  }

  // Save the list
  fs.writeFileSync(DISEASE_LIST_FILE, JSON.stringify(allDiseases, null, 2));
  console.log(`[Phase 1] Complete. ${allDiseases.length} diseases saved to ${DISEASE_LIST_FILE}`);
  return allDiseases;
}

// ===== PHASE 2: PROFILE GENERATION =====

const PROFILE_PROMPT_TEMPLATE = `You are a medical expert creating a comprehensive disease profile for a clinical decision support system.

Generate a complete JSON profile for: {{DISEASE_NAME}}
Brief description: {{DISEASE_BRIEF}}

The profile MUST follow this exact JSON schema:

{
  "id": "{{DISEASE_ID}}",
  "name": "Full medical name",
  "aliases": ["Alternative name 1", "Alternative name 2"],
  "icd10Codes": ["X00.0"],
  "omimId": "optional OMIM number or omit",
  "orphanetId": "optional Orphanet number or omit",
  "prevalence": {
    "estimate": "e.g. 1 in 50,000",
    "range": "optional percentage range",
    "classification": "ultra-rare|rare|uncommon|common"
  },
  "demographics": {
    "typicalOnsetAge": { "min": 0, "max": 120, "peak": 30 },
    "sexPredilection": "male|female|equal|slight-female|slight-male",
    "ethnicAssociations": ["optional"]
  },
  "diagnosticCriteria": {
    "formalCriteriaName": "Name of criteria if exists",
    "criteria": [
      { "id": "short-id", "description": "Criterion description", "category": "major|minor|supportive", "requiredForDiagnosis": false }
    ],
    "minimumForDiagnosis": "Description of minimum criteria needed",
    "notes": "optional notes"
  },
  "symptoms": {
    "pathognomonic": [
      { "symptomName": "Descriptive name", "frequency": 0.95, "bodySystem": "one of the valid systems", "notes": "optional" }
    ],
    "common": [
      { "symptomName": "...", "frequency": 0.5-0.9, "bodySystem": "...", "notes": "..." }
    ],
    "occasional": [
      { "symptomName": "...", "frequency": 0.1-0.49, "bodySystem": "...", "notes": "..." }
    ],
    "rare": [
      { "symptomName": "...", "frequency": 0.01-0.09, "bodySystem": "...", "notes": "..." }
    ]
  },
  "systemsAffected": ["list of body systems from valid set"],
  "keyFindings": {
    "laboratory": ["..."],
    "imaging": ["..."],
    "genetic": ["..."],
    "other": ["..."]
  },
  "differentialDiagnoses": [
    { "diseaseId": "kebab-case-id", "distinguishingFeatures": ["..."] }
  ],
  "redFlags": ["Clinical red flag 1", "..."],
  "specialistType": ["Specialist 1", "..."],
  "lastUpdated": "2026-02-17",
  "references": ["Key reference 1", "..."],
  "confidenceInData": "medium"
}

CRITICAL RULES:
1. bodySystem MUST be one of: neurological, musculoskeletal, cardiovascular, respiratory, gastrointestinal, dermatological, ophthalmological, endocrine, hematological, immunological, renal, reproductive, psychiatric, constitutional, otolaryngological
2. Include 1-3 pathognomonic symptoms (frequency 0.7-1.0), 3-6 common (0.5-0.89), 3-6 occasional (0.1-0.49), 2-4 rare (0.01-0.09)
3. Frequency values must be numbers between 0 and 1, NOT percentages
4. classification must be exactly: "ultra-rare", "rare", "uncommon", or "common"
5. sexPredilection must be exactly: "male", "female", "equal", "slight-female", or "slight-male"
6. Include at least 3 diagnostic criteria
7. Include at least 2 differential diagnoses
8. Include at least 3 red flags
9. The id field must be exactly: "{{DISEASE_ID}}"
10. All symptomName values should be medically precise, descriptive terms

Return ONLY the JSON object. No markdown, no explanation.`;

async function generateProfile(disease) {
  const prompt = PROFILE_PROMPT_TEMPLATE
    .replace(/\{\{DISEASE_NAME\}\}/g, disease.name)
    .replace(/\{\{DISEASE_ID\}\}/g, disease.id)
    .replace(/\{\{DISEASE_BRIEF\}\}/g, disease.brief || '');

  const result = await callOpenAI(
    [{ role: 'user', content: prompt }],
    { maxTokens: 4000, temperature: 0.2, responseFormat: { type: 'json_object' } }
  );

  const profile = JSON.parse(result);

  // Enforce the correct ID
  profile.id = disease.id;

  // Basic validation
  validateProfile(profile);

  return profile;
}

function validateProfile(profile) {
  const errors = [];

  if (!profile.id || typeof profile.id !== 'string') errors.push('Missing id');
  if (!profile.name || typeof profile.name !== 'string') errors.push('Missing name');
  if (!profile.prevalence?.classification) errors.push('Missing prevalence.classification');
  if (!['ultra-rare', 'rare', 'uncommon', 'common'].includes(profile.prevalence?.classification)) {
    errors.push(`Invalid prevalence.classification: ${profile.prevalence?.classification}`);
  }
  if (!profile.demographics?.sexPredilection) errors.push('Missing demographics.sexPredilection');
  if (!['male', 'female', 'equal', 'slight-female', 'slight-male'].includes(profile.demographics?.sexPredilection)) {
    errors.push(`Invalid sexPredilection: ${profile.demographics?.sexPredilection}`);
  }
  if (!profile.symptoms) errors.push('Missing symptoms');
  if (!profile.systemsAffected?.length) errors.push('Missing systemsAffected');

  // Map common invalid body systems to valid ones
  const BODY_SYSTEM_ALIASES = {
    'lymphatic': 'immunological',
    'hepatic': 'gastrointestinal',
    'hepatobiliary': 'gastrointestinal',
    'dental': 'musculoskeletal',
    'oral': 'gastrointestinal',
    'integumentary': 'dermatological',
    'otologic': 'otolaryngological',
    'auditory': 'otolaryngological',
    'vestibular': 'otolaryngological',
    'urological': 'renal',
    'urinary': 'renal',
    'genitourinary': 'renal',
    'skeletal': 'musculoskeletal',
    'osseous': 'musculoskeletal',
    'pulmonary': 'respiratory',
    'vascular': 'cardiovascular',
    'ocular': 'ophthalmological',
    'ophthalmologic': 'ophthalmological',
    'neuropsychiatric': 'psychiatric',
    'metabolic': 'endocrine',
    'pancreatic': 'gastrointestinal',
    'splenic': 'hematological',
  };

  function fixBodySystem(sys) {
    if (VALID_BODY_SYSTEMS.includes(sys)) return sys;
    const lower = sys.toLowerCase();
    if (BODY_SYSTEM_ALIASES[lower]) return BODY_SYSTEM_ALIASES[lower];
    // Fuzzy match
    const match = VALID_BODY_SYSTEMS.find(v => v.includes(lower) || lower.includes(v));
    return match || null;
  }

  // Validate body systems
  if (profile.systemsAffected) {
    profile.systemsAffected = profile.systemsAffected
      .map(sys => fixBodySystem(sys))
      .filter(Boolean);
    // Deduplicate
    profile.systemsAffected = [...new Set(profile.systemsAffected)];
    if (profile.systemsAffected.length === 0) {
      errors.push('No valid body systems after mapping');
    }
  }

  // Validate symptom body systems
  for (const tier of ['pathognomonic', 'common', 'occasional', 'rare']) {
    const symptoms = profile.symptoms?.[tier] || [];
    for (const s of symptoms) {
      if (s.bodySystem) {
        const fixed = fixBodySystem(s.bodySystem);
        if (fixed) s.bodySystem = fixed;
      }
      // Ensure frequency is a number
      if (typeof s.frequency !== 'number') {
        s.frequency = parseFloat(s.frequency) || 0.5;
      }
      // Clamp frequency to 0-1
      if (s.frequency > 1) s.frequency = s.frequency / 100;
    }
  }

  // Ensure arrays exist
  if (!Array.isArray(profile.aliases)) profile.aliases = [];
  if (!Array.isArray(profile.icd10Codes)) profile.icd10Codes = [];
  if (!Array.isArray(profile.redFlags)) profile.redFlags = [];
  if (!Array.isArray(profile.specialistType)) profile.specialistType = ['General Internal Medicine'];
  if (!Array.isArray(profile.references)) profile.references = [];
  if (!profile.keyFindings) profile.keyFindings = { laboratory: [], imaging: [], genetic: [], other: [] };
  if (!Array.isArray(profile.differentialDiagnoses)) profile.differentialDiagnoses = [];
  if (!profile.diagnosticCriteria) profile.diagnosticCriteria = { criteria: [] };
  if (!profile.confidenceInData) profile.confidenceInData = 'medium';
  if (!profile.lastUpdated) profile.lastUpdated = '2026-02-17';

  if (errors.length > 0) {
    throw new Error(`Validation errors for ${profile.id}: ${errors.join('; ')}`);
  }
}

async function generateProfilesPhase(diseaseList) {
  console.log(`[Phase 2] Generating profiles for ${diseaseList.length} diseases (${CONCURRENCY} concurrent)...`);

  let completed = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];
  const startTime = Date.now();

  // Load progress
  const progress = fs.existsSync(PROGRESS_FILE)
    ? JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'))
    : { completed: [], failed: [] };

  // Filter to diseases that need processing
  const toProcess = diseaseList.filter(d => {
    const filePath = path.join(DISEASES_DIR, `${d.id}.json`);
    if (fs.existsSync(filePath)) {
      skipped++;
      return false;
    }
    if (progress.completed.includes(d.id)) {
      skipped++;
      return false;
    }
    return true;
  });

  console.log(`  ${skipped} already exist, ${toProcess.length} to generate`);

  // Process in concurrent batches
  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (disease) => {
        try {
          const profile = await generateProfile(disease);
          const filePath = path.join(DISEASES_DIR, `${disease.id}.json`);
          fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
          progress.completed.push(disease.id);
          return { success: true, id: disease.id };
        } catch (err) {
          progress.failed.push({ id: disease.id, error: err.message });
          return { success: false, id: disease.id, error: err.message };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        completed++;
      } else {
        failed++;
        const errorInfo = result.status === 'fulfilled' ? result.value : { id: 'unknown', error: result.reason?.message };
        errors.push(errorInfo);
      }
    }

    // Save progress periodically
    if ((i + CONCURRENCY) % 50 === 0 || i + CONCURRENCY >= toProcess.length) {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const total = completed + skipped + failed;
    const rate = completed > 0 ? (completed / ((Date.now() - startTime) / 1000)).toFixed(1) : '0';
    const remaining = toProcess.length - (completed + failed);
    const eta = rate > 0 ? (remaining / parseFloat(rate) / 60).toFixed(1) : '?';
    console.log(`  Progress: ${total}/${diseaseList.length} (${completed} new, ${skipped} skipped, ${failed} failed) | ${rate}/s | ETA: ${eta}min`);
  }

  // Save final progress
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

  console.log(`[Phase 2] Complete.`);
  console.log(`  Generated: ${completed}`);
  console.log(`  Skipped (existing): ${skipped}`);
  console.log(`  Failed: ${failed}`);

  if (errors.length > 0) {
    console.log(`  Errors:`);
    for (const err of errors.slice(0, 20)) {
      console.log(`    - ${err.id}: ${err.error?.substring(0, 100)}`);
    }
    if (errors.length > 20) console.log(`    ... and ${errors.length - 20} more`);
  }

  return { completed, skipped, failed };
}

// ===== MAIN =====

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable required');
    process.exit(1);
  }

  console.log('=== SecondLook Knowledge Base Expansion ===\n');

  // Get existing disease IDs
  const existingFiles = fs.readdirSync(DISEASES_DIR).filter(f => f.endsWith('.json'));
  const existingIds = existingFiles.map(f => f.replace('.json', ''));
  console.log(`Existing diseases: ${existingIds.length}`);

  const totalTarget = DOMAINS.reduce((sum, d) => sum + d.target, 0);
  console.log(`Target new diseases: ${totalTarget}`);
  console.log(`Target total: ~${existingIds.length + totalTarget}\n`);

  // Phase 1: Generate disease lists
  const diseaseList = await generateDiseaseList(existingIds);
  console.log(`\nDisease list: ${diseaseList.length} diseases across ${DOMAINS.length} domains\n`);

  // Phase 2: Generate profiles
  const stats = await generateProfilesPhase(diseaseList);

  // Phase 3: Summary
  const finalCount = fs.readdirSync(DISEASES_DIR).filter(f => f.endsWith('.json')).length;
  console.log(`\n=== Summary ===`);
  console.log(`Total disease profiles: ${finalCount}`);
  console.log(`New profiles generated: ${stats.completed}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`\nNext step: Run 'node scripts/embed-diseases.js' to generate embeddings`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
