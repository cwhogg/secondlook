#!/usr/bin/env node
// One-shot backfill: write a lightweight prs:<id> summary key for every
// production run already stored as a full pr:<id> record. The /admin/runs
// list view reads only the summary keys (hydrating 100 full records in one
// mget exceeds Upstash's 10MB request cap). New runs write both keys via
// saveProdRun(); this catches up the records that pre-date that change.
//
// Usage (Node 20.6+; loads vars via --env-file):
//   node --env-file=.env.local scripts/backfill-prod-run-summaries.mjs
//   node --env-file=.env.local scripts/backfill-prod-run-summaries.mjs --dry-run
//
// Required env (pull via `vercel env pull .env.local`):
//   KV_REST_API_URL
//   KV_REST_API_TOKEN
//
// Safe to re-run: existing summary keys are skipped unless --force is passed.

import { Redis } from "@upstash/redis"

const KEY_INDEX = "pr:index"
const KEY_PREFIX = "pr:"
const KEY_SUMMARY_PREFIX = "prs:"
const TTL_SECONDS = 60 * 60 * 24 * 90 // 90 days

const dryRun = process.argv.includes("--dry-run")
const force = process.argv.includes("--force")

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
if (!url) fail("KV_REST_API_URL missing")
if (!token) fail("KV_REST_API_TOKEN missing")

const redis = new Redis({ url, token })

const runKey = (id) => `${KEY_PREFIX}${id}`
const summaryKey = (id) => `${KEY_SUMMARY_PREFIX}${id}`

function toSummary(record) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    ip: record.ip ?? null,
    summary: record.summary,
  }
}

async function main() {
  const ids = (await redis.zrange(KEY_INDEX, 0, -1, { rev: true })) || []
  console.log(`Found ${ids.length} run(s) in ${KEY_INDEX}${dryRun ? " (dry run)" : ""}`)

  let written = 0
  let skipped = 0
  let missing = 0
  let noSummary = 0

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]

    if (!force) {
      const exists = await redis.exists(summaryKey(id))
      if (exists) {
        skipped++
        continue
      }
    }

    // Fetch one full record at a time — single GETs stay well under the cap.
    const raw = await redis.get(runKey(id))
    if (!raw) {
      // Index entry whose full record expired/vanished. Leave the index
      // alone here; listProdRuns() prunes these lazily.
      missing++
      continue
    }

    let record
    try {
      record = typeof raw === "string" ? JSON.parse(raw) : raw
    } catch (err) {
      console.warn(`  ! parse failed for ${id}: ${err?.message}`)
      missing++
      continue
    }

    if (!record?.summary) {
      noSummary++
      continue
    }

    // Align the summary TTL with the full record's remaining lifetime so the
    // list row and the detail page expire together.
    const ttl = await redis.ttl(runKey(id))
    const ex = typeof ttl === "number" && ttl > 0 ? ttl : TTL_SECONDS

    if (dryRun) {
      written++
    } else {
      await redis.set(summaryKey(id), JSON.stringify(toSummary(record)), { ex })
      written++
    }

    if ((written + skipped) % 25 === 0) {
      console.log(`  …processed ${i + 1}/${ids.length}`)
    }
  }

  console.log("")
  console.log(`Done. ${dryRun ? "Would write" : "Wrote"} ${written} summary key(s).`)
  console.log(`  skipped (already present): ${skipped}`)
  if (missing) console.log(`  full record missing/unparseable: ${missing}`)
  if (noSummary) console.log(`  record had no summary field: ${noSummary}`)
}

main().catch((err) => fail(err?.stack || err?.message || String(err)))
