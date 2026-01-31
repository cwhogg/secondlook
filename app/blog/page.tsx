import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BookOpen, HelpCircle, GitCompare } from "lucide-react"
import { getAllContent, type ContentType } from "@/lib/content"

export const metadata: Metadata = {
  title: "Health Resources & Blog",
  description:
    "Expert articles, FAQs, and comparisons about rare diseases, symptom analysis, and getting the right diagnosis. Learn more about navigating complex health conditions.",
  keywords: [
    "rare disease blog",
    "health resources",
    "symptom analysis articles",
    "rare disease FAQ",
    "diagnosis comparison",
  ],
}

const typeConfig: Record<ContentType, { label: string; color: string; icon: typeof BookOpen }> = {
  blog: { label: "Article", color: "bg-blue-100 text-blue-700", icon: BookOpen },
  faq: { label: "FAQ", color: "bg-emerald-100 text-emerald-700", icon: HelpCircle },
  comparison: { label: "Comparison", color: "bg-purple-100 text-purple-700", icon: GitCompare },
}

export default function BlogIndexPage() {
  const content = getAllContent()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-gray-900 via-purple-800 to-blue-800 bg-clip-text text-transparent">
              Health Resources
            </span>
          </h1>
          <p className="text-xl text-gray-600 leading-relaxed">
            Expert articles, answers to common questions, and comparisons to help you navigate complex health conditions.
          </p>
        </div>

        {content.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-6" />
            <h2 className="text-2xl font-semibold text-gray-400 mb-2">Coming Soon</h2>
            <p className="text-gray-400">
              We&apos;re working on expert health content. Check back soon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {content.map((piece) => {
              const config = typeConfig[piece.type]
              const Icon = config.icon
              return (
                <Link
                  key={piece.slug}
                  href={`/blog/${piece.slug}`}
                  className="group bg-white rounded-3xl shadow-lg border border-gray-100 p-8 hover:shadow-xl hover:scale-[1.02] transition-all duration-300"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {config.label}
                    </span>
                    <span className="text-sm text-gray-400">
                      {new Date(piece.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-purple-700 transition-colors">
                    {piece.title}
                  </h2>
                  <p className="text-gray-600 leading-relaxed mb-4 line-clamp-3">
                    {piece.description}
                  </p>
                  <span className="inline-flex items-center text-sm font-medium text-purple-600 group-hover:text-purple-700">
                    Read more
                    <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
              )
            })}
          </div>
        )}

        <div className="text-center mt-16">
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-700 transition-colors text-sm"
          >
            &larr; Back to SecondLook
          </Link>
        </div>
      </div>
    </div>
  )
}
