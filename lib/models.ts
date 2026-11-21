/**
 * Every AI model SecondLook calls, in one place. When a provider retires a
 * model, change it here — gpt-4.1-nano's retirement (2026-11-21) silently
 * broke every run because the id was hard-coded in two files.
 *
 * BENCHMARK stages change diagnostic accuracy: swap them only behind a
 * benchmark run. PINNED models are the measuring stick (grader, published
 * baselines): change them only together with a full re-grade.
 *
 * Testing framework stays Anthropic-only (see CLAUDE.md provider rule).
 */
export const MODELS = {
  // ---- Diagnostic pipeline (BENCHMARK) ----
  triage: 'gpt-5.4-mini',
  specialist: 'gpt-5.5',
  critic: 'gpt-5.5',
  broadener: 'claude-sonnet-5-5',
  claudeEvaluator: 'claude-opus-5-5',
  claudeSynth: 'claude-opus-5-5',
  claudeFinalizer: 'claude-opus-5-5',

  // ---- Pipeline wording / formatting ----
  narrative: 'claude-sonnet-5-5',
  report: 'gpt-5.4-mini',
  clarifier: 'claude-sonnet-5-5',

  // ---- Intake + document reading ----
  parseSymptoms: 'gpt-5.4-mini',
  documentVision: 'gpt-5.4',

  // ---- Integrative report ----
  integrativeSpecialist: 'gpt-5.4',
  integrativeSynth: 'claude-opus-5-5',

  // ---- Content + test harness (Anthropic) ----
  harnessDefault: 'claude-sonnet-5-5',
  blogWriter: 'claude-sonnet-5-5',

  // ---- PINNED measuring stick ----
  grader: 'claude-opus-4-7',
  baselineOpenAI: 'o3',
  baselineClaude: 'claude-opus-4-7',
} as const;

export type ModelRole = keyof typeof MODELS;

/**
 * How a chat-completions request must be shaped for an OpenAI model.
 * Verified against the live API on 2026-11-21:
 * - o-series and gpt-5.5: reasoning models — developer role, no temperature,
 *   max_completion_tokens, optional reasoning_effort. gpt-5.5 additionally
 *   rejects function tools + reasoning_effort on /v1/chat/completions.
 * - gpt-5.4 / gpt-5.4-mini: accept temperature but only max_completion_tokens.
 * - gpt-4.x: temperature + max_tokens.
 */
export interface OpenAIStyle {
  reasoning: boolean;
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  /** Function tools + reasoning_effort only work on /v1/responses. */
  toolsWithEffortNeedResponsesApi: boolean;
}

export function openaiStyle(model: string): OpenAIStyle {
  if (/^o\d/.test(model)) {
    return { reasoning: true, tokenParam: 'max_completion_tokens', toolsWithEffortNeedResponsesApi: false };
  }
  if (/^gpt-5\.5/.test(model)) {
    return { reasoning: true, tokenParam: 'max_completion_tokens', toolsWithEffortNeedResponsesApi: true };
  }
  if (/^gpt-5/.test(model)) {
    return { reasoning: false, tokenParam: 'max_completion_tokens', toolsWithEffortNeedResponsesApi: false };
  }
  return { reasoning: false, tokenParam: 'max_tokens', toolsWithEffortNeedResponsesApi: false };
}

/** Token limit (+ temperature when accepted), to spread into a chat-completions body. */
export function openaiLimits(model: string, maxTokens: number, temperature?: number): Record<string, number> {
  const style = openaiStyle(model);
  const out: Record<string, number> = { [style.tokenParam]: maxTokens };
  if (!style.reasoning && temperature !== undefined) out.temperature = temperature;
  return out;
}

/**
 * Only Claude Sonnet/Haiku 4.x accept `temperature`. Opus 4.x and every
 * Claude 5.x model reject it ("temperature is deprecated for this model").
 */
export function claudeAcceptsTemperature(model: string): boolean {
  return /^claude-(sonnet|haiku)-4/.test(model);
}

/** Extra output room for Claude models whose thinking can't be turned off. */
const CLAUDE_THINKING_HEADROOM = 16000;

/**
 * Claude 5.x thinks by default and thinking tokens count against max_tokens;
 * the 4.x models these calls were written for did not think. Verified
 * 2026-11-21: a 350-token recap on Sonnet 5.5 spent 234 tokens thinking and
 * was cut off at 52 words; with thinking off it finished at 137 words.
 * - Sonnet 5.5: thinking off via { type: 'between_tools' } (no tools → no thinking).
 * - Haiku 5.5 / Sonnet 5: thinking off via { type: 'disabled' }.
 * - Opus 5.x / Fable: thinking can't be disabled — explicit medium effort plus
 *   headroom so the visible answer keeps the caller's budget.
 */
export function claudeThinkingControl(
  model: string,
  maxTokens: number,
): { fields: Record<string, unknown>; maxTokens: number } {
  if (/^claude-sonnet-5-5/.test(model)) return { fields: { thinking: { type: 'between_tools' } }, maxTokens };
  if (/^claude-(haiku-5|sonnet-5)/.test(model)) return { fields: { thinking: { type: 'disabled' } }, maxTokens };
  if (/^claude-(opus-5|fable-5)/.test(model)) {
    return { fields: { output_config: { effort: 'medium' } }, maxTokens: maxTokens + CLAUDE_THINKING_HEADROOM };
  }
  return { fields: {}, maxTokens };
}
