import Link from "next/link"
import { ArrowRight, Shield, CheckCircle, Lock, Sparkles, Zap, Heart, BookOpen } from "lucide-react"
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
      <div className="text-center mb-10">
        <h2 className="font-serif text-[2.2rem] font-normal text-[#1a1a1a] leading-tight mb-6">
          Health Resources &amp; Rare Disease Guides
        </h2>
        <p className="font-serif-body text-xl text-[#5a5a5a] max-w-3xl mx-auto leading-relaxed">
          Explore our guides on rare disease diagnosis, navigating complex medical cases, and making the most of AI symptom checkers on your health journey.
        </p>
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
            <div className="mt-4 flex items-center text-[#8b2500] font-sans text-xs font-medium uppercase tracking-wide">
              <span>Read more</span>
              <ArrowRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
      </div>

      <div className="text-center mt-10">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-[#8b2500] hover:text-[#6d1d00] font-sans text-sm font-semibold uppercase tracking-wide transition-colors"
        >
          <BookOpen className="h-4 w-4" />
          <span>View all resources</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
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
              Start Analysis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 md:py-[5rem]">
        <div className="max-w-[1140px] mx-auto px-8 grid grid-cols-1 md:grid-cols-[1fr_0.65fr] gap-12 items-center">
          {/* Text Content */}
          <div className="max-w-[600px]">
            {/* Trust Badges */}
            <div className="flex flex-wrap items-center gap-4 mb-8">
              <div className="flex items-center space-x-2 border border-[#d4c5b0] px-4 py-2">
                <Shield className="h-4 w-4 text-[#8b2500]" />
                <span className="font-sans text-xs font-medium text-[#5a5a5a] uppercase tracking-wide">HIPAA Compliant</span>
              </div>
              <div className="flex items-center space-x-2 border border-[#d4c5b0] px-4 py-2">
                <CheckCircle className="h-4 w-4 text-[#8b2500]" />
                <span className="font-sans text-xs font-medium text-[#5a5a5a] uppercase tracking-wide">MD Reviewed</span>
              </div>
              <div className="flex items-center space-x-2 border border-[#d4c5b0] px-4 py-2">
                <Lock className="h-4 w-4 text-[#c9a96e]" />
                <span className="font-sans text-xs font-medium text-[#5a5a5a] uppercase tracking-wide">Bank-Level Encryption</span>
              </div>
            </div>

            {/* Headline */}
            <h1 className="font-serif text-[2.6rem] md:text-[3.4rem] font-normal leading-[1.12] text-[#1a1a1a] mb-7 tracking-[-0.01em]">
              Find Your Rare Diagnosis <em className="text-[#8b2500]">in Minutes.</em>
            </h1>

            {/* Subline */}
            <p className="font-serif-body text-lg leading-[1.75] text-[#5a5a5a] mb-10 max-w-[480px]">
              Our AI analyzes your symptoms against thousands of conditions, focusing on rare and complex diagnoses that might be overlooked by general practitioners.
            </p>

            {/* CTA Button */}
            <Link
              href="/step-1"
              className="inline-flex items-center gap-2 font-sans text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-white bg-[#8b2500] px-9 py-4 hover:bg-[#6d1d00] transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              <span>Start My Health Analysis</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <p className="mt-5 font-sans text-[0.72rem] text-[#999] tracking-[0.02em]">
              Free during early access
            </p>
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

      {/* Medical Notice */}
      <section className="py-14">
        <div className="max-w-[700px] mx-auto px-8">
          <div className="border border-[#d4c5b0] border-t-2 border-t-[#8b2500] bg-white p-8 md:px-10">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#8b2500] flex items-center justify-center flex-shrink-0">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-medium text-[#1a1a1a] mb-2">Important Medical Notice</h3>
                <p className="font-serif-body text-[0.9rem] leading-[1.75] text-[#5a5a5a]">
                  This analysis is for educational purposes and does not replace professional medical advice. Always consult with qualified healthcare providers for medical decisions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-[4.5rem]">
        <div className="max-w-[1140px] mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {/* Feature 1 */}
            <div className="py-6 md:px-8 md:border-r border-[#d4c5b0] first:pl-0 border-b md:border-b-0">
              <div className="w-12 h-12 bg-[#faf6f0] flex items-center justify-center mb-6">
                <Shield className="h-6 w-6 text-[#8b2500]" />
              </div>
              <h3 className="font-serif text-xl font-medium text-[#1a1a1a] mb-3 leading-snug">
                Medical-Grade Security
              </h3>
              <p className="font-serif-body text-sm leading-relaxed text-[#5a5a5a]">
                Your health information is protected with the same security standards used by hospitals and medical institutions.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="py-6 md:px-8 md:border-r border-[#d4c5b0] border-b md:border-b-0">
              <div className="w-12 h-12 bg-[#faf6f0] flex items-center justify-center mb-6">
                <Zap className="h-6 w-6 text-[#c9a96e]" />
              </div>
              <h3 className="font-serif text-xl font-medium text-[#1a1a1a] mb-3 leading-snug">
                Fast Analysis
              </h3>
              <p className="font-serif-body text-sm leading-relaxed text-[#5a5a5a]">
                Get comprehensive health insights in under 10 minutes. No waiting for appointments or referrals.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="py-6 md:px-8 md:pl-8">
              <div className="w-12 h-12 bg-[#faf6f0] flex items-center justify-center mb-6">
                <Heart className="h-6 w-6 text-[#8b2500]" />
              </div>
              <h3 className="font-serif text-xl font-medium text-[#1a1a1a] mb-3 leading-snug">
                Doctor-Reviewed AI
              </h3>
              <p className="font-serif-body text-sm leading-relaxed text-[#5a5a5a]">
                Our AI is trained on peer-reviewed medical literature and overseen by licensed healthcare professionals.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="py-8">
        <GoldDivider />
      </div>

      {/* How It Works - Timeline */}
      <section className="py-16">
        <div className="max-w-[820px] mx-auto px-8">
          {/* Section Header */}
          <div className="text-center mb-14">
            <h2 className="font-serif text-[2.2rem] font-normal text-[#1a1a1a] leading-tight mb-4">
              How SecondLook Works
            </h2>
            <p className="font-serif-body text-xl text-[#5a5a5a] max-w-3xl mx-auto leading-relaxed">
              Our simple 4-step process helps you get expert medical insights quickly and securely.
            </p>
          </div>

          {/* Timeline */}
          <div className="relative pl-20 before:content-[''] before:absolute before:left-[33px] before:top-1 before:bottom-1 before:w-px before:bg-[#d4c5b0]">
            <TimelineStep
              number="I"
              title="Share Your Health Story"
              description="Tell us about your symptoms, health history, and concerns using our easy questionnaire designed for patients."
            />
            <TimelineStep
              number="II"
              title="AI Medical Review"
              description="Our medical AI analyzes your information against thousands of conditions, focusing on rare and complex diagnoses."
            />
            <TimelineStep
              number="III"
              title="Get Your Report"
              description="Receive a detailed analysis with potential conditions to discuss with your healthcare provider."
            />
            <TimelineStep
              number="IV"
              title="Get Recommendations"
              description="We recommend trusted partners who can fill in gaps and help get to a specific diagnosis."
            />
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="py-8">
        <GoldDivider wide />
      </div>

      {/* SEO Paragraph */}
      <section className="py-8">
        <div className="max-w-[820px] mx-auto px-8">
          <p className="font-serif-body text-center text-[#5a5a5a] leading-relaxed">
            Whether you&apos;re searching for a medical second opinion, exploring an AI symptom checker for rare diseases,
            or looking for help with a complex diagnosis, SecondLook provides the analytical depth that standard tools lack.
            Our platform is designed for patients navigating a diagnostic odyssey who need more than generic health advice.
          </p>
        </div>
      </section>

      {/* Resources Section */}
      <ResourcesSection />

      {/* Divider */}
      <div className="py-8">
        <GoldDivider />
      </div>

      {/* Final CTA Section */}
      <section className="py-[4.5rem] text-center">
        <div className="max-w-[480px] mx-auto px-8">
          <h2 className="font-serif text-[2rem] font-normal text-[#1a1a1a] mb-4 leading-snug">
            Ready to explore your health?
          </h2>
          <p className="font-serif-body text-[1.05rem] text-[#5a5a5a] leading-relaxed mb-9">
            Get AI-powered diagnostic insights for complex and rare conditions — free during early access.
          </p>
          <Link
            href="/step-1"
            className="inline-flex items-center gap-2 font-sans text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-white bg-[#8b2500] px-10 py-4 hover:bg-[#6d1d00] transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            <span>Start My Health Analysis</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
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
            SecondLook provides educational information only and is not a substitute for professional medical advice. Always consult with a qualified healthcare provider for medical concerns.
          </p>
        </div>
      </footer>
    </div>
  )
}
