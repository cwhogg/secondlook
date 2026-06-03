import { NextResponse } from "next/server"
import { Redis } from "@upstash/redis"
import type { TestCase } from "@/lib/types/admin"

// Corpus has grown past 3,000 cases; loading all of them via batched MGET
// (8-per-batch to stay under Upstash's 10 MB response cap) exceeds the
// 10-second default Vercel function timeout under load. Bump to 60s.
export const maxDuration = 60

// ===== Storage layout =====
// Each TestCase is stored at its own Redis key (`tc:<id>`) and indexed in a
// single sorted set (`tc:index`, score = createdAt ms). Per-key writes are
// atomic, so the read-merge-write race that plagued the Vercel Blob backend
// is gone: concurrent saves no longer overwrite each other's progress.
const KEY_INDEX = "tc:index"
const KEY_PREFIX = "tc:"
const caseKey = (id: string) => `${KEY_PREFIX}${id}`

let cachedRedis: Redis | null = null
function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  cachedRedis = new Redis({ url, token })
  return cachedRedis
}

function createdAtScore(tc: TestCase): number {
  const t = Date.parse(tc.createdAt)
  return Number.isFinite(t) ? t : Date.now()
}

// Upstash's REST API caps each request/response at 10 MB (pay-as-you-go) or
// 1 MB (free). A single MGET of all 500+ cases blows past that — observed
// 24 MB for our current corpus. Batch the MGET into chunks small enough that
// no single response can exceed the cap even when individual cases are large.
//
// v17 cases carry full pipelineMetadata.llmCalls[] arrays (per-call system
// prompt, user prompt, raw response, structured output) which can be 500
// KB-1 MB each. 30-per-batch could exceed 30 MB and trip the 10 MB cap.
// Dropped to 8 so even at 1 MB/case the batch stays well under cap. Extra
// round-trips add ~50ms total since the batches run in parallel.
const MGET_BATCH = 8

async function loadAllTestCases(redis: Redis): Promise<TestCase[]> {
  // Newest first — same ordering as the old Blob-backed implementation, which
  // unshifted new cases to the front of the array.
  const ids = (await redis.zrange<string[]>(KEY_INDEX, 0, -1, { rev: true })) || []
  if (ids.length === 0) return []

  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += MGET_BATCH) {
    batches.push(ids.slice(i, i + MGET_BATCH).map(caseKey))
  }
  const batchResults = await Promise.all(
    batches.map((keys) => redis.mget<(TestCase | null)[]>(...keys))
  )

  const out: TestCase[] = []
  for (const arr of batchResults) {
    if (!arr) continue
    for (const v of arr) {
      if (v && typeof v === "object") out.push(v as TestCase)
    }
  }
  return out
}

// Strip the heavy llmCalls + pipelineProgressLog arrays from the list response
// by default. llmCalls can be 500 KB-1 MB each (system + user prompts + raw
// response text); v17+ cases carry ~11 of them. pipelineProgressLog grows
// linearly with stage events (50+ entries on full v17 runs). Together they
// account for most of the per-case payload; stripping both drops a 3k-case
// response from ~7 MB (over Vercel's 4.5 MB function response cap, returns
// 500) to well under cap. /eval and the testing UI don't need either; the
// deep-dive HTML script uses ?includeLlmCalls=1 to opt back in.
function stripHeavyFields(tc: TestCase): TestCase {
  let next: TestCase = tc
  if (next.pipelineProgressLog) {
    const { pipelineProgressLog: _log, ...rest } = next
    void _log
    next = rest as TestCase
  }
  if (!next.pipelineResult || !next.pipelineResult.pipelineMetadata) return next
  const pm = next.pipelineResult.pipelineMetadata as unknown as Record<string, unknown>
  if (!pm.llmCalls) return next
  const { llmCalls: _llmCalls, ...restPm } = pm
  void _llmCalls
  return {
    ...next,
    pipelineResult: {
      ...next.pipelineResult,
      pipelineMetadata: restPm as unknown as NonNullable<TestCase["pipelineResult"]>["pipelineMetadata"],
    },
  } as TestCase
}

export async function GET(request: Request) {
  const redis = getRedis()
  if (!redis) return NextResponse.json({ testCases: [] })

  try {
    const url = new URL(request.url)
    const includeLlmCalls = url.searchParams.get("includeLlmCalls") === "1"
    const raw = await loadAllTestCases(redis)
    const testCases = includeLlmCalls ? raw : raw.map(stripHeavyFields)
    return NextResponse.json({ testCases })
  } catch (error) {
    console.error("Failed to load test cases from KV:", error)
    return NextResponse.json({ testCases: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const redis = getRedis()
  if (!redis) {
    return NextResponse.json(
      { error: "KV storage not configured" },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()

    // ===== Upsert / delete mode (primary path) =====
    if (Array.isArray(body.upsert) || Array.isArray(body.deleteIds)) {
      const upserts: TestCase[] = Array.isArray(body.upsert) ? body.upsert : []
      const deleteIds: string[] = Array.isArray(body.deleteIds) ? body.deleteIds : []

      const pipe = redis.pipeline()
      let cmds = 0
      for (const tc of upserts) {
        if (!tc || typeof tc.id !== "string") continue
        pipe.set(caseKey(tc.id), tc)
        pipe.zadd(KEY_INDEX, { score: createdAtScore(tc), member: tc.id })
        cmds += 2
      }
      for (const id of deleteIds) {
        if (typeof id !== "string") continue
        pipe.del(caseKey(id))
        pipe.zrem(KEY_INDEX, id)
        cmds += 2
      }
      if (cmds > 0) await pipe.exec()
      const total = await redis.zcard(KEY_INDEX)
      return NextResponse.json({ success: true, total })
    }

    // ===== Legacy full-replace mode =====
    // Kept for migration scripts that ship the entire array. Diffs the
    // current key set against the incoming one and only touches what changed.
    const testCases: TestCase[] = body.testCases
    if (!Array.isArray(testCases)) {
      return NextResponse.json(
        { error: "Provide either { upsert, deleteIds } or { testCases }" },
        { status: 400 }
      )
    }

    const incomingIds = new Set(
      testCases.filter((tc) => tc && typeof tc.id === "string").map((tc) => tc.id)
    )
    const existingIds = (await redis.zrange<string[]>(KEY_INDEX, 0, -1)) || []

    const pipe = redis.pipeline()
    let cmds = 0
    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        pipe.del(caseKey(id))
        pipe.zrem(KEY_INDEX, id)
        cmds += 2
      }
    }
    for (const tc of testCases) {
      if (!tc || typeof tc.id !== "string") continue
      pipe.set(caseKey(tc.id), tc)
      pipe.zadd(KEY_INDEX, { score: createdAtScore(tc), member: tc.id })
      cmds += 2
    }
    if (cmds > 0) await pipe.exec()
    const total = await redis.zcard(KEY_INDEX)
    return NextResponse.json({ success: true, total })
  } catch (error: any) {
    console.error("Failed to save test cases to KV:", error)
    return NextResponse.json(
      { error: `Failed to save test cases: ${error.message || "unknown error"}` },
      { status: 500 }
    )
  }
}
