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
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          featureName,
          journeyLengthMonths: journeyLength ? Number(journeyLength) : null,
          helpfulness,
          improvements,
        }),
      })
      setSubmitted(true)
      setTimeout(() => {
        onOpenChange(false)
        // Reset form after close
        setEmail("")
        setJourneyLength("")
        setHelpfulness(null)
        setImprovements("")
        setSubmitted(false)
      }, 1500)
    } catch {
      // Still close on error
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const helpfulnessLabels = ["Not at all", "Slightly", "Moderately", "Very", "Extremely"]

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-8">
            <p className="text-xl font-semibold text-emerald-700">Thanks for your feedback!</p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Thank you for testing SecondLook!</DialogTitle>
          <DialogDescription className="text-sm text-gray-600 pt-1">
            This feature ({featureName}) is not yet available. We&apos;re working on it! In the meantime, we&apos;d love your feedback.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Email */}
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Q1: Journey length */}
          <div>
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Q2: Helpfulness Likert */}
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">Was SecondLook helpful?</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setHelpfulness(value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    helpfulness === value
                      ? "bg-emerald-600 text-white shadow-md"
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
          <div>
            <label htmlFor="feedback-improvements" className="block text-sm font-medium text-gray-700 mb-1">
              What would make SecondLook more helpful?
            </label>
            <textarea
              id="feedback-improvements"
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              rows={3}
              placeholder="Your thoughts..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg font-medium text-sm hover:from-emerald-700 hover:to-green-700 transition-all disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
