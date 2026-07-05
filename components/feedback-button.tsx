"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { MessageSquare, X, Send, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Floating feedback button + modal, mounted globally from the root
 * layout. Non-obtrusive: 40px pill in the bottom-right corner, hidden
 * on admin routes (admins email directly).
 *
 * Submissions go to /api/feedback under mode='general' — piggybacks on
 * the same storage that /admin/feedback already lists. Capture is
 * best-effort: if the request fails we still show a warm "we got it"
 * state so the user isn't blocked by a network error they can't fix.
 */

const HIDE_ON_PATHS = ["/admin", "/step-1", "/analysis"]
// Paths where we WANT the button visible even though they might match a
// substring above. Explicit allowlist for step-1 subroutes and the like.
const FORCE_SHOW_PATHS: string[] = []

const DISMISSED_KEY = "sl_feedback_dismissed"

function shouldHide(pathname: string | null): boolean {
  if (!pathname) return false
  if (FORCE_SHOW_PATHS.some((p) => pathname.startsWith(p))) return false
  // Admin gets no widget. Step-1 during the intake flow is fine, so we
  // don't blanket-hide there — the HIDE_ON_PATHS entry above is only
  // for the /admin surface. Keep the logic explicit so the hide rule
  // stays legible.
  if (pathname.startsWith("/admin")) return true
  return false
}

function getSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined
  return window.localStorage.getItem("sl_session_id") || undefined
}

export function FeedbackButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Respect a previous "hide for this session" click.
    if (typeof window !== "undefined") {
      setDismissed(
        window.sessionStorage.getItem(DISMISSED_KEY) === "1",
      )
    }
  }, [])

  // Auto-focus the textarea when the modal opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => textareaRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  // Reset transient state when the modal closes.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setSuccess(false)
        setError(null)
        setSubmitting(false)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  // Esc to close.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  if (shouldHide(pathname) || dismissed) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            mode: "general",
            message: trimmed,
            email: email.trim() || undefined,
            page: pathname || undefined,
            sessionId: getSessionId(),
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      setSuccess(true)
      setMessage("")
      setEmail("")
      // Auto-close after a beat so the acknowledgment reads.
      setTimeout(() => setOpen(false), 1400)
    } catch (err: any) {
      setError(err?.message || "Couldn't send. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating trigger — bottom-right, respects mobile safe area. */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 pb-safe">
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Give feedback"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-[#d4c5b0] bg-white/95 backdrop-blur-sm px-4 py-2.5 shadow-sm",
              "text-[#5a5a5a] hover:text-white hover:bg-[#8b2500] hover:border-[#8b2500] transition-colors",
              "font-sans text-[0.72rem] font-semibold uppercase tracking-[0.14em]",
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
            <span>Feedback</span>
          </button>
          <button
            type="button"
            onClick={() => {
              window.sessionStorage.setItem(DISMISSED_KEY, "1")
              setDismissed(true)
            }}
            aria-label="Hide feedback button for this session"
            className="text-[#c9a96e] hover:text-[#8b2500] transition-colors p-1"
            title="Hide for this session"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="bg-white border border-[#d4c5b0] w-full max-w-md m-0 sm:m-4 rounded-none sm:rounded-none shadow-lg flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-start justify-between p-5 sm:p-6 border-b border-[#e5ddd3]">
              <div>
                <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b2500] mb-1">
                  We&rsquo;re listening
                </div>
                <h2
                  id="feedback-title"
                  className="font-serif text-xl sm:text-2xl text-[#1a1a1a] leading-tight"
                >
                  Send us feedback
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close feedback form"
                className="text-[#8b7355] hover:text-[#8b2500] transition-colors -mr-1 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            {success ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="h-6 w-6 text-emerald-700" />
                </div>
                <div className="font-serif text-lg text-[#1a1a1a]">Thanks &mdash; we got it.</div>
                <div className="font-serif-body text-sm text-[#5a5a5a] text-center max-w-xs">
                  Every note helps us make SecondLook better for the next patient searching for an answer.
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-y-auto">
                <div className="p-5 sm:p-6 space-y-4">
                  <p className="font-serif-body text-sm text-[#5a5a5a] leading-relaxed">
                    Bug reports, confusing steps, missing features, medical accuracy concerns &mdash; anything you noticed. We read every submission.
                  </p>

                  <div>
                    <label
                      htmlFor="feedback-message"
                      className="block font-sans text-[11px] font-semibold uppercase tracking-wider text-[#6d4c30] mb-1.5"
                    >
                      Your feedback
                    </label>
                    <textarea
                      ref={textareaRef}
                      id="feedback-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, 5000))}
                      required
                      rows={5}
                      placeholder="What&rsquo;s on your mind?"
                      className="w-full px-3 py-2.5 border border-[#d4c5b0] focus:ring-2 focus:ring-[#8b2500] focus:border-transparent text-sm font-serif-body resize-none"
                    />
                    <div className="mt-1 text-right font-sans text-[10px] text-[#8b7355]">
                      {message.length} / 5000
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="feedback-email"
                      className="block font-sans text-[11px] font-semibold uppercase tracking-wider text-[#6d4c30] mb-1.5"
                    >
                      Email <span className="font-normal normal-case text-[#8b7355]">(optional &mdash; if you&rsquo;d like a reply)</span>
                    </label>
                    <input
                      id="feedback-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.slice(0, 200))}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 border border-[#d4c5b0] focus:ring-2 focus:ring-[#8b2500] focus:border-transparent text-sm font-serif-body"
                    />
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                      {error}
                    </div>
                  )}
                </div>

                <div className="border-t border-[#e5ddd3] px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
                  <div className="font-serif-body text-[11px] text-[#8b7355] leading-snug">
                    We&rsquo;ll see the page you&rsquo;re on and your session id (not your name).
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || message.trim().length === 0}
                    className={cn(
                      "inline-flex items-center gap-2 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.14em] px-5 py-2.5 transition-colors",
                      submitting || message.trim().length === 0
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-[#8b2500] text-white hover:bg-[#6d1d00]",
                    )}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Sending&hellip;</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
