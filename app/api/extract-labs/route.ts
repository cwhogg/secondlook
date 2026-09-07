import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "crypto"
import type { LabResult } from "@/lib/types/index"

// Mirrors /api/extract-document but returns a structured LabResult[] instead
// of free-form text. Client pre-processes PDFs to page-images and compresses
// raw images the same way (in components/lab-upload.tsx), so this route
// accepts the same image payload shape.
//
// Vision-capable model (gpt-4.1) with function-call structured output —
// schema-constrained JSON rather than freeform parsing.
export const maxDuration = 60

const imageSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png"]),
})

// Either images (PDF/JPG/PNG, after client-side preprocessing) OR text
// (raw markdown / plain-text lab report). The same downstream prompt +
// function-call extracts the same LabResult[] shape from either input.
const requestSchema = z
  .object({
    images: z.array(imageSchema).max(15).optional(),
    text: z.string().max(200_000).optional(),
    fileName: z.string().min(1),
  })
  .refine(
    (v) => (v.images && v.images.length > 0) || (v.text && v.text.trim().length > 0),
    { message: "Provide either non-empty images or text" },
  )

interface ExtractedRawRow {
  testName?: string
  loincCode?: string
  value?: string
  unit?: string
  referenceRangeRaw?: string
  referenceRangeLow?: number
  referenceRangeHigh?: number
  flag?: string
  dateDrawn?: string
  labName?: string
  confidence?: number
}

function normalizeFlag(raw?: string): LabResult["flag"] {
  if (!raw) return undefined
  const r = raw.trim().toUpperCase()
  if (r === "H" || r === "HIGH") return "H"
  if (r === "L" || r === "LOW") return "L"
  if (r === "HH") return "HH"
  if (r === "LL") return "LL"
  if (r === "CRIT" || r === "CRITICAL") return "CRIT"
  if (r === "" || r === "N" || r === "NORMAL") return null
  return undefined
}

function parseNumeric(value: string | undefined): number | undefined {
  if (!value) return undefined
  // Strip operators ("<", ">", "≤", "≥") and units glued to the value.
  const m = value.replace(",", "").match(/-?\d+(\.\d+)?/)
  if (!m) return undefined
  const n = parseFloat(m[0])
  return Number.isFinite(n) ? n : undefined
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID()

  try {
    const body = await request.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues, requestId },
        { status: 400 },
      )
    }

    const { images, text, fileName } = parsed.data

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured", requestId },
        { status: 500 },
      )
    }

    const inputKind = images && images.length > 0 ? "image" : "text"
    const pageCount = images?.length ?? 0
    console.log(
      `[extract-labs] requestId=${requestId} file="${fileName}" kind=${inputKind}${
        inputKind === "image" ? ` pages=${pageCount}` : ` chars=${text?.length ?? 0}`
      }`,
    )

    const imageContent = (images ?? []).map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high" as const,
      },
    }))

    // Build the user message. Image mode keeps the existing prompt +
    // attaches image_url entries. Text mode passes the raw markdown/plain
    // text inline; the same system prompt + function call apply.
    const userMessageContent =
      inputKind === "image"
        ? [
            {
              type: "text" as const,
              text: `Extract structured lab results from this medical report (${pageCount} page${pageCount > 1 ? "s" : ""}): "${fileName}"`,
            },
            ...imageContent,
          ]
        : [
            {
              type: "text" as const,
              text: `Extract structured lab results from this medical report. The report below is a text document (markdown or plain text). Treat tables, lists, and "Label: value" lines as you would on a printed report.\n\nFile: "${fileName}"\n\n--- REPORT START ---\n${text}\n--- REPORT END ---`,
            },
          ]

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You extract structured laboratory results from medical lab report images. For each lab test on the report, emit one row. Do NOT include free-text interpretive notes, headers, demographics, or footers — only test results. Vital signs recorded on the report (blood pressure, heart rate, respiratory rate, temperature, height, weight, BMI, SpO2) DO count as rows. Do NOT include imaging-derived measurements (anatomical dimensions from ultrasound/CT/MRI/X-ray reports, e.g. "endometrial stripe 3 mm", lesion sizes, organ dimensions) — those belong to the imaging report, not the lab table. If a row is ambiguous or unreadable, lower the confidence (0.3-0.5); skip entirely only if you cannot identify any test/value pair.

