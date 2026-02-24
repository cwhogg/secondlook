import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const testingPassword = process.env.TESTING_PASSWORD

  if (!testingPassword) {
    // No password configured — allow access
    return NextResponse.json({ authorized: true })
  }

  try {
    const { password } = await request.json()

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password required" }, { status: 400 })
    }

    if (password === testingPassword) {
      return NextResponse.json({ authorized: true })
    }

    return NextResponse.json({ error: "Invalid password" }, { status: 403 })
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}
