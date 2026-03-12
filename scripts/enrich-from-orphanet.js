#!/usr/bin/env node

/**
 * Enrich KB disease profiles with curated Orphanet data.
 *
 * Processes 4 Orphanet XML datasets in order:
 *   1. HPO Phenotype annotations  → replaces symptom arrays with curated data
 *   2. Natural history            → updates onset ages and adds inheritance info
 *   3. Epidemiology               → updates prevalence classifications
 *   4. Gene associations          → updates genetic findings
 *
 * Matches KB profiles to Orphanet by orphanetId field (ORPHAcode).
 *
 * Data files should be pre-downloaded to scripts/orphanet-data/:
 *   curl -o scripts/orphanet-data/en_product4.xml https://www.orphadata.com/data/xml/en_product4.xml
 *   curl -o scripts/orphanet-data/en_product9_ages.xml https://www.orphadata.com/data/xml/en_product9_ages.xml
 *   curl -o scripts/orphanet-data/en_product9_prev.xml https://www.orphadata.com/data/xml/en_product9_prev.xml
 *   curl -o scripts/orphanet-data/en_product6.xml https://www.orphadata.com/data/xml/en_product6.xml
 *
 * Usage: node scripts/enrich-from-orphanet.js [--dry-run] [--pass phenotypes|history|epidemiology|genes]
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// --- Paths ---
const ORPHANET_DIR = path.join(__dirname, 'orphanet-data');
const DISEASES_DIR = path.join(__dirname, '..', 'lib', 'knowledge', 'diseases');

const FILES = {
  phenotypes: path.join(ORPHANET_DIR, 'en_product4.xml'),
  history: path.join(ORPHANET_DIR, 'en_product9_ages.xml'),
  epidemiology: path.join(ORPHANET_DIR, 'en_product9_prev.xml'),
  genes: path.join(ORPHANET_DIR, 'en_product6.xml'),
};

// --- CLI args ---
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const passFilter = args.includes('--pass') ? args[args.indexOf('--pass') + 1] : null;

// --- HPO Frequency → Tier/Frequency mapping ---
const FREQUENCY_MAP = {
  'Obligate (100%)':        { tier: 'pathognomonic', freq: 1.0 },
  'Very frequent (99-80%)': { tier: 'pathognomonic', freqMid: 0.90 },
  'Frequent (79-30%)':      { tier: 'common',       freqMid: 0.55 },
  'Occasional (29-5%)':     { tier: 'occasional',   freqMid: 0.17 },
  'Very rare (<4-1%)':      { tier: 'rare',         freqMid: 0.03 },
  'Excluded (0%)':          null, // skip
};

// --- Onset age mapping (Orphanet category → min/max years) ---
const ONSET_MAP = {
  'Antenatal':  { min: 0, max: 0 },
  'Neonatal':   { min: 0, max: 0.08 },
  'Infancy':    { min: 0, max: 2 },
  'Childhood':  { min: 2, max: 12 },
  'Adolescent': { min: 10, max: 18 },
  'Adult':      { min: 18, max: 65 },
  'Elderly':    { min: 60, max: 120 },
  'All ages':   { min: 0, max: 120 },
};

// --- Prevalence class → our classification ---
const PREVALENCE_MAP = {
  '>1 / 1000':        { classification: 'common',    estimate: 'Greater than 1 in 1,000' },
  '6-9 / 10 000':     { classification: 'uncommon',  estimate: '6-9 in 10,000' },
  '1-5 / 10 000':     { classification: 'uncommon',  estimate: '1-5 in 10,000' },
  '1-9 / 100 000':    { classification: 'rare',      estimate: '1-9 in 100,000' },
  '1-9 / 1 000 000':  { classification: 'rare',      estimate: '1-9 in 1,000,000' },
  '<1 / 1 000 000':   { classification: 'ultra-rare', estimate: 'Less than 1 in 1,000,000' },
};

// --- HPO term → body system keyword mapping ---
// Order matters: more specific patterns first
const BODY_SYSTEM_PATTERNS = [
  // Ophthalmological
  { system: 'ophthalmological', patterns: [
    /\beye\b/i, /\bocular\b/i, /\boptic\b/i, /\bretina/i, /\bvisual\b/i, /\bvisio?n\b/i,
    /\bcataract/i, /\bglaucoma/i, /\bmyopia/i, /\bcornea/i, /\blens\b/i, /\biris\b/i,
    /\bmacul/i, /\bophthalmo/i, /\bblindness/i, /\bstrabismus/i, /\bnystagmus/i,
    /\bcoloboma/i, /\banophthal/i, /\bmicrophthal/i, /\bproptosis/i, /\bblephar/i,
    /\bpapill/i, /\bfundus/i, /\bphotophob/i, /\bkeratitis/i, /\bkeratoconus/i,
    /\banteriorsegment/i, /\bvitreo/i, /\bchorioretinal/i, /\bchoro?idal/i,
    /\bscler/i, /\bpterygium/i, /\bexophthalm/i, /\benophthalm/i, /\boculomotor/i,
    /\boptic.?nerve/i, /\boptic.?disc/i, /\boptic.?atrophy/i, /\bretin/i,
    /\bconjunctiv/i, /\blacrimal/i, /\bdacry/i, /\bectropion/i, /\bentropion/i,
    /\bhyperopia/i, /\bastigmatism/i, /\bamblyopia/i, /\banisocoria/i,
    /\bptosis/i, /\bpalpebral/i, /\btelecanthus/i,
  ]},
  // Otolaryngological
  { system: 'otolaryngological', patterns: [
    /\bhearing\b/i, /\bdeaf/i, /\botitis/i, /\bear\b/i, /\baural\b/i,
    /\btinnitus/i, /\bvertigo\b/i, /\bcochle/i, /\bvestibul/i, /\blaryn/i,
    /\bpharyn/i, /\bsinusitis/i, /\brhinitis/i, /\bseptum/i, /\bnasal.?polyp/i,
    /\banosmia/i, /\bhoarseness/i, /\bstridor/i, /\bsubglottic/i, /\bpreauricul/i,
    /\bmicrotia/i, /\banotia/i, /\bsensorineural/i, /\bconductive.?hearing/i,
  ]},
  // Psychiatric
  { system: 'psychiatric', patterns: [
    /\bpsych/i, /\banxiety\b/i, /\bdepression\b/i, /\bautis/i, /\bADHD/i,
    /\bhallucination/i, /\bdelusion/i, /\bschizophren/i, /\bbipolar\b/i,
    /\bcompulsive\b/i, /\bOCD\b/i, /\baggress/i, /\bself.?injur/i,
    /\bself.?harm/i, /\bself.?mutilat/i, /\bphobia/i,
    /\battention.?deficit/i, /\batypical.?behavior/i, /\bbehavior.?abnorm/i,
    /\bbehavioral/i, /\birritabil/i, /\bstereotyp/i,
  ]},
  // Neurological
  { system: 'neurological', patterns: [
    /\bseizure/i, /\bepilepsy/i, /\bepileptic/i, /\bataxia/i, /\bbrain\b/i,
    /\bcerebr/i, /\bneuro(?!penia)/i, /\bspastic/i, /\bparesis/i, /\bparalys/i,
    /\btremor/i, /\bneuropath/i, /\bcogniti/i, /\bintellectual/i, /\bmental.?retard/i,
    /\bencephalop/i, /\bhydrocephalus/i, /\bmegalencephaly/i, /\bmicrocephaly/i,
    /\bmacrocephaly/i, /\bcortical/i, /\bdementia/i, /\bmyelopathy/i,
    /\bdysarthria/i, /\bapraxia/i, /\bdyspraxia/i, /\baphasia/i, /\bagnosia/i,
    /\bchorea/i, /\bdystonia/i, /\bmyoclonus/i, /\bheadache/i, /\bmigraine/i,
    /\bhypertoni/i, /\bhypotoni/i, /\bhyperreflex/i, /\bhyporeflex/i,
    /\bareflex/i, /\bdysmetria/i, /\bbasal.?ganglia/i, /\bwhite.?matter/i,
    /\bgait\b/i, /\bbabinski/i, /\bcorpus.?callosum/i, /\bfloppy/i,
    /\bregression/i, /\bEEG\b/i, /\bpyramidal/i, /\binability.?to.?walk/i,
    /\bChiari/i, /\bsleep.?abnorm/i, /\bsleep.?disturb/i,
    /\babsent.?speech/i, /\bspeech.?impair/i, /\bvocalizat/i,
    /\bleukodystrophy/i, /\bleukoencephalopath/i, /\bcerebell/i,
    /\bdysdiadochokinesi/i, /\bmyelin/i, /\bventriculomeg/i,
    /\bdelayed.?(?:development|milestone|motor|speech|language|psychomotor)/i,
    /\bdevelopmental.?delay/i, /\bglobal.?delay/i, /\bpsychomotor.?delay/i,
    /\bpsychomotor.?retard/i, /\blearning.?disab/i, /\babsent.?speech/i,
    /\bspeech.?delay/i, /\blanguage.?delay/i, /\bmotor.?delay/i,
    /\bcranial.?nerve/i, /\bperipheral.?nerve/i, /\bdyskinesi/i,
    /\bparkinsonism/i, /\bbradykinesi/i, /\brigidity/i,
    /\bspinal.?cord/i, /\bsynaptopathy/i, /\bchannelop/i,
  ]},
  // Cardiovascular
  { system: 'cardiovascular', patterns: [
    /\bcardiac/i, /\bheart\b/i, /\barrhythm/i, /\bcardiom/i,
    /\bvalv/i, /\baort/i, /\bcardio(?!megaly)/i, /\bpericardi/i,
    /\bhypertension\b/i, /\bventricular\b/i, /\batrial\b/i, /\bvasculiti/i,
    /\baneurysm/i, /\bthrombosis/i, /\bembolism/i, /\bcoronary/i,
    /\bmyocardi/i, /\bcongenit.?heart/i, /\bseptal.?defect/i,
    /\bstenosis(?!.*(renal|spinal|pyloric|laryngeal|subglottic|bronchial|esophageal))/i,
    /\bregurgitation/i, /\bprolapse/i, /\btachycardia/i, /\bbradycardia/i,
    /\bWolff.?Parkinson/i, /\blong.?QT/i, /\bBrugada/i,
    /\bdilat.+cardiomyopath/i, /\bhypertrophic.?cardiom/i,
    /\bpatent.?ductus/i, /\bfallot/i, /\bEbstein/i, /\btetralog/i,
    /\bRaynaud/i, /\bvascular/i, /\barteri/i,
  ]},
  // Respiratory
  { system: 'respiratory', patterns: [
    /\bpulmonar/i, /\blung\b/i, /\brespir/i, /\bpneumo/i, /\bbronch/i,
    /\basthma/i, /\bdyspnea/i, /\bbreath/i, /\btracheo/i, /\btracheal/i,
    /\bapnea/i, /\bpleural/i, /\bcystic.?fibrosis/i, /\binterstitial.?lung/i,
    /\bpulmonary.?hypertension/i, /\bpulmonary.?fibrosis/i,
  ]},
  // Gastrointestinal
  { system: 'gastrointestinal', patterns: [
    /\bgastro/i, /\bintestin/i, /\bdigest/i, /\bhepat/i, /\bliver\b/i,
    /\bpancrea/i, /\besophag/i, /\bstomach/i, /\bcolon\b/i, /\bcolonic/i,
    /\brectal\b/i, /\banal\b/i, /\bbiliar/i, /\bgallbladder/i,
    /\bcholangi/i, /\bcholecyst/i, /\bdysphagia/i, /\bnausea/i, /\bvomit/i,
    /\bdiarrhea/i, /\bconstipation/i, /\babdomin/i, /\bperiton/i,
    /\bcirrhosis/i, /\bjaundice/i, /\bicteru/i, /\bascites/i,
    /\bsplenom/i, /\bsplenomeg/i, /\bspleen\b/i, /\bhepatom/i,
    /\bduoden/i, /\bjejun/i, /\bileum/i, /\bileal/i, /\bcecal/i,
    /\bappendic/i, /\batresia(?!.*(aural|choanal|ear|iris|pupil))/i,
    /\bHirschsprung/i, /\bfeed.?difficult/i, /\bfailure.?to.?thrive/i,
    /\bmalabsorption/i, /\bceliac/i, /\benteropathy/i,
    /\bgastroesophag/i, /\breflux\b/i, /\bpyloric/i,
    /\bhernia\b/i, /\binguinal/i, /\bumbilical/i, /\bdiaphragmatic/i,
  ]},
  // Dermatological
  { system: 'dermatological', patterns: [
    /\bskin\b/i, /\bcutaneous/i, /\bdermat/i, /\brush\b/i, /\berythem/i,
    /\beczema/i, /\bpsoriasis/i, /\burticaria/i, /\bpruritus/i, /\bitch/i,
    /\balopecia/i, /\bhyperpigment/i, /\bhypopigment/i, /\bvitiligo/i,
    /\bichthyos/i, /\bhyperkerato/i, /\bkeratoderm/i, /\bnail\b/i,
    /\bhair\b/i, /\bhirsutism/i, /\bhypertrichosis/i, /\bbullous/i,
    /\bvesicul/i, /\bblister/i, /\bulcer/i, /\bwound/i, /\bscar/i,
    /\bkeloid/i, /\bhemangioma/i, /\bnevus/i, /\bcafe.?au.?lait/i,
    /\blentigines/i, /\bxanthoma/i, /\bphotosensitiv/i,
    /\bepidermolysis/i, /\bcutis.?laxa/i, /\bhyperelas/i,
    /\bdry.?skin/i, /\bxerosis/i, /\bpalmoplantar/i,
    /\bsubcutaneous/i, /\blipoma/i,
  ]},
  // Musculoskeletal
  { system: 'musculoskeletal', patterns: [
    /\bskeletal/i, /\bbone\b/i, /\bjoint\b/i, /\barthri/i, /\bmuscu/i,
    /\bosteo/i, /\bfracture/i, /\bscolios/i, /\bkyphos/i, /\blordos/i,
    /\bcontractur/i, /\bmyopath/i, /\bmuscle\b/i, /\bmuscular/i,
    /\bweakness/i, /\batrophy/i, /\bdysplasia(?!.*(broncho|ectoderm|fibrous|renal|hip))/i,
    /\bshort.?stature/i, /\btall.?stature/i, /\bovergrowth/i,
    /\bdwarfism/i, /\blimb\b/i, /\brhizomelic/i, /\bmesomelic/i,
    /\bacromelic/i, /\bcraniosyn/i, /\bsynostosis/i, /\bsyndactyl/i,
    /\bpolydactyl/i, /\bbrachydactyl/i, /\barachnodactyl/i,
    /\bclinodactyl/i, /\bcamptodactyl/i, /\bectrodactyl/i,
    /\bclub\s?foot/i, /\btalipes/i, /\bpes.?(?:planus|cavus)/i,
    /\bgenu.?(?:valgum|varum)/i, /\barthrogrypos/i, /\bfibromyalg/i,
    /\btendon/i, /\bligament/i, /\bcartilage/i, /\bmeniscus/i,
    /\bcramp/i, /\bmyalgia/i, /\barthralgia/i, /\bpatellar/i,
    /\bhip.?dys/i, /\bvertebral/i, /\bspinal(?!.?cord)/i,
    /\bcraniosynost/i, /\bosteoporos/i, /\bosteopenia/i,
    /\bfibula/i, /\btibia/i, /\bfemur/i, /\bhumerus/i, /\bradius/i, /\bulna/i,
    /\bscoliosis/i, /\bhypermobil/i, /\bhyperextens/i,
    /\brhabdomyolysis/i, /\bmyotoni/i,
    /\bpectus/i, /\brib\b/i, /\bfunnel.?chest/i, /\bpigeon.?chest/i,
  ]},
  // Endocrine
  { system: 'endocrine', patterns: [
    /\bendocrin/i, /\bthyroid/i, /\badrenal/i, /\bpituitary/i,
    /\bhormone/i, /\bdiabetes/i, /\binsulin/i, /\bhypoglycem/i,
    /\bhyperglycem/i, /\bgrowth.?hormone/i, /\bcushings?/i,
    /\baddisons?/i, /\bhyperaldosteron/i, /\bpheochromocytoma/i,
    /\bparathyroid/i, /\bhypocalc/i, /\bhypercalc/i,
    /\bprecocious.?puberty/i, /\bdelayed.?puberty/i,
    /\bhypogonad/i, /\bamenorrhea/i, /\bgynecomastia/i,
    /\bhyperparathyroid/i, /\bhypoparathyroid/i,
    /\bhyperthyroid/i, /\bhypothyroid/i, /\bgoiter/i, /\bgoitre/i,
    /\bobesity/i, /\bobes\b/i,
  ]},
  // Hematological
  { system: 'hematological', patterns: [
    /\bhemat/i, /\bblood\b/i, /\banemia/i, /\banaemia/i, /\bleuk(?!odystro)/i,
    /\bthrombocyto/i, /\bplatel/i, /\bneutrop/i, /\bpancytop/i,
    /\bcoagul/i, /\bhemophilia/i, /\bbleeding/i, /\bhemorrhag/i,
    /\bpurpura/i, /\bpetechia/i, /\bbone.?marrow/i, /\berythrocyt/i,
    /\breticulocyt/i, /\bhemoglobin/i, /\bhemolyt/i, /\bsickle/i,
    /\bthalassem/i, /\bspherocy/i, /\belliptocy/i, /\bpolycythem/i,
    /\bmyelodysplas/i, /\bmyeloprolifer/i, /\blymphocyt/i,
    /\beosinophil/i, /\bbasophil/i, /\bmonocyt/i, /\bgranulocyt/i,
    /\bmacrocyt/i, /\bmicrocyt/i, /\biron.?deficiency/i,
    /\bhypercoag/i, /\bthrombophil/i, /\bdisseminated.?intravascular/i,
    /\bsplenomegaly/i, /\bcreatine.?kinase/i, /\bCPK\b/i, /\bCK\b/i,
  ]},
  // Immunological
  { system: 'immunological', patterns: [
    /\bimmun/i, /\bautoimmun/i, /\ballerg/i, /\banaphylax/i,
    /\bimmunodeficien/i, /\blymphoproliferati/i, /\binflammato/i,
    /\bvasculitis/i, /\blupus/i, /\brheumatoid/i, /\bcomplement/i,
    /\bantibod/i, /\bimmunoglobulin/i, /\bcytokine/i,
    /\brecurrent.?infect/i, /\brecurrent.?respir/i,
    /\blymphadenopath/i, /\blymph.?node/i,
  ]},
  // Renal
  { system: 'renal', patterns: [
    /\brenal/i, /\bkidney/i, /\bnephro/i, /\burinar/i, /\bureteral/i,
    /\bureter\b/i, /\burethral/i, /\burethra\b/i, /\bbladder\b/i,
    /\bproteinuria/i, /\bhematuria/i, /\bglomerul/i, /\btubul/i,
    /\bhydronephros/i, /\bnephrocalcinos/i, /\bpolycystic.?kidney/i,
    /\brenal.?agenesis/i, /\brenal.?cyst/i, /\burolithiasis/i,
    /\bnephrolithiasis/i, /\brenal.?tubular/i, /\bchronic.?kidney/i,
    /\brenal.?insufficiency/i, /\brenal.?failure/i,
  ]},
  // Reproductive
  { system: 'reproductive', patterns: [
    /\breproductiv/i, /\bovari/i, /\btesticul/i, /\bgonad/i,
    /\buterin/i, /\buterus/i, /\bcervical/i, /\bvaginal/i,
    /\bmenstrual/i, /\binfertil/i, /\bgenital/i, /\bcryptorchid/i,
    /\bhypospadias/i, /\bepispadia/i, /\bclitoral/i, /\bphallo/i,
    /\bsexual.?develop/i, /\bambiguous.?genitalia/i,
    /\bmicropenis/i, /\bazoosperm/i, /\boligosperm/i,
    /\bpregnancy/i, /\bfetal/i, /\bplacent/i,
    /\bhypoplasia.?of.?penis/i, /\bsmall.?penis/i,
  ]},
  // Constitutional (catch-all for growth, facial dysmorphism, general)
  { system: 'constitutional', patterns: [
    /\bfacial/i, /\bdysmorphi/i, /\bgrowth\b/i, /\bfailure.?to.?thrive/i,
    /\bshort.?stature/i, /\btall.?stature/i, /\bovergrowth/i,
    /\bfatigue/i, /\bfever/i, /\bmalaise/i, /\bweight/i,
    /\bcachexia/i, /\banorexi/i, /\bfeeding/i, /\bswallow/i,
    /\bcraniofacial/i, /\bcleft/i, /\bmicrognath/i, /\bretrogn/i,
    /\bprogn/i, /\bhypertelori/i, /\bhypotelori/i, /\bsynophrys/i,
    /\bbroad.?nose/i, /\bflat.?nose/i, /\bepicanthus/i, /\bepicanthal/i,
    /\blow.?set.?ear/i, /\bhigh.?palate/i, /\bcleft.?palate/i,
    /\bcleft.?lip/i, /\bbroad.?forehead/i, /\bfrontal.?bossing/i,
    /\blong.?face/i, /\broad.?face/i, /\bflat.?face/i,
    /\bmidface/i, /\bmalar.?hypoplasia/i, /\bmandibular/i,
    /\bprominent.?ear/i, /\bdysmorph/i, /\bcongenital/i,
    /\bmultisystem/i, /\blethargy/i,
  ]},
];

// --- Helpers ---

function getTextValue(node) {
  if (!node) return null;
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node['#text'] !== undefined) return String(node['#text']);
  return null;
}

function normalizeOrphaCode(id) {
  if (!id) return null;
  const s = String(id).trim();
  // Handle "ORPHA:284", "ORPHA284", "284"
  const match = s.match(/(\d+)/);
  return match ? match[1] : null;
}

function ensureArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function mapToBodySystem(hpoTerm) {
  const text = hpoTerm || '';
  for (const { system, patterns } of BODY_SYSTEM_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return system;
    }
  }
  return 'constitutional'; // default fallback
}

function parseXML(filePath) {
  console.log(`  Parsing ${path.basename(filePath)} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)} MB)...`);
  const xml = fs.readFileSync(filePath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => {
      // Force these to always be arrays even with count=1
      return [
        'HPODisorderSetStatus', 'HPODisorderAssociation',
        'Disorder', 'Prevalence', 'DisorderGeneAssociation',
        'AverageAgeOfOnset', 'TypeOfInheritance',
      ].includes(name);
    },
  });
  return parser.parse(xml);
}

// --- Load KB profiles indexed by ORPHAcode ---

function loadKBProfiles() {
  console.log('\nLoading KB profiles...');
  const files = fs.readdirSync(DISEASES_DIR).filter(f => f.endsWith('.json'));
  const byOrpha = new Map(); // orphaCode → { profile, filePath }
  let noOrpha = 0;

  for (const file of files) {
    const filePath = path.join(DISEASES_DIR, file);
    try {
      const profile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const code = normalizeOrphaCode(profile.orphanetId);
      if (code) {
        byOrpha.set(code, { profile, filePath });
      } else {
        noOrpha++;
      }
    } catch (err) {
      console.warn(`  Warning: Failed to parse ${file}: ${err.message}`);
    }
  }

  console.log(`  Loaded ${files.length} profiles, ${byOrpha.size} with orphanetId, ${noOrpha} without`);
  return byOrpha;
}

// =====================================================
// Pass 1: HPO Phenotype Annotations → Symptom Profiles
// =====================================================

function enrichPhenotypes(kbProfiles) {
  console.log('\n=== Pass 1: HPO Phenotype Annotations ===');
  if (!fs.existsSync(FILES.phenotypes)) {
    console.log('  SKIPPED: en_product4.xml not found');
    return 0;
  }

  const data = parseXML(FILES.phenotypes);
  const entries = ensureArray(
    data.JDBOR?.HPODisorderSetStatusList?.HPODisorderSetStatus
  );
  console.log(`  Found ${entries.length} Orphanet disorders with HPO annotations`);

  let matched = 0;
  let skipped = 0;

  for (const entry of entries) {
    // Disorder may be wrapped in array by parser
    const disorder = Array.isArray(entry.Disorder) ? entry.Disorder[0] : entry.Disorder;
    if (!disorder) continue;
    const orphaCode = String(disorder.OrphaCode);
    const kbEntry = kbProfiles.get(orphaCode);
    if (!kbEntry) { skipped++; continue; }

    const associations = ensureArray(
      disorder.HPODisorderAssociationList?.HPODisorderAssociation
    );
    if (associations.length === 0) continue;

    // Build new symptom arrays
    const symptoms = {
      pathognomonic: [],
      common: [],
      occasional: [],
      rare: [],
    };

    const systemsUsed = new Set();

    for (const assoc of associations) {
      const hpoTerm = getTextValue(assoc.HPO?.HPOTerm);
      const hpoId = getTextValue(assoc.HPO?.HPOId);
      const freqName = getTextValue(assoc.HPOFrequency?.Name);

      if (!hpoTerm || !freqName) continue;

      const freqMapping = FREQUENCY_MAP[freqName];
      if (freqMapping === null) continue; // Excluded
      if (!freqMapping) continue; // Unknown frequency

      const bodySystem = mapToBodySystem(hpoTerm);
      systemsUsed.add(bodySystem);

      const symptom = {
        symptomName: hpoTerm,
        frequency: freqMapping.freq || freqMapping.freqMid,
        bodySystem,
      };

      symptoms[freqMapping.tier].push(symptom);
    }

    // Only replace if we got meaningful data (at least 3 symptoms)
    if (symptoms.pathognomonic.length + symptoms.common.length +
        symptoms.occasional.length + symptoms.rare.length < 3) {
      continue;
    }

    // Sort each tier by frequency descending
    for (const tier of Object.values(symptoms)) {
      tier.sort((a, b) => b.frequency - a.frequency);
    }

    kbEntry.profile.symptoms = symptoms;

    // Update systemsAffected from actual symptoms
    if (systemsUsed.size > 0) {
      kbEntry.profile.systemsAffected = [...systemsUsed];
    }

    kbEntry.profile.confidenceInData = 'medium';
    kbEntry.dirty = true;
    matched++;
  }

  console.log(`  Enriched: ${matched} profiles | No KB match: ${skipped}`);
  return matched;
}

// =====================================================
// Pass 2: Natural History → Onset Ages + Inheritance
// =====================================================

function enrichNaturalHistory(kbProfiles) {
  console.log('\n=== Pass 2: Natural History (Onset + Inheritance) ===');
  if (!fs.existsSync(FILES.history)) {
    console.log('  SKIPPED: en_product9_ages.xml not found');
    return 0;
  }

  const data = parseXML(FILES.history);
  const disorders = ensureArray(data.JDBOR?.DisorderList?.Disorder);
  console.log(`  Found ${disorders.length} Orphanet disorders with natural history`);

  let matched = 0;
  let skipped = 0;

  for (const disorder of disorders) {
    const orphaCode = String(disorder.OrphaCode);
    const kbEntry = kbProfiles.get(orphaCode);
    if (!kbEntry) { skipped++; continue; }

    // Age of onset
    const onsets = ensureArray(disorder.AverageAgeOfOnsetList?.AverageAgeOfOnset);
    const validOnsets = [];
    for (const onset of onsets) {
      const name = getTextValue(onset.Name);
      if (name && ONSET_MAP[name]) {
        validOnsets.push(ONSET_MAP[name]);
      }
    }

    if (validOnsets.length > 0) {
      const minAge = Math.min(...validOnsets.map(o => o.min));
      const maxAge = Math.max(...validOnsets.map(o => o.max));
      // Compute peak as midpoint of the first (most typical) onset category
      const peakAge = Math.round((validOnsets[0].min + validOnsets[0].max) / 2);

      kbEntry.profile.demographics.typicalOnsetAge = {
        min: minAge,
        max: maxAge,
        peak: Math.min(peakAge, maxAge),
      };
      kbEntry.dirty = true;
      matched++;
    }

    // Inheritance patterns → keyFindings.genetic
    const inheritances = ensureArray(disorder.TypeOfInheritanceList?.TypeOfInheritance);
    const inheritanceNames = [];
    for (const inh of inheritances) {
      const name = getTextValue(inh.Name);
      if (name && name !== 'Not applicable' && name !== 'Unknown' &&
          name !== 'No data available' && name !== 'Not yet documented') {
        inheritanceNames.push(`${name} inheritance`);
      }
    }

    if (inheritanceNames.length > 0) {
      const existing = kbEntry.profile.keyFindings.genetic || [];
      // Add inheritance info if not already present
      const existingLower = existing.map(s => s.toLowerCase());
      for (const inh of inheritanceNames) {
        if (!existingLower.some(e => e.includes(inh.toLowerCase().replace(' inheritance', '')))) {
          existing.push(inh);
        }
      }
      kbEntry.profile.keyFindings.genetic = existing;
      kbEntry.dirty = true;
    }
  }

  console.log(`  Enriched: ${matched} profiles | No KB match: ${skipped}`);
  return matched;
}

// =====================================================
// Pass 3: Epidemiology → Prevalence
// =====================================================

function enrichEpidemiology(kbProfiles) {
  console.log('\n=== Pass 3: Epidemiology (Prevalence) ===');
  if (!fs.existsSync(FILES.epidemiology)) {
    console.log('  SKIPPED: en_product9_prev.xml not found');
    return 0;
  }

  const data = parseXML(FILES.epidemiology);
  const disorders = ensureArray(data.JDBOR?.DisorderList?.Disorder);
  console.log(`  Found ${disorders.length} Orphanet disorders with epidemiology data`);

  let matched = 0;
  let skipped = 0;

  for (const disorder of disorders) {
    const orphaCode = String(disorder.OrphaCode);
    const kbEntry = kbProfiles.get(orphaCode);
    if (!kbEntry) { skipped++; continue; }

    const prevalences = ensureArray(disorder.PrevalenceList?.Prevalence);

    // Find the best prevalence entry:
    // Prefer "Point prevalence" > "Prevalence at birth" > "Lifetime Prevalence" > others
    // Prefer "Worldwide" geographic scope
    // Must have a PrevalenceClass
    let bestPrev = null;
    let bestScore = -1;

    for (const prev of prevalences) {
      const type = getTextValue(prev.PrevalenceType?.Name);
      const cls = getTextValue(prev.PrevalenceClass?.Name);
      const geo = getTextValue(prev.PrevalenceGeographic?.Name);

      if (!cls || cls === 'Unknown' || cls === 'Not yet documented') continue;

      let score = 0;
      if (type === 'Point prevalence') score += 10;
      else if (type === 'Prevalence at birth') score += 8;
      else if (type === 'Lifetime Prevalence') score += 6;
      else if (type === 'Annual incidence') score += 4;
      else score += 2; // Cases/families

      if (geo === 'Worldwide') score += 5;
      else if (geo === 'Europe') score += 3;

      if (score > bestScore) {
        bestScore = score;
        bestPrev = { type, cls, geo };
      }
    }

    if (bestPrev && PREVALENCE_MAP[bestPrev.cls]) {
      const mapping = PREVALENCE_MAP[bestPrev.cls];
      kbEntry.profile.prevalence = {
        estimate: mapping.estimate,
        range: bestPrev.cls,
        classification: mapping.classification,
      };
      kbEntry.dirty = true;
      matched++;
    }
  }

  console.log(`  Enriched: ${matched} profiles | No KB match: ${skipped}`);
  return matched;
}

// =====================================================
// Pass 4: Gene Associations
// =====================================================

function enrichGenes(kbProfiles) {
  console.log('\n=== Pass 4: Gene Associations ===');
  if (!fs.existsSync(FILES.genes)) {
    console.log('  SKIPPED: en_product6.xml not found');
    return 0;
  }

  const data = parseXML(FILES.genes);
  const disorders = ensureArray(data.JDBOR?.DisorderList?.Disorder);
  console.log(`  Found ${disorders.length} Orphanet disorders with gene data`);

  let matched = 0;
  let skipped = 0;

  // Map verbose relationship types to concise labels
  const REL_SHORT = {
    'Disease-causing germline mutation(s) in': 'causative',
    'Disease-causing germline mutation(s) (loss of function) in': 'causative, loss-of-function',
    'Disease-causing germline mutation(s) (gain of function) in': 'causative, gain-of-function',
    'Disease-causing somatic mutation(s) in': 'somatic',
    'Major susceptibility factor in': 'susceptibility',
    'Modifying germline mutation in': 'modifier',
    'Role in the phenotype of': 'phenotype modifier',
    'Part of a fusion gene in': 'fusion gene',
    'Candidate gene tested in': 'candidate',
    'Biomarker tested in': 'biomarker',
  };

  for (const disorder of disorders) {
    const orphaCode = String(disorder.OrphaCode);
    const kbEntry = kbProfiles.get(orphaCode);
    if (!kbEntry) { skipped++; continue; }

    const genes = ensureArray(
      disorder.DisorderGeneAssociationList?.DisorderGeneAssociation
    );
    if (genes.length === 0) continue;

    const geneEntries = [];
    for (const gene of genes) {
      const symbol = getTextValue(gene.Gene?.Symbol);
      const relType = getTextValue(gene.DisorderGeneAssociationType?.Name);
      const status = getTextValue(gene.DisorderGeneAssociationStatus?.Name);

      if (!symbol) continue;

      const shortRel = REL_SHORT[relType] || relType || 'associated';
      geneEntries.push(`${symbol} (${shortRel})`);
    }

    if (geneEntries.length > 0) {
      // Preserve any inheritance info that was added in pass 2
      const existing = kbEntry.profile.keyFindings.genetic || [];
      const inheritanceEntries = existing.filter(e =>
        e.toLowerCase().includes('inheritance') ||
        e.toLowerCase().includes('autosomal') ||
        e.toLowerCase().includes('x-linked') ||
        e.toLowerCase().includes('mitochondrial')
      );

      kbEntry.profile.keyFindings.genetic = [...geneEntries, ...inheritanceEntries];
      kbEntry.dirty = true;
      matched++;
    }
  }

  console.log(`  Enriched: ${matched} profiles | No KB match: ${skipped}`);
  return matched;
}

// =====================================================
// Main
// =====================================================

function main() {
  console.log('=== Orphanet KB Enrichment ===');
  if (DRY_RUN) console.log('(DRY RUN - no files will be modified)\n');

  const kbProfiles = loadKBProfiles();

  const counts = { phenotypes: 0, history: 0, epidemiology: 0, genes: 0 };

  if (!passFilter || passFilter === 'phenotypes') {
    counts.phenotypes = enrichPhenotypes(kbProfiles);
  }
  if (!passFilter || passFilter === 'history') {
    counts.history = enrichNaturalHistory(kbProfiles);
  }
  if (!passFilter || passFilter === 'epidemiology') {
    counts.epidemiology = enrichEpidemiology(kbProfiles);
  }
  if (!passFilter || passFilter === 'genes') {
    counts.genes = enrichGenes(kbProfiles);
  }

  // Write modified profiles back to disk
  let written = 0;
  if (!DRY_RUN) {
    console.log('\nWriting updated profiles...');
    for (const [code, entry] of kbProfiles) {
      if (!entry.dirty) continue;
      entry.profile.lastUpdated = new Date().toISOString().split('T')[0];
      const json = JSON.stringify(entry.profile, null, 2);
      fs.writeFileSync(entry.filePath, json + '\n');
      written++;
    }
    console.log(`  Wrote ${written} modified profile files`);
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`  HPO phenotypes enriched:  ${counts.phenotypes}`);
  console.log(`  Natural history enriched: ${counts.history}`);
  console.log(`  Epidemiology enriched:    ${counts.epidemiology}`);
  console.log(`  Gene associations enriched: ${counts.genes}`);
  console.log(`  Total files written:      ${written}`);
  console.log('\nDone. Next steps:');
  console.log('  node scripts/compile-kb.js');
  console.log('  node scripts/embed-diseases.js');
}

main();
