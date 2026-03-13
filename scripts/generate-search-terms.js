#!/usr/bin/env node

/**
 * Generate patient-friendly search terms for HPO/medical symptom names.
 *
 * Reads diseases-compiled.json, extracts all unique symptomName values,
 * filters out names that are already descriptive enough, then batches
 * the rest to OpenAI gpt-4.1-mini for patient-friendly aliases.
 *
 * Output: lib/knowledge/search-terms-map.json — Record<string, string[]>
 *
 * Usage: OPENAI_API_KEY=sk-... node scripts/generate-search-terms.js
 *
 * Supports resumption: if search-terms-map.json already exists, skips
 * symptom names that already have entries.
 */

const fs = require('fs');
const path = require('path');

const COMPILED_FILE = path.join(__dirname, '..', 'lib', 'knowledge', 'diseases-compiled.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'lib', 'knowledge', 'search-terms-map.json');
const BATCH_SIZE = 50;

function isAlreadyDescriptive(name) {
  const words = name.split(/\s+/);
  if (words.length <= 2 &&
      !name.toLowerCase().includes('abnormality') &&
      !name.toLowerCase().includes('abnormal') &&
      !name.toLowerCase().includes('morphology')) {
    return true;
  }
  return false;
}

async function callOpenAI(names, apiKey) {
  const numberedList = names.map((n, i) => `${i + 1}. ${n}`).join('\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a medical terminology expert. For each HPO (Human Phenotype Ontology) or medical term, provide 2-4 patient-friendly clinical search terms that describe the same symptom or finding. These will be used to match patient symptom descriptions to disease profiles.

Rules:
- Each search term should be a short phrase (2-5 words) a patient or clinician might use
- Include both clinical and lay terms where appropriate
- For "Abnormality of X morphology" terms, describe what the abnormality actually looks like
- For genetic/molecular terms, include the clinical presentation
- Do NOT include the original term itself
- Do NOT include disease names, only symptom descriptions

Return JSON: { "results": { "1": ["term1", "term2", ...], "2": [...], ... } }
Keys are the line numbers from the input.`,
        },
        {
          role: 'user',
          content: numberedList,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  const parsed = JSON.parse(content);
  return parsed.results;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable required');
    process.exit(1);
  }

  // Load compiled KB
  if (!fs.existsSync(COMPILED_FILE)) {
    console.error('Error: diseases-compiled.json not found. Run compile-kb.js first.');
    process.exit(1);
  }

  const diseases = JSON.parse(fs.readFileSync(COMPILED_FILE, 'utf-8'));
  console.log(`Loaded ${diseases.length} disease profiles`);

  // Extract all unique symptom names
  const allNames = new Set();
  for (const disease of diseases) {
    for (const tier of ['pathognomonic', 'common', 'occasional', 'rare']) {
      const symptoms = disease.symptoms[tier] || [];
      for (const s of symptoms) {
        allNames.add(s.symptomName);
      }
    }
  }
  console.log(`Found ${allNames.size} unique symptom names`);

  // Load existing map for resumption
  let existingMap = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    existingMap = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    console.log(`Loaded existing map with ${Object.keys(existingMap).length} entries (resuming)`);
  }

  // Filter: skip already-descriptive names and already-processed names
  const toProcess = [];
  let skippedDescriptive = 0;
  let skippedExisting = 0;

  for (const name of allNames) {
    if (existingMap[name] !== undefined) {
      skippedExisting++;
      continue;
    }
    if (isAlreadyDescriptive(name)) {
      skippedDescriptive++;
      // Store empty array for descriptive names so they don't get re-processed
      existingMap[name] = [];
      continue;
    }
    toProcess.push(name);
  }

  console.log(`Skipped ${skippedDescriptive} already-descriptive names`);
  console.log(`Skipped ${skippedExisting} already-processed names`);
  console.log(`${toProcess.length} names to process`);

  if (toProcess.length === 0) {
    console.log('Nothing to do!');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingMap, null, 2));
    return;
  }

  // Process in batches
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);

    console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} names)...`);

    try {
      const results = await callOpenAI(batch, apiKey);

      for (let j = 0; j < batch.length; j++) {
        const key = String(j + 1);
        const terms = results[key];
        if (Array.isArray(terms) && terms.length > 0) {
          existingMap[batch[j]] = terms;
        } else {
          existingMap[batch[j]] = [];
        }
      }

      processed += batch.length;
      console.log(`  Done. ${processed}/${toProcess.length} processed.`);

      // Save after each batch for resumption
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingMap, null, 2));

    } catch (err) {
      console.error(`  Error in batch ${batchNum}: ${err.message}`);
      errors++;

      // Save progress even on error
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingMap, null, 2));

      // If we get rate limited, wait longer
      if (err.message.includes('429')) {
        console.log('  Rate limited. Waiting 30 seconds...');
        await new Promise(r => setTimeout(r, 30000));
      }
    }

    // Brief pause between batches
    if (i + BATCH_SIZE < toProcess.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingMap, null, 2));

  const totalEntries = Object.keys(existingMap).length;
  const withTerms = Object.values(existingMap).filter(v => v.length > 0).length;
  console.log(`\nDone!`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log(`  Total entries: ${totalEntries}`);
  console.log(`  With search terms: ${withTerms}`);
  console.log(`  Empty (already descriptive): ${totalEntries - withTerms}`);
  if (errors > 0) console.log(`  Batch errors: ${errors} (re-run to resume)`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
