import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

const tools = [
  {
    href: "/admin/sessions",
    label: "Funnel",
    title: "Sessions & Usage",
    description:
      "Every visitor's step-by-step progression through the intake flow — IP, last step, patient info, symptoms, dropoff. Complete sessions link straight to the analysis run.",
  },
  {
    href: "/admin/runs",
    label: "Live",
    title: "Production Runs",
    description: (
      <>
        Every successful patient analysis from <code className="font-sans text-[0.82em] text-[#6d4c30] bg-[#faf6f0] px-1 py-px border border-[#e5d9c8]">/analyze-patient-v2</code> — top diagnosis, confidence, IP, full report on click.
      </>
    ),
  },
  {
    href: "/admin/feedback",
    label: "Signal",
    title: "Feedback",
    description:
      "Responses from the post-report survey modal. Aggregate ratings, free-text comments, link back to the analysis run.",
  },
  {
    href: "/admin/testing",
    label: "Harness",
    title: "Testing Framework",
    description:
      "Generate synthetic patient cases, run the V2 pipeline against them, grade against ground truth.",
  },
  {
    href: "/admin/eval",
    label: "Benchmark",
    title: "Phenopacket2Prompt Eval",
    description:
      "Run published benchmark cases against the live pipeline, paper-faithful Mondo grading.",
  },
]

export default function AdminIndexPage() {
  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      {/* Slim brand bar */}
      <nav className="border-b border-[#d4c5b0]">
        <div className="max-w-[820px] mx-auto px-5 sm:px-8 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-[1.15rem] font-semibold tracking-[0.01em]">
            <span className="text-[#1a1a1a]">Second</span>
            <span className="text-[#8b2500]">Look</span>
          </Link>
          <Link
            href="/"
            className="font-sans text-[0.72rem] font-medium text-[#5a5a5a] uppercase tracking-[0.08em] hover:text-[#8b2500] transition-colors"
          >
            ← Back home
          </Link>
        </div>
      </nav>

      <main className="max-w-[820px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
        {/* Masthead */}
        <header className="mb-10 sm:mb-12">
          <div className="font-sans text-[0.7rem] font-semibold text-[#8b2500] uppercase tracking-[0.18em] mb-3">
            Internal Tools
          </div>
          <h1 className="font-serif text-[2.4rem] sm:text-[3rem] font-normal text-[#1a1a1a] leading-none mb-3">
            Admin
          </h1>
          <p className="font-serif-body text-[15px] sm:text-base text-[#5a5a5a] leading-relaxed max-w-[480px]">
            Instrumentation for the diagnostic pipeline — production traffic, user
            feedback, and the two evaluation harnesses.
          </p>
          <div className="mt-6 h-px w-full bg-gradient-to-r from-[#c9a96e] via-[#d4c5b0] to-transparent" />
        </header>

        {/* Tool list */}
        <div className="border-t border-[#d4c5b0]">
          {tools.map((tool, index) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group grid grid-cols-[auto_1fr_auto] items-start gap-4 sm:gap-6 border-b border-[#d4c5b0] px-1 sm:px-2 py-6 sm:py-7 transition-colors hover:bg-[#faf6f0]"
            >
              {/* Index numeral */}
              <div className="font-serif text-[1.6rem] sm:text-[2rem] font-normal leading-none text-[#c9a96e] opacity-70 pt-0.5 tabular-nums transition-colors group-hover:text-[#8b2500] group-hover:opacity-100">
                {String(index + 1).padStart(2, "0")}
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <h2 className="font-serif text-lg sm:text-xl font-medium text-[#1a1a1a] leading-tight transition-colors group-hover:text-[#8b2500]">
                    {tool.title}
                  </h2>
                  <span className="font-sans text-[0.6rem] font-semibold text-[#6d4c30] uppercase tracking-[0.1em] border border-[#d4c5b0] bg-[#faf6f0] px-1.5 py-0.5 leading-none">
                    {tool.label}
                  </span>
                </div>
                <p className="font-serif-body text-sm sm:text-[15px] leading-relaxed text-[#5a5a5a] max-w-[560px]">
                  {tool.description}
                </p>
              </div>

              {/* Affordance */}
              <div className="pt-1.5 text-[#c9a96e] transition-all group-hover:text-[#8b2500] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                <ArrowUpRight className="h-5 w-5" strokeWidth={1.6} />
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-8 font-sans text-[0.7rem] text-[#9a8f80] uppercase tracking-[0.1em]">
          SecondLook · Restricted access
        </p>
      </main>
    </div>
  )
}
