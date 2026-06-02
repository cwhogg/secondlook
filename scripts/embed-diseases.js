#!/usr/bin/env node

/**
 * Generate embeddings for all disease symptom names in the knowledge base.
 *
 * Reads all disease JSON files, extracts every symptom name across all tiers,
 * calls OpenAI text-embedding-3-small (256 dimensions), and writes a compact
 * binary embeddings index.
 *
 * Output files:
 *   lib/knowledge/embeddings-meta.json  — disease→symptom mappings + vector offsets (~100 KB)
 *   lib/knowledge/embeddings-vectors.bin — raw Float32 vectors (~1-2 MB per 1K symptoms)
 *
 * Usage: OPENAI_API_KEY=sk-... node scripts/embed-diseases.js
 *
 * This script is idempotent — re-running it regenerates the full index.
 */

const fs = require('fs');
const path = require('path');

const DISEASES_DIR = path.join(__dirname, '..', 'lib', 'knowledge', 'diseases');
const META_FILE = path.join(__dirname, '..', 'lib', 'knowledge', 'embeddings-meta.json');
const VECTORS_FILE = path.join(__dirname, '..', 'lib', 'knowledge', 'embeddings-vectors.bin');
// v23: upgraded from text-embedding-3-small. 3-large produces meaningfully
// better latent representations at the same dimensionality (256d retained for
// Upstash Vector free-tier storage compatibility and zero retrieval-code change).
const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 256;
const BATCH_SIZE = 2000;

async function generateEmbeddings(texts, apiKey) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
  }

  const data = await response.json();
  const sorted = data.data.sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable required');
    process.exit(1);
  }

  // Load all disease files
  const files = fs.readdirSync(DISEASES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} disease files`);

  // Collect all symptom texts with their disease mappings
  // Include both symptomName and searchTerms for each symptom
  const symptomTexts = [];
  const symptomMap = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(DISEASES_DIR, file), 'utf-8');
    const disease = JSON.parse(content);

    for (const tier of ['pathognomonic', 'common', 'occasional', 'rare']) {
      const symptoms = disease.symptoms[tier] || [];
      for (const symptom of symptoms) {
        // Always embed the symptomName
        symptomTexts.push(symptom.symptomName);
        symptomMap.push({
          diseaseId: disease.id,
          tier,
          symptomName: symptom.symptomName,
        });

        // Also embed each searchTerm (patient-friendly aliases)
        if (symptom.searchTerms && symptom.searchTerms.length > 0) {
          for (const searchTerm of symptom.searchTerms) {
            symptomTexts.push(searchTerm);
            symptomMap.push({
              diseaseId: disease.id,
              tier,
              symptomName: searchTerm,
            });
          }
        }
      }
    }
  }

  console.log(`Collected ${symptomTexts.length} symptom texts to embed (including searchTerms)`);

  // Deduplicate symptom texts
  const uniqueTexts = [...new Set(symptomTexts)];
  console.log(`${uniqueTexts.length} unique symptom texts (${symptomTexts.length - uniqueTexts.length} duplicates)`);

  // Generate embeddings in batches
  const textToEmbedding = new Map();
  let processed = 0;

  for (let i = 0; i < uniqueTexts.length; i += BATCH_SIZE) {
    const batch = uniqueTexts.slice(i, i + BATCH_SIZE);
    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueTexts.length / BATCH_SIZE)} (${batch.length} texts)...`);

    const embeddings = await generateEmbeddings(batch, apiKey);

    for (let j = 0; j < batch.length; j++) {
      textToEmbedding.set(batch[j], embeddings[j]);
    }

    processed += batch.length;
    console.log(`  Done. ${processed}/${uniqueTexts.length} unique symptoms embedded.`);

    if (i + BATCH_SIZE < uniqueTexts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Build the index and binary vector buffer
  // Each symptom gets a vectorIndex pointing into the binary file
  const diseases = {};
  let vectorCount = 0;

  // Allocate buffer for all vectors (including duplicates per disease)
  const totalVectors = symptomMap.length;
  const vectorBuffer = Buffer.alloc(totalVectors * EMBEDDING_DIMENSIONS * 4); // Float32 = 4 bytes

  for (let i = 0; i < symptomMap.length; i++) {
    const { diseaseId, tier, symptomName } = symptomMap[i];
    const embedding = textToEmbedding.get(symptomName);

    if (!diseases[diseaseId]) {
      diseases[diseaseId] = [];
    }

    // Write the vector into the binary buffer
    const offset = vectorCount * EMBEDDING_DIMENSIONS * 4;
    for (let d = 0; d < EMBEDDING_DIMENSIONS; d++) {
      vectorBuffer.writeFloatLE(embedding[d], offset + d * 4);
    }

    diseases[diseaseId].push({
      symptomName,
      tier,
      vectorIndex: vectorCount,
    });

    vectorCount++;
  }

  // Write metadata JSON (small — just mappings, no vectors)
  const meta = {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    generatedAt: new Date().toISOString(),
    totalDiseases: Object.keys(diseases).length,
    totalVectors: vectorCount,
    uniqueSymptoms: uniqueTexts.length,
    diseases,
  };

  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));

  // Write binary vectors
  fs.writeFileSync(VECTORS_FILE, vectorBuffer);

  const metaSizeKB = (fs.statSync(META_FILE).size / 1024).toFixed(1);
  const vectorsSizeMB = (fs.statSync(VECTORS_FILE).size / (1024 * 1024)).toFixed(2);
  console.log(`\nDone!`);
  console.log(`  ${META_FILE}`);
  console.log(`    ${Object.keys(diseases).length} diseases, ${vectorCount} vectors (${uniqueTexts.length} unique)`);
  console.log(`    Size: ${metaSizeKB} KB`);
  console.log(`  ${VECTORS_FILE}`);
  console.log(`    Size: ${vectorsSizeMB} MB`);

  // Estimate cost
  const totalChars = uniqueTexts.reduce((sum, t) => sum + t.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);
  const costDollars = (estimatedTokens / 1000000) * 0.02;
  console.log(`  Estimated cost: $${costDollars.toFixed(4)}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
