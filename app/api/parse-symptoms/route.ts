import { type NextRequest, NextResponse } from "next/server"
import { callAnthropic } from "@/lib/anthropic"

export async function POST(request: NextRequest) {
  try {
    const { text, patientAge, patientSex } = await request.json()

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: "Symptom description too short" }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 })
    }

    const userPrompt = `
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

You must respond with valid JSON only (no markdown fences, no extra text).
`

    const result = await callAnthropic({
      systemPrompt:
        "You are a medical symptom extraction assistant that specializes in interpreting functional descriptions, anecdotal evidence, and colloquial language as clinical symptoms. Return only valid JSON. Every symptom must include originalPhrase, medicalTerm (SNOMED CT-compatible), alternativeSearchTerms (2-3 synonyms), and category.",
      userPrompt,
      maxTokens: 1500,
      temperature: 0.3,
      model: "claude-haiku-4-5-20251001",
    })

    const parsed = result.content
    if (!parsed?.symptoms || !Array.isArray(parsed.symptoms)) {
      console.error("[parse-symptoms] Unexpected response structure:", typeof parsed)
      return NextResponse.json({ error: "Failed to parse symptom data" }, { status: 500 })
    }

    return NextResponse.json(parsed)
  } catch (error: any) {
    console.error("[parse-symptoms] Error:", error.message)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
