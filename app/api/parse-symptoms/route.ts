import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { text, patientAge, patientSex } = await request.json()

    console.log("=== OpenAI Parse Symptoms Request ===")
    console.log("Timestamp:", new Date().toISOString())
    console.log("Patient Age:", patientAge)
    console.log("Patient Sex:", patientSex)
    console.log("Input text length:", text?.length || 0)
    console.log("Input text:", text)
    console.log("=====================================")

    if (!text || text.trim().length < 10) {
      console.log("❌ Request rejected: Text too short")
      return NextResponse.json({ error: "Symptom description too short" }, { status: 400 })
    }

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      console.log("❌ OpenAI API key not configured")
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
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
- "alternativeSearchTerms": provide 2-3 synonyms or related UMLS-searchable terms, ordered from most to least specific
- "severity": mild/moderate/severe based on context, or null
- "duration": timeframe if mentioned, or null
- "bodyPart": affected body part or null
- "category": classify as motor, sensory, pain, cognitive, autonomic, or constitutional

Every distinct symptom or functional complaint MUST be extracted as a separate entry. Do not skip descriptions just because they are colloquial or anecdotal.
`

    console.log("📤 Sending request to OpenAI...")
    console.log("Model: gpt-4")
    console.log("Temperature: 0.3")
    console.log("Max tokens: 1500")
    console.log("Prompt length:", prompt.length)

    const startTime = Date.now()

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "You are a medical symptom extraction assistant that specializes in interpreting functional descriptions, anecdotal evidence, and colloquial language as clinical symptoms. Return only valid JSON. Every symptom must include originalPhrase, medicalTerm (SNOMED CT-compatible), alternativeSearchTerms (2-3 synonyms), and category.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    })

    const responseTime = Date.now() - startTime
    console.log(`📥 OpenAI response received in ${responseTime}ms`)
    console.log("Response status:", response.status)
    console.log("Response headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      console.log("❌ OpenAI API error response:")
      const errorText = await response.text()
      console.log("Error body:", errorText)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    console.log("📊 OpenAI response data:")
    console.log("Usage:", data.usage)
    console.log("Model used:", data.model)
    console.log("Choices count:", data.choices?.length || 0)

    const content = data.choices[0]?.message?.content
    console.log("Raw content length:", content?.length || 0)
    console.log("Raw content:", content)

    if (!content) {
      console.log("❌ No content in OpenAI response")
      throw new Error("No response from OpenAI")
    }

    try {
      const parsedSymptoms = JSON.parse(content)
      console.log("✅ Successfully parsed JSON response")
      console.log("Symptoms extracted:", parsedSymptoms.symptoms?.length || 0)
      console.log("Parsed symptoms:", JSON.stringify(parsedSymptoms, null, 2))

      return NextResponse.json(parsedSymptoms)
    } catch (parseError) {
      console.error("❌ Failed to parse OpenAI JSON response:")
      console.error("Parse error:", parseError)
      console.error("Raw content that failed to parse:", content)
      return NextResponse.json({ error: "Failed to parse symptom data" }, { status: 500 })
    }
  } catch (error: any) {
    console.error("❌ Parse symptoms error:")
    console.error("Error type:", error.constructor.name)
    console.error("Error message:", error.message)
    console.error("Error stack:", error.stack)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
