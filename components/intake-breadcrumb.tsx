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

// Step 4 (old "Photos") was folded into step 3 as part of the upload
// consolidation, so this breadcrumb now shows 5 visible steps. The old
// /step-4 URL still exists but only as an auto-redirect (see
// app/step-4/page.tsx) — we hide it from the breadcrumb.
const STEPS: StepDef[] = [
  { step: 1, label: "Basics", href: "/step-1", required: true },
  { step: 2, label: "Your history", href: "/step-2", required: true },
  { step: 3, label: "Documents", href: "/step-3", required: false },
  { step: 5, label: "Review", href: "/step-5", required: true },
  { step: 6, label: "Submit", href: "/step-6", required: true },
]

interface IntakeBreadcrumbProps {
  current: IntakeStep
}

function dotClass(step: IntakeStep, current: IntakeStep, size: "sm" | "md") {
  const isCurrent = step === current
  const isPast = step < current
  const dim =
    size === "sm" ? "h-7 w-7 text-xs" : "h-6 w-6 text-xs"
  return cn(
    "inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0",
    dim,
    isCurrent && "bg-[#8b2500] text-white",
    isPast && "bg-emerald-600 text-white",
    !isCurrent && !isPast && "bg-gray-200 text-gray-600",
  )
}

export function IntakeBreadcrumb({ current }: IntakeBreadcrumbProps) {
  const currentDef = STEPS.find((s) => s.step === current) ?? STEPS[0]
  const currentPosition = STEPS.findIndex((s) => s.step === current) + 1 || 1

  return (
    <nav aria-label="Intake progress" className="mb-6 sm:mb-8">
      {/* Mobile: a tight row of 6 numbered circles, with the current
          step's label called out below. Past circles are tap-able links
          back; current and future are inert text. */}
      <div className="sm:hidden">
        <ol className="flex items-center justify-between">
          {STEPS.map((s) => {
            const isPast = s.step < current
            const node = (
              <span className={dotClass(s.step, current, "sm")} aria-hidden="true">
                {STEPS.indexOf(s) + 1}
              </span>
            )
            return (
              <li
                key={s.step}
                aria-current={s.step === current ? "step" : undefined}
                className="flex-1 flex justify-center"
              >
                {isPast ? (
                  <Link
                    href={s.href}
                    aria-label={`Back to step ${s.step}: ${s.label}`}
                    className="focus:outline-none focus:ring-2 focus:ring-[#8b2500] rounded-full"
                  >
                    {node}
                  </Link>
                ) : (
                  node
                )}
              </li>
            )
          })}
        </ol>
        <div className="mt-2 text-center text-sm text-gray-600">
          Step <span className="font-semibold text-[#8b2500]">{currentPosition}</span> of {STEPS.length}{" "}
          <span className="text-gray-400">·</span>{" "}
          <span className="font-semibold text-gray-900">{currentDef.label}</span>
          {!currentDef.required && (
            <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
          )}
        </div>
      </div>

      {/* Desktop: the labeled inline breadcrumb. Past steps link back. */}
      <ol className="hidden sm:flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        {STEPS.map((s, i) => {
          const isCurrent = s.step === current
          const isPast = s.step < current
          const isFuture = s.step > current

          const labelClass = cn(
            "ml-1.5",
            isCurrent && "text-[#8b2500] font-semibold",
            isPast && "text-emerald-700",
            isFuture && "text-gray-500",
          )

          const inner = (
            <span className="inline-flex items-center">
              <span className={dotClass(s.step, current, "md")} aria-hidden="true">
                {STEPS.indexOf(s) + 1}
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
