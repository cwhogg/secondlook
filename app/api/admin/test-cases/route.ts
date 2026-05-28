import { NextResponse } from "next/server"
import { put, list } from "@vercel/blob"
import type { TestCase } from "@/lib/types/admin"

const BLOB_PATH = "test-cases.json"

function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

export async function GET() {
  if (!blobConfigured()) {
    return NextResponse.json({ testCases: [] })
  }

  try {
    const testCases = await loadExistingTestCases()
    return NextResponse.json({ testCases })
  } catch (error) {
    console.error("Failed to load test cases from Blob:", error)
    return NextResponse.json({ testCases: [] }, { status: 500 })
  }
}

async function loadExistingTestCases(): Promise<TestCase[]> {
  const { blobs } = await list({ prefix: BLOB_PATH })
  if (blobs.length === 0) return []
  // The blob's public URL is CDN-cached. Without `cache: 'no-store'` plus a
  // cache-busting query param the server reads stale content and the next
  // upsert merges against an out-of-date baseline, silently overwriting
  // freshly-saved testCases. Both layers needed: 'no-store' bypasses fetch's
  // own cache, the query param forces a fresh origin pull at the CDN layer.
  const cacheBust = `?_t=${Date.now()}`
  const response = await fetch(blobs[0].url + cacheBust, { cache: "no-store" })
  return (await response.json()) as TestCase[]
}

async function writeTestCases(testCases: TestCase[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(testCases), {
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    access: "public",
  })
}

export async function POST(request: Request) {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: "Blob storage not configured" },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()

    // ===== Upsert / delete mode =====
    // Used by the active /eval and /testing UIs so each state update only
    // ships the changed cases (~100KB) instead of the full ~28MB array,
    // which exceeded Vercel's ~4.5MB serverless request-body limit and
    // caused silent 413 failures on every save.
    if (Array.isArray(body.upsert) || Array.isArray(body.deleteIds)) {
      const upserts: TestCase[] = Array.isArray(body.upsert) ? body.upsert : []
      const deleteIds: string[] = Array.isArray(body.deleteIds) ? body.deleteIds : []
      const upsertById = new Map<string, TestCase>()
      for (const tc of upserts) {
        if (tc && typeof tc.id === "string") upsertById.set(tc.id, tc)
      }
      const deleteSet = new Set(deleteIds)

      const existing = await loadExistingTestCases()
      const existingIds = new Set(existing.map((tc) => tc.id))

      const merged: TestCase[] = existing
        .filter((tc) => !deleteSet.has(tc.id))
        .map((tc) => upsertById.get(tc.id) ?? tc)

      // Append newly-created cases at the front (matches client prepend semantics)
      for (const [id, tc] of upsertById) {
        if (!existingIds.has(id)) merged.unshift(tc)
      }

      await writeTestCases(merged)
      return NextResponse.json({ success: true, total: merged.length })
    }

    // ===== Legacy full-replace mode =====
    // Kept for migration scripts. Subject to the 4.5MB body limit; do not
    // use from the client UI on large cohorts.
    const testCases: TestCase[] = body.testCases
    if (!Array.isArray(testCases)) {
      return NextResponse.json(
        { error: "Provide either { upsert, deleteIds } or { testCases }" },
        { status: 400 }
      )
    }

    await writeTestCases(testCases)
    return NextResponse.json({ success: true, total: testCases.length })
  } catch (error: any) {
    console.error("Failed to save test cases to Blob:", error)
    return NextResponse.json(
      { error: `Failed to save test cases: ${error.message || "unknown error"}` },
      { status: 500 }
    )
  }
}
