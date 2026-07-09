"use client"

import { useRouter } from "next/navigation"
import { Sparkles, ArrowRight } from "lucide-react"

interface Props {
  clinicalRequestId: string
}

export function IntegrativeCTACard({ clinicalRequestId }: Props) {
  const router = useRouter()
  if (!clinicalRequestId) return null

  const onClick = () => {
    router.push(`/analysis-integrative?clinicalRequestId=${encodeURIComponent(clinicalRequestId)}`)
  }

  return (
    <div className="mt-12 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800 shrink-0">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-amber-800 mb-2">
            Complementary perspective
          </div>
          <h3 className="text-xl sm:text-2xl font-serif text-slate-900 mb-2">
            Want an integrative-medicine perspective on your case?
          </h3>
          <p className="text-sm text-slate-700 mb-5 leading-relaxed">
            A separate panel of five practitioners — Functional Medicine, Naturopath, Acupuncturist (TCM), Ayurvedic, and mind-body/somatic — will review your case in their own frameworks and produce root-cause hypotheses, functional tests to consider, and interventions to explore with a licensed practitioner. This is a complementary view of your case, not a diagnosis. Takes about 60–90 seconds.
          </p>
          <button
            onClick={onClick}
            className="inline-flex items-center gap-2 rounded-md bg-amber-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            Run integrative panel
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="mt-4 text-xs text-slate-600 leading-relaxed">
            The clinical differential above remains the primary answer. This integrative report is separate and should be discussed with your primary care physician before acting on anything.
          </div>
        </div>
      </div>
    </div>
  )
}
