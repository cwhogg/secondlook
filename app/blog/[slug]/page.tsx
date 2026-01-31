import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getAllContent, getContentBySlug } from "@/lib/content"
import { markdownToHtml } from "@/lib/markdown"

export function generateStaticParams() {
  const content = getAllContent()
  return content.map((piece) => ({ slug: piece.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const piece = getContentBySlug(params.slug)
  if (!piece) return { title: "Not Found" }

  return {
    title: piece.title,
    description: piece.description,
    keywords: piece.targetKeywords,
    openGraph: {
      title: piece.title,
      description: piece.description,
      type: "article",
      publishedTime: piece.date,
    },
    twitter: {
      card: "summary_large_image",
      title: piece.title,
      description: piece.description,
    },
  }
}

function buildJsonLd(piece: { title: string; description: string; date: string; type: string; slug: string; content: string }) {
  const siteUrl = "https://secondlook.vercel.app"
  const url = `${siteUrl}/blog/${piece.slug}`

  if (piece.type === "faq") {
    const lines = piece.content.split("\n")
    const faqEntries: { question: string; answer: string }[] = []
    let currentQuestion = ""
    let currentAnswer: string[] = []

    for (const line of lines) {
      const headingMatch = line.match(/^#{2,3}\s+(.+)/)
      if (headingMatch) {
        if (currentQuestion && currentAnswer.length > 0) {
          faqEntries.push({
            question: currentQuestion,
            answer: currentAnswer.join(" ").trim(),
          })
        }
        currentQuestion = headingMatch[1]
        currentAnswer = []
      } else if (currentQuestion && line.trim()) {
        currentAnswer.push(line.replace(/[*_`#]/g, "").trim())
      }
    }
    if (currentQuestion && currentAnswer.length > 0) {
      faqEntries.push({
        question: currentQuestion,
        answer: currentAnswer.join(" ").trim(),
      })
    }

    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      name: piece.title,
      description: piece.description,
      url,
      mainEntity: faqEntries.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: entry.answer,
        },
      })),
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: piece.title,
    description: piece.description,
    url,
    datePublished: piece.date,
    dateModified: piece.date,
    publisher: {
      "@type": "Organization",
      name: "SecondLook",
      url: siteUrl,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  }
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const piece = getContentBySlug(params.slug)
  if (!piece) notFound()

  const htmlContent = await markdownToHtml(piece.content)
  const jsonLd = buildJsonLd(piece)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold bg-gradient-to-r from-purple-700 to-blue-600 bg-clip-text text-transparent">
          SecondLook
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/blog" className="text-sm font-medium text-gray-600 hover:text-purple-700 transition-colors">
            Resources
          </Link>
          <Link
            href="/step-1"
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md transition-all"
          >
            Start Analysis
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-20">
        <Link
          href="/blog"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Resources
        </Link>

        <header className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                piece.type === "blog"
                  ? "bg-blue-100 text-blue-700"
                  : piece.type === "faq"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-purple-100 text-purple-700"
              }`}
            >
              {piece.type === "blog" ? "Article" : piece.type === "faq" ? "FAQ" : "Comparison"}
            </span>
            <time className="text-sm text-gray-400" dateTime={piece.date}>
              {new Date(piece.date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </time>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
            <span className="bg-gradient-to-r from-gray-900 via-purple-800 to-blue-800 bg-clip-text text-transparent">
              {piece.title}
            </span>
          </h1>
          {piece.description && (
            <p className="text-xl text-gray-600 leading-relaxed">{piece.description}</p>
          )}
        </header>

        <div
          className="mdx-content"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />

        <footer className="mt-16 pt-8 border-t border-gray-200">
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Ready to get started?
            </h3>
            <p className="text-gray-700 mb-4">
              Use SecondLook to analyze your symptoms against thousands of rare and complex conditions.
            </p>
            <Link
              href="/step-1"
              className="inline-flex items-center bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-xl font-semibold shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-300"
            >
              Start My Health Analysis
            </Link>
          </div>
        </footer>
      </article>
    </div>
  )
}
