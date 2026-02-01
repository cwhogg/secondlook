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

function ResourcesSection() {
  const posts = getAllContent().slice(0, 3)
  if (posts.length === 0) return null

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="text-center mb-10">
        <h2 className="text-4xl md:text-5xl font-bold text-[#1e1b4b] mb-6">
          Health Resources &amp; Rare Disease Guides
        </h2>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
          Explore our guides on rare disease diagnosis, navigating complex medical cases, and making the most of AI symptom checkers on your health journey.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group bg-white rounded-xl shadow-sm border border-[#e5e2f0] p-5 md:p-6 hover:shadow-md transition-all duration-300 flex flex-col"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-700 transition-colors">
              {post.title}
            </h3>
            <p className="text-gray-600 leading-relaxed flex-1">{post.description}</p>
            <div className="mt-4 flex items-center text-indigo-700 font-medium text-sm">
              <span>Read more</span>
              <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
      </div>

      <div className="text-center mt-10">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-indigo-700 hover:text-indigo-800 font-semibold transition-colors"
        >
          <BookOpen className="h-5 w-5" />
          <span>View all resources</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#faf9fe]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Navigation */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-indigo-700">
          SecondLook
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/blog" className="text-sm font-medium text-gray-600 hover:text-indigo-700 transition-colors">
            Resources
          </Link>
          <Link
            href="/step-1"
            className="bg-indigo-700 hover:bg-indigo-800 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md transition-all"
          >
            Start Analysis
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
            <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100">
              <Shield className="h-4 w-4 text-indigo-700" />
              <span className="text-sm font-medium text-gray-700">HIPAA Compliant</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100">
              <CheckCircle className="h-4 w-4 text-indigo-700" />
              <span className="text-sm font-medium text-gray-700">MD Reviewed</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100">
              <Lock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-gray-700">Bank-Level Encryption</span>
            </div>
          </div>

          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
              <span className="text-[#1e1b4b]">
                {"Find Your Rare Diagnosis"}
              </span>
              <br />
              <span className="text-indigo-700">
                 in Minutes.
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-600 mb-10 leading-relaxed max-w-3xl mx-auto">
              Our AI analyzes your symptoms against thousands of conditions, focusing on rare and complex diagnoses that
              might be overlooked by general practitioners.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
              <Link
                href="/step-1"
                className="group bg-indigo-700 hover:bg-indigo-800 text-white px-8 py-4 rounded-lg font-semibold text-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-2"
              >
                <Sparkles className="h-5 w-5" />
                <span>Start My Health Analysis</span>
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <p className="text-center text-gray-500 text-sm">Free during early access</p>
          </div>
        </div>
      </section>

      {/* Medical Notice */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-indigo-50 rounded-2xl p-6 border border-[#e5e2f0]">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 bg-indigo-700 rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Important Medical Notice</h3>
              <p className="text-gray-700 leading-relaxed">
                This analysis is for educational purposes and does not replace professional medical advice. Always
                consult with qualified healthcare providers for medical decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-xl shadow-sm border border-[#e5e2f0] p-5 md:p-6 transition-all duration-300">
            <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6">
              <Shield className="h-8 w-8 text-indigo-700" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Medical-Grade Security</h3>
            <p className="text-gray-600 leading-relaxed">
              Your health information is protected with the same security standards used by hospitals and medical
              institutions.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#e5e2f0] p-5 md:p-6 transition-all duration-300">
            <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6">
              <Zap className="h-8 w-8 text-indigo-700" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Fast Analysis</h3>
            <p className="text-gray-600 leading-relaxed">
              Get comprehensive health insights in under 10 minutes. No waiting for appointments or referrals.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#e5e2f0] p-5 md:p-6 transition-all duration-300">
            <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6">
              <Heart className="h-8 w-8 text-indigo-700" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Doctor-Reviewed AI</h3>
            <p className="text-gray-600 leading-relaxed">
              Our AI is trained on peer-reviewed medical literature and overseen by licensed healthcare professionals.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold text-[#1e1b4b] mb-6">
            How SecondLook Works
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Our simple 4-step process helps you get expert medical insights quickly and securely.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="text-center">
            <div className="w-14 h-14 bg-indigo-700 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-sm">
              <span className="text-2xl font-bold text-white">1</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Share Your Health Story</h3>
            <p className="text-gray-600 leading-relaxed">
              Tell us about your symptoms, health history, and concerns using our easy questionnaire designed for
              patients.
            </p>
          </div>

          <div className="text-center">
            <div className="w-14 h-14 bg-indigo-700 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-sm">
              <span className="text-2xl font-bold text-white">2</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">AI Medical Review</h3>
            <p className="text-gray-600 leading-relaxed">
              Our medical AI analyzes your information against thousands of conditions, focusing on rare and complex
              diagnoses.
            </p>
          </div>

          <div className="text-center">
            <div className="w-14 h-14 bg-indigo-700 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-sm">
              <span className="text-2xl font-bold text-white">3</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Get Your Report</h3>
            <p className="text-gray-600 leading-relaxed">
              Receive a detailed analysis with potential conditions to discuss with your healthcare provider.
            </p>
          </div>

          <div className="text-center">
            <div className="w-14 h-14 bg-amber-600 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Get Recommendations</h3>
            <p className="text-gray-600 leading-relaxed">
              We recommend trusted partners who can fill in gaps and help get to a specific diagnosis.
            </p>
          </div>
        </div>
      </section>

      {/* Keyword-rich SEO paragraph */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-center text-gray-600 max-w-3xl mx-auto leading-relaxed">
          Whether you&apos;re searching for a medical second opinion, exploring an AI symptom checker for rare diseases,
          or looking for help with a complex diagnosis, SecondLook provides the analytical depth that standard tools lack.
          Our platform is designed for patients navigating a diagnostic odyssey who need more than generic health advice.
        </p>
      </section>

      {/* Resources Section */}
      <ResourcesSection />

      {/* Final CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">Ready to explore your health?</h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Get AI-powered diagnostic insights for complex and rare conditions — free during early access.
          </p>
          <Link
            href="/step-1"
            className="group bg-indigo-700 hover:bg-indigo-800 text-white px-8 py-4 rounded-lg font-semibold text-lg shadow-sm hover:shadow-md transition-all duration-200 inline-flex items-center space-x-2"
          >
            <Sparkles className="h-5 w-5" />
            <span>Start My Health Analysis</span>
            <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

    </div>
  )
}
