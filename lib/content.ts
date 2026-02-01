import fs from "fs"
import path from "path"
import matter from "gray-matter"

const contentDirectory = path.join(process.cwd(), "content")

export type ContentType = "blog" | "faq" | "comparison" | "landing-page"

export interface ContentMeta {
  slug: string
  title: string
  type: ContentType
  description: string
  targetKeywords: string[]
  status: string
  date: string
  lastModified: string
}

export interface ContentPiece extends ContentMeta {
  content: string
}

function getContentFromDirectory(dir: string, type: ContentType): ContentPiece[] {
  const dirPath = path.join(contentDirectory, dir)
  if (!fs.existsSync(dirPath)) return []

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

  return files.map((filename) => {
    const filePath = path.join(dirPath, filename)
    const fileContents = fs.readFileSync(filePath, "utf8")
    const { data, content } = matter(fileContents)
    const rawSlug = filename.replace(/\.mdx?$/, "")
    // Strip content-type prefix from slug
    const prefixes = ["blog-", "faq-", "comparison-", "landing-page-"]
    let slug = rawSlug
    for (const prefix of prefixes) {
      if (rawSlug.startsWith(prefix)) {
        slug = rawSlug.slice(prefix.length)
        break
      }
    }

    // Extract first non-heading paragraph as description fallback
    let description = data.description || ""
    if (!description) {
      const lines = content.split("\n")
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---")) {
          description = trimmed.replace(/[*_`\[\]()]/g, "").slice(0, 200)
          break
        }
      }
    }

    // Use generatedAt as date fallback
    const dateStr = data.date || data.generatedAt
    const date = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

    // lastModified falls back to date
    const lastModifiedStr = data.lastModified || dateStr
    const lastModified = lastModifiedStr ? new Date(lastModifiedStr).toISOString() : date

    return {
      slug,
      title: data.title || slug,
      type,
      description,
      targetKeywords: data.targetKeywords || [],
      status: data.status || "published",
      date,
      lastModified,
      content,
    }
  })
}

export function getAllContent(): ContentPiece[] {
  const blog = getContentFromDirectory("blog", "blog")
  const faq = getContentFromDirectory("faq", "faq")
  const comparison = getContentFromDirectory("comparison", "comparison")
  const landingPage = getContentFromDirectory("landing-page", "landing-page")

  return [...blog, ...faq, ...comparison, ...landingPage]
    .filter((piece) => piece.status === "published" || piece.status === "draft")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getContentBySlug(slug: string): ContentPiece | undefined {
  const all = [
    ...getContentFromDirectory("blog", "blog"),
    ...getContentFromDirectory("faq", "faq"),
    ...getContentFromDirectory("comparison", "comparison"),
    ...getContentFromDirectory("landing-page", "landing-page"),
  ]
  return all.find((piece) => piece.slug === slug)
}
