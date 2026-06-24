"use client"

import { useState } from "react"
import { X, ArrowRight, Send } from "lucide-react"

export type FeedbackMode = "test" | "real"

interface FeedbackModalProps {
  mode: FeedbackMode
  // Optional context the API correlates against later.
  analysisRequestId?: string | null
  expectedDiagnosis?: string
  actualTop1?: string
  onClose: () => void
  onSubmitted: () => void
}

const LIKERT_LABELS_VALUE = ["Not at all", "Slightly", "Somewhat", "Quite", "Extremely"]
const LIKERT_LABELS_UX = ["Frustrating", "Below average", "OK", "Good", "Great"]
const LIKERT_LABELS_USEFUL = ["Not useful", "A little", "Somewhat", "Useful", "Very useful"]

const LIKERT_EMOJIS = ["😞", "🙁", "😐", "🙂", "😄"]

/**
 * Post-report survey modal. Triggered 5 seconds after the user lands on
 * /results/print (gives them time to read the report first). Question
 * set diverges based on whether the session was started by the "Create
 * Test User" shortcut (sessionStorage has testUserGroundTruth) or by a
 * real patient flow.
 *
 * Modal is dismissible via the X — no penalty, no re-prompt this
 * session. Submission persists to Upstash KV via /api/feedback.
 */
