/**
 * Picks the next KB disease to turn into a daily patient-facing blog post.
 *
 * Strategy: rank every KB disease by patient-search value and data richness,
 * skip anything already covered by an existing post, and return the top
 * uncovered one. Deterministic given the current set of published posts —
 * each day one more disease is covered, so the next-best is chosen next.
 */
import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { loadDiseaseDatabase } from "@/lib/knowledge"
import type { DiseaseProfile } from "@/lib/types/knowledge-base"

const BLOG_DIR = path.join(process.cwd(), "content", "blog")

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/** Titles + diseaseIds of everything already written, for dedup. */
function loadCovered(): { ids: Set<string>; titles: string[] } {
  const ids = new Set<string>()
  const titles: string[] = []
  if (!fs.existsSync(BLOG_DIR)) return { ids, titles }
  for (const file of fs.readdirSync(BLOG_DIR)) {
    if (!/\.mdx?$/.test(file)) continue
    try {
      const { data } = matter(fs.readFileSync(path.join(BLOG_DIR, file), "utf8"))
      if (data.diseaseId) ids.add(String(data.diseaseId))
      if (data.title) titles.push(norm(String(data.title)))
    } catch {
      /* skip unreadable file */
    }
  }
  return { ids, titles }
}

function symptomCount(d: DiseaseProfile): number {
  const s: any = d.symptoms
  if (Array.isArray(s)) return s.length
  if (s && typeof s === "object") {
    return ["pathognomonic", "common", "occasional", "rare"].reduce(
      (n, k) => n + (Array.isArray(s[k]) ? s[k].length : 0),
      0,
    )
  }
  return 0
}

// Chromosomal-coordinate syndromes (e.g. "15q13.3 microdeletion syndrome")
// are data-rich but have near-zero patient search demand — they're diagnosed
// in infancy by geneticists, not self-discovered by adults googling symptoms.
// Heavily deprioritize them in favor of searchable diagnostic-odyssey names.
function isLowSearchGeneticSyndrome(name: string): boolean {
  const n = name.toLowerCase()
  return (
    /\b\d+[pq]\d/.test(n) || // chromosome band notation: 15q13.3, 1p36…
    /micro(deletion|duplication)/.test(n) ||
    /\b(deletion|duplication) syndrome\b/.test(n) ||
    /\btrisomy \d/.test(n)
  )
}

/** Higher = better blog candidate. SEO/patient-reach (prevalence, adult
 *  onset, recognizable name) weighted above raw data richness. */
function score(d: DiseaseProfile): number {
  let sc = 0

  // --- Patient-reach / SEO signals (dominant) ---
  if (isLowSearchGeneticSyndrome(d.name)) sc -= 25
  // Favor the winnable middle: "uncommon"/"rare" conditions have genuine
  // search demand AND are underdiagnosed, but face far less SERP competition
  // than "common" ones (which established medical sites already own — a new
  // domain won't rank for "celiac disease" but can for "hidradenitis
  // suppurativa"). Ultra-rare has too little search volume.
  const cls = (d.prevalence as any)?.classification || ""
  if (cls === "uncommon") sc += 7
  else if (cls === "rare") sc += 5
  else if (cls === "common") sc += 3
  else if (cls === "ultra-rare") sc -= 4
  const onset: any = (d as any).demographics?.typicalOnsetAge
  if (onset && (onset.min >= 12 || onset.peak >= 13)) sc += 3 // adults self-search more

  // --- Content value (secondary) ---
  const crit = (d as any).diagnosticCriteria?.criteria
  if (Array.isArray(crit) && crit.length) sc += 3 // real "tests to rule in/out"
  sc += Math.min(symptomCount(d), 8)
  if (Array.isArray(d.differentialDiagnoses) && d.differentialDiagnoses.length) sc += 3 // misdiagnosis angle
  if (Array.isArray((d as any).references) && (d as any).references.length) sc += 1 // citable (E-E-A-T)
  if ((d as any).specialistType) sc += 1
  const conf = (d as any).confidenceInData
  if (conf === "high") sc += 2
  else if (conf === "medium") sc += 1
  return sc
}

function isCovered(d: DiseaseProfile, covered: { ids: Set<string>; titles: string[] }): boolean {
  if (d.id && covered.ids.has(d.id)) return true
  const names = [d.name, ...((d.aliases as string[]) || [])].map(norm).filter(Boolean)
  // Covered if a disease name/alias already appears in an existing post title.
  return covered.titles.some((t) => names.some((n) => n.length > 4 && t.includes(n)))
}

export interface DiseasePick {
  disease: DiseaseProfile
  score: number
  rank: number
  totalCandidates: number
}

/** Return the top N uncovered diseases by score (default just the winner). */
export function pickNextDiseases(limit = 1): DiseasePick[] {
  const covered = loadCovered()
  const ranked = loadDiseaseDatabase()
    .filter((d) => d.name && !isCovered(d, covered))
    .map((d) => ({ disease: d, score: score(d) }))
    .sort((a, b) => b.score - a.score || a.disease.name.localeCompare(b.disease.name))
  return ranked.slice(0, limit).map((r, i) => ({
    ...r,
    rank: i + 1,
    totalCandidates: ranked.length,
  }))
}

export function pickNextDisease(): DiseasePick | null {
  return pickNextDiseases(1)[0] || null
}

/** SEO/patient-intent slug for a disease (deduped against existing files). */
export function slugForDisease(d: DiseaseProfile): string {
  const base = norm(d.name).replace(/\s+/g, "-")
  const slug = `${base}-symptoms-diagnosis-guide`
  if (!fs.existsSync(BLOG_DIR)) return slug
  const exists = (s: string) =>
    fs.existsSync(path.join(BLOG_DIR, `${s}.md`)) || fs.existsSync(path.join(BLOG_DIR, `${s}.mdx`))
  if (!exists(slug)) return slug
  let n = 2
  while (exists(`${slug}-${n}`)) n++
  return `${slug}-${n}`
}
