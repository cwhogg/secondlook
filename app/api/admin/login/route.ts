import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'sl_admin_session'
const MAX_AGE_SEC = 60 * 60 * 24 // 24h

export async function POST(req: Request) {
  const expected = process.env.TESTING_PASSWORD
  if (!expected) {
    // Dev mode — no password set, treat as authenticated. Set a marker
    // cookie so subsequent /admin/* requests don't re-hit /admin/login
    // (the middleware also short-circuits when expected is unset, so
    // either way works).
    return NextResponse.json({ ok: true })
  }

  let password = ''
  try {
    const body = await req.json()
    password = typeof body?.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 })
  }

  const a = Buffer.from(password)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: COOKIE_NAME,
    value: password,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SEC,
  })
  return res
}

export async function DELETE() {
  // Logout — clear the cookie.
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
