"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

interface FeedbackModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  featureName: string
}

export function FeedbackModal({ open, onOpenChange, featureName }: FeedbackModalProps) {
  const [email, setEmail] = useState("")
  const [journeyLength, setJourneyLength] = useState("")
  const [helpfulness, setHelpfulness] = useState<number | null>(null)
  const [improvements, setImprovements] = useState("")
  const [emailSubmitted, setEmailSubmitted] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [submittingEmail, setSubmittingEmail] = useState(false)
  const [submittingFeedback, setSubmittingFeedback] = useState(false)

  const resetForm = () => {
    setEmail("")
    setJourneyLength("")
    setHelpfulness(null)
    setImprovements("")
    setEmailSubmitted(false)
    setFeedbackSubmitted(false)
  }

  const handleEmailSubmit = async () => {
    setSubmittingEmail(true)
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, featureName, type: "email" }),
      })
      setEmailSubmitted(true)
    } catch {
      // Silently fail
    } finally {
      setSubmittingEmail(false)
    }
  }

  const handleFeedbackSubmit = async () => {
    setSubmittingFeedback(true)
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          featureName,
          type: "feedback",
          journeyLengthMonths: journeyLength ? Number(journeyLength) : null,
          helpfulness,
          improvements,
        }),
      })
      setFeedbackSubmitted(true)
      setTimeout(() => {
        onOpenChange(false)
        resetForm()
      }, 1500)
    } catch {
      onOpenChange(false)
    } finally {
      setSubmittingFeedback(false)
    }
  }

  const helpfulnessLabels = ["Not at all", "Slightly", "Moderately", "Very", "Extremely"]

  if (feedbackSubmitted) {
    return (
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm() }}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-8">
            <p className="text-xl font-semibold text-[#8b2500]">Thanks for your feedback!</p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Thank you for testing SecondLook!</DialogTitle>
          <DialogDescription className="text-sm text-gray-600 pt-1">
            This feature ({featureName}) is not yet available, but we are working on it! Submit your email and we will let you know when this feature is available.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Email section */}
          <div>
            <label htmlFor="feedback-email" className="block text-sm font-medium text-gray-700 mb-1">
              Your email
            </label>
            <input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={emailSubmitted}
              className="w-full rounded-none border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8b2500] focus:border-[#8b2500] disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {emailSubmitted ? (
            <p className="text-sm text-[#8b2500] font-medium">Email submitted — thank you!</p>
          ) : (
            <button
              type="button"
              onClick={handleEmailSubmit}
              disabled={submittingEmail || !email}
              className="w-full py-2.5 bg-[#8b2500] text-white rounded-none font-medium text-sm hover:bg-[#6d1d00] transition-all disabled:opacity-50"
            >
              {submittingEmail ? "Submitting..." : "Submit Email"}
            </button>
          )}

          {/* Divider + feedback section */}
          <div className="border-t border-gray-200 pt-5">
            <p className="text-sm text-gray-600 mb-5">In the meantime, we&apos;d love your feedback.</p>

            {/* Q1: Journey length */}
            <div className="mb-5">
              <label htmlFor="feedback-journey" className="block text-sm font-medium text-gray-700 mb-1">
                How long have you been on this diagnostic journey (in months)?
              </label>
              <input
                id="feedback-journey"
                type="number"
                min="0"
                value={journeyLength}
                onChange={(e) => setJourneyLength(e.target.value)}
                placeholder="e.g. 6"
                className="w-full rounded-none border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8b2500] focus:border-[#8b2500]"
              />
            </div>

            {/* Q2: Helpfulness Likert */}
            <div className="mb-5">
              <p className="block text-sm font-medium text-gray-700 mb-2">Was SecondLook helpful?</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setHelpfulness(value)}
                    className={`flex-1 py-2 rounded-none text-sm font-medium transition-all ${
                      helpfulness === value
                        ? "bg-[#8b2500] text-white shadow-md"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                <span>{helpfulnessLabels[0]}</span>
                <span>{helpfulnessLabels[4]}</span>
              </div>
            </div>

            {/* Q3: Improvements */}
            <div className="mb-5">
              <label htmlFor="feedback-improvements" className="block text-sm font-medium text-gray-700 mb-1">
                What would make SecondLook more helpful?
              </label>
              <textarea
                id="feedback-improvements"
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                rows={3}
                placeholder="Your thoughts..."
                className="w-full rounded-none border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8b2500] focus:border-[#8b2500] resize-none"
              />
            </div>

            {/* Submit feedback */}
            <button
              type="button"
              onClick={handleFeedbackSubmit}
              disabled={submittingFeedback}
              className="w-full py-2.5 bg-[#8b2500] text-white rounded-none font-medium text-sm hover:bg-[#6d1d00] transition-all disabled:opacity-50"
            >
              {submittingFeedback ? "Submitting..." : "Submit Feedback"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
