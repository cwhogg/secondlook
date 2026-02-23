import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "crypto"

export const maxDuration = 60

const imageSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png"]),
})

const requestSchema = z.object({
  images: z.array(imageSchema).min(1).max(15),
  fileName: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const requestId = randomUUID()

  try {
    const body = await request.json()
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues, requestId },
        { status: 400 }
      )
    }

    const { images, fileName } = parsed.data

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured", requestId },
        { status: 500 }
      )
    }

    console.log(`[extract-document] requestId=${requestId} file="${fileName}" pages=${images.length}`)

    const imageContent = images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high" as const,
      },
    }))

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
            content: `You are a medical document text extractor. Extract ALL clinically relevant text from the provided document image(s).

Include:
- Symptoms and clinical observations
- Diagnoses and medical conditions mentioned
- Lab values with their units and reference ranges
- Medications, dosages, and frequencies
- Vital signs and physical exam findings
- Imaging or test results and interpretations
- Dates of visits, procedures, or symptom onset
- Patient history notes

Formatting rules:
- Preserve the document's structure (headings, lists, tables) using plain text formatting
- For tables, use aligned columns or "Label: Value" format
- Separate distinct sections with blank lines
- If multiple pages are provided, process them in order as a single continuous document
- Flag any sections that are unreadable or unclear with [UNREADABLE: brief description]
- Do NOT interpret, diagnose, or add medical commentary — extract only what is written`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract all clinically relevant text from this medical document (${images.length} page${images.length > 1 ? "s" : ""}): "${fileName}"`,
              },
              ...imageContent,
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[extract-document] OpenAI error: ${response.status}`, errorText)
      return NextResponse.json(
        { error: "Failed to extract text from document", requestId },
        { status: 502 }
      )
    }

    const data = await response.json()
    const extractedText = data.choices?.[0]?.message?.content

    if (!extractedText) {
      return NextResponse.json(
        { error: "No text extracted from document", requestId },
        { status: 502 }
      )
    }

    console.log(`[extract-document] requestId=${requestId} extracted ${extractedText.length} chars`)

    return NextResponse.json({
      extractedText,
      pageCount: images.length,
      requestId,
    })
  } catch (error: any) {
    console.error(`[extract-document] requestId=${requestId} error:`, error.message)
    return NextResponse.json(
      { error: error.message || "Internal server error", requestId },
      { status: 500 }
    )
  }
}
