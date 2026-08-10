/**
 * Generates a patient-facing, SEO-optimized blog post for one KB disease,
 * grounded in that disease's structured profile (symptoms + frequencies,
 * diagnostic criteria, differentials, red flags, specialist, citations).
 *
 * The model is told to use ONLY the provided facts for anything specific —
 * this keeps patient-facing medical content anchored to the curated KB
 * rather than free-form generation, and lets us cite real sources.
 */
import { callAnthropic } from "@/lib/anthropic"
import type { DiseaseProfile } from "@/lib/types/knowledge-base"

const WRITER_MODEL = process.env.BLOG_WRITER_MODEL || "claude-sonnet-4-6"
const SITE = "https://www.secondlookdx.com"

export interface GeneratedPost {
  title: string
  description: string
  targetKeywords: string[]
  bodyMarkdown: string
  wordCount: number
  tweet1: string
  tweet2: string
}

/** Compact, structured facts from the KB profile for grounding. */
function factSheet(d: DiseaseProfile): string {
  const lines: string[] = []
  lines.push(`Name: ${d.name}`)
  if (d.aliases?.length) lines.push(`Also known as: ${d.aliases.join(", ")}`)
  if (d.icd10Codes?.length) lines.push(`ICD-10: ${d.icd10Codes.join(", ")}`)
  if ((d as any).omimId) lines.push(`OMIM: ${(d as any).omimId}`)
  if ((d as any).orphanetId) lines.push(`Orphanet ID: ${(d as any).orphanetId}`)
  const prev: any = d.prevalence
  if (prev) lines.push(`Prevalence: ${prev.estimate || ""} (${prev.classification || ""})`)
  const demo: any = d.demographics
  if (demo?.typicalOnsetAge)
    lines.push(
      `Typical onset age: ${demo.typicalOnsetAge.min}–${demo.typicalOnsetAge.max} (peak ${demo.typicalOnsetAge.peak}); sex: ${demo.sexPredilection || "unknown"}`,
    )
  if ((d as any).systemsAffected?.length)
    lines.push(`Body systems affected: ${(d as any).systemsAffected.join(", ")}`)

  const sym: any = d.symptoms
  if (Array.isArray(sym)) {
    lines.push(`Symptoms: ${sym.map((s: any) => s.name || s).join(", ")}`)
  } else if (sym) {
    for (const tier of ["pathognomonic", "common", "occasional", "rare"]) {
      const arr = sym[tier]
      if (Array.isArray(arr) && arr.length) {
        lines.push(
          `${tier} symptoms: ${arr
            .map((s: any) => (s.frequency ? `${s.name} (~${s.frequency}%)` : s.name || s))
            .join(", ")}`,
        )
      }
    }
  }
  const crit: any = (d as any).diagnosticCriteria
  if (crit?.criteria?.length) {
    lines.push(`Diagnostic criteria (${crit.formalCriteriaName || "criteria"}):`)
    for (const c of crit.criteria) {
      lines.push(
        `  - [${c.category}${c.requiredForDiagnosis ? ", required" : ""}] ${c.description}`,
      )
    }
  }
  if ((d as any).keyFindings?.length) lines.push(`Key findings: ${(d as any).keyFindings.join("; ")}`)
  if (d.differentialDiagnoses?.length)
    lines.push(`Commonly confused with / differentials: ${(d.differentialDiagnoses as any[]).map((x: any) => x.name || x).join(", ")}`)
  if ((d as any).redFlags?.length) lines.push(`Red flags (urgent): ${(d as any).redFlags.join("; ")}`)
  if ((d as any).specialistType) lines.push(`Primary specialist: ${(d as any).specialistType}`)
  if ((d as any).references?.length)
    lines.push(`References: ${(d as any).references.slice(0, 6).map((r: any) => r.title || r.url || r).join(" | ")}`)
  return lines.join("\n")
}

