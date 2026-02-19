import { AgentConfig } from './types';

export interface LLMCallResult {
  content: any;
  tokensUsed: number;
  durationMs: number;
  model: string;
}

export abstract class BaseAgent {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get model(): string {
    return this.config.model;
  }

  /**
   * Call OpenAI with structured output via function calling.
   */
  protected async callWithTools(
    userPrompt: string,
    tools: any[],
    toolChoice: any
  ): Promise<LLMCallResult> {
    const startTime = Date.now();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const requestBody = {
      model: this.config.model,
      messages: [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools,
      tool_choice: toolChoice,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${this.config.name}] REQUEST (callWithTools) — model: ${this.config.model}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`[${this.config.name}] SYSTEM PROMPT:\n${this.config.systemPrompt}`);
    console.log(`[${this.config.name}] USER PROMPT:\n${userPrompt}`);
    console.log(`[${this.config.name}] TOOLS: ${JSON.stringify(tools.map((t: any) => t.function?.name || t.name || 'unknown'))}`);
    console.log(`[${this.config.name}] TOOL_CHOICE: ${JSON.stringify(toolChoice)}`);
    console.log(`${'='.repeat(80)}`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${this.config.name}] ERROR ${response.status}:\n${errorText}`);
      throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
    }

    const data = await response.json();
    const durationMs = Date.now() - startTime;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${this.config.name}] RESPONSE — ${durationMs}ms, ${data.usage?.total_tokens || '?'} tokens`);
    console.log(`${'='.repeat(80)}`);
    console.log(`[${this.config.name}] RAW RESPONSE:\n${JSON.stringify(data.choices[0]?.message, null, 2)}`);
    console.log(`[${this.config.name}] USAGE: ${JSON.stringify(data.usage)}`);
    console.log(`${'='.repeat(80)}\n`);

    const toolCall = data.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error(`No tool call in response from ${this.config.name}`);
    }

    let content: any;
    try {
      content = JSON.parse(toolCall.function.arguments);
    } catch (err) {
      throw new Error(`Failed to parse tool call arguments from ${this.config.name}: ${err}`);
    }

    return {
      content,
      tokensUsed: data.usage?.total_tokens || 0,
      durationMs,
      model: data.model || this.config.model,
    };
  }

  /**
   * Call OpenAI expecting a plain text/JSON response (no function calling).
   */
  protected async callPlain(userPrompt: string): Promise<LLMCallResult> {
    const startTime = Date.now();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const requestBody = {
      model: this.config.model,
      messages: [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      response_format: { type: 'json_object' },
    };

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${this.config.name}] REQUEST (callPlain) — model: ${this.config.model}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`[${this.config.name}] SYSTEM PROMPT:\n${this.config.systemPrompt}`);
    console.log(`[${this.config.name}] USER PROMPT:\n${userPrompt}`);
    console.log(`${'='.repeat(80)}`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${this.config.name}] ERROR ${response.status}:\n${errorText}`);
      throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
    }

    const data = await response.json();
    const durationMs = Date.now() - startTime;
    const rawContent = data.choices[0]?.message?.content;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${this.config.name}] RESPONSE — ${durationMs}ms, ${data.usage?.total_tokens || '?'} tokens`);
    console.log(`${'='.repeat(80)}`);
    console.log(`[${this.config.name}] RAW RESPONSE:\n${rawContent}`);
    console.log(`[${this.config.name}] USAGE: ${JSON.stringify(data.usage)}`);
    console.log(`${'='.repeat(80)}\n`);

    let content: any;
    try {
      content = JSON.parse(rawContent);
    } catch {
      content = rawContent;
    }

    return {
      content,
      tokensUsed: data.usage?.total_tokens || 0,
      durationMs,
      model: data.model || this.config.model,
    };
  }
}
