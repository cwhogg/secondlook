// Helpers for using uploaded lab results inside the analysis pipeline.
//
// Two things this module does:
//   1. formatLabsForPrompt: render a sorted, dated, flagged labs block that
//      slots into specialist and evidence-evaluator prompts. Recent labs
//      come first; old labs are explicitly tagged so the LLM can weight
//      them appropriately (Phase 3 temporal weighting).
//   2. deriveSymptomsFromLabs: convert abnormal lab results (H/L/HH/LL/CRIT
//      flagged) into MappedSymptom-shaped entries so the retrieval engine,
//      which keys off the symptoms array, can use lab abnormalities to
//      match KB diseases. The KB lists things like "Elevated alanine
//      aminotransferase" or "Hypocalcemia" as expected symptoms, which is
//      exactly what these derivations produce.

import type { LabResult, MappedSymptom } from "../types"

const RECENT_DAYS = 90 // labs newer than this are treated as primary evidence
const OLD_DAYS = 365 // labs older than this are explicitly flagged as historical

function ageBucket(dateDrawn: string | undefined, now = new Date()): "recent" | "moderate" | "historical" | "undated" {
  if (!dateDrawn) return "undated"
  const t = Date.parse(dateDrawn)
  if (!Number.isFinite(t)) return "undated"
  const days = Math.round((now.getTime() - t) / (1000 * 60 * 60 * 24))
  if (days <= RECENT_DAYS) return "recent"
  if (days <= OLD_DAYS) return "moderate"
  return "historical"
}

function formatRow(lab: LabResult): string {
  const parts: string[] = []
  parts.push(lab.testName)
  const valueAndUnit = lab.unit ? `${lab.value} ${lab.unit}` : lab.value
  parts.push(valueAndUnit)
  if (lab.flag) parts.push(`[${lab.flag}]`)
  if (lab.referenceRange?.raw) parts.push(`ref ${lab.referenceRange.raw}`)
  if (lab.loincCode) parts.push(`(LOINC ${lab.loincCode})`)
  return parts.join(" · ")
}

export function formatLabsForPrompt(labs: LabResult[] | undefined): string {
  if (!labs || labs.length === 0) return ""

  // Sort: newest first within bucket, then alphabetical for stability.
  const sorted = [...labs].sort((a, b) => {
    const ad = a.dateDrawn ? Date.parse(a.dateDrawn) : 0
    const bd = b.dateDrawn ? Date.parse(b.dateDrawn) : 0
    if (bd !== ad) return bd - ad
    return a.testName.localeCompare(b.testName)
  })

  const buckets: Record<"recent" | "moderate" | "historical" | "undated", LabResult[]> = {
    recent: [],
    moderate: [],
    historical: [],
    undated: [],
  }
  for (const l of sorted) buckets[ageBucket(l.dateDrawn)].push(l)

  const sections: string[] = []
  const renderBucket = (label: string, group: LabResult[]) => {
    if (group.length === 0) return
    // Subgroup by drawn-date so "May 12, 2025: " can prefix the rows from
    // one panel together. Undated bucket has no subgroup header.
    const byDate = new Map<string, LabResult[]>()
    for (const l of group) {
      const key = l.dateDrawn || ""
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key)!.push(l)
    }
    const lines: string[] = [`-- ${label} --`]
    for (const [date, rows] of byDate) {
      if (date) lines.push(`${date}:`)
      for (const r of rows) lines.push(`  ${formatRow(r)}`)
    }
    sections.push(lines.join("\n"))
  }
  renderBucket("Recent labs (≤90 days)", buckets.recent)
  renderBucket("Moderate-age labs (3 months – 1 year)", buckets.moderate)
  renderBucket("Historical labs (>1 year old — weight LESS heavily)", buckets.historical)
  renderBucket("Undated labs", buckets.undated)

  return `===== PATIENT LAB RESULTS =====
The patient uploaded the following lab values directly from their reports. These are HARD DATA — interpret them in clinical context and weight by date drawn. Flags are exactly as the report printed them.

${sections.join("\n\n")}

These lab values are evidence, not a substitute for clinical reasoning. Old labs (>1 year) may not reflect current state. Always integrate with the symptom narrative.`
}

