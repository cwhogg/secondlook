import { AgentConfig } from './types';

export type LogCallback = (agent: string, phase: string, message: string) => void;

export interface LLMCallResult {
  content: any;
  tokensUsed: number;
  durationMs: number;
  model: string;
}

export abstract class BaseAgent {
  protected config: AgentConfig;

  /** Set this before pipeline execution to receive logs via SSE */
  static onLog: LogCallback | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get model(): string {
    return this.config.model;
  }

  private log(phase: string, message: string): void {
    console.log(`[${this.config.name}] ${phase}: ${message}`);
    BaseAgent.onLog?.(this.config.name, phase, message);
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

    this.log('REQUEST', `callWithTools — model: ${this.config.model}`);
    this.log('SYSTEM_PROMPT', this.config.systemPrompt);
    this.log('USER_PROMPT', userPrompt);
    this.log('TOOLS', JSON.stringify(tools.map((t: any) => t.function?.name || t.name || 'unknown')));

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
      this.log('ERROR', `${response.status}: ${errorText}`);
      throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
    }

    const data = await response.json();
    const durationMs = Date.now() - startTime;

    this.log('RESPONSE', `${durationMs}ms, ${data.usage?.total_tokens || '?'} tokens`);
    this.log('RESPONSE_BODY', JSON.stringify(data.choices[0]?.message, null, 2));
    this.log('USAGE', JSON.stringify(data.usage));

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

    this.log('REQUEST', `callPlain — model: ${this.config.model}`);
    this.log('SYSTEM_PROMPT', this.config.systemPrompt);
    this.log('USER_PROMPT', userPrompt);

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
      this.log('ERROR', `${response.status}: ${errorText}`);
      throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
    }

    const data = await response.json();
    const durationMs = Date.now() - startTime;
    const rawContent = data.choices[0]?.message?.content;

    this.log('RESPONSE', `${durationMs}ms, ${data.usage?.total_tokens || '?'} tokens`);
    this.log('RESPONSE_BODY', rawContent);
    this.log('USAGE', JSON.stringify(data.usage));

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
