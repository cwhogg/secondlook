#!/usr/bin/env node
/**
 * Upload local embeddings index to Upstash Vector.
 *
 * Reads:
 *   lib/knowledge/embeddings-meta.json   (vector index + disease-symptom mapping)
 *   lib/knowledge/embeddings-vectors.bin (raw Float32 array, contiguous vectors)
 *
 * Writes to Upstash Vector. Vector IDs are stable: `${diseaseId}::${tier}::${idx}`
 * so re-running this script overwrites old entries cleanly. Metadata per vector
 * includes the diseaseId and tier for filtered queries downstream.
 *
 * Env required:
 *   UPSTASH_VECTOR_REST_URL
 *   UPSTASH_VECTOR_REST_TOKEN
 *
 * Usage:
 *   node scripts/upload-embeddings-to-upstash.mjs              # full upload
 *   node scripts/upload-embeddings-to-upstash.mjs --dry-run    # count + skip uploads
 *   node scripts/upload-embeddings-to-upstash.mjs --resume     # skip already-existing IDs
 *
 * Batch size 1000 to stay within Upstash limits. Each batch is one POST request.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const META_PATH = join(ROOT, 'lib', 'knowledge', 'embeddings-meta.json');
const VECTORS_PATH = join(ROOT, 'lib', 'knowledge', 'embeddings-vectors.bin');
const BATCH_SIZE = 1000;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const RESUME = argv.includes('--resume');

// Parse .env.local for Upstash creds (don't require dotenv).
function loadEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const envText = readFileSync(join(ROOT, '.env.local'), 'utf8');
    const m = envText.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, 'm'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}

const UPSTASH_URL = loadEnv('UPSTASH_VECTOR_REST_URL');
const UPSTASH_TOKEN = loadEnv('UPSTASH_VECTOR_REST_TOKEN');
if (!DRY_RUN && (!UPSTASH_URL || !UPSTASH_TOKEN)) {
  console.error('FATAL: UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN required.');
  console.error('Add them to .env.local or set as env vars. (--dry-run skips this check)');
  process.exit(1);
}

if (!existsSync(META_PATH) || !existsSync(VECTORS_PATH)) {
  console.error(`FATAL: embeddings files not found. Run scripts/embed-diseases.js first.`);
  process.exit(1);
}

console.log(`Loading meta from ${META_PATH}...`);
const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
const dims = meta.dimensions;
const diseaseCount = Object.keys(meta.diseases).length;

console.log(`Loading vectors from ${VECTORS_PATH}...`);
const vectorsBuf = readFileSync(VECTORS_PATH);
const vectors = new Float32Array(vectorsBuf.buffer, vectorsBuf.byteOffset, vectorsBuf.byteLength / 4);
const totalVectors = vectors.length / dims;

console.log(`Index loaded: ${diseaseCount} diseases, ${totalVectors} vectors at ${dims}d`);
console.log(`Embedding model: ${meta.model || 'unknown'}`);

// Build the flat upload list: one entry per (diseaseId, tier, vectorIndex).
const uploads = [];
for (const [diseaseId, entries] of Object.entries(meta.diseases)) {
  for (const e of entries) {
    const offset = e.vectorIndex * dims;
    const vec = Array.from(vectors.subarray(offset, offset + dims));
    uploads.push({
      id: `${diseaseId}::${e.tier}::${e.vectorIndex}`,
      vector: vec,
      metadata: {
        diseaseId,
        tier: e.tier,
        symptomName: e.symptomName,
      },
    });
  }
}
console.log(`Total upload entries: ${uploads.length}`);

if (DRY_RUN) {
  console.log(`[dry-run] First entry preview:`);
  console.log(`  id: ${uploads[0].id}`);
  console.log(`  metadata: ${JSON.stringify(uploads[0].metadata)}`);
  console.log(`  vector[0..4]: ${uploads[0].vector.slice(0, 4).map((v) => v.toFixed(4)).join(', ')}`);
  console.log(`[dry-run] Would POST ${Math.ceil(uploads.length / BATCH_SIZE)} batches of ${BATCH_SIZE} to ${UPSTASH_URL || '<no url>'}/upsert`);
  process.exit(0);
}

// Resume mode: query Upstash for existing IDs and skip them.
let toUpload = uploads;
if (RESUME) {
  console.log('Resume mode: checking which IDs already exist...');
  // Upstash doesn't have a "list all IDs" cheap endpoint; instead we'll just
  // try upsert and let it overwrite duplicates (idempotent). Resume is for
  // partial-failure recovery, so re-upserting is fine.
  console.log('(Upstash upsert is idempotent — re-running re-uploads all entries.)');
}

let uploaded = 0;
let failed = 0;
const startMs = Date.now();

for (let i = 0; i < toUpload.length; i += BATCH_SIZE) {
  const batch = toUpload.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(toUpload.length / BATCH_SIZE);
  process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} vectors) ... `);
  try {
    const resp = await fetch(`${UPSTASH_URL}/upsert`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    uploaded += batch.length;
    const elapsedSec = (Date.now() - startMs) / 1000;
    const rate = uploaded / elapsedSec;
    const remaining = (toUpload.length - uploaded) / rate;
    console.log(`OK (${uploaded}/${toUpload.length}, ${rate.toFixed(0)}/s, ETA ${Math.round(remaining)}s)`);
  } catch (err) {
    failed += batch.length;
    console.log(`FAIL ${err.message.slice(0, 150)}`);
  }
}

const wallMin = ((Date.now() - startMs) / 60000).toFixed(1);
console.log(`\nDone. Uploaded: ${uploaded}, failed: ${failed}, wall: ${wallMin} min`);