// Map of common test names → short "patient finding" labels that retrieval's
// symptom-overlap scoring can match against KB symptom names. Intentionally
// small and general-purpose; extends without code change since unknown
// tests fall through to a generic "Elevated X" / "Decreased X" pattern.
const ELEVATED_TERMS: Record<string, string> = {
  ast: "Elevated aspartate aminotransferase",
  "aspartate aminotransferase": "Elevated aspartate aminotransferase",
  alt: "Elevated alanine aminotransferase",
  "alanine aminotransferase": "Elevated alanine aminotransferase",
  "alkaline phosphatase": "Elevated alkaline phosphatase",
  bilirubin: "Hyperbilirubinemia",
  creatinine: "Elevated creatinine",
  bun: "Elevated blood urea nitrogen",
  glucose: "Hyperglycemia",
  hba1c: "Elevated HbA1c",
  potassium: "Hyperkalemia",
  sodium: "Hypernatremia",
  calcium: "Hypercalcemia",
  phosphorus: "Hyperphosphatemia",
  phosphate: "Hyperphosphatemia",
  magnesium: "Hypermagnesemia",
  pth: "Elevated parathyroid hormone",
  "parathyroid hormone": "Elevated parathyroid hormone",
  tsh: "Elevated thyroid stimulating hormone",
  ferritin: "Elevated ferritin",
  crp: "Elevated C-reactive protein",
  "c-reactive protein": "Elevated C-reactive protein",
  esr: "Elevated erythrocyte sedimentation rate",
  wbc: "Leukocytosis",
  "white blood cell": "Leukocytosis",
  platelet: "Thrombocytosis",
  hemoglobin: "Polycythemia",
  ldh: "Elevated lactate dehydrogenase",
  troponin: "Elevated troponin",
  "ck-mb": "Elevated CK-MB",
  "creatine kinase": "Elevated creatine kinase",
}
const DECREASED_TERMS: Record<string, string> = {
  potassium: "Hypokalemia",
  sodium: "Hyponatremia",
  calcium: "Hypocalcemia",
  phosphorus: "Hypophosphatemia",
  phosphate: "Hypophosphatemia",
  magnesium: "Hypomagnesemia",
  glucose: "Hypoglycemia",
  hemoglobin: "Anemia",
  wbc: "Leukopenia",
  "white blood cell": "Leukopenia",
  platelet: "Thrombocytopenia",
  ceruloplasmin: "Low ceruloplasmin",
  iron: "Low serum iron",
  ferritin: "Low ferritin",
  tsh: "Suppressed thyroid stimulating hormone",
  "free t4": "Low free thyroxine",
  "vitamin d": "Vitamin D deficiency",
  "vitamin b12": "Vitamin B12 deficiency",
  igg: "Hypogammaglobulinemia",
  iga: "IgA deficiency",
  igm: "IgM deficiency",
  albumin: "Hypoalbuminemia",
  complement: "Hypocomplementemia",
  c3: "Low C3 complement",
  c4: "Low C4 complement",
}

function lookupFinding(map: Record<string, string>, testName: string): string | undefined {
  const lower = testName.toLowerCase()
  // Try direct match, then substring containment for compound names like
  // "Alanine aminotransferase (ALT)".
  if (map[lower]) return map[lower]
  for (const key of Object.keys(map)) {
    if (lower.includes(key)) return map[key]
  }
  return undefined
}

