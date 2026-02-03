import Link from "next/link"
import { getAllContent } from "@/lib/content"

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "SecondLook",
      url: "https://secondlook.vercel.app",
      description:
        "AI-powered symptom analysis tool that helps identify rare and complex medical conditions that general practitioners might overlook.",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@type": "MedicalWebPage",
      name: "SecondLook — AI-Powered Rare Disease Diagnosis Tool",
      url: "https://secondlook.vercel.app",
      description:
        "Analyze your symptoms against thousands of rare and complex conditions. Get a second opinion powered by AI in minutes.",
      about: {
        "@type": "MedicalCondition",
        name: "Rare Diseases",
      },
      lastReviewed: new Date().toISOString().split("T")[0],
      medicalAudience: {
        "@type": "Patient",
      },
    },
    {
      "@type": "Organization",
      name: "SecondLook",
      url: "https://secondlook.vercel.app",
      logo: "https://secondlook.vercel.app/icon.svg",
    },
  ],
}

// DNA Helix SVG Component
function DNAHelix() {
  return (
    <svg viewBox="0 0 400 480" xmlns="http://www.w3.org/2000/svg" fill="none" className="w-full max-w-[380px] h-auto">
      {/* Outer frame */}
      <rect x="40" y="20" width="320" height="440" stroke="#d4c5b0" strokeWidth="1" fill="none"/>
      <rect x="48" y="28" width="304" height="424" stroke="#c9a96e" strokeWidth="0.5" fill="none"/>

      {/* DNA-inspired double helix, left strand */}
      <path d="M140,60 C140,100 260,120 260,160 C260,200 140,220 140,260 C140,300 260,320 260,360 C260,400 140,420 140,440"
            stroke="#8b2500" strokeWidth="1.5" fill="none" opacity="0.8"/>
      {/* DNA-inspired double helix, right strand */}
      <path d="M260,60 C260,100 140,120 140,160 C140,200 260,220 260,260 C260,300 140,320 140,360 C140,400 260,420 260,440"
            stroke="#c9a96e" strokeWidth="1.5" fill="none" opacity="0.7"/>

      {/* Cross rungs */}
      <line x1="158" y1="90" x2="242" y2="90" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="168" y1="110" x2="232" y2="110" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="190" y1="130" x2="210" y2="130" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="168" y1="150" x2="232" y2="150" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="158" y1="170" x2="242" y2="170" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="168" y1="190" x2="232" y2="190" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="190" y1="210" x2="210" y2="210" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="168" y1="230" x2="232" y2="230" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="158" y1="250" x2="242" y2="250" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="168" y1="270" x2="232" y2="270" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="190" y1="290" x2="210" y2="290" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="168" y1="310" x2="232" y2="310" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="158" y1="330" x2="242" y2="330" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="168" y1="350" x2="232" y2="350" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="190" y1="370" x2="210" y2="370" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="168" y1="390" x2="232" y2="390" stroke="#d4c5b0" strokeWidth="0.75"/>
      <line x1="158" y1="410" x2="242" y2="410" stroke="#d4c5b0" strokeWidth="0.75"/>

      {/* Small diamond accents along the helix */}
      <rect x="196" y="86" width="8" height="8" transform="rotate(45 200 90)" fill="#8b2500" opacity="0.4"/>
      <rect x="196" y="166" width="8" height="8" transform="rotate(45 200 170)" fill="#c9a96e" opacity="0.5"/>
      <rect x="196" y="246" width="8" height="8" transform="rotate(45 200 250)" fill="#8b2500" opacity="0.4"/>
      <rect x="196" y="326" width="8" height="8" transform="rotate(45 200 330)" fill="#c9a96e" opacity="0.5"/>
      <rect x="196" y="406" width="8" height="8" transform="rotate(45 200 410)" fill="#8b2500" opacity="0.4"/>

      {/* Corner ornaments */}
      <line x1="44" y1="24" x2="64" y2="24" stroke="#c9a96e" strokeWidth="1.5"/>
      <line x1="44" y1="24" x2="44" y2="44" stroke="#c9a96e" strokeWidth="1.5"/>

      <line x1="356" y1="24" x2="336" y2="24" stroke="#c9a96e" strokeWidth="1.5"/>
      <line x1="356" y1="24" x2="356" y2="44" stroke="#c9a96e" strokeWidth="1.5"/>

      <line x1="44" y1="456" x2="64" y2="456" stroke="#c9a96e" strokeWidth="1.5"/>
      <line x1="44" y1="456" x2="44" y2="436" stroke="#c9a96e" strokeWidth="1.5"/>

      <line x1="356" y1="456" x2="336" y2="456" stroke="#c9a96e" strokeWidth="1.5"/>
      <line x1="356" y1="456" x2="356" y2="436" stroke="#c9a96e" strokeWidth="1.5"/>

      {/* Subtle cross motif at center */}
      <line x1="200" y1="220" x2="200" y2="280" stroke="#8b2500" strokeWidth="1" opacity="0.25"/>
      <line x1="170" y1="250" x2="230" y2="250" stroke="#8b2500" strokeWidth="1" opacity="0.25"/>

      {/* Text along bottom */}
      <text x="200" y="472" textAnchor="middle"
            fontFamily="'Instrument Sans', Helvetica, sans-serif"
            fontSize="7" fill="#c9a96e" letterSpacing="3">DIAGNOSTIC ANALYSIS</text>
    </svg>
  )
}

