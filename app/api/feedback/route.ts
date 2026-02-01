import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const body = await request.json()
  console.log("[Feedback]", JSON.stringify(body, null, 2))
  return NextResponse.json({ success: true })
}
