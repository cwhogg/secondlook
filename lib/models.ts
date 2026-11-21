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
  triage: 'gpt-4.1-mini',
  specialist: 'o3',
  critic: 'o3',
  broadener: 'claude-sonnet-4-6',
  claudeEvaluator: 'claude-opus-4-7',
  claudeSynth: 'claude-opus-4-7',
  claudeFinalizer: 'claude-opus-4-7',

  // ---- Pipeline wording / formatting ----
  narrative: 'claude-sonnet-4-6',
  report: 'gpt-4.1-mini',
  clarifier: 'claude-sonnet-4-6',

  // ---- Intake + document reading ----
  parseSymptoms: 'gpt-4.1-mini',
  documentVision: 'gpt-4.1',

  // ---- Integrative report ----
  integrativeSpecialist: 'gpt-4.1',
  integrativeSynth: 'claude-opus-4-7',

  // ---- Content + test harness (Anthropic) ----
  harnessDefault: 'claude-sonnet-4-6',
  blogWriter: 'claude-sonnet-4-6',

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
