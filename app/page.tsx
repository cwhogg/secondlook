import Link from "next/link"
import { ArrowRight, Shield, CheckCircle, Lock, Sparkles, Zap, Heart } from "lucide-react"

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

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 via-blue-600/5 to-emerald-600/5"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
            <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100">
              <Shield className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-gray-700">HIPAA Compliant</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">MD Reviewed</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100">
              <Lock className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-gray-700">Bank-Level Encryption</span>
            </div>
          </div>

          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
              <span className="bg-gradient-to-r from-gray-900 via-purple-800 to-blue-800 bg-clip-text text-transparent">
                {"Find Your Rare Diagnosis"} 
              </span>
              <br />
              <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                 in Minutes.
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-600 mb-12 leading-relaxed max-w-3xl mx-auto">
              Our AI analyzes your symptoms against thousands of conditions, focusing on rare and complex diagnoses that
              might be overlooked by general practitioners.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
              <Link
                href="/step-1"
                className="group bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center space-x-2"
              >
                <Sparkles className="h-5 w-5" />
                <span>Start My Health Analysis</span>
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <p className="text-center text-gray-500 text-sm">Trusted by 50,000+ patients nationwide</p>
          </div>
        </div>
      </section>

      {/* Medical Notice */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-100">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
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
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 hover:shadow-xl hover:scale-105 transition-all duration-300">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-2xl flex items-center justify-center mb-6">
              <Shield className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Medical-Grade Security</h3>
            <p className="text-gray-600 leading-relaxed">
              Your health information is protected with the same security standards used by hospitals and medical
              institutions.
            </p>
          </div>

          <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 hover:shadow-xl hover:scale-105 transition-all duration-300">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center mb-6">
              <Zap className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Fast Analysis</h3>
            <p className="text-gray-600 leading-relaxed">
              Get comprehensive health insights in under 10 minutes. No waiting for appointments or referrals.
            </p>
          </div>

          <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 hover:shadow-xl hover:scale-105 transition-all duration-300">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-purple-200 rounded-2xl flex items-center justify-center mb-6">
              <Heart className="h-8 w-8 text-purple-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Doctor-Reviewed AI</h3>
            <p className="text-gray-600 leading-relaxed">
              Our AI is trained on peer-reviewed medical literature and overseen by licensed healthcare professionals.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-gray-900 via-purple-800 to-blue-800 bg-clip-text text-transparent mb-6">
            How SecondLook Works
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Our simple 4-step process helps you get expert medical insights quickly and securely.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <span className="text-2xl font-bold text-white">1</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Share Your Health Story</h3>
            <p className="text-gray-600 leading-relaxed">
              Tell us about your symptoms, health history, and concerns using our easy questionnaire designed for
              patients.
            </p>
          </div>

          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <span className="text-2xl font-bold text-white">2</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">AI Medical Review</h3>
            <p className="text-gray-600 leading-relaxed">
              Our medical AI analyzes your information against thousands of conditions, focusing on rare and complex
              diagnoses.
            </p>
          </div>

          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <span className="text-2xl font-bold text-white">3</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Get Your Report</h3>
            <p className="text-gray-600 leading-relaxed">
              Receive a detailed analysis with potential conditions to discuss with your healthcare provider.
            </p>
          </div>

          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Get Recommendations</h3>
            <p className="text-gray-600 leading-relaxed">
              We recommend trusted partners who can fill in gaps and help get to a specific diagnosis.
            </p>
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
              50,000+
            </div>
            <p className="text-gray-600">Patients Analyzed</p>
          </div>
          <div>
            <div className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
              95%
            </div>
            <p className="text-gray-600">Accuracy Rate</p>
          </div>
          <div>
            <div className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
              {"<10"}
            </div>
            <p className="text-gray-600">Minutes Average</p>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">Ready to explore your health?</h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Join thousands of patients who have discovered new insights about their health conditions.
          </p>
          <Link
            href="/step-1"
            className="group bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center space-x-2"
          >
            <Sparkles className="h-5 w-5" />
            <span>Start My Health Analysis</span>
            <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* Partner Logos */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-gray-100">
        <div className="text-center mb-12">
          <h3 className="text-2xl font-semibold text-gray-900 mb-4">Trusted Healthcare Partners</h3>
          <p className="text-gray-600">We work with leading healthcare organizations to provide comprehensive care</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center opacity-60">
          <div className="flex items-center justify-center">
            <img src="/images/steadymd-logo.jpg" alt="SteadyMD" className="h-12 object-contain" />
          </div>
          <div className="flex items-center justify-center">
            <img src="/images/zus-health-logo.jpg" alt="Zus Health" className="h-12 object-contain" />
          </div>
          <div className="flex items-center justify-center">
            <img src="/images/23andme-logo.png" alt="23andMe" className="h-12 object-contain" />
          </div>
          <div className="flex items-center justify-center">
            <img src="/images/heartbeat-health-logo.jpg" alt="Heartbeat Health" className="h-12 object-contain" />
          </div>
          <div className="flex items-center justify-center">
            <img src="/images/talkiatry-logo.png" alt="Talkiatry" className="h-12 object-contain" />
          </div>
          <div className="flex items-center justify-center">
            <img src="/images/amplifymd-logo.webp" alt="AmplifyMD" className="h-12 object-contain" />
          </div>
          <div className="flex items-center justify-center">
            <img src="/images/oshi-health-logo.jpg" alt="Oshi Health" className="h-12 object-contain" />
          </div>
          <div className="flex items-center justify-center">
            <img src="/images/synapticure-logo.png" alt="Synapticure" className="h-12 object-contain" />
          </div>
        </div>
      </section>
    </div>
  )
}
