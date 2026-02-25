import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callAnthropic } from '@/lib/anthropic';

// Accept either a URL (server fetches Reddit) or pre-fetched post data (paste fallback)
const urlInput = z.object({
  mode: z.literal('url'),
  url: z.string().url(),
});

const pasteInput = z.object({
  mode: z.literal('paste'),
  title: z.string(),
  selftext: z.string().min(50, 'Post text is too short'),
  subreddit: z.string().default('unknown'),
  url: z.string().default(''),
});

const inputSchema = z.discriminatedUnion('mode', [urlInput, pasteInput]);

async function fetchRedditPost(url: string) {
  // Normalize Reddit URL
  let redditUrl = url.trim().split('?')[0].replace(/\/+$/, '');
  redditUrl = redditUrl
    .replace(/^https?:\/\/old\.reddit\.com/, 'https://www.reddit.com')
    .replace(/^https?:\/\/reddit\.com/, 'https://www.reddit.com');

  if (!redditUrl.match(/reddit\.com\/r\/\w+\/comments\//)) {
    throw new Error('URL must be a Reddit post (e.g., reddit.com/r/subreddit/comments/...)');
  }

  const jsonUrl = redditUrl + '.json';
  const redditResponse = await fetch(jsonUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });

  if (!redditResponse.ok) {
    throw new Error(`Reddit returned ${redditResponse.status} — try pasting the post text instead`);
  }

  const redditData = await redditResponse.json();
  const postData = redditData?.[0]?.data?.children?.[0]?.data;

  if (!postData) {
    throw new Error('Could not parse Reddit response — post may be deleted or private');
  }

  const { selftext, title, subreddit, author } = postData;

  if (!selftext || selftext.trim().length < 50) {
    throw new Error('Post has no text content or is too short — may be a link post or image');
  }

  return { selftext, title, subreddit, author, url: redditUrl };
}

async function analyzePost(
  post: { title: string; selftext: string; subreddit: string },
) {
  const systemPrompt = `You are a clinical data extraction specialist. You will receive a Reddit post from a health-related subreddit. Your job is to determine if it's a patient narrative and extract relevant clinical information.

You must respond with valid JSON only (no markdown fences, no extra text).`;

  const userPrompt = `Analyze this Reddit post and extract clinical information.

Title: ${post.title}
Subreddit: r/${post.subreddit}
Post text:
${post.selftext}

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

  return result.content;
}

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
    let post: { selftext: string; title: string; subreddit: string; author: string; url: string };

    if (input.mode === 'url') {
      post = await fetchRedditPost(input.url);
    } else {
      post = {
        selftext: input.selftext,
        title: input.title,
        subreddit: input.subreddit,
        author: 'unknown',
        url: input.url,
      };
    }

    const processed = await analyzePost(post);

    if (!processed || typeof processed !== 'object' || processed.isPatientNarrative === undefined) {
      return NextResponse.json(
        { error: 'Failed to analyze Reddit post — unexpected response format', requestId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      processed,
      rawPost: {
        title: post.title,
        subreddit: post.subreddit,
        author: post.author,
        url: post.url,
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
