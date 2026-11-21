import { AgentConfig } from './types';
import { fetchWithResilience } from '../llm-retry';
import { openaiStyle } from '../models';

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

  /** Whether this agent uses a reasoning model (o-series, gpt-5.5). */
  private isReasoningModel(): boolean {
    return openaiStyle(this.config.model).reasoning;
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
      requestBody[openaiStyle(this.config.model).tokenParam] = this.config.maxTokens;
    }

    // gpt-5.5 rejects function tools + reasoning_effort on chat completions;
    // the same call works on /v1/responses (verified 2026-11-21).
    const useResponses =
      reasoning && !!this.config.reasoningEffort && openaiStyle(this.config.model).toolsWithEffortNeedResponsesApi;

    this.log('REQUEST', `callWithTools — model: ${this.config.model}${reasoning ? ` (reasoning, effort: ${this.config.reasoningEffort || 'default'})` : ''}`);
    this.log('SYSTEM_PROMPT', this.config.systemPrompt);
    this.log('USER_PROMPT', userPrompt);
    this.log('TOOLS', JSON.stringify(tools.map((t: any) => t.function?.name || t.name || 'unknown')));

    const response = await this.fetchWithRetry(
      useResponses ? 'https://api.openai.com/v1/responses' : 'https://api.openai.com/v1/chat/completions',
      {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(useResponses ? toResponsesRequest(requestBody) : requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.log('ERROR', `${response.status}: ${errorText}`);
      throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
    }

    let raw = await response.json();
    if (useResponses && !(raw.output || []).some((o: any) => o.type === 'function_call')) {
      // 'auto' (see toResponsesRequest) occasionally yields a text answer; retry once forcing a tool call.
      this.log('RETRY', 'no tool call under tool_choice=auto — retrying with required');
      const retry = await this.fetchWithRetry('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...toResponsesRequest(requestBody), tool_choice: 'required' }),
      });
      if (retry.ok) raw = await retry.json();
    }
    const data = useResponses ? responsesToChatShape(raw) : raw;
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
      requestBody[openaiStyle(this.config.model).tokenParam] = this.config.maxTokens;
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

/** Chat-completions tool request → /v1/responses request (same model, prompt, tools, effort). */
function toResponsesRequest(body: Record<string, any>): Record<string, any> {
  const fnChoice = body.tool_choice?.function?.name;
  return {
    model: body.model,
    input: body.messages,
    // strict:false keeps today's non-strict JSON-schema behavior.
    tools: (body.tools || []).map((t: any) => ({ type: 'function', ...t.function, strict: false })),
    // Forcing a named function makes gpt-5.5 skip reasoning entirely (0 reasoning
    // tokens; 'required' ~100, 'auto' ~500 on the same case, 2026-11-21). With a
    // single tool, 'auto' keeps full reasoning; callWithTools retries with
    // 'required' if no tool call comes back.
    tool_choice: fnChoice ? (body.tools?.length === 1 ? 'auto' : { type: 'function', name: fnChoice }) : body.tool_choice,
    max_output_tokens: body.max_completion_tokens,
    reasoning: { effort: body.reasoning_effort },
  };
}

/** /v1/responses result → the chat-completions fields callWithTools reads. */
function responsesToChatShape(r: any): any {
  const call = (r.output || []).find((o: any) => o.type === 'function_call');
  const text = (r.output || [])
    .filter((o: any) => o.type === 'message')
    .flatMap((o: any) => o.content || [])
    .map((c: any) => c.text || '')
    .join('');
  return {
    model: r.model,
    choices: [
      {
        message: {
          content: text || null,
          tool_calls: call ? [{ type: 'function', function: { name: call.name, arguments: call.arguments } }] : undefined,
        },
        finish_reason: r.status === 'incomplete' ? (r.incomplete_details?.reason === 'max_output_tokens' ? 'length' : r.incomplete_details?.reason) : call ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: r.usage?.input_tokens,
      completion_tokens: r.usage?.output_tokens,
      total_tokens: r.usage?.total_tokens,
      completion_tokens_details: { reasoning_tokens: r.usage?.output_tokens_details?.reasoning_tokens },
    },
  };
}