// Mechanical-check support: a flat list of analyte aliases that map to the
// canonical analyte key used by the ELEVATED_TERMS / DECREASED_TERMS tables
// above. Lets the criteria-text scanner detect e.g. "Serum ALT > 100 U/L"
// and look it up in the patient's labs.
const ANALYTE_ALIASES: Array<{ aliases: string[]; canonical: string }> = [
  { aliases: ["ast", "aspartate aminotransferase", "sgot"], canonical: "ast" },
  { aliases: ["alt", "alanine aminotransferase", "sgpt"], canonical: "alt" },
  { aliases: ["alkaline phosphatase", "alk phos", "alp"], canonical: "alkaline phosphatase" },
  { aliases: ["bilirubin", "total bilirubin"], canonical: "bilirubin" },
  { aliases: ["creatinine", "serum creatinine"], canonical: "creatinine" },
  { aliases: ["bun", "blood urea nitrogen", "urea"], canonical: "bun" },
  { aliases: ["glucose", "blood glucose", "fasting glucose"], canonical: "glucose" },
  { aliases: ["hba1c", "a1c", "hemoglobin a1c", "glycated hemoglobin"], canonical: "hba1c" },
  { aliases: ["potassium", "k+"], canonical: "potassium" },
  { aliases: ["sodium", "na+"], canonical: "sodium" },
  { aliases: ["calcium", "ionized calcium"], canonical: "calcium" },
  { aliases: ["phosphorus", "phosphate", "po4"], canonical: "phosphorus" },
  { aliases: ["magnesium", "mg++"], canonical: "magnesium" },
  { aliases: ["pth", "parathyroid hormone", "intact pth"], canonical: "pth" },
  { aliases: ["tsh", "thyroid stimulating hormone"], canonical: "tsh" },
  { aliases: ["ferritin"], canonical: "ferritin" },
  { aliases: ["crp", "c-reactive protein"], canonical: "crp" },
  { aliases: ["esr", "sed rate", "erythrocyte sedimentation"], canonical: "esr" },
  { aliases: ["wbc", "white blood cell", "leukocyte count"], canonical: "wbc" },
  { aliases: ["platelet", "platelets", "plt"], canonical: "platelet" },
  { aliases: ["hemoglobin", "hgb", "hb"], canonical: "hemoglobin" },
  { aliases: ["ldh", "lactate dehydrogenase"], canonical: "ldh" },
  { aliases: ["troponin"], canonical: "troponin" },
  { aliases: ["ceruloplasmin"], canonical: "ceruloplasmin" },
  { aliases: ["iron", "serum iron"], canonical: "iron" },
  { aliases: ["free t4", "ft4", "thyroxine"], canonical: "free t4" },
  { aliases: ["vitamin d", "25-hydroxyvitamin d", "25oh vitamin d"], canonical: "vitamin d" },
  { aliases: ["vitamin b12", "cobalamin", "b12"], canonical: "vitamin b12" },
  { aliases: ["igg"], canonical: "igg" },
  { aliases: ["iga"], canonical: "iga" },
  { aliases: ["igm"], canonical: "igm" },
  { aliases: ["albumin"], canonical: "albumin" },
  { aliases: ["c3", "c3 complement"], canonical: "c3" },
  { aliases: ["c4", "c4 complement"], canonical: "c4" },
]

function detectAnalyte(text: string): string | undefined {
  const lower = text.toLowerCase()
  // Sort longest-first so "alkaline phosphatase" matches before "alp" buried
  // in another word.
  const pairs: Array<{ alias: string; canonical: string }> = []
  for (const a of ANALYTE_ALIASES) for (const al of a.aliases) pairs.push({ alias: al, canonical: a.canonical })
  pairs.sort((a, b) => b.alias.length - a.alias.length)
  for (const { alias, canonical } of pairs) {
    if (lower.includes(alias)) return canonical
  }
  return undefined
}

