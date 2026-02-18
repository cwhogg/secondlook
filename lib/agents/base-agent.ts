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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: this.config.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools,
        tool_choice: toolChoice,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
    }

    const data = await response.json();
    const durationMs = Date.now() - startTime;

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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: this.config.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
    }

    const data = await response.json();
    const durationMs = Date.now() - startTime;
    const rawContent = data.choices[0]?.message?.content;

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
