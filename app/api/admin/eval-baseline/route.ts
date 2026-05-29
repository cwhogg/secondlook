import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { callAnthropic } from "@/lib/anthropic"

// o3 reasoning:high and claude-opus-4-7 both take 30-90s on dense vignettes;
// Vercel's default 10s timeout would kill the request mid-think.
export const maxDuration = 300

const inputSchema = z.object({
  ppkt_id: z.string(),
  caseDescription: z.string().min(20, "caseDescription too short"),
  model: z.enum(["openai", "claude"]),
})

// Prompt aligned with the Phenopacket2Prompt official protocol (Robinson et
// al., Zenodo 15324355). The official protocol asks for "as many diagnoses
// as you think are reasonable" and grades at Top-1 / Top-3 / Top-10; we cap
// at 10 since that is the benchmark grading cutoff and our grader also
// processes top 10. JSON output is retained (the official protocol uses a
// numbered list) so the response is mechanically parsable — content of the
// list is the same.
const SYSTEM_PROMPT = `You are a clinical diagnostician asked to produce a differential diagnosis from a clinical vignette. There is a single definitive diagnosis for this case, and it is a diagnosis that is known today to exist in humans (almost always confirmable by a genetic test, occasionally by validated clinical criteria). The vignette may include excluded findings ("however, the following features were excluded: ..."); treat those features as absent. Return STRICT JSON only, no prose.`

const USER_INSTRUCTION_PREFIX = `Give a differential diagnosis as a list of candidate diagnoses ranked by probability starting with the most likely candidate. Each candidate should be a specific real disease name. Return only this JSON:
{
  "diagnoses": [
    { "diagnosis": "Disease name", "reasoning": "one-sentence justification" }
  ]
}
Exactly 10 entries, ranked most likely first, distinct diseases.

CLINICAL VIGNETTE:
`

const OPENAI_MODEL = "o3"
const CLAUDE_MODEL = "claude-opus-4-7"

interface BaselineDiagnosis {
  diagnosis: string
  reasoning?: string
}

interface BaselineResult {
  diagnoses: BaselineDiagnosis[]
  model: string
  tokensUsed: number
  durationMs: number
}

async function callOpenAIBaseline(caseDescription: string): Promise<BaselineResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured")

  const start = Date.now()
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_INSTRUCTION_PREFIX + caseDescription },
      ],
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      max_completion_tokens: 20000,
    }),
  })

  const durationMs = Date.now() - start
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenAI ${response.status}: ${errText.substring(0, 500)}`)
  }

  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content ?? ""
  const tokensUsed =
    (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0)
  const parsed = parseDiagnosesJson(raw)
  return {
    diagnoses: parsed,
    model: data.model || OPENAI_MODEL,
    tokensUsed,
    durationMs,
  }
}

async function callClaudeBaseline(caseDescription: string): Promise<BaselineResult> {
  const result = await callAnthropic({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_INSTRUCTION_PREFIX + caseDescription,
    maxTokens: 8192,
    temperature: 0.2,
    model: CLAUDE_MODEL,
  })
  const diagnoses =
    Array.isArray(result.content?.diagnoses)
      ? (result.content.diagnoses as BaselineDiagnosis[])
      : parseDiagnosesJson(result.rawText)
  return {
    diagnoses,
    model: result.model,
    tokensUsed: result.tokensUsed,
    durationMs: result.durationMs,
  }
}

function parseDiagnosesJson(text: string): BaselineDiagnosis[] {
  if (!text) return []
  const tryParse = (s: string): any => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }
  let parsed = tryParse(text)
  if (!parsed) {
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (fenceMatch) parsed = tryParse(fenceMatch[1])
  }
  if (!parsed || !Array.isArray(parsed.diagnoses)) return []
  return parsed.diagnoses
    .map((d: any) => ({
      diagnosis: typeof d?.diagnosis === "string" ? d.diagnosis : "",
      reasoning: typeof d?.reasoning === "string" ? d.reasoning : undefined,
    }))
    .filter((d: BaselineDiagnosis) => d.diagnosis.length > 0)
    .slice(0, 10)
}

export async function POST(request: NextRequest) {
  const requestId = `evalbase_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  let input
  try {
    input = inputSchema.parse(await request.json())
  } catch (error: any) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid request body"
    return NextResponse.json({ error: message, requestId }, { status: 400 })
  }

  try {
    const result =
      input.model === "openai"
        ? await callOpenAIBaseline(input.caseDescription)
        : await callClaudeBaseline(input.caseDescription)

    if (result.diagnoses.length === 0) {
      return NextResponse.json(
        {
          error: `Model returned no parseable diagnoses (model=${input.model})`,
          requestId,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      requestId,
      ppkt_id: input.ppkt_id,
      mode: input.model,
      diagnoses: result.diagnoses,
      generationMetadata: {
        model: result.model,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        source: "generated" as const,
      },
    })
  } catch (error: any) {
    console.error(`[${requestId}] eval-baseline error:`, error?.message)
    return NextResponse.json(
      { error: error?.message || "Internal server error", requestId },
      { status: 500 },
    )
  }
}