Rules:
- testName: the canonical name of the analyte (e.g. "Alanine aminotransferase (ALT)", "Thyroid stimulating hormone (TSH)"). If only an abbreviation is shown, expand it.
- loincCode: a best-guess LOINC code if you recognize the test from common clinical chemistry. Leave undefined if uncertain — never guess.
- value: the result exactly as printed (numeric like "127" or qualitative like "Positive", "Negative", "Trace").
- unit: the unit as printed (e.g. "mg/dL", "U/L", "10^3/µL"). Omit when none is printed.
- referenceRangeRaw: the full reference range string as printed (e.g. "70-99", "<5.7", "Negative").
- referenceRangeLow / referenceRangeHigh: numeric bounds parsed from the range when both ends are numeric. Leave blank when the range is qualitative or open-ended.
- flag: H, L, HH, LL, CRIT, or blank. Use what the report prints; do not infer one if the report does not flag the result.
- dateDrawn: ISO date (YYYY-MM-DD) when the specimen was collected. If only a "collected" / "reported" / "ordered" date is available, prefer collected, then reported. Leave blank if no date is on the page.
- labName: name of the performing lab (e.g. "LabCorp"). Optional.
- confidence: 0-1 — your certainty the row was read correctly. Penalize unclear scans, ambiguous units, and OCR uncertainty.

Process every page in order. Within a single report, the dateDrawn and labName apply to every result unless the page indicates otherwise. Return an empty results array if the document contains no lab results.`,
          },
          {
            role: "user",
            content: userMessageContent,
          },
        ],
        temperature: 0.1,
        max_tokens: 8000,
        tool_choice: { type: "function", function: { name: "report_lab_results" } },
        tools: [
          {
            type: "function",
            function: {
              name: "report_lab_results",
              description: "Return the structured lab results extracted from the report.",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        testName: { type: "string" },
                        loincCode: { type: "string" },
                        value: { type: "string" },
                        unit: { type: "string" },
                        referenceRangeRaw: { type: "string" },
                        referenceRangeLow: { type: "number" },
                        referenceRangeHigh: { type: "number" },
                        flag: { type: "string" },
                        dateDrawn: { type: "string" },
                        labName: { type: "string" },
                        confidence: { type: "number", minimum: 0, maximum: 1 },
                      },
                      required: ["testName", "value", "confidence"],
                    },
                  },
                  documentNotes: {
                    type: "string",
                    description: "Optional brief observation about the document overall — e.g. \"low-resolution scan, several values unclear\"; empty string if no notes.",
                  },
                },
                required: ["results"],
              },
            },
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[extract-labs] OpenAI error: ${response.status}`, errorText.substring(0, 500))
      return NextResponse.json(
        { error: `Lab extraction failed (${response.status})`, requestId },
        { status: 502 },
      )
    }

    const data = await response.json()
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]
    if (!toolCall?.function?.arguments) {
      return NextResponse.json(
        { error: "Model returned no structured output", requestId },
        { status: 502 },
      )
    }

    let parsedArgs: { results?: ExtractedRawRow[]; documentNotes?: string }
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments)
    } catch {
      return NextResponse.json(
        { error: "Model returned unparseable JSON", requestId },
        { status: 502 },
      )
    }

    const rawRows = Array.isArray(parsedArgs.results) ? parsedArgs.results : []
    const results: LabResult[] = rawRows
      .filter((r) => typeof r.testName === "string" && r.testName.trim().length > 0 && typeof r.value === "string")
      .map((r): LabResult => {
        const referenceRange = r.referenceRangeRaw
          ? {
              raw: r.referenceRangeRaw,
              low: Number.isFinite(r.referenceRangeLow) ? r.referenceRangeLow : undefined,
              high: Number.isFinite(r.referenceRangeHigh) ? r.referenceRangeHigh : undefined,
            }
          : undefined
        return {
          testName: r.testName!.trim(),
          value: r.value!.trim(),
          numericValue: parseNumeric(r.value),
          unit: r.unit?.trim() || undefined,
          referenceRange,
          flag: normalizeFlag(r.flag),
          dateDrawn: r.dateDrawn?.trim() || undefined,
          labName: r.labName?.trim() || undefined,
          loincCode: r.loincCode?.trim() || undefined,
          source: "extracted",
          confidence: typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.5,
          sourceFile: fileName,
        }
      })

    console.log(
      `[extract-labs] requestId=${requestId} extracted ${results.length} results from ${
        inputKind === "image" ? `${pageCount} page(s)` : `${text?.length ?? 0} chars`
      }`,
    )

    return NextResponse.json({
      results,
      documentNotes: parsedArgs.documentNotes || "",
      pageCount,
      requestId,
    })
  } catch (error: any) {
    console.error(`[extract-labs] requestId=${requestId} error:`, error?.message)
    return NextResponse.json(
      { error: error?.message || "Internal server error", requestId },
      { status: 500 },
    )
  }
}
