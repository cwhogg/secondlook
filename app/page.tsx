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
            text: "Yes. Your health information is processed securely and is never stored on our servers. All patient data remains in your browser's local storage and is never transmitted beyond what is needed for the AI analysis. We use bank-level encryption for all data in transit.",
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
      <section id="main-content" className="py-12 sm:py-20 md:py-[5rem]">
        <div className="max-w-[1140px] mx-auto px-4 sm:px-8 grid grid-cols-1 md:grid-cols-[1fr_0.65fr] gap-8 sm:gap-12 items-center">
          {/* Text Content */}
          <div className="max-w-[600px]">
            {/* Beta Test Badge */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-6 sm:mb-8">
              <div className="flex items-center space-x-1.5 sm:space-x-2 border-2 border-[#8b2500] bg-[#8b2500] px-3 sm:px-4 py-1.5 sm:py-2">
                <FlaskConical className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                <span className="font-sans text-[10px] sm:text-xs font-semibold text-white uppercase tracking-wider">
                  Beta Test
                </span>
              </div>
            </div>

            {/* Headline */}
            <h1 className="font-serif text-[2rem] sm:text-[2.6rem] md:text-[3.4rem] font-normal leading-[1.12] text-[#1a1a1a] mb-5 sm:mb-7 tracking-[-0.01em]">
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
            <div className="max-w-[240px] sm:max-w-[380px]">
              <DNAHelix />
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="py-8">
        <GoldDivider wide />
      </div>

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
              How SecondLook Works
            </h2>
            <p className="font-serif-body text-lg sm:text-xl text-[#5a5a5a] max-w-3xl mx-auto leading-relaxed">
              A multi-stage diagnostic pipeline that turns your story into a ranked differential and concrete next steps.
            </p>
          </div>

          {/* Flow diagram */}
          <div className="flex flex-col items-center">
            <FlowStep step={1} icon={Upload} title="Upload your story and data" />
            <FlowStep step={2} icon={Search} title="SecondLook extracts clinical concepts" />
            <FlowStep step={3} icon={Database} title="Map symptoms and concepts to candidates in our 9k+ rare disease knowledge base" />
            <FlowStep step={4} icon={UsersRound} title="Activate 5 most relevant AI specialist agents in parallel to select most likely diagnoses from profile" />
            <FlowStep step={5} icon={ListOrdered} title="Synthesize and rank a top-10 differential" />
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
          {/* Section Header */}
          <div className="text-center mb-10 sm:mb-12">
            <div className="inline-flex items-center gap-1.5 mb-4 px-3 py-1 bg-white border border-[#d4c5b0]">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500]">
                Benchmark Results
              </span>
            </div>
            <h2 className="font-serif text-[1.6rem] sm:text-[2.2rem] font-normal text-[#1a1a1a] leading-tight mb-4">
              SecondLook beats current benchmarks in rare disease diagnosis
            </h2>
            <p className="font-serif-body text-base sm:text-lg text-[#5a5a5a] max-w-2xl mx-auto leading-relaxed">
              Tested against the same Phenopacket2Prompt benchmark used to evaluate Exomiser, o1-preview, and GPT-4o in the peer-reviewed literature — graded the same way, in Mondo ontology space, so the numbers are directly comparable.
            </p>
          </div>

          {/* Hero Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 sm:mb-12">
            <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
              <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500] mb-2">
                vs. gold-standard tool
              </div>
              <div className="font-serif text-[2rem] sm:text-[2.4rem] leading-none text-[#1a1a1a] mb-1">
                +1.2<span className="text-base text-[#5a5a5a] font-sans ml-1">pp</span>
              </div>
              <div className="font-serif-body text-sm text-[#5a5a5a] leading-snug">
                Top-1 over <strong>Exomiser</strong> — the dedicated rare-disease phenotype-matching tool.
              </div>
            </div>

            <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
              <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500] mb-2">
                head-to-head
              </div>
              <div className="font-serif text-[2rem] sm:text-[2.4rem] leading-none text-[#1a1a1a] mb-1">
                +5.7<span className="text-base text-[#5a5a5a] font-sans ml-1">pp</span>
              </div>
              <div className="font-serif-body text-sm text-[#5a5a5a] leading-snug">
                Top-1 over <strong>OpenAI o3</strong> single-shot on identical cases — same patient, same grader.
              </div>
            </div>

            <div className="bg-white border border-[#d4c5b0] p-5 sm:p-6">
              <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#8b2500] mb-2">
                vs. prior LLM SOTA
              </div>
              <div className="font-serif text-[2rem] sm:text-[2.4rem] leading-none text-[#1a1a1a] mb-1">
                +13.1<span className="text-base text-[#5a5a5a] font-sans ml-1">pp</span>
              </div>
              <div className="font-serif-body text-sm text-[#5a5a5a] leading-snug">
                Top-1 over <strong>o1-preview</strong> from the published Phenopacket2Prompt evaluation.
              </div>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="bg-white border border-[#d4c5b0] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf6f0] border-b border-[#d4c5b0]">
                  <th className="text-left font-sans text-[10px] font-semibold uppercase tracking-wider text-[#6d4c30] px-4 py-3">
                    Method
                  </th>
                  <th className="text-right font-sans text-[10px] font-semibold uppercase tracking-wider text-[#6d4c30] px-4 py-3 w-24">
                    Top-1
                  </th>
                  <th className="text-right font-sans text-[10px] font-semibold uppercase tracking-wider text-[#6d4c30] px-4 py-3 w-24">
                    Top-3
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-[#8b2500] text-white">
                  <td className="font-serif font-semibold px-4 py-3">SecondLook</td>
                  <td className="font-serif font-bold tabular-nums text-right px-4 py-3">36.7%</td>
                  <td className="font-serif font-bold tabular-nums text-right px-4 py-3">50.0%</td>
                </tr>
                <tr className="border-t border-[#e8ddd0]">
                  <td className="font-serif px-4 py-3 text-[#1a1a1a]">
                    Exomiser<sup className="text-[#999] text-[10px] ml-0.5">1</sup>
                  </td>
                  <td className="font-serif tabular-nums text-right text-[#5a5a5a] px-4 py-3">35.5%</td>
                  <td className="font-serif tabular-nums text-right text-[#5a5a5a] px-4 py-3">46.3%</td>
                </tr>
                <tr className="border-t border-[#e8ddd0]">
                  <td className="font-serif px-4 py-3 text-[#1a1a1a]">
                    Claude Opus 4.7 (single-shot)<sup className="text-[#999] text-[10px] ml-0.5">2</sup>
                  </td>
                  <td className="font-serif tabular-nums text-right text-[#5a5a5a] px-4 py-3">33.3%</td>
                  <td className="font-serif tabular-nums text-right text-[#5a5a5a] px-4 py-3">43.3%</td>
                </tr>
                <tr className="border-t border-[#e8ddd0]">
                  <td className="font-serif px-4 py-3 text-[#1a1a1a]">
                    OpenAI o3 (single-shot)<sup className="text-[#999] text-[10px] ml-0.5">2</sup>
                  </td>
                  <td className="font-serif tabular-nums text-right text-[#5a5a5a] px-4 py-3">31.0%</td>
                  <td className="font-serif tabular-nums text-right text-[#5a5a5a] px-4 py-3">41.4%</td>
                </tr>
                <tr className="border-t border-[#e8ddd0]">
                  <td className="font-serif px-4 py-3 text-[#1a1a1a]">
                    o1-preview<sup className="text-[#999] text-[10px] ml-0.5">1</sup>
                  </td>
                  <td className="font-serif tabular-nums text-right text-[#5a5a5a] px-4 py-3">23.6%</td>
                  <td className="font-serif tabular-nums text-right text-[#5a5a5a] px-4 py-3">31.2%</td>
                </tr>
                <tr className="border-t border-[#e8ddd0]">
                  <td className="font-serif px-4 py-3 text-[#1a1a1a]">
                    GPT-4o<sup className="text-[#999] text-[10px] ml-0.5">1</sup>
                  </td>
                  <td className="font-serif tabular-nums text-right text-[#5a5a5a] px-4 py-3">~20%</td>
                  <td className="font-serif tabular-nums text-right text-[#5a5a5a] px-4 py-3">~27%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Dataset description */}
          <div className="mt-10 sm:mt-12 bg-white border border-[#d4c5b0] p-5 sm:p-6">
            <h3 className="font-serif text-lg sm:text-xl font-medium text-[#1a1a1a] mb-3 leading-snug">
              About the Phenopacket2Prompt benchmark
            </h3>
            <p className="font-serif-body text-sm sm:text-[15px] leading-relaxed text-[#5a5a5a] mb-3">
              Phenopacket2Prompt is a public dataset of <strong>9,587 published clinical vignettes</strong>, each derived from a peer-reviewed case report and paired with a verified ground-truth diagnosis (typically an OMIM identifier). Because every case maps to a real published patient, it is widely used as the rare-disease benchmark for diagnostic AI evaluation.
            </p>
            <p className="font-serif-body text-sm sm:text-[15px] leading-relaxed text-[#5a5a5a]">
              SecondLook&rsquo;s numbers were measured on a random sample from this dataset (n=30 cases, paper-faithful Mondo grading) and compared against Exomiser, o1-preview, and GPT-4o numbers reported in Robinson et al., 2026 (n=5,213). The Claude Opus 4.7 and OpenAI o3 numbers were generated by us on the same case sample as SecondLook, using each model in a single-shot diagnostic prompt so the comparison is head-to-head.
            </p>
          </div>

          {/* References */}
          <div className="mt-6 sm:mt-8 px-1">
            <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#6d4c30] mb-2">
              References &amp; methodology
            </div>
            <ol className="font-serif-body text-xs sm:text-[13px] leading-relaxed text-[#777] space-y-1.5 list-decimal pl-5">
              <li>
                Robinson PN et al. (2026). Evaluation of LLMs on rare-disease diagnosis using the Phenopacket2Prompt benchmark. <em>European Journal of Human Genetics</em>. Exomiser, o1-preview, and GPT-4o Top-N rates reported on n=5,213 cases.
              </li>
              <li>
                Head-to-head Claude Opus 4.7 and OpenAI o3 numbers measured by SecondLook on the same random sample as our pipeline (n=30), using each model in a single-shot diagnostic prompt against the same vignettes.
              </li>
              <li>
                Phenopacket2Prompt dataset: <span className="font-mono text-[11px]">doi:10.5281/zenodo.15065293</span>.
              </li>
              <li>
                Grading is paper-faithful: each prediction is grounded to a Mondo class, scored 1.0 for an exact OMIM/skos:exactMatch hit and 0.5 for an IS_A ancestor of the gold; Top-N counts a case correct when any of the top N has score &gt; 0 (Robinson et al. methodology).
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="py-8">
        <GoldDivider wide />
      </div>

      {/* SEO Paragraph */}
      <section className="py-8">
        <div className="max-w-[820px] mx-auto px-4 sm:px-8">
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
      <section className="py-12 sm:py-[4.5rem] text-center">
        <div className="max-w-[480px] mx-auto px-4 sm:px-8">
          <h2 className="font-serif text-[1.5rem] sm:text-[2rem] font-normal text-[#1a1a1a] mb-4 leading-snug">
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
