import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { medications } = await request.json()

    console.log("=== OpenAI Parse Medications Request ===")
    console.log("Timestamp:", new Date().toISOString())
    console.log("Medications to parse:", medications)
    console.log("=====================================")

    if (!medications || medications.length === 0) {
      console.log("❌ Request rejected: No medications provided")
      return NextResponse.json({ error: "No medications provided" }, { status: 400 })
    }

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      console.log("❌ OpenAI API key not configured")
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
    }

    const medicationList = medications.map((med: any) => `${med.name} (${med.type})`).join("\n")

    const prompt = `
You are a pharmaceutical expert. Parse the following medications and return standardized information.

Medications to parse:
${medicationList}

For each medication, return a JSON object with this exact structure:
{
  "medications": [
    {
      "originalInput": "exact input from user",
      "standardizedName": "correct generic or brand name",
      "genericName": "generic name if different from standardized",
      "brandNames": ["common brand names"],
      "ndcCode": "NDC code if available or null",
      "drugClass": "therapeutic class",
      "type": "prescription/otc/supplement",
      "confidence": "high/medium/low",
      "notes": "any important notes or corrections"
    }
  ]
}

IMPORTANT: 
- Use exact medication names from FDA databases
- Include NDC codes only if you're certain they're correct
- For supplements, focus on active ingredients
- Mark confidence as "low" if the input is unclear or misspelled
- Include common brand names for generic drugs
`

    console.log("📤 Sending request to OpenAI...")
    console.log("Model: gpt-4")
    console.log("Temperature: 0.2")
    console.log("Max tokens: 1500")

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
            content: "You are a pharmaceutical expert. Return only valid JSON with medication information.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    })

    const responseTime = Date.now() - startTime
    console.log(`📥 OpenAI response received in ${responseTime}ms`)
    console.log("Response status:", response.status)

    if (!response.ok) {
      console.log("❌ OpenAI API error response:")
      const errorText = await response.text()
      console.log("Error body:", errorText)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    console.log("📊 OpenAI response data:")
    console.log("Usage:", data.usage)

    const content = data.choices[0]?.message?.content
    console.log("Raw content:", content)

    if (!content) {
      console.log("❌ No content in OpenAI response")
      throw new Error("No response from OpenAI")
    }

    try {
      const parsedMedications = JSON.parse(content)
      console.log("✅ Successfully parsed JSON response")
      console.log("Medications parsed:", parsedMedications.medications?.length || 0)

      return NextResponse.json(parsedMedications)
    } catch (parseError) {
      console.error("❌ Failed to parse OpenAI JSON response:")
      console.error("Parse error:", parseError)
      console.error("Raw content that failed to parse:", content)
      return NextResponse.json({ error: "Failed to parse medication data" }, { status: 500 })
    }
  } catch (error: any) {
    console.error("❌ Parse medications error:")
    console.error("Error message:", error.message)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
