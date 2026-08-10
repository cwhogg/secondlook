import { fetchWithResilience } from './llm-retry';

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

  const response = await fetchWithResilience(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
    {
      label: `anthropic:${model}`,
      timeoutMs: 150_000, // synth/finalize on Opus can run long; bound each attempt
      onRetry: (info) =>
        console.warn(
          `[callAnthropic] retry ${info.attempt + 1} (${info.status || info.error}) in ${info.delayMs}ms — ${model}`,
        ),
    },
  );

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

  // Surface silent max_tokens truncation as a first-class failure. Opus 4.8
  // occasionally hits the maxTokens ceiling on large synthesis prompts and
  // returns a mid-object cut. Downstream JSON.parse then throws generic
  // "got string" errors, hiding the root cause. Log + throw here so the
  // agent-level error message points at the actual issue.
  if (data.stop_reason === 'max_tokens') {
    console.error('[callAnthropic] response truncated by max_tokens', {
      model: data.model || model,
      maxTokens,
      outputTokens: data.usage?.output_tokens,
      rawTail: rawText.slice(-300),
    });
    throw new Error(`Anthropic response truncated: hit max_tokens=${maxTokens} on ${data.model || model} (output_tokens=${data.usage?.output_tokens})`);
  }

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

  try {
    const { pushLlmCall } = require('./pipeline/llm-call-log');
    pushLlmCall({
      provider: 'anthropic',
      model: data.model || model,
      temperature: supportsTemperature ? temperature : undefined,
      maxTokens,
      systemPrompt,
      userPrompt,
      rawResponseText: rawText,
      structuredOutput: content,
      finishReason: data.stop_reason,
      tokensIn: data.usage?.input_tokens,
      tokensOut: data.usage?.output_tokens,
      durationMs,
    });
  } catch { /* logger optional */ }

  return {
    content,
    rawText,
    tokensUsed,
    durationMs,
    model: data.model || model,
  };
}
