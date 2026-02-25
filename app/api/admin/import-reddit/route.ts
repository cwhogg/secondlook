import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callAnthropic } from '@/lib/anthropic';

const inputSchema = z.object({
  title: z.string(),
  selftext: z.string().min(50, 'Post text is too short'),
  subreddit: z.string(),
  author: z.string(),
  url: z.string().url(),
});

export async function POST(request: NextRequest) {
  const requestId = `reddit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured', requestId },
      { status: 503 }
    );
  }

  let input;
  try {
    const body = await request.json();
    input = inputSchema.parse(body);
  } catch (error: any) {
    const message = error instanceof z.ZodError
      ? error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : 'Invalid request body';
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }

  try {
    const { title, selftext, subreddit, author, url } = input;

    // Use LLM to extract patient narrative and diagnosis info
    const systemPrompt = `You are a clinical data extraction specialist. You will receive a Reddit post from a health-related subreddit. Your job is to determine if it's a patient narrative and extract relevant clinical information.

You must respond with valid JSON only (no markdown fences, no extra text).`;

    const userPrompt = `Analyze this Reddit post and extract clinical information.

Title: ${title}
Subreddit: r/${subreddit}
Post text:
${selftext}

Respond with this exact JSON structure:
{
  "isPatientNarrative": true/false,
  "narrative": "The patient's description of their symptoms, cleaned up to remove Reddit-specific content (edit notes, thanks for replies, formatting artifacts, subreddit references) but preserving the original voice, phrasing, and all clinical details. If the post is in third person (caregiver), keep it that way. If not a patient narrative, set to empty string.",
  "demographics": {
    "age": "best guess from post or 'unknown'",
    "sex": "male/female/other/unknown"
  },
  "diagnosisInfo": {
    "status": "confirmed|suspected|investigating|unknown",
    "diagnosis": "the diagnosis if mentioned, or null",
    "confidence": "high|medium|low — how confident you are in extracting the correct diagnosis"
  },
  "chiefComplaint": "The primary reason the patient is seeking help, in their own words. Empty string if not a narrative.",
  "warnings": ["array of any issues: e.g., 'No clear diagnosis mentioned', 'Post is about a family member not the poster', 'Diagnosis is self-reported and unconfirmed', 'Post may describe a common condition, not a rare disease']
}

IMPORTANT:
- Keep the patient's original voice and phrasing in the narrative — do NOT rewrite it clinically
- Remove only Reddit meta-content: "Edit:", "Update:", "TL;DR:", thanks for replies, subreddit rules mentions, formatting like ** or #
- If the post mentions a confirmed diagnosis, extract it. If they're still searching for one, note that.
- If the post isn't about a patient describing symptoms (e.g., it's a question about medication, a research article, a rant), set isPatientNarrative to false.`;

    const result = await callAnthropic({
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.3,
    });

    const processed = result.content;

    if (!processed || typeof processed !== 'object' || processed.isPatientNarrative === undefined) {
      return NextResponse.json(
        { error: 'Failed to analyze Reddit post — unexpected response format', requestId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      processed,
      rawPost: {
        title,
        subreddit,
        author,
        url,
      },
      requestId,
    });
  } catch (error: any) {
    console.error(`[${requestId}] Reddit import error:`, error.message);
    return NextResponse.json(
      { error: error.message, requestId },
      { status: 500 }
    );
  }
}
