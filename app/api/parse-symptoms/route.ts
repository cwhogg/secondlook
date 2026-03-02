import { type NextRequest, NextResponse } from "next/server"

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

async function callOpenAIWithRetry(
  openaiApiKey: string,
  messages: Array<{ role: string; content: string }>,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages,
        temperature: 0.3,
        max_tokens: 1500,
      }),
    })

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = response.headers.get("retry-after")
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt)
      console.log(`[parse-symptoms] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      continue
    }

    return response
  }

  // Shouldn't reach here, but satisfy TypeScript
  throw new Error("Max retries exceeded")
}

export async function POST(request: NextRequest) {
  try {
    const { text, patientAge, patientSex } = await request.json()

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: "Symptom description too short" }, { status: 400 })
    }

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 503 })
    }

    const prompt = `
You are a medical symptom parser specializing in translating patient language into SNOMED CT-compatible medical terminology. You must interpret ALL patient descriptions — including functional limitations, anecdotal reports, and colloquial language — as clinical symptoms.

Patient Information:
- Age: ${patientAge}
- Sex: ${patientSex}

Patient Description: "${text}"

Extract symptoms and return them as a JSON object with this exact structure:
{
  "symptoms": [
    {
      "originalPhrase": "exact words/phrase the patient used",
      "medicalTerm": "SNOMED CT-compatible medical term",
      "alternativeSearchTerms": ["synonym 1", "synonym 2", "synonym 3"],
      "severity": "mild/moderate/severe or null",
      "duration": "timeframe or null",
      "bodyPart": "affected body part or null",
      "category": "motor|sensory|pain|cognitive|autonomic|constitutional"
    }
  ]
}

CRITICAL INTERPRETATION RULES:
1. FUNCTIONAL DESCRIPTIONS are symptoms. Translate them to clinical terms:
   - "can't grip things" → medicalTerm: "grip weakness", alternativeSearchTerms: ["reduced grip strength", "hand weakness", "loss of grip"]
   - "fumbling with keys" → medicalTerm: "impaired fine motor coordination", alternativeSearchTerms: ["loss of manual dexterity", "impaired hand coordination", "clumsiness of hand"]
   - "fingers don't work right" → medicalTerm: "finger motor dysfunction", alternativeSearchTerms: ["impaired finger dexterity", "finger weakness", "loss of finger coordination"]

2. ANECDOTAL EVIDENCE implies symptoms. Extract the underlying clinical finding:
   - "dropped a glass three times" → medicalTerm: "involuntary release of objects", alternativeSearchTerms: ["grip weakness", "loss of grip strength", "hand weakness"]
   - "keep bumping into things" → medicalTerm: "impaired spatial awareness", alternativeSearchTerms: ["clumsiness", "poor coordination", "ataxia"]
   - "can't button my shirt anymore" → medicalTerm: "impaired fine motor coordination", alternativeSearchTerms: ["loss of manual dexterity", "finger dexterity impairment", "reduced hand function"]

3. COLLOQUIAL LANGUAGE must be mapped to recognized medical terms:
   - "a persistent cramp" → medicalTerm: "muscle cramp", alternativeSearchTerms: ["muscle spasm", "cramping", "involuntary muscle contraction"]
   - "feels numb" → medicalTerm: "numbness", alternativeSearchTerms: ["paresthesia", "hypoesthesia", "sensory loss"]

FIELD REQUIREMENTS:
- "originalPhrase": exact words the patient used
- "medicalTerm": use SNOMED CT / UMLS-compatible clinical terminology. Prefer terms that exist in medical ontologies (e.g., "muscle cramp" not "crampy feeling")
- "alternativeSearchTerms": provide 2-3 synonyms or related UMLS-searchable terms. IMPORTANT: the FIRST alternative MUST be a simple, well-known SNOMED CT concept (1-2 words, e.g., "abdominal pain", "paresthesia", "weakness", "fatigue"). Subsequent alternatives can be more specific. For compound symptoms (e.g., "weakness and tingling in arms"), split into the core concepts as alternatives (e.g., ["weakness", "paresthesia", "limb weakness"])
- "severity": mild/moderate/severe based on context, or null
- "duration": timeframe if mentioned, or null
- "bodyPart": affected body part or null
- "category": classify as motor, sensory, pain, cognitive, autonomic, or constitutional

Every distinct symptom or functional complaint MUST be extracted as a separate entry. Do not skip descriptions just because they are colloquial or anecdotal.
`

    const response = await callOpenAIWithRetry(openaiApiKey, [
      {
        role: "system",
        content:
          "You are a medical symptom extraction assistant that specializes in interpreting functional descriptions, anecdotal evidence, and colloquial language as clinical symptoms. Return only valid JSON. Every symptom must include originalPhrase, medicalTerm (SNOMED CT-compatible), alternativeSearchTerms (2-3 synonyms), and category.",
      },
      {
        role: "user",
        content: prompt,
      },
    ])

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[parse-symptoms] OpenAI API error ${response.status}:`, errorText)
      const status = response.status === 429 ? 429 : 502
      return NextResponse.json(
        { error: `OpenAI API error: ${response.status}` },
        { status }
      )
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      return NextResponse.json({ error: "No response from OpenAI" }, { status: 502 })
    }

    try {
      const parsedSymptoms = JSON.parse(content)
      return NextResponse.json(parsedSymptoms)
    } catch {
      console.error("[parse-symptoms] Failed to parse JSON:", content)
      return NextResponse.json({ error: "Failed to parse symptom data" }, { status: 500 })
    }
  } catch (error: any) {
    console.error("[parse-symptoms] Error:", error.message)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
