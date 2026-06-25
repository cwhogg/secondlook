import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "crypto"

// Symptom-photo extractor: the user uploads a photo of a visible finding
// on their own body (rash, lesion, eye redness, swelling, joint deformity,
// etc.) and we produce a concise clinical-style description of what is
// visible. Output is appended to the patient's chief-complaint narrative
// so downstream parse-symptoms can map it to symptoms.
//
// This is intentionally separate from /api/extract-document so the user's
// intent is captured at upload time — that eliminates the silent-failure
// path where /api/extract-document was given a symptom photo, returned a
// "no text found" message, and that message was treated as the user's
// chief complaint.

export const maxDuration = 60

const imageSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png"]),
})

const requestSchema = z.object({
  // Multiple images allowed (e.g. one rash photographed from two angles),
  // but capped well below extract-document's 15 — a symptom rarely needs
  // more than a few angles.
  images: z.array(imageSchema).min(1).max(4),
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

    console.log(
      `[extract-symptom-photo] requestId=${requestId} file="${fileName}" images=${images.length}`,
    )

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
            content: `You inspect a photo a patient has uploaded of a visible finding on their own body and produce a concise, neutral clinical description that another clinician can read.

Return STRICT JSON with this exact shape, no prose outside the JSON:
{
  "classification": "symptom_photo" | "medical_document" | "unreadable" | "other",
  "description": "<one or two short sentences describing visible findings, using neutral clinical terminology where it helps, else lay language>",
  "bodyPart": "<the body part visible, e.g. 'right eye', 'forearm', 'left ankle', or '' if unclear>",
  "reason": "<one short sentence explaining the classification>"
}

Rules:
- "symptom_photo" — a photo of a person's body or a visible finding on it. This is what this endpoint is for. Fill in description and bodyPart.
- "medical_document" — the image is actually a written medical document (lab report, prescription, doctor note). Set description and bodyPart to "" and explain in reason; the client will redirect to the document-upload flow.
- "unreadable" — the image is too blurry, too dark, or otherwise can't be interpreted confidently.
- "other" — not a body part, not a medical document, not relevant (e.g. screenshot of an app, unrelated photo, meme).

Description guidelines (when classification is "symptom_photo"):
- Describe ONLY what is visible. Do NOT diagnose, name a disease, or speculate about cause.
- Use clinical terms when widely understood (e.g. "erythema", "conjunctival hyperemia", "swelling", "papular rash", "petechiae", "ecchymosis"). Pair with lay language when helpful: "redness (erythema) on...".
- Note distribution, laterality, color, and approximate extent when you can see them.
- Keep it under 40 words.
- Do NOT add commentary about photo quality unless it materially limits assessment.
- Do NOT mention this is from a photo or that the patient uploaded it; the downstream pipeline already knows.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Inspect this upload and produce the JSON described above. File: "${fileName}".`,
              },
              ...imageContent,
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 600,
      }),
    })

    if (!response.ok) {
      console.error(
        `[extract-symptom-photo] OpenAI error: ${response.status}`,
      )
      return NextResponse.json(
        { error: "Failed to analyze symptom photo", requestId },
        { status: 502 },
      )
    }

    const data = await response.json()
    const rawContent = data.choices?.[0]?.message?.content
    if (!rawContent) {
      return NextResponse.json(
        { error: "No response from vision model", requestId },
        { status: 502 },
      )
    }

    let parsedOut: {
      classification?: string
      description?: string
      bodyPart?: string
      reason?: string
    }
    try {
      parsedOut = JSON.parse(rawContent)
    } catch {
      console.error(
        `[extract-symptom-photo] requestId=${requestId} non-JSON response`,
      )
      return NextResponse.json(
        { error: "Vision model returned malformed response", requestId },
        { status: 502 },
      )
    }

    const classification = parsedOut.classification || "unreadable"
    const description = (parsedOut.description || "").trim()
    const bodyPart = (parsedOut.bodyPart || "").trim()
    const reason = parsedOut.reason || ""

    if (classification !== "symptom_photo") {
      console.log(
        `[extract-symptom-photo] requestId=${requestId} rejected — classification=${classification}`,
      )
      return NextResponse.json(
        { error: "not_a_symptom_photo", classification, reason, requestId },
        { status: 422 },
      )
    }

    if (!description) {
      return NextResponse.json(
        { error: "no_description_produced", classification, reason, requestId },
        { status: 502 },
      )
    }

    console.log(
      `[extract-symptom-photo] requestId=${requestId} description=${description.length}c bodyPart="${bodyPart}"`,
    )

    return NextResponse.json({
      description,
      bodyPart,
      classification,
      requestId,
    })
  } catch (error: any) {
    console.error(
      `[extract-symptom-photo] requestId=${requestId} error: ${error?.message ?? "unknown"}`,
    )
    return NextResponse.json(
      { error: error.message || "Internal server error", requestId },
      { status: 500 },
    )
  }
}
