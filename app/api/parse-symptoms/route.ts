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
You are a medical symptom parser. Extract individual symptoms from the following patient description and map them to their original phrases.

Patient Information:
- Age: ${patientAge}
- Sex: ${patientSex}

Patient Description: "${text}"

Extract symptoms and return them as a JSON object with this exact structure:
{
  "symptoms": [
    {
      "originalPhrase": "exact words/phrase the patient used",
      "medicalTerm": "appropriate medical terminology",
      "severity": "mild/moderate/severe or null",
      "duration": "timeframe or null",
      "bodyPart": "affected body part or null"
    }
  ]
}

IMPORTANT: 
- "originalPhrase" should be the exact words the patient used (e.g., "heart feels tight", "out of breath", "tired all the time")
- "medicalTerm" should be the appropriate medical terminology that can be mapped to UMLS concepts (e.g., "chest tightness", "dyspnea", "fatigue")
- Focus on medical symptoms only
- Be specific and use medical terminology for the medicalTerm field
`

    console.log("📤 Sending request to OpenAI...")
    console.log("Model: gpt-4")
    console.log("Temperature: 0.3")
    console.log("Max tokens: 1000")
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
              "You are a medical symptom extraction assistant. Return only valid JSON with originalPhrase and medicalTerm fields.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
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
