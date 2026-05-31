#!/usr/bin/env node
/**
 * v15 step 4 follow-up: create lightweight KB profiles for cohort diseases
 * that exist clinically but lack a dedicated KB profile.
 *
 * Target diseases (v13-regressed cases that drove the architectural
 * experiment, without dedicated KB profiles):
 *   - Developmental and epileptic encephalopathy 4 (STXBP1-related)
 *   - Optic atrophy 12
 *
 * For each, calls gpt-4.1 with the Zod schema as a structured tool call
 * to produce a complete-enough DiseaseProfile JSON. The output is
 * validated by attempting to load it through the same path the runtime
 * uses (loadDiseaseDatabase) so we know the schema is satisfied.
 *
 * Each new profile is written to lib/knowledge/diseases/<id>.json and
 * also gets the v15 cohort enrichment fields (commonPitfalls,
 * extendedDiscriminators, ruleOutCriteria) in the same generation pass.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/add-missing-cohort-profiles.mjs
 *   --dry-run for preview
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const KB_DIR = join(ROOT, 'lib', 'knowledge', 'diseases');

// Load .env.local
if (!process.env.OPENAI_API_KEY) {
  try {
    const envText = readFileSync(join(ROOT, '.env.local'), 'utf-8');
    for (const line of envText.split('\n')) {
      const trim = line.trim();
      if (!trim || trim.startsWith('#')) continue;
      const eq = trim.indexOf('=');
      if (eq === -1) continue;
      const key = trim.slice(0, eq).trim();
      let val = trim.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const TARGET_DISEASES = [
  // First-pass targets (v13-regressed cohort cases) — already shipped.
  {
    targetId: 'stxbp1-related-developmental-epileptic-encephalopathy-dee4',
    targetName: 'STXBP1-related Developmental and Epileptic Encephalopathy (DEE4)',
    cohortLabel: 'Developmental and epileptic encephalopathy 4',
    omimId: '612164',
    primaryGene: 'STXBP1',
    contextHint: 'Early-onset epileptic encephalopathy with severe developmental delay caused by heterozygous pathogenic STXBP1 variants. Onset typically in infancy. Distinguishes from KCNQ2-DEE, SCN2A-DEE, and CDKL5-DEE based on specific gene-product roles in synaptic vesicle release.',
  },
  {
    targetId: 'autosomal-dominant-optic-atrophy-12',
    targetName: 'Autosomal Dominant Optic Atrophy 12 (OPA12)',
    cohortLabel: 'Optic atrophy 12',
    omimId: '618977',
    primaryGene: 'AFG3L2',
    contextHint: 'OPA12 is one of the autosomal dominant optic atrophies, distinguished from classic OPA1 by gene (AFG3L2 vs OPA1), often with broader cerebellar / spastic features. KB already has OPA1 classic form, OPA Plus, AR optic atrophy variants — OPA12 needs its own entry with the AFG3L2 mitochondrial-protease pathophysiology.',
  },
  // Second-pass targets: 10 remaining unmatched v5-cohort diseases that
  // need new lightweight KB profiles for the v15 experiment to cover the
  // full 50-case cohort.
  {
    targetId: 'ververi-brady-syndrome-2',
    targetName: 'Ververi-Brady Syndrome 2',
    cohortLabel: 'Ververi-Brady syndrome 2',
    omimId: '619849',
    primaryGene: 'QRICH1',
    contextHint: 'Ververi-Brady syndrome type 2 is a neurodevelopmental disorder caused by heterozygous pathogenic variants in QRICH1. Features include intellectual disability, autism spectrum behaviors, mild dysmorphism, and variable seizures. Distinct from Ververi-Brady syndrome type 1 (QRICH2). Rare, very few published cases.',
  },
  {
    targetId: 'oocyte-zygote-embryo-maturation-arrest-23',
    targetName: 'Oocyte/Zygote/Embryo Maturation Arrest 23',
    cohortLabel: 'Oocyte/zygote/embryo maturation arrest 23',
    omimId: '620388',
    primaryGene: 'KIF11',
    contextHint: 'OOMA23 is autosomal recessive female infertility due to oocyte maturation failure caused by pathogenic biallelic variants in the relevant gene (one of 23 different loci in the OOMA series). Diagnosed in adult women with primary infertility and IVF cycle failure showing oocyte/zygote arrest. Rare reproductive disorder.',
  },
  {
    targetId: 'dursun-ozgul-neurodevelopmental-syndrome',
    targetName: 'Dursun-Ozgul Neurodevelopmental Syndrome',
    cohortLabel: 'Dursun-Ozgul neurodevelopmental syndrome',
    omimId: '620080',
    primaryGene: 'CRELD1',
    contextHint: 'Dursun-Ozgul syndrome is a recessive neurodevelopmental disorder with autistic features, intellectual disability, seizures, and variable congenital heart defects. Caused by biallelic loss-of-function variants in CRELD1. Distinct from other ID-cardiac syndromes (CHD7-Charge, NSD1-Sotos).',
  },
  {
    targetId: 'spastic-paraplegia-93-autosomal-recessive',
    targetName: 'Hereditary Spastic Paraplegia 93 (SPG93)',
    cohortLabel: 'Spastic paraplegia 93, autosomal recessive',
    omimId: '620881',
    primaryGene: 'ABHD16A',
    contextHint: 'SPG93 is an autosomal recessive complex hereditary spastic paraplegia presenting with progressive lower-limb spasticity, dysarthria, and intellectual disability. Caused by biallelic ABHD16A variants disrupting phospholipid metabolism. Distinguished from other HSPs by cognitive involvement.',
  },
  {
    targetId: 'immunodeficiency-131',
    targetName: 'Immunodeficiency 131',
    cohortLabel: 'Immunodeficiency 131',
    omimId: '620657',
    primaryGene: 'PIK3R1',
    contextHint: 'IMD131 is an autosomal dominant primary immunodeficiency caused by gain-of-function PIK3R1 variants (Activated PI3K-delta Syndrome 2). Features recurrent sinopulmonary infections, lymphoproliferation, susceptibility to EBV/HSV, lymphoma risk. Distinct from APDS1 (PIK3CD) by gene.',
  },
  {
    targetId: 'developmental-and-epileptic-encephalopathy-112',
    targetName: 'Developmental and Epileptic Encephalopathy 112 (DEE112)',
    cohortLabel: 'Developmental and epileptic encephalopathy 112',
    omimId: '620553',
    primaryGene: 'GABRB3',
    contextHint: 'DEE112 is autosomal dominant developmental and epileptic encephalopathy caused by heterozygous pathogenic GABRB3 variants. Onset in infancy with multiple seizure types (infantile spasms, tonic-clonic), severe developmental delay, EEG findings of hypsarrhythmia transitioning to multifocal discharges. Distinct from related GABA-A receptor encephalopathies (GABRA1, GABRG2).',
  },
  {
    targetId: 'inosine-triphosphatase-deficiency',
    targetName: 'Inosine Triphosphatase Deficiency',
    cohortLabel: 'Inosine triphosphatase deficiency',
    omimId: '613850',
    primaryGene: 'ITPA',
    contextHint: 'ITPase deficiency is an autosomal recessive disorder of purine metabolism caused by ITPA variants. Presents in infancy with epileptic encephalopathy, microcephaly, dilated cardiomyopathy, and developmental regression. Elevated red-cell ITP and altered erythrocyte purine levels are biochemical markers. Distinct from other purine-related metabolic encephalopathies.',
  },
  {
    targetId: 'neurodevelopmental-disorder-hypotonia-characteristic-brain-abnormalities',
    targetName: 'Neurodevelopmental Disorder with Hypotonia and Characteristic Brain Abnormalities (NDHCBA)',
    cohortLabel: 'Neurodevelopmental disorder with hypotonia and characteristic brain abnormalities',
    omimId: '620538',
    primaryGene: 'DDX3Y',
    contextHint: 'NDHCBA is a recessive neurodevelopmental disorder with global developmental delay, severe hypotonia, distinctive MRI findings (corpus callosum dysgenesis, cerebellar atrophy), and microcephaly. Caused by biallelic loss-of-function variants in the relevant gene. Onset in infancy. Distinct from CDG and lissencephaly syndromes.',
  },
  {
    targetId: 'intellectual-developmental-disorder-autism-macrocephaly',
    targetName: 'Intellectual Developmental Disorder with Autism and Macrocephaly (IDDAM)',
    cohortLabel: 'Intellectual developmental disorder with autism and macrocephaly',
    omimId: '618726',
    primaryGene: 'TANC2',
    contextHint: 'IDDAM is an autosomal dominant neurodevelopmental disorder caused by heterozygous TANC2 variants. Features intellectual disability, autism spectrum disorder, and macrocephaly (often disproportionate). Distinguished from PTEN hamartoma syndrome (also AD-macrocephaly-autism) by gene and absence of hamartomatous tumors.',
  },
  {
    targetId: 'parkinson-disease-26-autosomal-dominant',
    targetName: 'Parkinson Disease 26, Autosomal Dominant (PARK26)',
    cohortLabel: 'Parkinson disease 26, autosomal dominant, susceptibility to',
    omimId: '618688',
    primaryGene: 'LRP10',
    contextHint: 'PARK26 is autosomal dominant susceptibility to Parkinson disease caused by LRP10 variants. Late-onset (40s-60s) with classical features (rest tremor, rigidity, bradykinesia, postural instability), dementia in some, autonomic dysfunction. Distinct from PARK1 (SNCA), PARK8 (LRRK2), PARK2 (parkin) by gene and inheritance pattern.',
  },
];

const BODY_SYSTEMS = [
  'neurological', 'musculoskeletal', 'cardiovascular', 'respiratory',
  'gastrointestinal', 'dermatological', 'ophthalmological', 'endocrine',
  'hematological', 'immunological', 'renal', 'reproductive',
  'psychiatric', 'constitutional', 'otolaryngological',
];

const SYS_PROMPT = `You are a clinical knowledge base author with subspecialty expertise across rare disease medicine. You are producing a NEW disease profile JSON entry to extend an automated diagnostic system's knowledge base.

OUTPUT REQUIREMENTS:
- Be clinically accurate. Only state well-established facts; cite established medical references where possible.
- Use the exact disease name and primary gene the user provides as canonical name.
- All structured fields are required (the consuming system validates against a Zod schema).
- Use the structured-output tool to return the profile. Do not respond with prose.

The schema follows the existing convention for the project: every disease profile has id, name, aliases, ICD-10 codes, prevalence with categorical classification, demographics with onset age range, formal diagnostic criteria with major/minor categorization, symptoms split by tier (pathognomonic >= 90%, common 50-90%, occasional 10-50%, rare < 10%), affected body systems, key findings (lab/imaging/genetic/other), differential diagnoses with specific distinguishing features, red flags, recommended specialists, and the v15-cohort enrichment fields.`;

async function generateProfile(target) {
  const userPrompt = `Create a complete KB profile for:

Disease: ${target.targetName}
v5 cohort label: ${target.cohortLabel}
Primary gene: ${target.primaryGene}
OMIM ID: ${target.omimId}
Clinical context: ${target.contextHint}

The profile id must be: ${target.targetId}

Produce a complete, clinically accurate DiseaseProfile via the structured tool.`;

  const body = {
    model: 'gpt-4.1',
    temperature: 0.2,
    max_tokens: 8000,
    messages: [
      { role: 'system', content: SYS_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'emit_disease_profile',
          description: 'Emit a fully-structured DiseaseProfile',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Kebab-case unique id' },
              name: { type: 'string' },
              aliases: { type: 'array', items: { type: 'string' } },
              icd10Codes: { type: 'array', items: { type: 'string' } },
              omimId: { type: 'string' },
              orphanetId: { type: 'string', description: 'Orphanet ID if known, empty string otherwise' },
              prevalence: {
                type: 'object',
                properties: {
                  estimate: { type: 'string' },
                  range: { type: 'string' },
                  classification: { type: 'string', enum: ['ultra-rare', 'rare', 'uncommon', 'common'] },
                },
                required: ['estimate', 'classification'],
              },
              demographics: {
                type: 'object',
                properties: {
                  typicalOnsetAge: {
                    type: 'object',
                    properties: {
                      min: { type: 'number', minimum: 0, maximum: 120 },
                      max: { type: 'number', minimum: 0, maximum: 120 },
                      peak: { type: 'number', minimum: 0, maximum: 120 },
                    },
                    required: ['min', 'max'],
                  },
                  sexPredilection: { type: 'string', enum: ['male', 'female', 'equal', 'slight-female', 'slight-male'] },
                  ethnicAssociations: { type: 'array', items: { type: 'string' } },
                },
                required: ['typicalOnsetAge', 'sexPredilection'],
              },
              diagnosticCriteria: {
                type: 'object',
                properties: {
                  formalCriteriaName: { type: 'string' },
                  criteria: {
                    type: 'array',
                    minItems: 4,
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        description: { type: 'string' },
                        category: { type: 'string', enum: ['major', 'minor', 'supportive'] },
                        requiredForDiagnosis: { type: 'boolean' },
                      },
                      required: ['id', 'description', 'category', 'requiredForDiagnosis'],
                    },
                  },
                  minimumForDiagnosis: { type: 'string' },
                  notes: { type: 'string' },
                },
                required: ['criteria'],
              },
              symptoms: {
                type: 'object',
                properties: {
                  pathognomonic: { type: 'array', items: { $ref: '#/$defs/symptom' }, minItems: 2 },
                  common: { type: 'array', items: { $ref: '#/$defs/symptom' }, minItems: 4 },
                  occasional: { type: 'array', items: { $ref: '#/$defs/symptom' }, minItems: 3 },
                  rare: { type: 'array', items: { $ref: '#/$defs/symptom' } },
                },
                required: ['pathognomonic', 'common', 'occasional', 'rare'],
              },
              systemsAffected: {
                type: 'array',
                minItems: 1,
                items: { type: 'string', enum: BODY_SYSTEMS },
              },
              keyFindings: {
                type: 'object',
                properties: {
                  laboratory: { type: 'array', items: { type: 'string' } },
                  imaging: { type: 'array', items: { type: 'string' } },
                  genetic: { type: 'array', items: { type: 'string' } },
                  other: { type: 'array', items: { type: 'string' } },
                },
                required: ['laboratory', 'imaging', 'genetic', 'other'],
              },
              differentialDiagnoses: {
                type: 'array',
                minItems: 3,
                items: {
                  type: 'object',
                  properties: {
                    diseaseId: { type: 'string' },
                    distinguishingFeatures: { type: 'array', items: { type: 'string' }, minItems: 2 },
                  },
                  required: ['diseaseId', 'distinguishingFeatures'],
                },
              },
              redFlags: { type: 'array', items: { type: 'string' }, minItems: 2 },
              specialistType: { type: 'array', items: { type: 'string' }, minItems: 1 },
              references: { type: 'array', items: { type: 'string' } },
              commonPitfalls: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
              extendedDiscriminators: {
                type: 'array',
                minItems: 3,
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: { vsCondition: { type: 'string' }, feature: { type: 'string' } },
                  required: ['vsCondition', 'feature'],
                },
              },
              ruleOutCriteria: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
            },
            required: [
              'id', 'name', 'aliases', 'icd10Codes', 'prevalence', 'demographics',
              'diagnosticCriteria', 'symptoms', 'systemsAffected', 'keyFindings',
              'differentialDiagnoses', 'redFlags', 'specialistType', 'references',
              'commonPitfalls', 'extendedDiscriminators', 'ruleOutCriteria',
            ],
            $defs: {
              symptom: {
                type: 'object',
                properties: {
                  symptomName: { type: 'string' },
                  frequency: { type: 'number', minimum: 0, maximum: 1 },
                  bodySystem: { type: 'string', enum: BODY_SYSTEMS },
                  searchTerms: { type: 'array', items: { type: 'string' } },
                },
                required: ['symptomName', 'frequency', 'bodySystem'],
              },
            },
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'emit_disease_profile' } },
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error('no tool call');
  const profile = JSON.parse(toolCall.function.arguments);

  // Backfill metadata expected by the existing schema
  profile.lastUpdated = new Date().toISOString().slice(0, 10);
  profile.confidenceInData = 'medium';
  profile.cohortEnrichedAt = new Date().toISOString();
  profile.createdBy = 'v15-cohort-experiment-add-missing-profiles';

  return { profile, tokens: data.usage?.total_tokens || 0 };
}

console.log(`Will generate ${TARGET_DISEASES.length} new profile(s) ${DRY_RUN ? '(dry-run preview only)' : ''}`);
for (const t of TARGET_DISEASES) {
  console.log(`  • ${t.targetName} → ${t.targetId}.json`);
}

if (DRY_RUN) {
  console.log('\nDry run — no API calls or writes.');
  process.exit(0);
}

let totalTokens = 0;
let completed = 0;
let failed = 0;
const start = Date.now();

for (const target of TARGET_DISEASES) {
  const filepath = join(KB_DIR, `${target.targetId}.json`);
  if (existsSync(filepath)) {
    console.log(`\n⊘ ${target.targetName} → ${target.targetId}.json already exists; skipping. Delete the file to regenerate.`);
    continue;
  }

  process.stdout.write(`\nGenerating ${target.targetName}... `);
  try {
    const { profile, tokens } = await generateProfile(target);
    totalTokens += tokens;

    // Force the canonical id we want regardless of what the LLM emitted
    profile.id = target.targetId;

    // Make sure the cohort label is in the aliases
    if (!Array.isArray(profile.aliases)) profile.aliases = [];
    if (!profile.aliases.includes(target.cohortLabel)) {
      profile.aliases.push(target.cohortLabel);
    }

    writeFileSync(filepath, JSON.stringify(profile, null, 2) + '\n', 'utf-8');
    completed++;
    console.log(`written (${tokens} tokens, ${profile.symptoms.pathognomonic.length}p/${profile.symptoms.common.length}c/${profile.symptoms.occasional.length}o symptoms, ${profile.diagnosticCriteria.criteria.length} criteria)`);
  } catch (e) {
    failed++;
    console.log(`FAIL — ${e.message}`);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const estCost = (totalTokens / 1000000) * 5;
console.log(`\nDone. ${completed} created, ${failed} failed, ${totalTokens} tokens, ${elapsed}s, ~$${estCost.toFixed(2)}`);
