/**
 * Per-pipeline LLM call logging — captures every prompt and response to
 * each LLM during a single DiagnosticPipeline.execute() invocation, so
 * downstream tooling (the case deep-dive HTML, post-hoc analysis) can
 * inspect exactly what was sent and received.
 *
 * Uses AsyncLocalStorage so push sites in BaseAgent, callAnthropic, and
 * the reconciliation module don't have to thread a logger parameter
 * through every call.
 *
 * Toggle via env LOG_LLM_CALLS=1 (default off in production; on for v16
 * experimental cohort). When off, push() is a no-op.
 *
 * Each persisted call is bounded in size — very long prompts/responses
 * get truncated with a marker so a single runaway case can't blow past
 * KV size limits.
 */
import { AsyncLocalStorage } from 'async_hooks';

export interface LlmCallRecord {
  // When the call started, ISO timestamp
  startedAt: string;
  // Agent / stage attribution (best-effort — push sites supply what they know)
  agentName?: string;
  stageName?: string;
  // Where in the pipeline we are (sequence number for ordering)
  callIndex: number;

  // Provider details
  provider: 'openai' | 'anthropic';
  model: string;
  reasoningEffort?: string;
  temperature?: number;
  maxTokens?: number;

  // Input prompts (truncated if too long)
  systemPrompt: string;
  userPrompt: string;
  systemPromptTruncated?: boolean;
  userPromptTruncated?: boolean;

  // For tool/function calls (OpenAI)
  toolNames?: string[];
  toolChoice?: string;

  // Response
  rawResponseText?: string;            // Anthropic returns text; we keep it
  rawResponseTextTruncated?: boolean;
  structuredOutput?: any;              // Parsed JSON or tool arguments (already structured)
  reasoningSummary?: string;           // Claude extended_thinking summary when available
  reasoningTokens?: number;            // OpenAI o-series reasoning_tokens count
  finishReason?: string;

  // Metadata
  tokensIn?: number;
  tokensOut?: number;
  durationMs: number;
  error?: string;
}

const TRUNCATE_AT = 40000; // ~10K tokens — generous, prevents single calls from blowing up KV

function truncate(s: string): { text: string; truncated: boolean } {
  if (typeof s !== 'string') return { text: '', truncated: false };
  if (s.length <= TRUNCATE_AT) return { text: s, truncated: false };
  return { text: s.slice(0, TRUNCATE_AT) + `\n\n... [truncated ${s.length - TRUNCATE_AT} chars]`, truncated: true };
}

interface LogState {
  enabled: boolean;
  calls: LlmCallRecord[];
  defaultAgent?: string;
  defaultStage?: string;
}

const storage = new AsyncLocalStorage<LogState>();

/**
 * Run a function with a fresh LLM-call log context.
 * Returns the array of captured calls plus the function's result.
 */
export async function withLlmCallLog<T>(fn: () => Promise<T>): Promise<{ result: T; calls: LlmCallRecord[] }> {
  const enabled = process.env.LOG_LLM_CALLS !== '0' && process.env.LOG_LLM_CALLS !== 'false';
  const state: LogState = { enabled, calls: [] };
  const result = await storage.run(state, fn);
  return { result, calls: state.calls };
}

/**
 * Set the default agent / stage attribution for subsequent push() calls.
 * Used by orchestrator and agent-execute wrappers to provide context that
 * the underlying call site doesn't have.
 */
export function setLogContext(ctx: { agentName?: string; stageName?: string }): void {
  const state = storage.getStore();
  if (!state) return;
  if (ctx.agentName !== undefined) state.defaultAgent = ctx.agentName;
  if (ctx.stageName !== undefined) state.defaultStage = ctx.stageName;
}

/**
 * Push an LLM call into the log. No-op if logging isn't enabled or no log
 * context is active.
 */
export function pushLlmCall(
  call: Omit<LlmCallRecord, 'callIndex' | 'startedAt' | 'systemPrompt' | 'userPrompt'> & {
    systemPrompt: string;
    userPrompt: string;
    startedAt?: string;
  },
): void {
  const state = storage.getStore();
  if (!state || !state.enabled) return;

  const sp = truncate(call.systemPrompt);
  const up = truncate(call.userPrompt);
  const rt = call.rawResponseText !== undefined ? truncate(call.rawResponseText) : null;

  const record: LlmCallRecord = {
    callIndex: state.calls.length,
    startedAt: call.startedAt || new Date().toISOString(),
    agentName: call.agentName || state.defaultAgent,
    stageName: call.stageName || state.defaultStage,
    provider: call.provider,
    model: call.model,
    reasoningEffort: call.reasoningEffort,
    temperature: call.temperature,
    maxTokens: call.maxTokens,
    systemPrompt: sp.text,
    userPrompt: up.text,
    systemPromptTruncated: sp.truncated || undefined,
    userPromptTruncated: up.truncated || undefined,
    toolNames: call.toolNames,
    toolChoice: call.toolChoice,
    rawResponseText: rt?.text,
    rawResponseTextTruncated: rt?.truncated || undefined,
    structuredOutput: call.structuredOutput,
    reasoningSummary: call.reasoningSummary,
    reasoningTokens: call.reasoningTokens,
    finishReason: call.finishReason,
    tokensIn: call.tokensIn,
    tokensOut: call.tokensOut,
    durationMs: call.durationMs,
    error: call.error,
  };

  state.calls.push(record);
}

/**
 * Returns whether logging is enabled in the current context. Used by call
 * sites to avoid building expensive payloads when logging is off.
 */
export function isLlmLoggingEnabled(): boolean {
  const state = storage.getStore();
  return !!state?.enabled;
}
