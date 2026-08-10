/**
 * Local runner for the daily disease-post generator.
 *
 *   npx tsx scripts/generate-disease-post.ts              # preview only
 *   npx tsx scripts/generate-disease-post.ts --publish    # commit + deploy live
 *   npx tsx scripts/generate-disease-post.ts --disease="Wilson Disease"
 *
 * Preview mode writes the full post file to mockups/ so you can review the
 * content/SEO before anything goes live. --publish commits to the repo
 * (requires GITHUB_TOKEN) which auto-deploys.
 */
import fs from "fs"
import path from "path"

// Load .env.local into process.env (tsx doesn't do this automatically).
for (const envFile of [".env.local", ".env"]) {
  const p = path.join(process.cwd(), envFile)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const i = line.indexOf("=")
    if (i < 0 || line.trim().startsWith("#")) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    if (!(k in process.env)) process.env[k] = v
  }
}

async function main() {
  const args = process.argv.slice(2)
  const publish = args.includes("--publish")
  const list = args.includes("--list")
  const diseaseArg = args.find((a) => a.startsWith("--disease="))?.split("=")[1]

  const { pickNextDisease, pickNextDiseases, slugForDisease } = await import(
    "../lib/blog-gen/disease-picker"
  )

  if (list) {
    const top = pickNextDiseases(25)
    top.forEach((p) =>
      console.log(
        `#${String(p.rank).padStart(2)} [${p.score}] ${p.disease.name} — ${(p.disease.prevalence as any)?.classification || "?"}`,
      ),
    )
    console.log(`\nuncovered pool: ${top[0]?.totalCandidates}`)
    return
  }
  const { generatePost } = await import("../lib/blog-gen/generate")
  const { buildPostFile, publishToGitHub } = await import("../lib/blog-gen/github-publish")
  const { loadDiseaseDatabase } = await import("../lib/knowledge")

  let disease
  if (diseaseArg) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    disease = loadDiseaseDatabase().find((d) => norm(d.name) === norm(diseaseArg))
    if (!disease) throw new Error(`Disease not found: ${diseaseArg}`)
    console.log(`Using requested disease: ${disease.name}`)
  } else {
    const top = pickNextDiseases(5)
    console.log("Top candidates:")
    top.forEach((p) => console.log(`  #${p.rank} [score ${p.score}] ${p.disease.name}`))
    disease = pickNextDisease()!.disease
    console.log(`\nCandidate pool: ${top[0]?.totalCandidates} uncovered diseases\n`)
  }

  const slug = slugForDisease(disease)
  console.log(`Generating post for "${disease.name}" (slug: ${slug})…\n`)
  const post = await generatePost(disease, slug)

  console.log("── TITLE ──\n" + post.title)
  console.log("\n── META DESCRIPTION (" + post.description.length + " chars) ──\n" + post.description)
  console.log("\n── KEYWORDS ──\n" + post.targetKeywords.join(" · "))
  console.log("\n── TWEET 1 (" + post.tweet1.length + " chars) ──\n" + post.tweet1)
  console.log("\n── TWEET 2 ──\n" + post.tweet2)
  console.log(`\n── BODY: ${post.wordCount} words ──`)

  if (publish) {
    const { url } = await publishToGitHub(post, slug, disease.id)
    console.log(`\n✓ Published + committed → ${url} (deploying)`)
  } else {
    const file = buildPostFile(post, slug, disease.id, new Date().toISOString())
    const out = path.join(process.cwd(), "mockups", `sample-post-${slug}.md`)
    fs.writeFileSync(out, file)
    console.log(`\n✓ Preview written (NOT live): ${out}`)
    console.log("  Review it, then run with --publish to commit + deploy.")
  }
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e)
  process.exit(1)
})