function detectDirection(text: string): "elevated" | "decreased" | "abnormal" | "specific" | "presence" | undefined {
  const lower = text.toLowerCase()
  if (/<\s*\d|\bbelow\b|\blow\b|\bdecreased?\b|\breduced?\b|\bdepleted\b|\bdeficien(t|cy)\b|\bnegative\b/.test(lower)) return "decreased"
  if (/>\s*\d|\babove\b|\bhigh\b|\belevated\b|\bincreased?\b|\bhyperc?\w*/.test(lower)) return "elevated"
  if (/abnormal|altered/.test(lower)) return "abnormal"
  if (/\bdetected\b|\bpresent\b|\bpositive\b/.test(lower)) return "presence"
  if (/=\s*\d|\d\s*-\s*\d/.test(lower)) return "specific"
  return undefined
}

// Pull a single threshold value out of a criterion like "PTH > 65 pg/mL" or
// "Ceruloplasmin level less than 20 mg/dL". Returns the operator and the
// number when both are clear.
function detectThreshold(text: string): { op: "<" | "<=" | ">" | ">="; value: number } | undefined {
  const opMatch = text.match(/([<>]=?|less than|greater than|below|above)\s*([\d.]+)/i)
  if (!opMatch) return undefined
  const value = parseFloat(opMatch[2])
  if (!Number.isFinite(value)) return undefined
  const opRaw = opMatch[1].toLowerCase()
  let op: "<" | "<=" | ">" | ">="
  if (opRaw === "<" || opRaw === "less than" || opRaw === "below") op = "<"
  else if (opRaw === "<=") op = "<="
  else if (opRaw === ">" || opRaw === "greater than" || opRaw === "above") op = ">"
  else op = ">="
  return { op, value }
}

function labMatchesCanonical(lab: LabResult, canonical: string): boolean {
  const name = lab.testName.toLowerCase()
  const pair = ANALYTE_ALIASES.find((a) => a.canonical === canonical)
  if (!pair) return false
  return pair.aliases.some((al) => name.includes(al))
}

export interface MechanicalLabCriterionFinding {
  // Index of the criterion in the criteriaDetails array we updated.
  criterionIndex: number
  // The patient lab row we used to support the criterion.
  matchedLab: LabResult
  // How we judged it.
  rationale: string
}