function buildSystemPrompt(): string {
  return `You are a medical writer creating patient-facing educational articles for SecondLook, a rare-disease diagnostic resource. Your reader is a patient (or their family) who is undiagnosed or newly wondering whether they might have this condition — often after years of being dismissed.

Write with warmth, clarity, and respect. No hype, no fear-mongering, no false hope. You are helping someone recognize a condition and know what to do next.

GROUNDING RULES (critical for medical safety):
- Use ONLY the facts in the provided FACT SHEET for anything specific to this disease (symptoms, frequencies, tests, criteria, specialists, prevalence). Do not invent statistics, drug names, or numbers not present.
- General, well-established medical context (what a test measures, what a specialty does) is fine.
- Never tell the reader they have the condition or should start/stop treatment. Frame everything as "worth discussing with a doctor."

STRUCTURE the article in this order, using ## H2 markdown headings (do NOT include an H1 — the title is separate; do NOT include frontmatter):
1. A 2–3 sentence opener that speaks to the patient's lived experience (the "hidden in plain sight" feeling).
2. ## What ${"{disease}"} actually is — plain-language explanation.
3. ## Symptoms to look for — group by how common; note the frequencies from the fact sheet where given.
4. ## What it's often mistaken for — the differentials, and why the mix-up happens.
5. ## The tests that rule it in or out — translate the diagnostic criteria into what a patient would actually get (the specific test that confirms it, plus what a doctor rules out first).
6. ## The path to a diagnosis — a realistic step-by-step from "something's wrong" to confirmation.
7. ## Which specialists to see — who to ask for a referral to, and why.
8. ## What patients go through — the emotional/practical reality of the diagnostic odyssey; validating.
9. ## When to push for answers — red flags and how to advocate for yourself.
10. ## Sources — bullet list citing the references / OMIM / Orphanet from the fact sheet.

Then a short closing line inviting the reader to run their symptoms through SecondLook: link to ${SITE}/step-1 as "start a free symptom analysis". End with a one-line disclaimer: this article is educational, not medical advice.

SEO: the title and body should naturally include how patients search ("<disease> symptoms", "is it <disease>", "<disease> misdiagnosis", "<disease> diagnosis"). Target ~1,300–1,900 words.

OUTPUT: return ONLY a single JSON object, no markdown fences, exactly this shape:
{
  "title": "compelling, patient-facing, keyword-rich H1 (max ~70 chars of core phrase; a subtitle after a colon is fine)",
  "description": "meta description, 150–158 chars, benefit-driven, includes the disease name",
  "targetKeywords": ["5–8 realistic patient search phrases"],
  "bodyMarkdown": "the full article body in markdown, starting with the opener paragraph then the ## sections",
  "tweet1": "a punchy hook tweet (max 260 chars) that makes an undiagnosed patient stop scrolling — lead with the most relatable missed-diagnosis detail. No link, no hashtags in tweet1.",
  "tweet2": "one short teaser sentence, then the article title on its own line, then a blank line, then the placeholder token {{URL}} (which will be replaced with the post URL). Nothing else."
}`
}

export async function generatePost(disease: DiseaseProfile, slug: string): Promise<GeneratedPost> {
  const userPrompt = `FACT SHEET for the disease to write about:\n\n${factSheet(disease)}\n\nWrite the article now. The eventual URL will be ${SITE}/blog/${slug} (use the {{URL}} placeholder in tweet2).`

  const res = await callAnthropic({
    model: WRITER_MODEL,
    systemPrompt: buildSystemPrompt().replace(/\{disease\}/g, disease.name),
    userPrompt,
    maxTokens: 8000,
    temperature: 0.6,
  })

  const c: any = res.content
  if (!c || typeof c !== "object" || !c.bodyMarkdown || !c.title) {
    throw new Error(
      `Writer did not return the expected JSON (got ${typeof c}). Raw: ${String(res.rawText).slice(0, 300)}`,
    )
  }

  const body = String(c.bodyMarkdown).trim()
  const wordCount = body.split(/\s+/).filter(Boolean).length
  return {
    title: String(c.title).trim(),
    description: String(c.description || "").trim().slice(0, 160),
    targetKeywords: Array.isArray(c.targetKeywords) ? c.targetKeywords.map(String) : [],
    bodyMarkdown: body,
    wordCount,
    tweet1: String(c.tweet1 || "").trim(),
    tweet2: String(c.tweet2 || "").trim(),
  }
}
