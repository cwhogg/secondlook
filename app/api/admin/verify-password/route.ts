import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

function constantTimeMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const testingPassword = process.env.TESTING_PASSWORD

  if (!testingPassword) {
    // No password configured — allow access
    return NextResponse.json({ authorized: true })
  }

  // Cookie-first: the /admin/login flow sets sl_admin_session. Pages that
  // call this endpoint on mount (testing, eval) send an empty password
  // body to ask "is auth even required?" — once the user has signed in
  // via the middleware-redirected /admin/login page, this cookie check
  // lets the page proceed without showing a second password form.
  const cookieHeader = request.headers.get("cookie")
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const trimmed = part.trim()
      if (trimmed.startsWith("sl_admin_session=")) {
        const value = decodeURIComponent(
          trimmed.slice("sl_admin_session=".length),
        )
        if (constantTimeMatches(value, testingPassword)) {
          return NextResponse.json({ authorized: true })
        }
        break
      }
    }
  }

  try {
    const { password } = await request.json()

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password required" }, { status: 400 })
    }

    if (constantTimeMatches(password, testingPassword)) {
      return NextResponse.json({ authorized: true })
    }

    return NextResponse.json({ error: "Invalid password" }, { status: 403 })
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}