// Walk the criteriaDetails of a hypothesis and try to mechanically confirm
// criteria whose text references a recognizable lab marker. Only updates
// criteria currently flagged `met: false`; never demotes an already-met one.
// Returns the updated criteriaDetails along with a list of what we changed
// (for transparency / audit).
export function mechanicallyCheckLabCriteria(
  criteriaDetails: Array<{ criterion: string; met: boolean; evidence: string }>,
  labs: LabResult[] | undefined,
): {
  updated: Array<{ criterion: string; met: boolean; evidence: string }>
  findings: MechanicalLabCriterionFinding[]
} {
  if (!labs || labs.length === 0 || criteriaDetails.length === 0) {
    return { updated: criteriaDetails, findings: [] }
  }

  // Sort newest-first so when the same analyte appears in multiple uploaded
  // reports (different draws), the most recent value is the one we use to
  // confirm a criterion. Phase-3 temporal weighting: a recent positive
  // matters more than a years-old measurement.
  const labsByRecency = [...labs].sort((a, b) => {
    const ad = a.dateDrawn ? Date.parse(a.dateDrawn) : 0
    const bd = b.dateDrawn ? Date.parse(b.dateDrawn) : 0
    return bd - ad
  })

  const findings: MechanicalLabCriterionFinding[] = []
  const updated = criteriaDetails.map((cd, i) => {
    if (cd.met) return cd // already confirmed by the LLM
    const analyte = detectAnalyte(cd.criterion)
    if (!analyte) return cd
    const direction = detectDirection(cd.criterion)
    const threshold = detectThreshold(cd.criterion)
    const candidateLabs = labsByRecency.filter((l) => labMatchesCanonical(l, analyte))
    if (candidateLabs.length === 0) return cd

    for (const lab of candidateLabs) {
      let met = false
      let rationale = ""

      if (threshold && typeof lab.numericValue === "number") {
        const v = lab.numericValue
        const ok =
          (threshold.op === "<" && v < threshold.value) ||
          (threshold.op === "<=" && v <= threshold.value) ||
          (threshold.op === ">" && v > threshold.value) ||
          (threshold.op === ">=" && v >= threshold.value)
        if (ok) {
          met = true
          rationale = `Patient ${lab.testName} = ${lab.value}${lab.unit ? " " + lab.unit : ""} satisfies threshold "${threshold.op} ${threshold.value}".`
        }
      } else if (direction === "elevated") {
        if (lab.flag === "H" || lab.flag === "HH" || lab.flag === "CRIT") {
          met = true
          rationale = `Patient ${lab.testName} flagged ${lab.flag} (elevated) per the report.`
        } else if (
          typeof lab.numericValue === "number" &&
          typeof lab.referenceRange?.high === "number" &&
          lab.numericValue > lab.referenceRange.high
        ) {
          met = true
          rationale = `Patient ${lab.testName} = ${lab.value} exceeds reference upper bound ${lab.referenceRange.high}.`
        }
      } else if (direction === "decreased") {
        if (lab.flag === "L" || lab.flag === "LL" || lab.flag === "CRIT") {
          met = true
          rationale = `Patient ${lab.testName} flagged ${lab.flag} (low) per the report.`
        } else if (
          typeof lab.numericValue === "number" &&
          typeof lab.referenceRange?.low === "number" &&
          lab.numericValue < lab.referenceRange.low
        ) {
          met = true
          rationale = `Patient ${lab.testName} = ${lab.value} below reference lower bound ${lab.referenceRange.low}.`
        }
      } else if (direction === "abnormal") {
        if (lab.flag && lab.flag !== null) {
          met = true
          rationale = `Patient ${lab.testName} = ${lab.value} flagged ${lab.flag} (abnormal).`
        }
      } else if (direction === "presence") {
        const v = lab.value.toLowerCase()
        if (/positive|detected|present/.test(v)) {
          met = true
          rationale = `Patient ${lab.testName} = "${lab.value}" indicates presence.`
        }
      }

      if (met) {
        findings.push({ criterionIndex: i, matchedLab: lab, rationale })
        return {
          ...cd,
          met: true,
          evidence: cd.evidence
            ? `${cd.evidence} | Lab confirmation: ${rationale}`
            : `Lab confirmation: ${rationale}`,
        }
      }
    }
    return cd
  })

  return { updated, findings }
}

export function deriveSymptomsFromLabs(labs: LabResult[] | undefined): MappedSymptom[] {
  if (!labs || labs.length === 0) return []
  const out: MappedSymptom[] = []
  const seen = new Set<string>()
  for (const lab of labs) {
    if (!lab.flag) continue
    const isHigh = lab.flag === "H" || lab.flag === "HH"
    const isLow = lab.flag === "L" || lab.flag === "LL"
    const isCritical = lab.flag === "CRIT"
    if (!isHigh && !isLow && !isCritical) continue
    const finding = isHigh
      ? lookupFinding(ELEVATED_TERMS, lab.testName) || `Elevated ${lab.testName}`
      : isLow
        ? lookupFinding(DECREASED_TERMS, lab.testName) || `Decreased ${lab.testName}`
        : `Critical ${lab.testName} value`
    if (seen.has(finding)) continue
    seen.add(finding)
    const original = `${lab.testName}: ${lab.value}${lab.unit ? " " + lab.unit : ""}${lab.flag ? ` [${lab.flag}]` : ""}`
    out.push({
      originalPhrase: original,
      medicalTerm: finding,
      umlsConcepts: [],
      selectedConcept: null,
      confidence: lab.confidence ?? 0.7,
      confirmed: lab.source === "manual" || (lab.confidence ?? 0) >= 0.7,
      mappingError: false,
      feedbackStatus: "none",
    })
  }
  return out
}
