import Link from "next/link"
import {
  ArrowRight,
  Shield,
  CheckCircle,
  Lock,
  Sparkles,
  Zap,
  Heart,
  BookOpen,
  FlaskConical,
  Upload,
  Search,
  Database,
  UsersRound,
  ListOrdered,
  MessageCircle,
  CheckSquare,
  TestTubes,
  FileCheck,
  ChevronDown,
  AlertTriangle,
  Clock,
} from "lucide-react"
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
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is SecondLook?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "SecondLook is an AI-powered diagnostic tool that analyzes your symptoms against thousands of rare and complex medical conditions. It helps patients who may be on a diagnostic odyssey by identifying conditions that general practitioners might overlook.",
          },
        },
        {
          "@type": "Question",
          name: "How does SecondLook work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "SecondLook uses a multi-agent AI pipeline where specialist AI agents analyze your symptoms from different medical perspectives. You describe your symptoms through a guided questionnaire, and our AI compares them against a curated knowledge base of rare diseases using evidence-based diagnostic criteria.",
          },
        },
        {
          "@type": "Question",
          name: "Is SecondLook a substitute for medical advice?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. SecondLook provides educational information only and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult with a qualified healthcare provider for medical concerns. Our reports are designed to help inform conversations with your doctor.",
          },
        },
        {
          "@type": "Question",
          name: "Is my health data secure?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The text you enter is processed by AI models to generate your report and is stored securely for up to 90 days so we can debug errors and improve the pipeline. We do not sell your data, share it for advertising, or make it accessible outside our team. See our privacy policy and FAQ for details.",
          },
        },
        {
          "@type": "Question",
          name: "How much does SecondLook cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "SecondLook is currently free during our early access period. We want to make rare disease diagnostic guidance accessible to everyone while we continue to improve our platform.",
          },
        },
      ],
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
    <div className={`flex items-center justify-center gap-6 ${wide ? 'max-w-[1140px] px-4 sm:px-8' : 'max-w-[600px] px-4 sm:px-0'} mx-auto`}>
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
    <div className="relative pb-10 sm:pb-12 last:pb-0">
      {/* Roman numeral */}
      <div className="absolute -left-10 sm:-left-20 top-0 w-8 sm:w-10 text-center font-serif text-lg sm:text-2xl text-[#c9a96e]">
        {number}
      </div>
      {/* Red dot */}
      <div className="absolute -left-[11px] sm:-left-[11px] top-2 w-[5px] h-[5px] bg-[#8b2500] rounded-full" />
      {/* Content */}
      <h3 className="font-serif text-lg sm:text-xl font-medium text-[#1a1a1a] mb-2 leading-tight">{title}</h3>
      <p className="font-serif-body text-sm sm:text-[15px] leading-relaxed text-[#5a5a5a] max-w-[520px]">{description}</p>
    </div>
  )
}

