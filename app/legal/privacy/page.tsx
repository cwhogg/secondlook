import Link from "next/link"
import { Layout } from "@/components/layout"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy — SecondLook",
  description:
    "Privacy Policy for SecondLook, an AI-powered rare-disease analysis beta operated by Woggner Strategies, LLC dba HoggHealth.",
}

const EFFECTIVE_DATE = "June 24, 2026"

export default function PrivacyPage() {
  return (
    <Layout>
      <div className="bg-[#f5f0eb] py-8 sm:py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 bg-white p-6 sm:p-10 border border-gray-200">
          <p className="text-xs uppercase tracking-wider text-[#8b2500] font-semibold mb-2">
            Legal
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Effective {EFFECTIVE_DATE}</p>

          <Section title="1. Plain-language summary">
            <p>
              SecondLook is a beta research preview operated by Woggner Strategies, LLC (dba
              HoggHealth). We collect the symptom narrative and demographic information you enter,
              your IP address, browser type, and the AI-generated analysis output. We store it on
              Vercel and Upstash, send portions to OpenAI and Anthropic so their language models
              can produce the analysis, and use the records to debug, improve, and evaluate the
              Service. <strong>We do not sell your data and we do not run advertising.</strong> We
              are not a HIPAA-covered entity, have not undergone SOC 2 or HITRUST audit, and you
              should not use SecondLook for protected health information you would not be
              comfortable sharing through a non-regulated beta product. Read on for the details.
            </p>
          </Section>

          <Section title="2. Who we are">
            <p>
              Woggner Strategies, LLC, a California limited liability company doing business as
              HoggHealth (referred to in this policy as &ldquo;<strong>HoggHealth</strong>,&rdquo;
              &ldquo;<strong>SecondLook</strong>,&rdquo; &ldquo;<strong>we</strong>,&rdquo; or
              &ldquo;<strong>us</strong>&rdquo;), is the data controller for personal information
              collected through the SecondLook web application.
            </p>
          </Section>

          <Section title="3. What we collect">
            <p>When you use SecondLook we collect:</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-700 mt-2">
              <li>
                <strong>Information you provide:</strong> your symptom narrative and medical
                history (the &ldquo;chief complaint&rdquo; free-text field), demographics (age,
                biological sex), patient-supplied hypothesis (if any), structured lab values you
                upload, your answers to clarifying questions in the refinement flow, and any
                feedback you submit through the in-product survey.
              </li>
              <li>
                <strong>Technical information collected automatically:</strong> your IP address,
                browser user-agent, and timestamps of your requests.
              </li>
              <li>
                <strong>AI-generated output:</strong> the differential diagnosis ranking,
                evaluator scoring, recommended tests, and other analysis the Service produces in
                response to your input.
              </li>
              <li>
                <strong>Pipeline metadata:</strong> stage durations, token usage, model
                identifiers, and summary diagnostic logs used to monitor and improve the Service.
              </li>
            </ul>
            <p className="mt-2">
              We do not require an account during the beta and do not collect your name, email
              address, phone number, or address unless you contact us directly.
            </p>
          </Section>

          <Section title="4. How we use it">
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-700 mt-2">
              <li>
                Run the SecondLook AI diagnostic pipeline and return the analysis to you;
              </li>
              <li>Debug pipeline failures and individual analysis runs;</li>
              <li>
                Evaluate the Service against benchmark cases, measure accuracy, and improve the
                prompts, knowledge base, and selection logic over time;
              </li>
              <li>Respond to your messages and feedback;</li>
              <li>Detect and prevent abuse, fraud, and security incidents; and</li>
              <li>Comply with our legal obligations.</li>
            </ul>
          </Section>

          <Section title="5. Where the data lives — our infrastructure stack">
            <p>
              We use the following third-party providers to operate the Service. Each link goes
              to that provider&rsquo;s own privacy policy.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-gray-700 mt-2">
              <li>
                <strong>Vercel</strong> — application hosting, server-side function execution, and
                analytics (Vercel Analytics + Speed Insights, no marketing cookies). Vercel
                handles inbound requests and runs our code.{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  className="text-[#8b2500] underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Vercel privacy policy
                </a>
                .
              </li>
              <li>
                <strong>Upstash Redis</strong> — the database where saved analysis records,
                feedback responses, and the rare-disease knowledge base are persisted.{" "}
                <a
                  href="https://upstash.com/trust/privacy.pdf"
                  className="text-[#8b2500] underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Upstash privacy policy
                </a>
                .
              </li>
              <li>
                <strong>OpenAI</strong> — large language models used in the analysis pipeline
                (triage, specialist agents, o3 critique). Your symptom narrative and the
                generated context are sent to OpenAI to produce reasoning output. We use the
                OpenAI API, which (under OpenAI&rsquo;s current default terms) is not used to
                train OpenAI&rsquo;s models.{" "}
                <a
                  href="https://openai.com/policies/privacy-policy"
                  className="text-[#8b2500] underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenAI privacy policy
                </a>
                .
              </li>
              <li>
                <strong>Anthropic</strong> — Claude models used in the evaluator, synthesizer,
                finalizer, narrative-merger stages of the analysis flow and in the synthetic
                patient generator and grading flows for our testing framework. The Anthropic API
                (under Anthropic&rsquo;s current default terms) is not used to train
                Anthropic&rsquo;s models.{" "}
                <a
                  href="https://www.anthropic.com/legal/privacy"
                  className="text-[#8b2500] underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Anthropic privacy policy
                </a>
                .
              </li>
              <li>
                <strong>UMLS (U.S. National Library of Medicine)</strong> — used to validate
                medical terminology in the symptom-mapping step. We send the parsed medical term
                only, not the full narrative.{" "}
                <a
                  href="https://www.nlm.nih.gov/web_policies.html"
                  className="text-[#8b2500] underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  NLM privacy notice
                </a>
                .
              </li>
              <li>
                <strong>@sparticuz/chromium (release tarball)</strong> — the headless Chromium
                binary used for server-side PDF rendering is downloaded at function cold start
                from the public GitHub release of the Sparticuz/chromium project. No user data
                is sent to GitHub in this fetch.
              </li>
            </ul>
            <p className="mt-3">
              We do not use any third-party advertising network, marketing tracker, behavioral
              analytics tool, or data broker.
            </p>
          </Section>

          <Section title="6. How long we keep it">
            <ul className="list-disc pl-5 space-y-1 text-gray-700 mt-2">
              <li>
                <strong>Analysis records</strong> (patient case + analysis output + IP):
                <strong> 90 days</strong>, then automatically deleted from Upstash Redis.
              </li>
              <li>
                <strong>Feedback survey responses</strong>: <strong>365 days</strong>, then
                automatically deleted from Upstash Redis.
              </li>
              <li>
                <strong>Operational logs</strong> (Vercel function logs): retained per
                Vercel&rsquo;s default retention (currently 30 days on the relevant plan tier).
              </li>
              <li>
                <strong>Backups and aggregate statistics</strong>: aggregate, de-identified
                metrics (e.g., &ldquo;average pipeline duration this week&rdquo;) may be retained
                longer for trend analysis. We do not retain identifiable backups.
              </li>
            </ul>
          </Section>

          <Section title="7. Sharing">
            <p>
              We share information with the third-party providers listed in Section 5 strictly to
              operate the Service. We do not sell, rent, or trade your personal information. We do
              not share it for advertising or marketing purposes. We may disclose information when
              required by law, in response to a valid legal process, or to protect the rights,
              safety, or property of HoggHealth or others.
            </p>
            <p className="mt-2">
              If we are ever involved in a merger, acquisition, financing, or sale of assets, your
              information may be transferred to a successor entity, subject to the terms of this
              policy.
            </p>
          </Section>

          <Section title="8. Security and compliance posture">
            <p>
              We follow practices aligned with the protections required by the HIPAA Privacy and
              Security Rules — including transport encryption (TLS), encryption at rest in
              Upstash, role-restricted access to administrative tooling, server-side rate
              limiting, and minimization of data sent to third-party LLM providers.
              <strong> SecondLook is not a HIPAA-covered entity, does not enter into Business
              Associate Agreements with users, and has not undergone SOC 2, HITRUST, or similar
              third-party security audit.</strong>{" "}
              You should not submit information through SecondLook that you would not be
              comfortable sharing through a non-regulated beta product.
            </p>
            <p className="mt-2">
              No system is perfectly secure. We cannot guarantee that data will not be subject to
              unauthorized access despite our practices, and you use the Service at your own risk.
            </p>
          </Section>

          <Section title="9. Your choices">
            <p>You can:</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-700 mt-2">
              <li>
                <strong>Use the Service without an account.</strong> We do not require account
                creation.
              </li>
              <li>
                <strong>Request access or deletion</strong> of the analysis records associated
                with your submissions by emailing{" "}
                <a
                  href="mailto:privacy@SecondLookDx.com"
                  className="text-[#8b2500] underline"
                >
                  privacy@SecondLookDx.com
                </a>
                . Because we do not require accounts, you will need to provide enough information
                (e.g., the approximate date and time of the analysis, the IP address you used) for
                us to identify the record. During the beta this is a manual process; we will aim
                to respond within 30 days.
              </li>
              <li>
                <strong>Refuse the feedback survey</strong> — the in-product survey is dismissible
                via the X in the corner.
              </li>
              <li>
                <strong>Stop using the Service.</strong> You can leave at any time. Records you
                already submitted will remain in our infrastructure for the retention windows
                described above.
              </li>
            </ul>
            <p className="mt-2">
              If you are a California resident, you may have additional rights under the
              California Consumer Privacy Act (CCPA) as amended by the California Privacy Rights
              Act (CPRA), including the right to know, delete, and correct personal information
              and to opt out of the &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of personal
              information. We do not sell or share personal information as those terms are defined
              under the CCPA. To exercise any CCPA right, contact us at the email above.
            </p>
          </Section>

          <Section title="10. Cookies and analytics">
            <p>
              We use Vercel Analytics and Vercel Speed Insights to measure aggregate usage
              patterns and page performance. These tools use cookies and local storage to attribute
              events to a session. We do not use third-party marketing cookies, advertising
              pixels, or cross-site tracking. We do not honor &ldquo;Do Not Track&rdquo; signals
              because there is no industry-standard interpretation of them.
            </p>
            <p className="mt-2">
              We use your browser&rsquo;s local storage and sessionStorage to keep the multi-step
              form responsive and to remember in-progress analyses. That data lives in your
              browser only; clearing site data removes it.
            </p>
          </Section>

          <Section title="11. Children">
            <p>
              The Service is not directed to children under 18 and we do not knowingly collect
              personal information from children. If you believe a child has submitted information
              to us, contact{" "}
              <a href="mailto:privacy@SecondLookDx.com" className="text-[#8b2500] underline">
                privacy@SecondLookDx.com
              </a>{" "}
              and we will delete it.
            </p>
          </Section>

          <Section title="12. International users">
            <p>
              The Service is hosted in the United States. If you access the Service from outside
              the United States, you understand that information you submit will be transferred to
              and stored in the United States. We do not represent that the Service is suitable or
              available for use in other jurisdictions.
            </p>
          </Section>

          <Section title="13. Changes to this Policy">
            <p>
              We may update this Privacy Policy from time to time. We will update the
              &ldquo;Effective&rdquo; date at the top of the page when we do. Material changes
              will be highlighted on the homepage or otherwise made reasonably visible.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>Privacy inquiries and rights requests:</p>
            <p className="mt-2">
              <a href="mailto:privacy@SecondLookDx.com" className="text-[#8b2500] underline">
                privacy@SecondLookDx.com
              </a>
            </p>
            <p className="mt-3">
              General questions:{" "}
              <a href="mailto:support@SecondLookDx.com" className="text-[#8b2500] underline">
                support@SecondLookDx.com
              </a>
            </p>
            <p className="mt-3">
              Woggner Strategies, LLC (dba HoggHealth)
              <br />
              California, United States
            </p>
          </Section>

          <div className="mt-10 pt-6 border-t border-gray-200 flex items-center justify-between text-sm">
            <Link href="/legal/terms" className="text-[#8b2500] hover:underline">
              ← Terms of Use
            </Link>
            <Link href="/" className="text-[#8b2500] hover:underline">
              Home →
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
