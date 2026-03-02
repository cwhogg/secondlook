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
    const { blobs } = await list({ prefix: BLOB_PATH })
    if (blobs.length === 0) {
      return NextResponse.json({ testCases: [] })
    }

    const response = await fetch(blobs[0].url)
    const testCases: TestCase[] = await response.json()
    return NextResponse.json({ testCases })
  } catch (error) {
    console.error("Failed to load test cases from Blob:", error)
    return NextResponse.json({ testCases: [] }, { status: 500 })
  }
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
    const testCases: TestCase[] = body.testCases

    if (!Array.isArray(testCases)) {
      return NextResponse.json(
        { error: "testCases must be an array" },
        { status: 400 }
      )
    }

    await put(BLOB_PATH, JSON.stringify(testCases), {
      contentType: "application/json",
      addRandomSuffix: false,
      access: "public",
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save test cases to Blob:", error)
    return NextResponse.json(
      { error: "Failed to save test cases" },
      { status: 500 }
    )
  }
}
