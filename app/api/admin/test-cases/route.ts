import { NextResponse } from "next/server"
import { kv } from "@vercel/kv"
import type { TestCase } from "@/lib/types/admin"

const KV_KEY = "test-cases"

function kvConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

export async function GET() {
  if (!kvConfigured()) {
    return NextResponse.json({ testCases: [] })
  }

  try {
    const testCases = await kv.get<TestCase[]>(KV_KEY)
    return NextResponse.json({ testCases: testCases ?? [] })
  } catch (error) {
    console.error("Failed to load test cases from KV:", error)
    return NextResponse.json({ testCases: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!kvConfigured()) {
    return NextResponse.json(
      { error: "KV storage not configured" },
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

    await kv.set(KV_KEY, testCases)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save test cases to KV:", error)
    return NextResponse.json(
      { error: "Failed to save test cases" },
      { status: 500 }
    )
  }
}
