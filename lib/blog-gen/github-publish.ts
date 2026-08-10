/**
 * Publish a generated post by committing content/blog/<slug>.md to GitHub
 * via the Contents API — which triggers a Vercel deploy and makes the post
 * live. Adapted from the OpenHealthDataHub publishToGitHub. Auto-publish
 * (status: published) per the chosen model. Requires GITHUB_TOKEN and,
 * optionally, GITHUB_OWNER / GITHUB_REPO (defaults below).
 */
import type { GeneratedPost } from "./generate"

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_OWNER = process.env.GITHUB_OWNER || "cwhogg"
const GITHUB_REPO = process.env.GITHUB_REPO || "secondlook"
const SITE = "https://www.secondlookdx.com"

export function isGithubConfigured(): boolean {
  return !!GITHUB_TOKEN
}

/** Build the exact file (frontmatter + body) we commit — also used by the
 *  local script to write a preview to disk without publishing. */
export function buildPostFile(
  post: GeneratedPost,
  slug: string,
  diseaseId: string,
  dateIso: string,
): string {
  const fm = [
    "---",
    `title: ${JSON.stringify(post.title)}`,
    "type: blog-post",
    `diseaseId: ${JSON.stringify(diseaseId)}`,
    `targetKeywords: ${JSON.stringify(post.targetKeywords)}`,
    `date: ${JSON.stringify(dateIso)}`,
    `description: ${JSON.stringify(post.description)}`,
    `author: "SecondLook Editorial Team"`,
    `twitterTitle: ${JSON.stringify(post.tweet1)}`,
    `twitterSummary: ${JSON.stringify(post.tweet2)}`,
    "ideaName: SecondLook",
    "status: published",
    `wordCount: ${post.wordCount}`,
    `canonicalUrl: ${JSON.stringify(`${SITE}/blog/${slug}`)}`,
    "---",
    "",
    post.bodyMarkdown,
    "",
  ].join("\n")
  return fm
}

export async function publishToGitHub(
  post: GeneratedPost,
  slug: string,
  diseaseId: string,
): Promise<{ committed: boolean; url: string }> {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN not configured")

  const filePath = `content/blog/${slug}.md`
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
  }

  // Preserve original date + get sha if the file already exists (re-publish).
  let sha: string | undefined
  let dateIso = new Date().toISOString()
  try {
    const existing = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
      { headers },
    )
    if (existing.ok) {
      const j = await existing.json()
      sha = j.sha
      const decoded = Buffer.from(j.content, "base64").toString("utf-8")
      const m = decoded.match(/^date:\s*"(.+?)"/m)
      if (m) dateIso = m[1]
    }
  } catch {
    /* new file */
  }

  const fileContent = buildPostFile(post, slug, diseaseId, dateIso)
  const body: Record<string, unknown> = {
    message: sha ? `Update disease post: ${post.title}` : `Add disease post: ${post.title}`,
    content: Buffer.from(fileContent).toString("base64"),
    branch: "main",
  }
  if (sha) body.sha = sha

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
    { method: "PUT", headers, body: JSON.stringify(body) },
  )
  if (!res.ok) {
    throw new Error(`GitHub commit failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }
  return { committed: true, url: `${SITE}/blog/${slug}` }
}
