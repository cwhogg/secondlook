"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

export type IntakeStep = 1 | 2 | 3 | 4 | 5 | 6

interface StepDef {
  step: IntakeStep
  label: string
  href: string
  required: boolean
}

const STEPS: StepDef[] = [
  { step: 1, label: "Basics", href: "/step-1", required: true },
  { step: 2, label: "Your history", href: "/step-2", required: true },
  { step: 3, label: "Labs", href: "/step-3", required: false },
  { step: 4, label: "Photos", href: "/step-4", required: false },
  { step: 5, label: "Review", href: "/step-5", required: true },
  { step: 6, label: "Submit", href: "/step-6", required: true },
]

interface IntakeBreadcrumbProps {
  current: IntakeStep
}

export function IntakeBreadcrumb({ current }: IntakeBreadcrumbProps) {
  return (
    <nav aria-label="Intake progress" className="mb-8">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        {STEPS.map((s, i) => {
          const isCurrent = s.step === current
          const isPast = s.step < current
          const isFuture = s.step > current

          const numberClass = cn(
            "inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold flex-shrink-0",
            isCurrent && "bg-[#8b2500] text-white",
            isPast && "bg-emerald-600 text-white",
            isFuture && "bg-gray-200 text-gray-600",
          )

          const labelClass = cn(
            "ml-1.5",
            isCurrent && "text-[#8b2500] font-semibold",
            isPast && "text-emerald-700",
            isFuture && "text-gray-500",
          )

          // Past steps link back. Current is plain text. Future is disabled.
          const inner = (
            <span className="inline-flex items-center">
              <span className={numberClass} aria-hidden="true">
                {s.step}
              </span>
              <span className={labelClass}>
                {s.label}
                {!s.required && (
                  <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
                )}
              </span>
            </span>
          )

          return (
            <li key={s.step} className="flex items-center">
              {isPast ? (
                <Link
                  href={s.href}
                  className="hover:underline focus:outline-none focus:ring-2 focus:ring-[#8b2500] rounded"
                >
                  {inner}
                </Link>
              ) : (
                <span aria-current={isCurrent ? "step" : undefined}>{inner}</span>
              )}
              {i < STEPS.length - 1 && (
                <span className="mx-2 text-gray-300" aria-hidden="true">
                  ›
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
