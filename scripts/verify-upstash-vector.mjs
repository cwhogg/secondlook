#!/usr/bin/env node
/**
 * Sanity-check Upstash Vector credentials and index.
 * Hits /info on the configured Upstash Vector index — no writes, no API budget.
 *
 * Reads UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN from .env.local
 * (or process env). Exits 0 if reachable, 1 otherwise.
 *
 * Run AFTER creating the Upstash index and adding env vars locally:
 *   node scripts/verify-upstash-vector.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const envText = readFileSync(join(ROOT, '.env.local'), 'utf8');
    const m = envText.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, 'm'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}

const url = loadEnv('UPSTASH_VECTOR_REST_URL');
const token = loadEnv('UPSTASH_VECTOR_REST_TOKEN');

if (!url || !token) {
  console.error('FATAL: UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN not found.');
  console.error('Set them in .env.local or as env vars.');
  process.exit(1);
}

console.log(`URL:   ${url}`);
console.log(`Token: ${token.slice(0, 8)}...${token.slice(-4)} (${token.length} chars)`);

try {
  const resp = await fetch(`${url}/info`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`FAIL: HTTP ${resp.status}: ${text.slice(0, 300)}`);
    process.exit(1);
  }
  const info = JSON.parse(text);
  console.log('\nIndex info:');
  console.log(JSON.stringify(info, null, 2));
  const r = info.result || info;
  if (r.dimension && r.dimension !== 256) {
    console.warn(`\nWARNING: index dimension is ${r.dimension}, expected 256.`);
    console.warn('Our embeddings are 256d (text-embedding-3-large @ 256). Mismatch will cause upload to fail.');
    process.exit(1);
  }
  console.log('\nOK — Upstash Vector reachable, credentials valid.');
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
}
