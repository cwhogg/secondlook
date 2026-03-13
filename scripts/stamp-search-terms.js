#!/usr/bin/env node

/**
 * Stamp generated search terms into all disease profile JSON files.
 *
 * Reads search-terms-map.json, walks every symptom in every disease profile,
 * and adds searchTerms arrays where the map has non-empty entries.
 *
 * Usage: node scripts/stamp-search-terms.js
 *
 * After running: rebuild with compile-kb.js then embed-diseases.js
 */

const fs = require('fs');
const path = require('path');

const DISEASES_DIR = path.join(__dirname, '..', 'lib', 'knowledge', 'diseases');
const SEARCH_TERMS_FILE = path.join(__dirname, '..', 'lib', 'knowledge', 'search-terms-map.json');

function main() {
  console.log('=== Stamp Search Terms ===\n');

  // Load search terms map
  if (!fs.existsSync(SEARCH_TERMS_FILE)) {
    console.error('Error: search-terms-map.json not found. Run generate-search-terms.js first.');
    process.exit(1);
  }

  const searchTermsMap = JSON.parse(fs.readFileSync(SEARCH_TERMS_FILE, 'utf-8'));
  const mapEntries = Object.keys(searchTermsMap).length;
  const withTerms = Object.entries(searchTermsMap).filter(([, v]) => v.length > 0).length;
  console.log(`Loaded search terms map: ${mapEntries} entries (${withTerms} with terms)`);

  // Process disease files
  const files = fs.readdirSync(DISEASES_DIR).filter(f => f.endsWith('.json'));
  console.log(`Processing ${files.length} disease files...\n`);

  let profilesUpdated = 0;
  let symptomsUpdated = 0;
  let symptomsTotal = 0;
  let termsRemoved = 0;

  for (const file of files) {
    const filePath = path.join(DISEASES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const disease = JSON.parse(content);

    let fileModified = false;

    for (const tier of ['pathognomonic', 'common', 'occasional', 'rare']) {
      const symptoms = disease.symptoms[tier] || [];
      for (const symptom of symptoms) {
        symptomsTotal++;

        const terms = searchTermsMap[symptom.symptomName];
        if (terms && terms.length > 0) {
          symptom.searchTerms = terms;
          symptomsUpdated++;
          fileModified = true;
        } else if (symptom.searchTerms) {
          // Remove stale searchTerms if the map says empty
          delete symptom.searchTerms;
          termsRemoved++;
          fileModified = true;
        }
      }
    }

    if (fileModified) {
      fs.writeFileSync(filePath, JSON.stringify(disease, null, 2) + '\n');
      profilesUpdated++;
    }
  }

  console.log(`Done!`);
  console.log(`  Profiles updated: ${profilesUpdated}/${files.length}`);
  console.log(`  Symptoms with searchTerms: ${symptomsUpdated}/${symptomsTotal}`);
  if (termsRemoved > 0) console.log(`  Stale searchTerms removed: ${termsRemoved}`);
  console.log(`\nNext steps:`);
  console.log(`  1. node scripts/compile-kb.js`);
  console.log(`  2. OPENAI_API_KEY=... node scripts/embed-diseases.js`);
}

main();
