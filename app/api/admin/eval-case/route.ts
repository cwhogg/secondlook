import { NextRequest, NextResponse } from "next/server"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

const DATASET_PATH = join(process.cwd(), "scripts", "benchmark-data", "en.jsonl")

interface EvalCaseRow {
  ppkt_id: string
  diagnosis: Array<{ id: string; label: string }>
  case_description: string
}

let cachedDataset: EvalCaseRow[] | null = null

function loadDataset(): EvalCaseRow[] {
  if (cachedDataset) return cachedDataset
  if (!existsSync(DATASET_PATH)) {
    cachedDataset = []
    return cachedDataset
  }
  const text = readFileSync(DATASET_PATH, "utf-8")
  cachedDataset = text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as EvalCaseRow)
  return cachedDataset
}

function extractDemographics(caseDescription: string): { age: string; sex: "male" | "female" | "other" } {
  const firstLine = caseDescription.split("\n")[0]
  let sex: "male" | "female" | "other" = "other"
  if (/\b(man|boy|male)\b/i.test(firstLine)) sex = "male"
  else if (/\b(woman|girl|female)\b/i.test(firstLine)) sex = "female"

  let age = ""
  const yearMatch = firstLine.match(/(\d+)-year[-, ]/)
  const monthOnly = firstLine.match(/(\d+)-month-old/)
  const dayOnly = firstLine.match(/(\d+)-day/)
  if (yearMatch) age = yearMatch[1]
  else if (monthOnly) age = String(Math.max(0, Math.round(parseInt(monthOnly[1]) / 12)))
  else if (dayOnly) age = "0"

  if (!age) {
    const fullYearMatch = caseDescription.match(/(\d+)\s*(?:-\s*)?year[s]?[- ]*old/i)
    const fullMonthMatch = caseDescription.match(/(\d+)\s*(?:-\s*)?month[s]?[- ]*old/i)
    const fullDayMatch = caseDescription.match(/(\d+)\s*(?:-\s*)?day[s]?[- ]*old/i)
    const ageOfMatch = caseDescription.match(/(?:age|aged)\s+(\d+)/i)
    const atAgeMatch = caseDescription.match(/at\s+(?:the\s+)?age\s+of\s+(\d+)/i)
    if (fullYearMatch) age = fullYearMatch[1]
    else if (ageOfMatch) age = ageOfMatch[1]
    else if (atAgeMatch) age = atAgeMatch[1]
    else if (fullMonthMatch) age = String(Math.max(0, Math.round(parseInt(fullMonthMatch[1]) / 12)))
    else if (fullDayMatch) age = "0"
  }
  if (!age) age = "30"
  return { age, sex }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const countParam = url.searchParams.get("count")
  const excludeParam = url.searchParams.get("exclude") || ""
  const modeParam = url.searchParams.get("mode") || "uniform"
  const count = countParam ? Math.max(1, Math.min(100, parseInt(countParam, 10))) : 1
  const mode = modeParam === "diversified" ? "diversified" : "uniform"

  const dataset = loadDataset()
  if (dataset.length === 0) {
    return NextResponse.json(
      { error: "Eval dataset not available on this server" },
      { status: 503 },
    )
  }

  const excluded = new Set(excludeParam.split(",").map((s) => s.trim()).filter(Boolean))
  const available = dataset.filter((row) => !excluded.has(row.ppkt_id))
  if (available.length === 0) {
    return NextResponse.json(
      { error: "All eval cases have been run; nothing left to sample" },
      { status: 409 },
    )
  }

  const picked: EvalCaseRow[] = []

  if (mode === "diversified") {
    // Diagnosis-stratified sampling: the corpus is heavily concentrated
    // (top-15 diagnoses cover ~28% of the 9,587 rows; DEE4 alone is 462
    // rows / ~4.8%). Uniform row sampling repeatedly hits the same handful
    // of diseases and biases pipeline-quality evaluation toward how we
    // handle those few. Diversified mode buckets rows by primary diagnosis
    // label first, then picks distinct labels uniformly at random and
    // returns one random representative case per label.
    const byLabel = new Map<string, EvalCaseRow[]>()
    for (const row of available) {
      const label = row.diagnosis?.[0]?.label?.trim()
      if (!label) continue
      if (!byLabel.has(label)) byLabel.set(label, [])
      byLabel.get(label)!.push(row)
    }
    const labels = Array.from(byLabel.keys())
    for (let i = 0; i < count && labels.length > 0; i++) {
      const labelIdx = Math.floor(Math.random() * labels.length)
      const label = labels.splice(labelIdx, 1)[0]
      const candidates = byLabel.get(label)!
      const caseIdx = Math.floor(Math.random() * candidates.length)
      picked.push(candidates[caseIdx])
    }
  } else {
    const remaining = available.slice()
    for (let i = 0; i < count && remaining.length > 0; i++) {
      const idx = Math.floor(Math.random() * remaining.length)
      picked.push(remaining.splice(idx, 1)[0])
    }
  }

  const cases = picked.map((row) => ({
    ppkt_id: row.ppkt_id,
    diagnosis: row.diagnosis,
    case_description: row.case_description,
    demographics: extractDemographics(row.case_description),
  }))

  return NextResponse.json({
    cases,
    totalAvailable: available.length,
    totalDataset: dataset.length,
    samplingMode: mode,
  })
}