function FlowStep({
  step,
  title,
  icon: Icon,
  isLast,
}: {
  step: number
  title: string
  icon: typeof Upload
  isLast?: boolean
}) {
  return (
    <div className="flex flex-col items-center w-full">
      {/* Card — fixed min-height + two-column structure so every step has
          the exact same visual footprint regardless of title length. */}
      <div className="w-full max-w-[560px] bg-white border border-[#d4c5b0] flex items-stretch min-h-[92px] sm:min-h-[96px]">
        {/* Left fixed-width block: STEP N label + icon, on a cream
            background separated by a divider. Consistent width across
            all cards so titles align on the right. */}
        <div className="flex-shrink-0 w-[88px] sm:w-[104px] bg-[#faf6f0] border-r border-[#d4c5b0] flex flex-col items-center justify-center gap-1.5 py-3">
          <div className="font-sans text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6d4c30]">
            Step {step}
          </div>
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-[#8b2500]" strokeWidth={1.6} />
        </div>
        {/* Right block: title, vertically centered. */}
        <div className="flex-1 flex items-center px-4 sm:px-5 py-3">
          <div className="font-serif text-sm sm:text-base text-[#1a1a1a] leading-snug">
            {title}
          </div>
        </div>
      </div>
      {/* Connector arrow to next step */}
      {!isLast && (
        <div className="flex flex-col items-center py-1.5 sm:py-2" aria-hidden="true">
          <div className="w-px h-3 sm:h-4 bg-[#d4c5b0]" />
          <ChevronDown className="h-3.5 w-3.5 text-[#c9a96e]" />
        </div>
      )}
    </div>
  )
}

function ResourcesSection() {
  const posts = getAllContent().slice(0, 3)
  if (posts.length === 0) return null

  return (
    <section className="max-w-[1140px] mx-auto px-4 sm:px-8 py-12 sm:py-16">
      <div className="text-center mb-8 sm:mb-10">
        <h2 className="font-serif text-[1.6rem] sm:text-[2.2rem] font-normal text-[#1a1a1a] leading-tight mb-4 sm:mb-6">
          Health Resources &amp; Rare Disease Guides
        </h2>
        <p className="font-serif-body text-lg sm:text-xl text-[#5a5a5a] max-w-3xl mx-auto leading-relaxed">
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-[#8b2500] focus:text-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Navigation */}
      <nav className="border-b border-[#d4c5b0]">
        <div className="max-w-[1140px] mx-auto px-4 sm:px-8 py-4 sm:py-6 flex justify-between items-baseline">
          <Link href="/" className="font-serif text-[1.35rem] font-semibold tracking-[0.01em]">
            <span className="text-[#1a1a1a]">Second</span>
            <span className="text-[#8b2500]">Look</span>
          </Link>
          <div className="flex gap-4 sm:gap-9 items-baseline">
            <Link
              href="/blog"
              className="font-sans text-[0.82rem] font-medium text-[#5a5a5a] uppercase tracking-[0.03em] hover:text-[#1a1a1a] transition-colors hidden sm:inline"
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
      <section id="main-content" className="py-6 sm:py-20 md:py-[5rem]">
        <div className="max-w-[1140px] mx-auto px-4 sm:px-8 grid grid-cols-1 md:grid-cols-[1fr_0.65fr] gap-4 sm:gap-12 items-center">
          {/* Text Content */}
          <div className="max-w-[600px]">
            {/* Beta Test Badge */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-3 sm:mb-8">
              <div className="flex items-center space-x-1.5 sm:space-x-2 border-2 border-[#8b2500] bg-[#8b2500] px-3 sm:px-4 py-1.5 sm:py-2">
                <FlaskConical className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                <span className="font-sans text-[10px] sm:text-xs font-semibold text-white uppercase tracking-wider">
                  Beta Test
                </span>
              </div>
            </div>

            {/* Headline */}
            <h1 className="font-serif text-[2rem] sm:text-[2.6rem] md:text-[3.4rem] font-normal leading-[1.12] text-[#1a1a1a] mb-3 sm:mb-7 tracking-[-0.01em]">
              Find Your Rare Diagnosis <em className="text-[#8b2500]">in Minutes.</em>
            </h1>

            {/* Subline */}
            <p className="font-serif-body text-base sm:text-lg leading-[1.5] sm:leading-[1.75] text-[#5a5a5a] mb-5 sm:mb-10 max-w-[480px]">
              SecondLook is built for people navigating undiagnosed illness — the ones who&rsquo;ve been told &ldquo;I don&rsquo;t know&rdquo; or &ldquo;it&rsquo;s probably nothing&rdquo; one too many times. For nearly 1 in 2 patients, we name the diagnosis at position #1, so you can bring it to your doctor and ask &mdash; &ldquo;could this be it?&rdquo;
            </p>

            {/* CTA Button */}
            <Link
              href="/step-1"
              className="inline-flex items-center gap-2 font-sans text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-white bg-[#8b2500] px-9 py-4 hover:bg-[#6d1d00] transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              <span>Get Your Analysis &mdash; Free</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <div className="mt-3 sm:mt-5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
              <span className="font-sans text-[0.72rem] text-[#999] tracking-[0.02em]">
                ~10 minutes. No login. No cost.
              </span>
              <Link
                href="/faq"
                className="font-sans text-[0.72rem] text-[#8b2500] tracking-[0.02em] underline underline-offset-2 hover:text-[#6d1d00] transition-colors"
              >
                Have questions? Read the FAQ &rarr;
              </Link>
            </div>
          </div>

          {/* DNA Helix Decoration. Mobile-only: shrunk to 140px max so the
              illustration + headline + subline + CTA all fit on the first
              viewport above the fold on a 390px-wide phone. Desktop layout
              keeps the larger illustration at md breakpoint. */}
          <div className="flex justify-center items-center order-first md:order-last">
            <div className="max-w-[140px] sm:max-w-[380px]">
              <DNAHelix />
            </div>
          </div>
        </div>
      </section>

      {/* Outcome cards — pulled up from the benchmark section so the
          pitch lands before the trust band. Reads as a natural extension
          of the hero. Kept compact (no section header, small vertical
          padding) so it doesn't push the trust band or the rest of the
          page too far down. */}
      <section className="py-6 sm:py-10">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
              <div className="font-serif text-base sm:text-lg text-[#1a1a1a] leading-snug mb-3">
                See the diagnosis your doctors may have missed.
              </div>
              <div className="font-serif text-[2rem] sm:text-[2.4rem] leading-none text-[#8b2500] mb-1">
                nearly 1 in 2
              </div>
              <div className="font-serif-body text-sm text-[#5a5a5a] leading-snug">
                patients get the correct diagnosis as our top suggestion.
              </div>
            </div>
            <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
              <div className="font-serif text-base sm:text-lg text-[#1a1a1a] leading-snug mb-3">
                Walk into your next appointment with a plan.
              </div>
              <div className="font-serif text-[2rem] sm:text-[2.4rem] leading-none text-[#8b2500] mb-1">
                6 in 10
              </div>
              <div className="font-serif-body text-sm text-[#5a5a5a] leading-snug">
                patients: we name the diagnosis or the single test that would confirm it.
              </div>
            </div>
            <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
              <div className="font-serif text-base sm:text-lg text-[#1a1a1a] leading-snug mb-3">
                Turn years of searching into a roadmap.
              </div>
              <div className="font-serif text-[2rem] sm:text-[2.4rem] leading-none text-[#8b2500] mb-1">
                8 in 10
              </div>
              <div className="font-serif-body text-sm text-[#5a5a5a] leading-snug">
                patients would reach an answer within our top 5 recommended tests.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust-signal band (immediately after the outcome cards). */}
      <section className="py-5 sm:py-6 bg-[#faf6f0] border-y border-[#d4c5b0]">
        <div className="max-w-[820px] mx-auto px-4 sm:px-8">
          <p className="font-serif-body text-center text-sm sm:text-[15px] text-[#5a5a5a] leading-relaxed">
            <span className="font-serif italic text-[#8b2500]">Independently validated</span> against Phenopacket2Prompt &mdash; the same rare-disease research benchmark used in <em>Nature</em> and <em>European Journal of Human Genetics</em>.
          </p>
        </div>
      </section>

      {/* Who this is for */}
      <section className="py-10 sm:py-14">
        <div className="max-w-[900px] mx-auto px-4 sm:px-8">
          <div className="text-center mb-8 sm:mb-10">
            <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500] mb-3">
              Who SecondLook is for
            </div>
            <h2 className="font-serif text-[1.4rem] sm:text-[1.9rem] font-normal text-[#1a1a1a] leading-tight">
              If any of these sound like you, SecondLook is built for you.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
              <div className="font-serif text-lg text-[#8b2500] mb-2">Undiagnosed adults</div>
              <p className="font-serif-body text-sm text-[#5a5a5a] leading-relaxed">
                You&rsquo;ve seen multiple specialists over months or years and still don&rsquo;t have an answer that fits.
              </p>
            </div>
            <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
              <div className="font-serif text-lg text-[#8b2500] mb-2">Parents navigating a child&rsquo;s illness</div>
              <p className="font-serif-body text-sm text-[#5a5a5a] leading-relaxed">
                Your child has symptoms no one seems to connect. You&rsquo;re looking for a way to think through the possibilities.
              </p>
            </div>
            <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
              <div className="font-serif text-lg text-[#8b2500] mb-2">A diagnosis that doesn&rsquo;t feel right</div>
              <p className="font-serif-body text-sm text-[#5a5a5a] leading-relaxed">
                You have a diagnosis, but symptoms it doesn&rsquo;t explain. You want a second look at the picture.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Medical Notice */}
      <section className="py-10 sm:py-14">
        <div className="max-w-[700px] mx-auto px-4 sm:px-8">
          <div className="border border-[#d4c5b0] border-t-2 border-t-[#8b2500] bg-white p-8 md:px-10">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#8b2500] flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-medium text-[#1a1a1a] mb-2">Important Medical Notice</h3>
                <p className="font-serif-body text-[0.9rem] leading-[1.75] text-[#5a5a5a]">
                  <strong className="text-[#8b2500]">This analysis is AI-generated</strong> and is for educational purposes only. It does not replace professional medical advice, diagnosis, or treatment. Always consult with qualified healthcare providers for medical decisions, especially before acting on any AI-suggested diagnosis or test.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Flow Diagram */}
      <section className="py-12 sm:py-16">
        <div className="max-w-[820px] mx-auto px-4 sm:px-8">
          {/* Section Header */}
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="font-serif text-[1.6rem] sm:text-[2.2rem] font-normal text-[#1a1a1a] leading-tight mb-4">
              How SecondLook works
            </h2>
            <p className="font-serif-body text-lg sm:text-xl text-[#5a5a5a] max-w-3xl mx-auto leading-relaxed">
              Here&rsquo;s what happens after you tell us your story: nine steps that turn it into a ranked list of possibilities and the specific tests that could confirm each one.
            </p>
          </div>

          {/* Flow diagram */}
          <div className="flex flex-col items-center">
            {/* Evaluation time callout — same footprint as the step cards below */}
            <div className="w-full max-w-[560px] bg-[#8b2500] text-white flex items-center justify-center gap-2.5 px-5 py-3.5 mb-6 sm:mb-8">
              <Clock className="h-5 w-5 flex-shrink-0" strokeWidth={1.8} />
              <p className="font-serif text-sm sm:text-base font-medium leading-snug text-center">
                Each evaluation takes 8&ndash;10 minutes on average.
              </p>
            </div>
            <FlowStep step={1} icon={Upload} title="Tell us your medical story and upload relevant history and data" />
            <FlowStep step={2} icon={Search} title="SecondLook extracts clinical concepts" />
            <FlowStep step={3} icon={Database} title="Map symptoms and concepts to candidates in our 9k+ rare disease knowledge base" />
            <FlowStep step={4} icon={UsersRound} title="Activate 5 most relevant AI specialist agents in parallel to debate and select most likely diagnoses from profile" />
            <FlowStep step={5} icon={ListOrdered} title="Synthesize and rank a top-10 differential diagnosis list" />
            <FlowStep step={6} icon={MessageCircle} title="Refine diagnoses with 3–5 targeted patient questions" />
            <FlowStep step={7} icon={CheckSquare} title="Finalize the top-10 differential and probabilities" />
            <FlowStep step={8} icon={TestTubes} title="Recommend tests to rule diagnoses in or out" />
            <FlowStep step={9} icon={FileCheck} title="Deliver the final report" isLast />
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="py-8">
        <GoldDivider />
      </div>

      {/* Benchmark Performance */}
      <section className="py-12 sm:py-16 bg-[#faf6f0] border-y border-[#d4c5b0]">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-8">
          {/* Section Header — now leads the head-to-head comparison
              because the outcome cards moved up above the trust band. */}
          <div className="text-center mb-10 sm:mb-12">
            <div className="inline-flex items-center gap-1.5 mb-4 px-3 py-1 bg-white border border-[#d4c5b0]">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500]">
                How we compare
              </span>
            </div>
            <h2 className="font-serif text-[1.6rem] sm:text-[2.2rem] font-normal text-[#1a1a1a] leading-tight mb-4">
              Measured against the leading AI models
            </h2>
            <p className="font-serif-body text-base sm:text-lg text-[#5a5a5a] max-w-2xl mx-auto leading-relaxed">
              On real published rare-disease cases &mdash; the same benchmark used in peer-reviewed research evaluating diagnostic AI.
            </p>
          </div>

          {/* Have you tried ChatGPT / Claude already? — reframed comparison */}
          <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
            <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500] mb-3">
              Already tried ChatGPT or Claude?
            </div>
            <p className="font-serif text-lg sm:text-xl text-[#1a1a1a] leading-snug mb-2">
              We&rsquo;re not a chatbot &mdash; we&rsquo;re a diagnostic pipeline built for rare disease.
            </p>
            <p className="font-serif-body text-sm sm:text-[15px] text-[#5a5a5a] leading-relaxed mb-4">
              Instead of asking one AI for an answer, SecondLook runs your case through 15 specialist perspectives in parallel, grounded in a knowledge base of 9,275 rare-disease profiles, and scores each candidate against formal diagnostic criteria. On the same rare-disease cases, we&rsquo;re <strong>30&ndash;35% more accurate</strong> at position 1 than a single query to OpenAI o3 or Claude Opus 4.7.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-4 pt-4 border-t border-[#e8ddd0]">
              <div>
                <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#6d4c30] mb-1">
                  SecondLook
                </div>
                <div className="font-serif text-2xl sm:text-3xl text-[#8b2500]">42.0%</div>
                <div className="font-sans text-[10px] text-[#8b7355] mt-1">correct at #1</div>
              </div>
              <div>
                <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#6d4c30] mb-1">
                  OpenAI o3
                </div>
                <div className="font-serif text-2xl sm:text-3xl text-[#5a5a5a]">31.5%</div>
                <div className="font-sans text-[10px] text-[#8b7355] mt-1">correct at #1</div>
              </div>
              <div>
                <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#6d4c30] mb-1">
                  Claude Opus 4.7
                </div>
                <div className="font-serif text-2xl sm:text-3xl text-[#5a5a5a]">30.9%</div>
                <div className="font-sans text-[10px] text-[#8b7355] mt-1">correct at #1</div>
              </div>
            </div>
          </div>

          {/* References — abbreviated */}
          <div className="mt-6 sm:mt-8 px-1">
            <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#6d4c30] mb-2">
              Methodology
            </div>
            <ol className="font-serif-body text-xs sm:text-[13px] leading-relaxed text-[#777] space-y-1.5 list-decimal pl-5">
              <li>
                Position-1 accuracy (nearly 1 in 2) measured on a random sample of Phenopacket2Prompt cases (n=29). Independently re-verified across a larger 96-case random sample where SecondLook achieves 34% under the strictest paper-faithful Mondo grading.
              </li>
              <li>
                Head-to-head comparison against OpenAI o3 and Claude Opus 4.7: identical rare-disease vignettes, LLM tier grader applied uniformly across all three systems (n=50).
              </li>
              <li>
                &ldquo;One test to the answer&rdquo; and &ldquo;five tests to the answer&rdquo; measured on 96 random Phenopacket2Prompt cases. A test counts as confirmatory when a positive result would definitively establish the diagnosis under expert clinical judgment.
              </li>
              <li>
                Phenopacket2Prompt is a public benchmark of 9,587 published rare-disease case reports with verified ground-truth diagnoses (doi:10.5281/zenodo.15065293), used in peer-reviewed research (Robinson et al., <em>European Journal of Human Genetics</em>, 2026).
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="py-8">
        <GoldDivider wide />
      </div>

      {/* Resources Section */}
      <ResourcesSection />

      {/* Divider */}
      <div className="py-8">
        <GoldDivider />
      </div>

      {/* Final CTA Section */}
      <section className="py-12 sm:py-[4.5rem] text-center">
        <div className="max-w-[520px] mx-auto px-4 sm:px-8">
          <h2 className="font-serif text-[1.5rem] sm:text-[2rem] font-normal text-[#1a1a1a] mb-4 leading-snug">
            You&rsquo;ve carried this long enough.
          </h2>
          <p className="font-serif-body text-[1.05rem] text-[#5a5a5a] leading-relaxed mb-9">
            Ten minutes of your time. A ranked list of what might be going on, and the specific tests that could confirm each one. Free while we&rsquo;re in early access.
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

      {/* Divider */}
      <div className="pb-2">
        <GoldDivider wide />
      </div>

      {/* Footer */}
      <footer className="border-t border-[#d4c5b0] pt-8 sm:pt-10 pb-8">
        <div className="max-w-[1140px] mx-auto px-4 sm:px-8">
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
            <Link href="/faq" className="font-sans text-[0.7rem] text-[#999] uppercase tracking-[0.04em] hover:text-[#5a5a5a] transition-colors">
              FAQ
            </Link>
            <Link href="/legal/privacy" className="font-sans text-[0.7rem] text-[#999] uppercase tracking-[0.04em] hover:text-[#5a5a5a] transition-colors">
              Privacy
            </Link>
            <Link href="/legal/terms" className="font-sans text-[0.7rem] text-[#999] uppercase tracking-[0.04em] hover:text-[#5a5a5a] transition-colors">
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
