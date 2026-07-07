import Link from "next/link"
import type { Metadata } from "next"
import {
  ArrowRight,
  Sparkles,
  ChevronRight,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Frequently Asked Questions | SecondLook",
  description:
    "Answers to common questions about SecondLook — what it is, how it works, how accurate it is, what happens to your data, and what to do with the results.",
  robots: { index: true, follow: true },
}

/**
 * The FAQ page is organized as a small set of themed sections so a
 * patient scanning for their specific concern doesn't have to read
 * every entry. Sections roughly track the actual objections a
 * rare-disease patient searching for answers has: what is this, does
 * it really help, is my data safe, how do I use the results.
 *
 * Content is duplicated in the JSON-LD FAQPage schema at the bottom
 * for search-engine surface visibility. Any factual claim here must
 * match the /legal/privacy policy and the actual pipeline behavior —
 * corrections shipped inline are always safer than "we'll fix it
 * later."
 */

interface QA {
  q: string
  a: React.ReactNode
  /** Plain-text version of `a` for JSON-LD. Must match a.textContent semantically. */
  aPlain: string
}

interface Section {
  title: string
  items: QA[]
}

const SECTIONS: Section[] = [
  {
    title: "What SecondLook is",
    items: [
      {
        q: "What is SecondLook?",
        a: (
          <>
            SecondLook is a diagnostic support tool built specifically for rare and
            complex conditions. You share your symptoms and medical history; our
            system runs your case through fifteen specialist AI perspectives in
            parallel, grounded in a knowledge base of 9,275 rare-disease profiles,
            and returns a ranked list of possibilities with the specific tests
            that could confirm each one.
          </>
        ),
        aPlain:
          "SecondLook is a diagnostic support tool for rare and complex conditions. You share your symptoms and history; our system runs your case through fifteen specialist AI perspectives, grounded in a knowledge base of 9,275 rare-disease profiles, and returns a ranked list of possibilities with the specific tests that could confirm each one.",
      },
      {
        q: "Who is SecondLook for?",
        a: (
          <>
            Three groups. Undiagnosed adults who have seen multiple specialists
            without an answer. Parents navigating a child&rsquo;s symptoms no one
            can connect. And anyone with a diagnosis they suspect is incomplete or
            wrong. If you&rsquo;ve been through the diagnostic odyssey and want a
            fresh, structured look, we hope SecondLook can help.
          </>
        ),
        aPlain:
          "SecondLook aims to help undiagnosed adults who have seen multiple specialists without an answer, parents navigating a child's unexplained symptoms, and anyone with a diagnosis they suspect is incomplete or wrong.",
      },
      {
        q: "Is SecondLook a doctor?",
        a: (
          <>
            No. SecondLook is not a doctor and not a medical device. It cannot
            examine you, order tests, or make a diagnosis. What it can do is give
            you a structured, ranked view of the possibilities the evidence in
            your story supports &mdash; something you take into a conversation
            with a real clinician, not something that replaces one.
          </>
        ),
        aPlain:
          "No. SecondLook is not a doctor and not a medical device. It cannot examine you, order tests, or make a diagnosis. It provides a ranked view of possibilities that you take into a conversation with a real clinician.",
      },
    ],
  },
  {
    title: "Does it really help?",
    items: [
      {
        q: "How accurate is SecondLook?",
        a: (
          <>
            On rare-disease cases from a published research benchmark, SecondLook
            names the correct diagnosis at position #1 for nearly 1 in 2 patients.
            For 6 in 10 patients, we either name the diagnosis or point to the
            single test that would confirm it. For 8 in 10, one of the top 5
            tests we recommend would definitively confirm the answer. See the{" "}
            <Link href="/" className="text-[#8b2500] underline">
              homepage
            </Link>{" "}
            for methodology and comparison to other AI models.
          </>
        ),
        aPlain:
          "On rare-disease cases from a published research benchmark, SecondLook names the correct diagnosis at position 1 for nearly 1 in 2 patients. For 6 in 10, we either name the diagnosis or point to the single confirmatory test. For 8 in 10, one of the top 5 tests we recommend would confirm the answer.",
      },
      {
        q: "How is SecondLook different from ChatGPT or Claude?",
        a: (
          <>
            ChatGPT and Claude are single AI models answering a single query.
            SecondLook is a multi-stage pipeline: fifteen specialist agents debate
            your case in parallel; each candidate is scored against formal
            diagnostic criteria from our rare-disease knowledge base; a
            reconciliation step and critic layer refine the top 10; and every
            candidate ends with the specific test that would confirm it. On the
            same rare-disease cases we compared, SecondLook is 30&ndash;35% more
            accurate at position 1 than either single-shot model.
          </>
        ),
        aPlain:
          "ChatGPT and Claude are single AI models answering a single query. SecondLook is a multi-stage pipeline with fifteen specialist agents, criteria-grounded scoring against a rare-disease knowledge base, reconciliation, and per-candidate test recommendations. On the same rare-disease cases, SecondLook is 30-35 percent more accurate at position 1 than either single-shot model.",
      },
      {
        q: "What kinds of conditions can SecondLook help identify?",
        a: (
          <>
            SecondLook is tuned for rare and complex conditions &mdash; the kind
            that often go undiagnosed for years. Our knowledge base includes
            9,275 rare-disease profiles across all body systems: genetic
            syndromes, autoimmune and inflammatory conditions, metabolic
            disorders, connective-tissue diseases, mitochondrial disorders,
            endocrine disorders, neurological rare diseases, and many more. It is
            not built for common conditions where a general symptom checker would
            do fine.
          </>
        ),
        aPlain:
          "SecondLook is tuned for rare and complex conditions across all body systems: genetic syndromes, autoimmune and inflammatory conditions, metabolic disorders, connective-tissue diseases, mitochondrial disorders, endocrine disorders, neurological rare diseases, and more. It is not built for common conditions where a general symptom checker would suffice.",
      },
      {
        q: "What if the diagnosis SecondLook suggests isn't right?",
        a: (
          <>
            That&rsquo;s a real possibility &mdash; our current best number is
            nearly 1 in 2 correct at position #1, which means more than 1 in 2 of
            the time our top pick is not the final answer. That&rsquo;s why the
            report gives you the top 10 possibilities, why each one comes with
            the test that would confirm or rule it out, and why the whole thing
            is framed as a conversation-starter with your clinician &mdash; not a
            verdict. If your doctor rules out our top suggestion, our second,
            third, or fourth may still be worth exploring.
          </>
        ),
        aPlain:
          "The current best-case accuracy is nearly 1 in 2 at position 1, so the top pick is often not the final answer. The report includes the top 10 possibilities with per-candidate confirmatory tests, so if your doctor rules out our top suggestion, others in the list remain worth exploring.",
      },
    ],
  },
  {
    title: "Your data and privacy",
    items: [
      {
        q: "Is my data private?",
        a: (
          <>
            Yes. The text you enter is processed by AI models to generate your
            report and is stored securely for up to 90 days so we can debug
            errors and improve the pipeline. We do not sell your data, share it
            for advertising, or make it accessible outside our team. The full
            details are in our{" "}
            <Link
              href="/legal/privacy"
              className="text-[#8b2500] underline"
            >
              privacy policy
            </Link>
            .
          </>
        ),
        aPlain:
          "The text you enter is processed by AI models to generate your report and is stored securely for up to 90 days for debugging and pipeline improvement. We do not sell your data, share it for advertising, or make it accessible outside our team. Full details in the privacy policy.",
      },
      {
        q: "Which AI models process my case?",
        a: (
          <>
            SecondLook uses OpenAI and Anthropic (Claude) models under their
            standard API terms &mdash; not their public consumer products.
            Neither vendor uses API traffic for model training. Your case is
            processed to generate your report and is not used to train any AI
            model.
          </>
        ),
        aPlain:
          "SecondLook uses OpenAI and Anthropic (Claude) models under their standard API terms. Neither vendor uses API traffic for model training. Your case is processed to generate your report and is not used to train any AI model.",
      },
      {
        q: "Is this HIPAA-compliant?",
        a: (
          <>
            SecondLook is a research preview and is not offered as a
            HIPAA-covered service. If you enter identifying information that
            constitutes protected health information under HIPAA, we treat it
            with the same operational care as we would under HIPAA &mdash; but
            we do not offer BAAs or the formal covered-entity relationship
            HIPAA requires. If HIPAA coverage matters to your use case, use
            SecondLook without identifying information (age, sex, symptoms are
            enough for the analysis; names, addresses, medical-record numbers
            are not needed).
          </>
        ),
        aPlain:
          "SecondLook is a research preview and is not offered as a HIPAA-covered service. We do not offer BAAs. For HIPAA-sensitive use, submit without identifying information — age, sex, and symptoms are enough for the analysis.",
      },
      {
        q: "Can I delete my data?",
        a: (
          <>
            Yes. Request deletion at any time by emailing us and we&rsquo;ll
            remove your case within 7 business days. See the{" "}
            <Link
              href="/legal/privacy"
              className="text-[#8b2500] underline"
            >
              privacy policy
            </Link>{" "}
            for the current contact.
          </>
        ),
        aPlain:
          "Yes. Email us to request deletion; we remove your case within 7 business days. Contact details in the privacy policy.",
      },
    ],
  },
  {
    title: "Using SecondLook",
    items: [
      {
        q: "How long does it take?",
        a: (
          <>
            About ten minutes total. Five to seven minutes to answer the intake
            questions and describe your symptoms; the analysis itself runs in
            about eight to ten minutes. You can walk away and come back &mdash;
            the report is saved to your session.
          </>
        ),
        aPlain:
          "About ten minutes total. Five to seven minutes to answer intake questions; the analysis runs in eight to ten minutes.",
      },
      {
        q: "Do I need to upload lab reports or imaging?",
        a: (
          <>
            No &mdash; the written narrative is enough on its own. Uploading
            lab reports, imaging summaries, or specialist notes gives the
            analysis more to work with and typically sharpens the ranking,
            but it&rsquo;s optional. You can upload PDFs, images (JPG/PNG),
            markdown, or plain-text files.
          </>
        ),
        aPlain:
          "No. The written narrative is enough. Uploading lab reports, imaging summaries, or specialist notes as PDF, image, markdown, or plain text is optional and sharpens the ranking when available.",
      },
      {
        q: "What do I do with the results?",
        a: (
          <>
            Bring them to your next clinical appointment. The report is
            designed to be a conversation starter with a real clinician:
            &ldquo;here are the possibilities I&rsquo;d like to work through,
            and here are the tests that would confirm or rule out each one.&rdquo;
            Some patients bring the printed report; others summarize the top
            three candidates and their confirmatory tests. Either works. What
            SecondLook does not do &mdash; and cannot do &mdash; is act on the
            results in your medical care; that&rsquo;s your clinician&rsquo;s
            role.
          </>
        ),
        aPlain:
          "Bring the results to your next clinical appointment. The report is a conversation starter with a real clinician: 'here are the possibilities and the tests that would confirm or rule out each one.' SecondLook does not act on results in your medical care; that is your clinician's role.",
      },
      {
        q: "Should I upload a photo of a rash or an X-ray?",
        a: (
          <>
            Yes, and either works. On the Photos &amp; Imaging step you can
            upload a photograph of a visible finding (rash, eye redness,
            swelling) or a medical imaging study (X-ray, CT, MRI, ultrasound).
            SecondLook describes what&rsquo;s visible in clinical terms and
            adds it to the case narrative.
          </>
        ),
        aPlain:
          "Yes. You can upload a photograph of a visible finding (rash, redness, swelling) or a medical imaging study (X-ray, CT, MRI, ultrasound) on the Photos and Imaging step. SecondLook describes what is visible in clinical terms and adds it to the case narrative.",
      },
      {
        q: "How much does SecondLook cost?",
        a: (
          <>
            Free while we&rsquo;re in early access &mdash; no signup, no login,
            no card required.
          </>
        ),
        aPlain:
          "Free while we are in early access. No signup, no login, no card required.",
      },
    ],
  },
  {
    title: "The medical picture",
    items: [
      {
        q: "Can SecondLook diagnose me?",
        a: (
          <>
            No. Only a licensed clinician can make a diagnosis. SecondLook
            surfaces possibilities and the tests that would confirm them; the
            diagnostic act itself belongs to your clinician.
          </>
        ),
        aPlain:
          "No. Only a licensed clinician can make a diagnosis. SecondLook surfaces possibilities and the tests that would confirm them.",
      },
      {
        q: "What if I have an emergency?",
        a: (
          <>
            Call your local emergency number or go to an emergency department.
            SecondLook takes about ten minutes to complete an analysis and is
            not designed for time-critical decisions.
          </>
        ),
        aPlain:
          "Call your local emergency number or go to an emergency department. SecondLook takes about ten minutes and is not designed for time-critical decisions.",
      },
      {
        q: "Should I use SecondLook if I already have a diagnosis I'm happy with?",
        a: (
          <>
            Only if something about it isn&rsquo;t sitting right &mdash;
            symptoms it doesn&rsquo;t explain, a treatment that isn&rsquo;t
            working, a family history that suggests something else. If your
            diagnosis explains the picture and your care plan is working,
            SecondLook doesn&rsquo;t add much.
          </>
        ),
        aPlain:
          "Only if something about the current diagnosis is not sitting right — unexplained symptoms, an ineffective treatment, or a family history that suggests something else. If the current picture is complete and care is working, SecondLook does not add much.",
      },
    ],
  },
]