// Gold Divider Component
function GoldDivider({ wide = false }: { wide?: boolean }) {
  return (
    <div className={`flex items-center justify-center gap-6 ${wide ? 'max-w-[1140px] px-8' : 'max-w-[600px]'} mx-auto`}>
      <div className="flex-1 h-px bg-[#c9a96e]" />
      <div className="w-[7px] h-[7px] bg-[#c9a96e] rotate-45 flex-shrink-0" />
      <div className="flex-1 h-px bg-[#c9a96e]" />
    </div>
  )
}

// Timeline Step Component
function TimelineStep({
  number,
  title,
  description
}: {
  number: string
  title: string
  description: string
}) {
  return (
    <div className="relative pb-12 last:pb-0">
      {/* Roman numeral */}
      <div className="absolute -left-20 md:-left-20 top-0 w-10 text-center font-serif text-2xl text-[#c9a96e]">
        {number}
      </div>
      {/* Red dot */}
      <div className="absolute -left-[11px] md:-left-[11px] top-2 w-[5px] h-[5px] bg-[#8b2500] rounded-full" />
      {/* Content */}
      <h3 className="font-serif text-xl font-medium text-[#1a1a1a] mb-2 leading-tight">{title}</h3>
      <p className="font-serif-body text-[15px] leading-relaxed text-[#5a5a5a] max-w-[520px]">{description}</p>
    </div>
  )
}

