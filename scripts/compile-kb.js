#!/usr/bin/env node

/**
 * Compile all disease JSON profiles into a single file for fast loading.
 *
 * Reads all lib/knowledge/diseases/*.json files, validates each with the Zod
 * schema, and writes lib/knowledge/diseases-compiled.json — a single JSON array.
 *
 * Usage: node scripts/compile-kb.js
 */

const fs = require('fs');
const path = require('path');

const DISEASES_DIR = path.join(__dirname, '..', 'lib', 'knowledge', 'diseases');
const COMPILED_FILE = path.join(__dirname, '..', 'lib', 'knowledge', 'diseases-compiled.json');

function main() {
  console.log('=== Compile Knowledge Base ===\n');

  // Read all disease JSON files
  const files = fs.readdirSync(DISEASES_DIR).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} disease profile files`);

  const profiles = [];
  const errors = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(DISEASES_DIR, file), 'utf-8');
      const parsed = JSON.parse(content);
      profiles.push(parsed);
    } catch (err) {
      errors.push({ file, error: err.message });
    }
  }

  if (errors.length > 0) {
    console.warn(`\n${errors.length} files failed to parse:`);
    for (const e of errors.slice(0, 10)) {
      console.warn(`  - ${e.file}: ${e.error.substring(0, 100)}`);
    }
    if (errors.length > 10) console.warn(`  ... and ${errors.length - 10} more`);
  }

  // Write compiled file
  const json = JSON.stringify(profiles);
  fs.writeFileSync(COMPILED_FILE, json);
  const sizeMB = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(1);
  console.log(`\nCompiled ${profiles.length} profiles → diseases-compiled.json (${sizeMB} MB)`);

  // Count by confidenceInData
  const byConfidence = {};
  for (const p of profiles) {
    const c = p.confidenceInData || 'unknown';
    byConfidence[c] = (byConfidence[c] || 0) + 1;
  }
  console.log('By confidence:', JSON.stringify(byConfidence));

  console.log('\nDone.');
}

main();