export default function FAQPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SECTIONS.flatMap((s) =>
      s.items.map((qa) => ({
        "@type": "Question",
        name: qa.q,
        acceptedAnswer: { "@type": "Answer", text: qa.aPlain },
      })),
    ),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-white">
        {/* Header — matches the homepage editorial style. */}
        <header className="border-b border-[#d4c5b0] bg-[#faf6f0]">
          <div className="max-w-[1140px] mx-auto px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between">
            <Link
              href="/"
              className="font-serif text-[1.35rem] font-semibold tracking-[0.01em]"
            >
              <span className="text-[#1a1a1a]">Second</span>
              <span className="text-[#8b2500]">Look</span>
            </Link>
            <Link
              href="/step-1"
              className="inline-flex items-center gap-2 font-sans text-[0.7rem] sm:text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-white bg-[#8b2500] px-4 sm:px-5 py-2 sm:py-2.5 hover:bg-[#6d1d00] transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Get Your Analysis</span>
              <span className="sm:hidden">Start</span>
            </Link>
          </div>
        </header>

        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="max-w-[1140px] mx-auto px-4 sm:px-8 pt-6"
        >
          <ol className="flex items-center gap-1.5 text-sm">
            <li>
              <Link
                href="/"
                className="font-sans text-[11px] uppercase tracking-[0.12em] text-[#8b7355] hover:text-[#8b2500]"
              >
                Home
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5 text-[#c9a96e]" />
            </li>
            <li>
              <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-[#8b2500]">
                Frequently asked questions
              </span>
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="max-w-[1140px] mx-auto px-4 sm:px-8 pt-8 sm:pt-12 pb-8 sm:pb-14">
          <div className="max-w-[760px]">
            <h1 className="font-serif text-[2rem] sm:text-[2.6rem] md:text-[3rem] font-normal leading-[1.14] text-[#1a1a1a] mb-4 sm:mb-6 tracking-[-0.01em]">
              Frequently asked questions
            </h1>
            <p className="font-serif-body text-base sm:text-lg leading-[1.7] text-[#5a5a5a]">
              Everything patients and families ask us before using SecondLook &mdash;
              plus the answers to a few questions we wish more people asked us.
              If yours isn&rsquo;t here, the{" "}
              <Link href="/legal/privacy" className="text-[#8b2500] underline">
                privacy policy
              </Link>{" "}
              covers data handling in detail.
            </p>
          </div>
        </section>

        {/* FAQ content */}
        <section className="max-w-[1140px] mx-auto px-4 sm:px-8 pb-16 sm:pb-24">
          <div className="max-w-[820px] grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 sm:gap-12">
            {/* Sticky table of contents (desktop only) */}
            <nav
              aria-label="Section navigation"
              className="hidden lg:block sticky top-6 self-start"
            >
              <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500] mb-3">
                Jump to
              </div>
              <ul className="space-y-2">
                {SECTIONS.map((s) => (
                  <li key={s.title}>
                    <a
                      href={`#${slug(s.title)}`}
                      className="font-serif-body text-sm text-[#5a5a5a] hover:text-[#8b2500] leading-snug block"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Sections */}
            <div className="space-y-12 sm:space-y-14">
              {SECTIONS.map((s) => (
                <div key={s.title} id={slug(s.title)}>
                  <div className="mb-6 sm:mb-8 pb-3 border-b border-[#d4c5b0]">
                    <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500] mb-2">
                      Section
                    </div>
                    <h2 className="font-serif text-[1.4rem] sm:text-[1.7rem] font-normal text-[#1a1a1a] leading-tight">
                      {s.title}
                    </h2>
                  </div>

                  <div className="space-y-6 sm:space-y-8">
                    {s.items.map((qa) => (
                      <div
                        key={qa.q}
                        className="border-l-2 border-[#c9a96e] pl-4 sm:pl-6"
                      >
                        <h3 className="font-serif text-[1.05rem] sm:text-[1.15rem] font-medium text-[#1a1a1a] mb-2 leading-snug">
                          {qa.q}
                        </h3>
                        <div className="font-serif-body text-sm sm:text-[15px] text-[#5a5a5a] leading-[1.75]">
                          {qa.a}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA — same visual language as the homepage's final CTA. */}
        <section className="py-12 sm:py-16 bg-[#faf6f0] border-t border-[#d4c5b0]">
          <div className="max-w-[520px] mx-auto px-4 sm:px-8 text-center">
            <h2 className="font-serif text-[1.5rem] sm:text-[2rem] font-normal text-[#1a1a1a] mb-4 leading-snug">
              Ready when you are.
            </h2>
            <p className="font-serif-body text-[1.05rem] text-[#5a5a5a] leading-relaxed mb-8">
              Ten minutes of your time. A ranked list of what might be going on,
              and the specific tests that could confirm each one.
            </p>
            <Link
              href="/step-1"
              className="inline-flex items-center gap-2 font-sans text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-white bg-[#8b2500] px-10 py-4 hover:bg-[#6d1d00] transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              <span>Get Your Analysis &mdash; Free</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Footer — matches the homepage. */}
        <footer className="border-t border-[#d4c5b0] pt-8 sm:pt-10 pb-8">
          <div className="max-w-[1140px] mx-auto px-4 sm:px-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-baseline gap-4 mb-3">
              <div className="flex flex-col md:flex-row items-start md:items-baseline gap-2 md:gap-8">
                <Link href="/" className="font-serif text-base font-semibold">
                  <span className="text-[#1a1a1a]">Second</span>
                  <span className="text-[#8b2500]">Look</span>
                </Link>
                <span className="font-serif-body text-[0.8rem] text-[#999] italic">
                  Rare disease diagnostic guidance
                </span>
              </div>
              <div className="font-sans text-[0.7rem] text-[#999] tracking-[0.02em]">
                &copy; 2026 SecondLook
              </div>
            </div>
            <div className="flex flex-wrap gap-7 mt-3">
              <Link
                href="/faq"
                className="font-sans text-[0.7rem] text-[#999] uppercase tracking-[0.04em] hover:text-[#5a5a5a] transition-colors"
              >
                FAQ
              </Link>
              <Link
                href="/legal/privacy"
                className="font-sans text-[0.7rem] text-[#999] uppercase tracking-[0.04em] hover:text-[#5a5a5a] transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/legal/terms"
                className="font-sans text-[0.7rem] text-[#999] uppercase tracking-[0.04em] hover:text-[#5a5a5a] transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/blog"
                className="font-sans text-[0.7rem] text-[#999] uppercase tracking-[0.04em] hover:text-[#5a5a5a] transition-colors"
              >
                Resources
              </Link>
            </div>
            <div className="w-full h-px bg-[#e5ddd3] my-5" />
            <p className="font-serif-body text-[0.72rem] text-[#b0a898] leading-relaxed max-w-[620px]">
              SecondLook provides educational information only and is not a
              substitute for professional medical advice. Always consult with a
              qualified healthcare provider for medical concerns.
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
