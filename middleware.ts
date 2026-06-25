import { NextRequest, NextResponse } from 'next/server'

// Edge-runtime guard for the entire /admin/* surface. Any unauthenticated
// visit redirects to /admin/login with ?from= so the user lands back where
// they were after sign-in. When TESTING_PASSWORD is unset (dev mode), the
// guard is a no-op so local iteration stays friction-free.
//
// Cookie value = the shared admin password verbatim. httpOnly + Secure +
// SameSite=lax. Same secret as the x-admin-password header; pages get
// session continuity for free, scripts continue using the header.

const COOKIE_NAME = 'sl_admin_session'

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function middleware(req: NextRequest) {
  const expected = process.env.TESTING_PASSWORD
  if (!expected) return NextResponse.next()

  const cookie = req.cookies.get(COOKIE_NAME)?.value
  if (cookie && timingSafeEqualStr(cookie, expected)) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = '/admin/login'
  url.search = `?from=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`
  return NextResponse.redirect(url)
}

export const config = {
  // Match every /admin/* page except /admin/login itself.
  // API routes under /api/admin/* keep their own requireAdmin() check —
  // we don't redirect API calls (the client wouldn't follow it and POST
  // bodies would be lost), they 401 instead.
  matcher: ['/admin/((?!login$|login/).*)', '/admin'],
}
