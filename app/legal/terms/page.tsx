import Link from "next/link"
import { Layout } from "@/components/layout"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Use — SecondLook",
  description:
    "Terms of Use for SecondLook, an AI-powered rare-disease analysis beta operated by Woggner Strategies, LLC dba HoggHealth.",
}

const EFFECTIVE_DATE = "June 24, 2026"

export default function TermsPage() {
  return (
    <Layout>
      <div className="bg-[#f5f0eb] py-8 sm:py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 bg-white p-6 sm:p-10 border border-gray-200">
          <p className="text-xs uppercase tracking-wider text-[#8b2500] font-semibold mb-2">
            Legal
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1">Terms of Use</h1>
          <p className="text-sm text-gray-500 mb-8">Effective {EFFECTIVE_DATE}</p>

          <Section title="1. Acceptance of these Terms">
            <p>
              These Terms of Use (the &ldquo;<strong>Terms</strong>&rdquo;) are a binding agreement between
              you and Woggner Strategies, LLC, a California limited liability company doing
              business as HoggHealth (&ldquo;<strong>HoggHealth</strong>,&rdquo;
              &ldquo;<strong>SecondLook</strong>,&rdquo; &ldquo;<strong>we</strong>,&rdquo;
              &ldquo;<strong>us</strong>,&rdquo; or &ldquo;<strong>our</strong>&rdquo;) governing
              your access to and use of the SecondLook web application and any related services
              (collectively, the &ldquo;<strong>Service</strong>&rdquo;). By accessing or using the
              Service you confirm that you have read, understood, and agreed to be bound by these
              Terms and the{" "}
              <Link href="/legal/privacy" className="text-[#8b2500] underline">
                Privacy Policy
              </Link>
              . If you do not agree, do not use the Service.
            </p>
          </Section>

          <Section title="2. About SecondLook (Beta Status)">
            <p>
              SecondLook is an early-stage research preview that uses large language model (LLM)
              agents to surface differential diagnosis candidates for rare and complex diseases
              based on patient-supplied symptom narratives. The Service is offered free of charge
              during this beta period. The Service is{" "}
              <strong>experimental software</strong> that has not been cleared, approved, or
              registered by the U.S. Food and Drug Administration or any other regulatory body, is
              not a medical device, and is{" "}
              <strong>not a substitute for evaluation, diagnosis, or treatment by a licensed
              clinician</strong>.
            </p>
          </Section>

          <Section title="3. Not Medical Advice">
            <p>
              Output produced by SecondLook is for informational and educational purposes only.
              The Service does not establish a clinician–patient relationship, does not provide a
              medical diagnosis, and does not constitute medical advice, diagnosis, or treatment.
              <strong> Do not begin, stop, or change any medication, treatment, test, or
              workup based solely on output from SecondLook.</strong> Always consult a
              qualified healthcare provider with any questions about your health. If you think
              you are experiencing a medical emergency, call 911 or go to the nearest emergency
              department.
            </p>
          </Section>

          <Section title="4. Eligibility">
            <p>To use the Service you must:</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-700 mt-2">
              <li>Be at least 18 years old;</li>
              <li>Have the legal capacity to enter into a binding agreement;</li>
              <li>Reside in the United States; and</li>
              <li>
                Agree to use the Service only for yourself (or, if you are entering information on
                behalf of a person you legally represent, you confirm that you have authority to
                do so on their behalf).
              </li>
            </ul>
            <p className="mt-2">
              The Service is not directed to children under 18 and we do not knowingly collect
              information from them.
            </p>
          </Section>

          <Section title="5. Permitted and Prohibited Use">
            <p>You agree that you will not:</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-700 mt-2">
              <li>
                Use the Service for the diagnosis, treatment, or management of any specific medical
                condition in clinical practice;
              </li>
              <li>
                Use the Service to make decisions about another person&rsquo;s care without their
                informed consent;
              </li>
              <li>
                Submit information you do not have the right to submit, or that contains personally
                identifiable information about a third party who has not consented;
              </li>
              <li>
                Attempt to reverse engineer, scrape, decompile, or extract the underlying models,
                prompts, knowledge base, or proprietary content of the Service;
              </li>
              <li>
                Use the Service to develop a competing AI or diagnostic product;
              </li>
              <li>
                Submit content that is unlawful, abusive, defamatory, or that infringes the rights
                of others; or
              </li>
              <li>Probe, attack, or attempt to bypass the security of the Service.</li>
            </ul>
          </Section>

          <Section title="6. Beta Status — Provided &ldquo;AS IS&rdquo;">
            <p>
              The Service is provided on an <strong>&ldquo;AS IS&rdquo;</strong> and{" "}
              <strong>&ldquo;AS AVAILABLE&rdquo;</strong> basis, without warranties of any kind,
              express or implied, including without limitation warranties of merchantability,
              fitness for a particular purpose, non-infringement, accuracy, reliability,
              availability, completeness, or freedom from error. We do not warrant that any output
              of the Service is medically accurate, complete, current, or appropriate for any
              specific person. Reasoning produced by LLMs can be wrong, incomplete, or
              hallucinated, and the Service may identify the wrong condition, miss the correct
              condition, or both.
            </p>
          </Section>

          <Section title="7. Intellectual Property">
            <p>
              The SecondLook software, name, design, knowledge base, prompts, and all related
              content are the property of HoggHealth or its licensors. We grant you a limited,
              revocable, non-transferable, non-exclusive license to use the Service for personal,
              non-commercial informational purposes during the beta. All rights not expressly
              granted are reserved.
            </p>
            <p className="mt-2">
              You retain ownership of the symptom narratives and other content you submit. By
              submitting content you grant us a limited license to process it through our AI
              pipeline, store it in our infrastructure as described in the{" "}
              <Link href="/legal/privacy" className="text-[#8b2500] underline">
                Privacy Policy
              </Link>
              , and use de-identified, aggregated versions to improve the Service.
            </p>
          </Section>

          <Section title="8. Third-Party Services">
            <p>
              The Service relies on third-party providers (Vercel for hosting, Upstash for
              database, OpenAI and Anthropic for language models, and others described in the
              Privacy Policy). Your use of the Service is subject to those providers&rsquo; own
              terms and policies. We are not responsible for third-party services or content.
            </p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p>
              To the maximum extent permitted by applicable law, in no event shall HoggHealth, its
              affiliates, officers, members, employees, or contractors be liable for any indirect,
              incidental, special, consequential, exemplary, or punitive damages, or any loss of
              profits, revenue, data, goodwill, or other intangible losses, arising out of or in
              connection with your access to or use of the Service, even if we have been advised
              of the possibility of such damages. In no event shall our aggregate liability arising
              out of or relating to these Terms or the Service exceed one hundred U.S. dollars
              (US$100). Some jurisdictions do not allow the exclusion or limitation of certain
              damages, so the above may not apply to you in full.
            </p>
          </Section>

          <Section title="10. Indemnification">
            <p>
              You agree to defend, indemnify, and hold harmless HoggHealth and its affiliates,
              officers, members, employees, and contractors from any claim, demand, loss, damage,
              cost, or expense (including reasonable attorneys&rsquo; fees) arising out of or
              relating to (a) your use of the Service, (b) your violation of these Terms, or
              (c) your violation of any law or the rights of any third party.
            </p>
          </Section>

          <Section title="11. Termination">
            <p>
              We may suspend, modify, or terminate the Service (or any part of it) at any time,
              for any reason, with or without notice. We may terminate your access if you breach
              these Terms. Sections that by their nature should survive termination (including
              Sections 3, 6, 7, 9, 10, 13, and 14) will survive.
            </p>
          </Section>

          <Section title="12. Changes to these Terms">
            <p>
              We may update these Terms from time to time. We will update the &ldquo;Effective&rdquo;
              date at the top of this page when we do. Material changes will be highlighted on the
              homepage or otherwise made reasonably visible. Your continued use of the Service after
              changes become effective constitutes acceptance of the updated Terms.
            </p>
          </Section>

          <Section title="13. Governing Law and Disputes">
            <p>
              These Terms are governed by the laws of the State of California, without regard to
              its conflict-of-laws principles. You and HoggHealth agree to the exclusive
              jurisdiction of the state and federal courts located in California for any dispute
              not subject to arbitration. Where required by applicable law, you may have rights
              that cannot be waived; nothing in these Terms is intended to override those rights.
            </p>
          </Section>

          <Section title="14. Miscellaneous">
            <p>
              These Terms, together with the Privacy Policy, are the entire agreement between you
              and HoggHealth concerning the Service. If any provision is held unenforceable, the
              remaining provisions remain in effect. Our failure to enforce any right is not a
              waiver of that right. You may not assign these Terms; we may assign them in
              connection with a merger, acquisition, or sale of assets.
            </p>
          </Section>

          <Section title="15. Contact">
            <p>
              Questions about these Terms can be sent to{" "}
              <a href="mailto:support@SecondLookDx.com" className="text-[#8b2500] underline">
                support@SecondLookDx.com
              </a>
              . Legal notices may be sent to Woggner Strategies, LLC (dba HoggHealth), California,
              United States.
            </p>
          </Section>

          <div className="mt-10 pt-6 border-t border-gray-200 flex items-center justify-between text-sm">
            <Link href="/" className="text-[#8b2500] hover:underline">
              ← Home
            </Link>
            <Link href="/legal/privacy" className="text-[#8b2500] hover:underline">
              Privacy Policy →
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7 text-[15px] leading-relaxed text-gray-800">
      <h2 className="text-lg font-bold text-gray-900 mb-2">{title}</h2>
      {children}
    </section>
  )
}
