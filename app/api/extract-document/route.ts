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
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You inspect an uploaded image (or images) and decide whether it is a medical TEXT document, a symptom photo, or something else, then act accordingly.

Return STRICT JSON with this exact shape, no prose outside the JSON:
{
  "classification": "medical_document" | "symptom_photo" | "unreadable" | "other",
  "extractedText": "<extracted text if classification is medical_document, else empty string>",
  "reason": "<one short sentence explaining the classification>"
}

Classification rules:
- "medical_document" — a written/printed medical record: lab report, imaging report, doctor's note, prescription, after-visit summary, discharge paper, etc. The page contains structured text the user expects to be transcribed.
- "symptom_photo" — a photo of the user's body or a visible finding (rash, lesion, swelling, eye redness, joint deformity, etc.). NOT a written document.
- "unreadable" — image quality, blur, lighting, or content prevents you from confidently identifying what it is.
- "other" — anything else (screenshot of an app, a meme, an unrelated photo).

When classification is "medical_document":
- Set extractedText to ALL clinically relevant text on the page(s): symptoms, diagnoses, lab values with units + reference ranges, medications with dosages, vital signs, exam findings, imaging interpretations, dates, patient history.
- Preserve structure with plain text (lists, "Label: Value" for tables). Separate sections with blank lines.
- If multiple pages, treat them in order as one continuous document.
- Flag unreadable parts inline with [UNREADABLE: brief description].
- Do NOT interpret, diagnose, or add commentary — extract only what is written.

When classification is anything else:
- Set extractedText to "" (empty string). Do not paraphrase or describe the image — that belongs in a different endpoint. Use reason to explain.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Classify and (if a medical document) extract this upload (${images.length} page${images.length > 1 ? "s" : ""}): "${fileName}". Respond with the JSON shape above.`,
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
    const rawContent = data.choices?.[0]?.message?.content
    if (!rawContent) {
      return NextResponse.json(
        { error: "No response from extraction model", requestId },
        { status: 502 }
      )
    }

    let llmResult: { classification?: string; extractedText?: string; reason?: string }
    try {
      llmResult = JSON.parse(rawContent)
    } catch {
      // Model returned malformed JSON despite json_object mode.
      console.error(`[extract-document] requestId=${requestId} non-JSON response`)
      return NextResponse.json(
        { error: "Extraction model returned malformed response", requestId },
        { status: 502 }
      )
    }

    const classification = llmResult.classification || "unreadable"
    const extractedText = (llmResult.extractedText || "").trim()
    const reason = llmResult.reason || ""

    if (classification !== "medical_document") {
      console.log(`[extract-document] requestId=${requestId} rejected — classification=${classification}`)
      // 422 = "request was valid, but the upload isn't what this endpoint
      // is for". Client surfaces the classification + reason to the user
      // so they know what to do next (use the symptom-photo upload, or
      // upload a different file).
      return NextResponse.json(
        { error: "not_a_medical_document", classification, reason, requestId },
        { status: 422 }
      )
    }

    if (!extractedText) {
      return NextResponse.json(
        { error: "no_text_extracted", classification, reason, requestId },
        { status: 422 }
      )
    }

    console.log(`[extract-document] requestId=${requestId} extracted ${extractedText.length} chars`)

    return NextResponse.json({
      extractedText,
      classification,
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
