#!/usr/bin/env node
/**
 * Normalize body system values in all disease profiles to match the valid enum.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'lib', 'knowledge', 'diseases');

const VALID = new Set([
  'neurological', 'musculoskeletal', 'cardiovascular', 'respiratory',
  'gastrointestinal', 'dermatological', 'ophthalmological', 'endocrine',
  'hematological', 'immunological', 'renal', 'reproductive',
  'psychiatric', 'constitutional', 'otolaryngological',
]);

const ALIASES = {
  'lymphatic': 'immunological',
  'hepatic': 'gastrointestinal',
  'hepatobiliary': 'gastrointestinal',
  'dental': 'musculoskeletal',
  'oral': 'gastrointestinal',
  'oral/mucosal': 'gastrointestinal',
  'integumentary': 'dermatological',
  'otologic': 'otolaryngological',
  'auditory': 'otolaryngological',
  'vestibular': 'otolaryngological',
  'ent/upper respiratory': 'otolaryngological',
  'urological': 'renal',
  'urinary': 'renal',
  'genitourinary': 'renal',
  'skeletal': 'musculoskeletal',
  'osseous': 'musculoskeletal',
  'skeletal muscle': 'musculoskeletal',
  'pulmonary': 'respiratory',
  'vascular': 'cardiovascular',
  'ocular': 'ophthalmological',
  'ophthalmologic': 'ophthalmological',
  'neuropsychiatric': 'psychiatric',
  'metabolic': 'endocrine',
  'pancreatic': 'gastrointestinal',
  'splenic': 'hematological',
  'hematologic': 'hematological',
  'dermatologic': 'dermatological',
  'immunologic': 'immunological',
  'neurologic': 'neurological',
  'autonomic': 'neurological',
  'general': 'constitutional',
  'central nervous system': 'neurological',
  'peripheral nervous system': 'neurological',
  'peripheral nervous system (small fibers)': 'neurological',
  'upper motor neurons': 'neurological',
  'corticospinal tracts': 'neurological',
  'cerebellum': 'neurological',
  'neuromuscular junction': 'neurological',
  'trigeminal nerve (cn v)': 'neurological',
  'basal ganglia': 'neurological',
  'spinal cord': 'neurological',
  'cerebral cortex': 'neurological',
  'motor neurons': 'neurological',
  'anterior horn cells': 'neurological',
};

function fixSystem(sys) {
  if (VALID.has(sys)) return sys;
  const lower = sys.toLowerCase();
  if (VALID.has(lower)) return lower;
  if (ALIASES[lower]) return ALIASES[lower];
  // Fuzzy: check if any valid system is contained in the value
  for (const v of VALID) {
    if (lower.includes(v) || v.includes(lower)) return v;
  }
  return null;
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
let fixedCount = 0;
let unfixable = [];

for (const file of files) {
  const filePath = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let changed = false;

  // Fix systemsAffected
  if (data.systemsAffected) {
    const original = [...data.systemsAffected];
    data.systemsAffected = data.systemsAffected
      .map(s => {
        const fixed = fixSystem(s);
        if (!fixed) {
          unfixable.push({ file, field: 'systemsAffected', value: s });
          return null;
        }
        return fixed;
      })
      .filter(Boolean);
    data.systemsAffected = [...new Set(data.systemsAffected)];
    if (data.systemsAffected.length === 0) {
      data.systemsAffected = ['constitutional'];
    }
    if (JSON.stringify(original) !== JSON.stringify(data.systemsAffected)) changed = true;
  }

  // Fix symptom body systems
  for (const tier of ['pathognomonic', 'common', 'occasional', 'rare']) {
    const symptoms = data.symptoms?.[tier] || [];
    for (const s of symptoms) {
      if (s.bodySystem) {
        const fixed = fixSystem(s.bodySystem);
        if (fixed && fixed !== s.bodySystem) {
          s.bodySystem = fixed;
          changed = true;
        } else if (!fixed) {
          unfixable.push({ file, field: `symptoms.${tier}`, value: s.bodySystem });
          s.bodySystem = 'constitutional';
          changed = true;
        }
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    fixedCount++;
  }
}

console.log(`Normalized ${fixedCount} files`);
if (unfixable.length > 0) {
  console.log(`${unfixable.length} unfixable values (defaulted to fallback):`);
  const unique = [...new Set(unfixable.map(u => u.value))];
  for (const v of unique.slice(0, 20)) {
    console.log(`  - "${v}"`);
  }
}
