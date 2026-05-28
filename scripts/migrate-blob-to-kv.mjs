#!/usr/bin/env node
// One-shot migration: copy the test-cases array from Vercel Blob storage
// into Upstash Redis (Vercel KV), one key per case + a sorted-set index.
//
// Usage (Node 20.6+; loads vars via --env-file):
//   node --env-file=.env.local scripts/migrate-blob-to-kv.mjs
//   node --env-file=.env.local scripts/migrate-blob-to-kv.mjs --dry-run
//
// Required env (pull via `vercel env pull .env.local`):
//   BLOB_READ_WRITE_TOKEN
//   KV_REST_API_URL
//   KV_REST_API_TOKEN

import { list } from "@vercel/blob"
import { Redis } from "@upstash/redis"

const BLOB_PATH = "test-cases.json"
const KEY_INDEX = "tc:index"
const KEY_PREFIX = "tc:"

const dryRun = process.argv.includes("--dry-run")

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

if (!process.env.BLOB_READ_WRITE_TOKEN) fail("BLOB_READ_WRITE_TOKEN missing")
if (!process.env.KV_REST_API_URL) fail("KV_REST_API_URL missing")
if (!process.env.KV_REST_API_TOKEN) fail("KV_REST_API_TOKEN missing")

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

async function loadFromBlob() {
  const { blobs } = await list({ prefix: BLOB_PATH })
  if (blobs.length === 0) return []
  const cacheBust = `?_t=${Date.now()}`
  const response = await fetch(blobs[0].url + cacheBust, { cache: "no-store" })
  if (!response.ok) fail(`Blob fetch failed: HTTP ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data)) fail("Blob payload is not an array")
  return data
}

function createdAtScore(tc) {
  const t = Date.parse(tc.createdAt)
  return Number.isFinite(t) ? t : Date.now()
}

// Lifecycle ordering — when the same id appears multiple times in the Blob
// array (which the legacy read-modify-write code allowed), prefer the copy
// furthest along the pipeline so we don't downgrade a graded case to an
// earlier state.
const STATUS_RANK = { graded: 5, completed: 4, running: 3, generated: 2, error: 1 }
function statusRank(tc) {
  return STATUS_RANK[tc?.status] ?? 0
}

// Pick the "best" copy among duplicates: highest status, then largest
// serialized size as a proxy for completeness (e.g. has pipelineResult,
// grading detail, etc.).
function pickBest(group) {
  let best = group[0]
  let bestRank = statusRank(best)
  let bestSize = JSON.stringify(best).length
  for (let i = 1; i < group.length; i++) {
    const cur = group[i]
    const curRank = statusRank(cur)
    const curSize = JSON.stringify(cur).length
    if (curRank > bestRank || (curRank === bestRank && curSize > bestSize)) {
      best = cur
      bestRank = curRank
      bestSize = curSize
    }
  }
  return best
}

async function main() {
  console.log(`Reading test cases from Vercel Blob (${BLOB_PATH})...`)
  const cases = await loadFromBlob()
  console.log(`  found ${cases.length} array entries in Blob`)

  console.log(`Current KV index size: ${await redis.zcard(KEY_INDEX)}`)

  // Dedupe by id, picking the most-complete copy.
  const byId = new Map()
  let skipped = 0
  for (const tc of cases) {
    if (!tc || typeof tc.id !== "string") {
      skipped++
      continue
    }
    if (!byId.has(tc.id)) byId.set(tc.id, [])
    byId.get(tc.id).push(tc)
  }
  const deduped = []
  let collapsed = 0
  for (const [, group] of byId) {
    if (group.length > 1) collapsed += group.length - 1
    deduped.push(pickBest(group))
  }
  console.log(
    `  ${deduped.length} unique ids, ${collapsed} duplicate entries collapsed (best-copy retained), ${skipped} skipped (missing id)`
  )

  if (dryRun) {
    console.log("\nDry run — no writes performed.")
    return
  }

  const BATCH = 50
  let written = 0
  for (let i = 0; i < deduped.length; i += BATCH) {
    const slice = deduped.slice(i, i + BATCH)
    const pipe = redis.pipeline()
    let cmds = 0
    for (const tc of slice) {
      pipe.set(`${KEY_PREFIX}${tc.id}`, tc)
      pipe.zadd(KEY_INDEX, { score: createdAtScore(tc), member: tc.id })
      cmds += 2
      written++
    }
    if (cmds > 0) await pipe.exec()
    process.stdout.write(
      `\r  wrote ${written}/${deduped.length} cases (${Math.round((written / deduped.length) * 100)}%)`
    )
  }
  console.log("")

  const finalCount = await redis.zcard(KEY_INDEX)
  console.log(`\nKV index size after write: ${finalCount}`)
  if (finalCount === deduped.length) {
    console.log("✓ Migration complete.")
  } else {
    console.log(`⚠ Expected ${deduped.length}, got ${finalCount}.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
