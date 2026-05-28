export interface AnthropicCallOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
  model?: string;
}

export interface AnthropicCallResult {
  content: any;
  rawText: string;
  tokensUsed: number;
  durationMs: number;
  model: string;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Thin wrapper around the Anthropic Messages API using direct fetch.
 * Mirrors the project's pattern in base-agent.ts (OpenAI via fetch).
 */
export async function callAnthropic(options: AnthropicCallOptions): Promise<AnthropicCallResult> {
  const {
    systemPrompt,
    userPrompt,
    maxTokens,
    temperature = 0.7,
    model = DEFAULT_MODEL,
  } = options;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const startTime = Date.now();

  // Claude Opus 4.x and later reasoning models reject `temperature` —
  // omit it for those models. Sonnet / Haiku still accept it.
  const supportsTemperature = !/^claude-opus-4/.test(model);

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  };
  if (supportsTemperature) requestBody.temperature = temperature;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText.substring(0, 500)}`);
  }

  const data = await response.json();
  const durationMs = Date.now() - startTime;

  const rawText = data.content
    ?.filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('') || '';

  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  // Extract JSON from response — handles both raw JSON and markdown-fenced
  let content: any;
  try {
    content = JSON.parse(rawText);
  } catch {
    // Try extracting from markdown code fence
    const fenceMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        content = JSON.parse(fenceMatch[1]);
      } catch {
        content = rawText;
      }
    } else {
      content = rawText;
    }
  }

  return {
    content,
    rawText,
    tokensUsed,
    durationMs,
    model: data.model || model,
  };
}
