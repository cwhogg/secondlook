import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { symptoms } = await request.json()

    if (!symptoms || !Array.isArray(symptoms) || symptoms.length < 2) {
      return NextResponse.json(
        { error: "At least 2 symptoms are required for pattern analysis" },
        { status: 400 },
      )
    }

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 },
      )
    }

    const symptomList = symptoms
      .map(
        (s: any) =>
          `[${s.index}] Original: "${s.originalPhrase}" | Medical term: "${s.medicalTerm}" | UMLS concept: "${s.umlsConceptName || "unmapped"}" (CUI: ${s.umlsCui || "N/A"}) | Category: ${s.category || "unknown"} | Body part: ${s.bodyPart || "unknown"} | Severity: ${s.severity || "unknown"}`,
      )
      .join("\n")

    const prompt = `You are a clinical pattern recognition specialist. Analyze the following set of symptoms and identify clinical patterns — groups of symptoms that together suggest a specific condition category or pathological process.

SYMPTOMS:
${symptomList}

Analyze these symptoms AS A GROUP. Look for:
1. Symptoms that cluster anatomically (same body region/system)
2. Symptoms that cluster by category (all motor, all sensory, etc.)
3. Symptoms that together suggest a specific pathological process (neuromuscular, inflammatory, vascular, etc.)
4. Temporal or severity patterns

Return a JSON object with this exact structure:
{
  "patterns": [
    {
      "patternName": "Descriptive name of the clinical pattern",
      "clinicalCategory": "e.g., Neuromuscular, Inflammatory, Vascular, etc.",
      "symptomIndices": [0, 1, 2],
      "confidence": 0.85,
      "reasoning": "Clinical explanation of why these symptoms cluster together...",
      "suggestedInvestigations": ["Test 1", "Test 2"],
      "differentialConsiderations": ["Condition 1", "Condition 2", "Condition 3"]
    }
  ],
  "overallImpression": "Summary of the overall clinical picture...",
  "symptomsThatDontFitPatterns": []
}

RULES:
- confidence is 0.0-1.0
- symptomIndices reference the [index] numbers from the symptom list
- A symptom can appear in multiple patterns
- symptomsThatDontFitPatterns lists indices of symptoms that don't fit any identified pattern
- Be specific in reasoning — explain the pathophysiological connection
- suggestedInvestigations should be specific tests/studies (e.g., "EMG/nerve conduction study" not just "further testing")
- differentialConsiderations should list 2-5 specific conditions
- Only identify patterns you are reasonably confident about (confidence >= 0.5)`

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
              "You are a clinical pattern recognition specialist. Return only valid JSON. Identify meaningful clinical patterns in symptom groups.",
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

    if (!response.ok) {
      const errorText = await response.text()
      console.error("OpenAI pattern analysis error:", errorText)
      return NextResponse.json(
        { error: `OpenAI API error: ${response.status}` },
        { status: 502 },
      )
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      return NextResponse.json(
        { error: "No response from pattern analysis" },
        { status: 502 },
      )
    }

    try {
      const parsed = JSON.parse(content)
      return NextResponse.json(parsed)
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim())
          return NextResponse.json(parsed)
        } catch {
          console.error("Failed to parse extracted JSON from pattern analysis")
        }
      }
      console.error("Failed to parse pattern analysis response:", content)
      return NextResponse.json(
        { error: "Failed to parse pattern analysis" },
        { status: 502 },
      )
    }
  } catch (error: any) {
    console.error("Pattern analysis error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    )
  }
}
