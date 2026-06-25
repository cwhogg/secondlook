'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') || '/admin'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.status === 200) {
        // Hard navigation so the cookie set by the response is in scope
        // for the destination (router.push keeps the SPA cache that hasn't
        // seen the cookie yet).
        window.location.assign(from)
        return
      }
      if (res.status === 403) {
        setError('Invalid password')
      } else {
        setError(`Unexpected ${res.status}`)
      }
    } catch (err: any) {
      setError(err?.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={onSubmit}
        className="bg-white border border-gray-200 p-8 max-w-md w-full"
      >
        <h1 className="text-xl font-bold mb-4 text-gray-900">SecondLook · Admin</h1>
        <p className="text-sm text-gray-600 mb-4">Enter the admin password.</p>
        <input
          type="text"
          name="username"
          autoComplete="username"
          value="secondlook-admin"
          readOnly
          hidden
        />
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
          className="w-full px-3 py-2 border border-gray-300 mb-2 text-sm"
          placeholder="Password"
        />
        {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2 bg-[#8b2500] text-white text-sm font-semibold hover:bg-[#6d1d00] disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>}>
      <LoginForm />
    </Suspense>
  )
}
