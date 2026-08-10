import { AgentConfig } from './types';
import { fetchWithResilience } from '../llm-retry';

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

  /** Whether this agent uses a reasoning model (o3, o4-mini, etc.) */
  private isReasoningModel(): boolean {
    return this.config.model.startsWith('o');
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
   * Fetch with per-attempt timeout and retry on transient failures (429,
   * 5xx, overload, and network errors / timeouts). Delegates to the shared
   * resilience helper so OpenAI and Anthropic calls share one policy.
   */
  private async fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
    return fetchWithResilience(url, init, {
      maxRetries,
      timeoutMs: 150_000, // reasoning models (o3) can run long per call
      label: `openai:${this.config.model}`,
      onRetry: (info) =>
        this.log(
          'RETRY',
          `${info.status || info.error} — retrying in ${info.delayMs}ms (attempt ${info.attempt + 1}/${maxRetries})`,
        ),
    });
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

    const reasoning = this.isReasoningModel();
    const requestBody: Record<string, any> = {
      model: this.config.model,
      messages: [
        { role: reasoning ? 'developer' : 'system', content: this.config.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools,
      tool_choice: toolChoice,
    };

    if (reasoning) {
      requestBody.max_completion_tokens = this.config.maxTokens;
      if (this.config.reasoningEffort) {
        requestBody.reasoning_effort = this.config.reasoningEffort;
      }
    } else {
      requestBody.temperature = this.config.temperature;
      requestBody.max_tokens = this.config.maxTokens;
    }

    this.log('REQUEST', `callWithTools — model: ${this.config.model}${reasoning ? ` (reasoning, effort: ${this.config.reasoningEffort || 'default'})` : ''}`);
    this.log('SYSTEM_PROMPT', this.config.systemPrompt);
    this.log('USER_PROMPT', userPrompt);
    this.log('TOOLS', JSON.stringify(tools.map((t: any) => t.function?.name || t.name || 'unknown')));

    const response = await this.fetchWithRetry('https://api.openai.com/v1/chat/completions', {
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
    if (data.usage?.completion_tokens_details?.reasoning_tokens) {
      this.log('REASONING_TOKENS', `${data.usage.completion_tokens_details.reasoning_tokens} reasoning tokens`);
    }

    const toolCall = data.choices[0]?.message?.tool_calls?.[0];
    const hasToolCall = !!toolCall?.function?.arguments;

    let content: any = undefined;
    let parseError: string | undefined;
    if (hasToolCall) {
      try {
        content = JSON.parse(toolCall.function.arguments);
      } catch (err) {
        parseError = String(err);
      }
    }

    // Persist call into per-pipeline log BEFORE any throw so empty/failed
    // responses are diagnosable (finish_reason, token counts, raw text).
    try {
      const { pushLlmCall } = require('../pipeline/llm-call-log');
      pushLlmCall({
        agentName: this.config.name,
        provider: 'openai',
        model: data.model || this.config.model,
        reasoningEffort: this.config.reasoningEffort,
        temperature: reasoning ? undefined : this.config.temperature,
        maxTokens: this.config.maxTokens,
        systemPrompt: this.config.systemPrompt,
        userPrompt,
        toolNames: tools.map((t: any) => t.function?.name || t.name || 'unknown'),
        toolChoice: typeof toolChoice === 'string' ? toolChoice : (toolChoice?.function?.name || 'auto'),
        rawResponseText: data.choices?.[0]?.message?.content || undefined,
        structuredOutput: content,
        reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
        finishReason: data.choices?.[0]?.finish_reason,
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
        durationMs,
        error: !hasToolCall ? 'No tool call in response' : parseError,
      });
    } catch { /* logger optional; never break the pipeline */ }

    if (!hasToolCall) {
      throw new Error(`No tool call in response from ${this.config.name}`);
    }
    if (parseError) {
      throw new Error(`Failed to parse tool call arguments from ${this.config.name}: ${parseError}`);
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

    const reasoning = this.isReasoningModel();
    const requestBody: Record<string, any> = {
      model: this.config.model,
      messages: [
        { role: reasoning ? 'developer' : 'system', content: this.config.systemPrompt },
        { role: 'user', content: reasoning ? userPrompt + '\n\nRespond with valid JSON only.' : userPrompt },
      ],
    };

    if (reasoning) {
      requestBody.max_completion_tokens = this.config.maxTokens;
      if (this.config.reasoningEffort) {
        requestBody.reasoning_effort = this.config.reasoningEffort;
      }
    } else {
      requestBody.temperature = this.config.temperature;
      requestBody.max_tokens = this.config.maxTokens;
      requestBody.response_format = { type: 'json_object' };
    }

    this.log('REQUEST', `callPlain — model: ${this.config.model}${reasoning ? ` (reasoning, effort: ${this.config.reasoningEffort || 'default'})` : ''}`);
    this.log('SYSTEM_PROMPT', this.config.systemPrompt);
    this.log('USER_PROMPT', userPrompt);

    const response = await this.fetchWithRetry('https://api.openai.com/v1/chat/completions', {
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
    if (data.usage?.completion_tokens_details?.reasoning_tokens) {
      this.log('REASONING_TOKENS', `${data.usage.completion_tokens_details.reasoning_tokens} reasoning tokens`);
    }

    let content: any;
    try {
      content = JSON.parse(rawContent);
    } catch {
      content = rawContent;
    }

    try {
      const { pushLlmCall } = require('../pipeline/llm-call-log');
      pushLlmCall({
        agentName: this.config.name,
        provider: 'openai',
        model: data.model || this.config.model,
        reasoningEffort: this.config.reasoningEffort,
        temperature: reasoning ? undefined : this.config.temperature,
        maxTokens: this.config.maxTokens,
        systemPrompt: this.config.systemPrompt,
        userPrompt,
        rawResponseText: rawContent,
        structuredOutput: content,
        reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
        finishReason: data.choices?.[0]?.finish_reason,
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
        durationMs,
      });
    } catch { /* logger optional */ }

    return {
      content,
      tokensUsed: data.usage?.total_tokens || 0,
      durationMs,
      model: data.model || this.config.model,
    };
  }
}