function ResourcesSection() {
  const posts = getAllContent().slice(0, 3)
  if (posts.length === 0) return null

  return (
    <section className="max-w-[1140px] mx-auto px-8 py-16">
      <div className="mb-10">
        <div className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-[#8b2500] mb-4">Resources</div>
        <h2 className="font-serif text-[2.2rem] font-normal text-[#1a1a1a] leading-tight">
          Guides for your diagnostic journey
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
        {posts.map((post, index) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className={`group p-6 ${index < posts.length - 1 ? 'md:border-r border-b md:border-b-0' : ''} border-[#d4c5b0]`}
          >
            <div className="font-serif text-[2.5rem] font-normal text-[#c9a96e] opacity-70 leading-none mb-4">
              {String(index + 1).padStart(2, '0')}
            </div>
            <h3 className="font-serif text-lg font-medium text-[#1a1a1a] mb-3 leading-snug group-hover:text-[#8b2500] transition-colors">
              {post.title}
            </h3>
            <p className="font-serif-body text-sm leading-relaxed text-[#5a5a5a]">{post.description}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Navigation */}
      <nav className="border-b border-[#d4c5b0]">
        <div className="max-w-[1140px] mx-auto px-8 py-6 flex justify-between items-baseline">
          <Link href="/" className="font-serif text-[1.35rem] font-semibold tracking-[0.01em]">
            <span className="text-[#1a1a1a]">Second</span>
            <span className="text-[#8b2500]">Look</span>
          </Link>
          <div className="flex gap-9 items-baseline">
            <Link
              href="/blog"
              className="font-sans text-[0.82rem] font-medium text-[#5a5a5a] uppercase tracking-[0.03em] hover:text-[#1a1a1a] transition-colors"
            >
              Resources
            </Link>
            <Link
              href="/step-1"
              className="font-sans text-[0.82rem] font-medium text-[#8b2500] uppercase tracking-[0.03em] pb-[2px] border-b border-[#8b2500] hover:text-[#6d1d00] hover:border-[#6d1d00] transition-colors"
            >
              Begin Assessment
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 md:py-[5rem]">
        <div className="max-w-[1140px] mx-auto px-8 grid grid-cols-1 md:grid-cols-[1fr_0.65fr] gap-12 items-center">
          {/* Text Content */}
          <div className="max-w-[600px]">
            {/* Eyebrow */}
            <div className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8b2500] mb-6 flex items-center gap-3">
              <span className="inline-block w-7 h-px bg-[#8b2500]" />
              Rare Disease Diagnostics
            </div>

            {/* Headline */}
            <h1 className="font-serif text-[2.6rem] md:text-[3.4rem] font-normal leading-[1.12] text-[#1a1a1a] mb-7 tracking-[-0.01em]">
              When standard answers <em className="text-[#8b2500]">aren&apos;t enough.</em>
            </h1>

            {/* Subline */}
            <p className="font-serif-body text-lg leading-[1.75] text-[#5a5a5a] mb-10 max-w-[480px]">
              Expert AI analysis for rare and complex conditions. A structured diagnostic tool built for the patients who fall through the cracks of conventional medicine.
            </p>

            {/* CTA Button */}
            <Link
              href="/step-1"
              className="inline-block font-sans text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-white bg-[#8b2500] px-9 py-4 hover:bg-[#6d1d00] transition-colors"
            >
              Begin Your Assessment
            </Link>
          </div>

          {/* DNA Helix Decoration */}
          <div className="flex justify-center items-center order-first md:order-last">
            <DNAHelix />
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="py-8">
        <GoldDivider wide />
      </div>

      {/* How It Works - Timeline */}
      <section className="py-16">
        <div className="max-w-[820px] mx-auto px-8">
          {/* Section Header */}
          <div className="mb-14">
            <div className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8b2500] mb-4">
              Methodology
            </div>
            <h2 className="font-serif text-[2.2rem] font-normal text-[#1a1a1a] leading-tight">
              A structured path to clarity
            </h2>
          </div>

          {/* Timeline */}
          <div className="relative pl-20 before:content-[''] before:absolute before:left-[33px] before:top-1 before:bottom-1 before:w-px before:bg-[#d4c5b0]">
            <TimelineStep
              number="I"
              title="Describe your symptoms"
              description="Begin with a thorough accounting of symptoms, their onset, duration, and severity. Our guided assessment captures the clinical nuance that standard intake forms miss."
            />
            <TimelineStep
              number="II"
              title="Medications and clinical history"
              description="Document current medications, prior treatments, test results, and the full arc of your diagnostic history. Context shapes analysis."
            />
            <TimelineStep
              number="III"
              title="Family and genetic background"
              description="Many rare conditions carry hereditary patterns. We ask about family medical history to identify potential genetic links that might otherwise go unnoticed."
            />
            <TimelineStep
              number="IV"
              title="Receive your analysis"
              description="Our AI cross-references your complete clinical profile against an extensive knowledge base of rare and complex conditions, delivering prioritized differential diagnoses and recommended next steps."
            />
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="py-8">
        <GoldDivider />
      </div>

      {/* Pull Quote */}
      <section className="bg-[#faf6f0] border-y border-[#d4c5b0] py-20">
        <div className="max-w-[860px] mx-auto px-8 text-center">
          <span className="font-serif text-[5rem] text-[#c9a96e] leading-none block -mb-2 opacity-60">&ldquo;</span>
          <p className="font-serif italic text-[1.75rem] font-normal leading-[1.5] text-[#1a1a1a] mb-6">
            Designed for the diagnostic odyssey — when you need more than generic health advice.
          </p>
          <div className="font-sans text-[0.75rem] font-medium uppercase tracking-[0.14em] text-[#8b2500]">
            The SecondLook Mission
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-[4.5rem]">
        <div className="max-w-[1140px] mx-auto px-8">
          <div className="mb-10">
            <div className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8b2500]">
              Capabilities
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {/* Feature 1 */}
            <div className="py-6 md:px-8 md:border-r border-[#d4c5b0] first:pl-0">
              <div className="font-serif text-[2.5rem] font-normal text-[#c9a96e] leading-none mb-4 opacity-70">01</div>
              <h3 className="font-serif text-lg font-medium text-[#1a1a1a] mb-3 leading-snug">
                Rare Condition Intelligence
              </h3>
              <p className="font-serif-body text-sm leading-relaxed text-[#5a5a5a]">
                Access analysis informed by thousands of documented rare diseases, genetic conditions, and atypical presentations that general-purpose tools overlook.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="py-6 md:px-8 md:border-r border-[#d4c5b0] border-t md:border-t-0">
              <div className="font-serif text-[2.5rem] font-normal text-[#c9a96e] leading-none mb-4 opacity-70">02</div>
              <h3 className="font-serif text-lg font-medium text-[#1a1a1a] mb-3 leading-snug">
                Differential Prioritization
              </h3>
              <p className="font-serif-body text-sm leading-relaxed text-[#5a5a5a]">
                Rather than a simple list, receive a ranked differential with reasoning, weighted by symptom correlation, prevalence data, and clinical plausibility.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="py-6 md:px-8 md:pl-8 border-t md:border-t-0">
              <div className="font-serif text-[2.5rem] font-normal text-[#c9a96e] leading-none mb-4 opacity-70">03</div>
              <h3 className="font-serif text-lg font-medium text-[#1a1a1a] mb-3 leading-snug">
                Actionable Next Steps
              </h3>
              <p className="font-serif-body text-sm leading-relaxed text-[#5a5a5a]">
                Every analysis concludes with specific, referenced recommendations: specialist referrals, targeted tests, and clinical resources to bring to your care team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="py-12">
        <GoldDivider wide />
      </div>

      {/* Medical Notice */}
      <section className="py-14">
        <div className="max-w-[700px] mx-auto px-8">
          <div className="border border-[#d4c5b0] border-t-2 border-t-[#8b2500] bg-white p-8 md:px-10">
            <div className="font-sans text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[#8b2500] mb-3">
              Clinical Disclaimer
            </div>
            <p className="font-serif-body text-[0.85rem] leading-[1.75] text-[#5a5a5a]">
              <strong className="text-[#1a1a1a] font-semibold">SecondLook is an informational tool and does not provide medical diagnoses.</strong>{' '}
              The analysis generated by this platform is intended to support, not replace, the clinical judgment of qualified healthcare professionals. Always consult a licensed physician or specialist before making medical decisions.
            </p>
          </div>
        </div>
      </section>

      {/* Resources Section */}
      <ResourcesSection />

      {/* Final CTA Section */}
      <section className="py-[4.5rem] text-center">
        <div className="max-w-[480px] mx-auto px-8">
          <h2 className="font-serif text-[2rem] font-normal text-[#1a1a1a] mb-4 leading-snug">
            Ready for a second look?
          </h2>
          <p className="font-serif-body text-[1.05rem] text-[#5a5a5a] leading-relaxed mb-9">
            Three minutes of structured input can surface possibilities that years of searching have missed.
          </p>
          <Link
            href="/step-1"
            className="inline-block font-sans text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-white bg-[#8b2500] px-10 py-4 hover:bg-[#6d1d00] transition-colors"
          >
            Start Your Assessment
          </Link>
          <p className="mt-5 font-sans text-[0.72rem] text-[#999] tracking-[0.02em]">
            No account required. Your data is never stored.
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="pb-2">
        <GoldDivider wide />
      </div>

      {/* Footer */}
      <footer className="border-t border-[#d4c5b0] pt-10 pb-8">
        <div className="max-w-[1140px] mx-auto px-8">
          {/* Top Row */}
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

          {/* Links */}
          <div className="flex flex-wrap gap-7 mt-3">
            <Link href="#" className="font-sans text-[0.7rem] text-[#999] uppercase tracking-[0.04em] hover:text-[#5a5a5a] transition-colors">
              Privacy
            </Link>
            <Link href="#" className="font-sans text-[0.7rem] text-[#999] uppercase tracking-[0.04em] hover:text-[#5a5a5a] transition-colors">
              Terms
            </Link>
            <Link href="/blog" className="font-sans text-[0.7rem] text-[#999] uppercase tracking-[0.04em] hover:text-[#5a5a5a] transition-colors">
              Resources
            </Link>
          </div>

          {/* Bottom Rule & Fine Print */}
          <div className="w-full h-px bg-[#e5ddd3] my-5" />
          <p className="font-serif-body text-[0.72rem] text-[#b0a898] leading-relaxed max-w-[620px]">
            SecondLook is not a medical device and has not been evaluated by the FDA. Content provided is for informational purposes only and should not be construed as professional medical advice. This tool is designed to complement, not replace, the expertise of licensed healthcare providers.
          </p>
        </div>
      </footer>
    </div>
  )
}
