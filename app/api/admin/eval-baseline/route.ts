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

const SYSTEM_PROMPT = `You are a senior diagnostician asked to produce a differential diagnosis from a clinical vignette. Return STRICT JSON only, no prose. The vignette may include excluded findings ("the following features were excluded: ..."); treat those as absent. The user message contains exactly the vignette text and nothing else — interpret it as the entire clinical presentation.`

const USER_INSTRUCTION_PREFIX = `What are your top 5 differential diagnoses for what disease this patient might have. Return only this JSON:
{
  "diagnoses": [
    { "diagnosis": "Disease name", "reasoning": "one-sentence justification" }
  ]
}
Exactly 5 entries, ranked most likely first, distinct diseases. The diagnosis field must be a real clinical disease name.

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
    maxTokens: 4096,
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
    .slice(0, 5)
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