export function FeedbackModal({
  mode,
  analysisRequestId,
  expectedDiagnosis,
  actualTop1,
  onClose,
  onSubmitted,
}: FeedbackModalProps) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Test-mode answers
  const [valueRating, setValueRating] = useState<number | null>(null)
  const [uxRating, setUxRating] = useState<number | null>(null)
  const [testComments, setTestComments] = useState("")

  // Real-mode answers
  const [usefulnessRating, setUsefulnessRating] = useState<number | null>(null)
  const [learnedSomething, setLearnedSomething] = useState<"yes" | "no" | null>(null)
  const [whatLearned, setWhatLearned] = useState("")
  const [confirmedSomething, setConfirmedSomething] = useState<"yes" | "no" | null>(null)
  const [whatConfirmed, setWhatConfirmed] = useState("")
  const [realComments, setRealComments] = useState("")

  const totalSteps = mode === "test" ? 3 : 4
  const isLast = step === totalSteps

  const submit = async () => {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const payload =
        mode === "test"
          ? {
              mode: "test" as const,
              valueRating: valueRating ?? undefined,
              uxRating: uxRating ?? undefined,
              comments: testComments.trim() || undefined,
              expectedDiagnosis,
              actualTop1,
            }
          : {
              mode: "real" as const,
              usefulnessRating: usefulnessRating ?? undefined,
              learnedSomething: learnedSomething ?? undefined,
              whatLearned: whatLearned.trim() || undefined,
              confirmedSomething: confirmedSomething ?? undefined,
              whatConfirmed: whatConfirmed.trim() || undefined,
              comments: realComments.trim() || undefined,
            }
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, analysisRequestId }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(txt.slice(0, 200) || `Server returned ${res.status}`)
      }
      onSubmitted()
    } catch (err: any) {
      setError(err?.message || "Failed to submit")
    } finally {
      setSubmitting(false)
    }
  }

  const advance = () => {
    if (isLast) {
      submit()
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#8b2500] mb-1">
              {mode === "test" ? "Test feedback" : "Your feedback"}
            </div>
            <div className="text-sm text-gray-600">
              Question {step} of {totalSteps}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close feedback"
            className="text-gray-400 hover:text-gray-700 transition-colors -mt-1 -mr-1 p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Intro on step 1 */}
        {step === 1 && (
          <div className="px-5 pt-4 text-sm text-gray-700 leading-relaxed">
            {mode === "test" ? (
              <>
                Thank you for testing SecondLook! I would love your feedback so I can make it better
                <span className="text-gray-500"> ({totalSteps} questions).</span>
              </>
            ) : (
              <>
                Thank you for using SecondLook! I would love your feedback so I can make it better
                <span className="text-gray-500"> ({totalSteps} questions).</span>
              </>
            )}
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {mode === "test" && step === 1 && (
            <LikertQuestion
              prompt="Rate the value to someone searching for a diagnosis"
              labels={LIKERT_LABELS_VALUE}
              value={valueRating}
              onChange={setValueRating}
            />
          )}
          {mode === "test" && step === 2 && (
            <LikertQuestion
              prompt="Rate the user experience"
              labels={LIKERT_LABELS_UX}
              value={uxRating}
              onChange={setUxRating}
            />
          )}
          {mode === "test" && step === 3 && (
            <OpenTextQuestion
              prompt="Please give me any comments or feedback!"
              value={testComments}
              onChange={setTestComments}
            />
          )}

          {mode === "real" && step === 1 && (
            <LikertQuestion
              prompt="Was SecondLook useful to you in your journey?"
              labels={LIKERT_LABELS_USEFUL}
              value={usefulnessRating}
              onChange={setUsefulnessRating}
            />
          )}
          {mode === "real" && step === 2 && (
            <YesNoQuestion
              prompt="Did you learn anything new from SecondLook?"
              value={learnedSomething}
              onChange={setLearnedSomething}
              followUpLabel="What did you learn?"
              followUpValue={whatLearned}
              onFollowUpChange={setWhatLearned}
            />
          )}
          {mode === "real" && step === 3 && (
            <YesNoQuestion
              prompt="Did SecondLook confirm anything you already knew?"
              value={confirmedSomething}
              onChange={setConfirmedSomething}
              followUpLabel="What did it confirm?"
              followUpValue={whatConfirmed}
              onFollowUpChange={setWhatConfirmed}
            />
          )}
          {mode === "real" && step === 4 && (
            <OpenTextQuestion
              prompt="Please give me any feedback on what was helpful or bad with SecondLook."
              value={realComments}
              onChange={setRealComments}
            />
          )}
        </div>

        {/* Footer */}
        {error && (
          <div className="mx-5 mb-3 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">
            {error}
          </div>
        )}
        <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Your feedback is anonymous beyond IP and time.
          </span>
          <button
            onClick={advance}
            disabled={submitting}
            className="px-5 py-2 bg-[#8b2500] text-white text-sm font-semibold hover:bg-[#6d1d00] transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <span className="inline-block h-3 w-3 border-2 border-white border-r-transparent rounded-full animate-spin" />
                Sending…
              </>
            ) : isLast ? (
              <>
                <Send className="h-4 w-4" />
                Submit
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function LikertQuestion({
  prompt,
  labels,
  value,
  onChange,
}: {
  prompt: string
  labels: string[]
  value: number | null
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="font-semibold text-gray-900 mb-4">{prompt}</div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`flex flex-col items-center gap-1 px-1 py-3 border-2 transition-all ${
                selected
                  ? "border-[#8b2500] bg-[#faf6f0]"
                  : "border-gray-200 hover:border-[#8b2500] bg-white"
              }`}
            >
              <span className="text-2xl leading-none" aria-hidden>
                {LIKERT_EMOJIS[n - 1]}
              </span>
              <span
                className={`text-[10px] text-center leading-tight ${
                  selected ? "text-[#8b2500] font-semibold" : "text-gray-600"
                }`}
              >
                {labels[n - 1]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function YesNoQuestion({
  prompt,
  value,
  onChange,
  followUpLabel,
  followUpValue,
  onFollowUpChange,
}: {
  prompt: string
  value: "yes" | "no" | null
  onChange: (v: "yes" | "no") => void
  followUpLabel: string
  followUpValue: string
  onFollowUpChange: (v: string) => void
}) {
  return (
    <div>
      <div className="font-semibold text-gray-900 mb-3">{prompt}</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {(["yes", "no"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`py-3 border-2 font-semibold uppercase text-sm transition-all ${
              value === opt
                ? "border-[#8b2500] bg-[#8b2500] text-white"
                : "border-gray-200 hover:border-[#8b2500] text-gray-700"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {value === "yes" && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-700">{followUpLabel}</label>
          <textarea
            value={followUpValue}
            onChange={(e) => onFollowUpChange(e.target.value)}
            rows={3}
            maxLength={5000}
            className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-[#8b2500] focus:ring-1 focus:ring-[#8b2500] resize-none"
            placeholder="A few words is plenty."
            autoFocus
          />
        </div>
      )}
    </div>
  )
}

function OpenTextQuestion({
  prompt,
  value,
  onChange,
}: {
  prompt: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <div className="font-semibold text-gray-900 mb-3">{prompt}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        maxLength={5000}
        className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-[#8b2500] focus:ring-1 focus:ring-[#8b2500] resize-none"
        placeholder="Anything that was helpful, confusing, missing, or wrong. Even one sentence helps."
        autoFocus
      />
    </div>
  )
}
