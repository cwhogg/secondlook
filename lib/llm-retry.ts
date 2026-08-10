/**
 * Shared resilience for LLM HTTP calls: per-request timeout + retry with
 * exponential backoff and jitter on the transient failures that both OpenAI
 * and Anthropic surface (429 rate limit, 5xx, 529 overloaded, and network
 * errors / timeouts). Non-retryable 4xx (bad prompt, auth, schema) pass
 * straight through.
 *
 * Before this, callAnthropic had zero retry and no timeout (a single 529
 * killed a whole analysis run), base-agent retried only 429, and no call
 * site bounded how long a hung upstream could block. This centralizes the
 * policy so every provider call gets the same protection.
 */

export interface ResilienceOptions {
  /** Total attempts = maxRetries + 1. Default 3. */
  maxRetries?: number;
  /** Per-attempt timeout in ms before the request is aborted. Default 120s. */
  timeoutMs?: number;
  /** Label for logs. */
  label?: string;
  /** Called before each retry sleep. */
  onRetry?: (info: { attempt: number; status?: number; error?: string; delayMs: number }) => void;
}

/**
 * Classify an error/message as a transient failure worth retrying. Mirrors
 * the codes OpenAI and Anthropic return for rate limits and overload, plus
 * common network-level errors and our own timeout marker. Used both by the
 * fetch wrapper and by orchestrator-level stage retries (which see thrown
 * Error messages, not Response objects).
 */
export function isRetryableError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('529') ||
    msg.includes('overload') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch failed')
  );
}

function backoffMs(attempt: number): number {
  // 1s, 2s, 4s, 8s … capped at 30s, plus up to 500ms jitter to avoid
  // synchronized retries across parallel specialist calls.
  return Math.min(30_000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch() with per-attempt timeout and transient-failure retry. NOTE: this
 * manages its own AbortSignal for the timeout, so any `signal` on `init` is
 * overridden — provider calls here don't pass one.
 */
export async function fetchWithResilience(
  url: string,
  init: RequestInit,
  opts: ResilienceOptions = {},
): Promise<Response> {
  const { maxRetries = 3, timeoutMs = 120_000, label = 'llm', onRetry } = opts;
  let lastErr: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`${label}: request timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const retryAfter = res.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoffMs(attempt);
        onRetry?.({ attempt, status: res.status, delayMs: delay });
        await sleep(delay);
        continue;
      }
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      lastErr = err;
      // AbortController.abort(reason) rejects with `reason`; surface our
      // timeout message so isRetryableError classifies it correctly.
      const e = controller.signal.aborted && controller.signal.reason ? controller.signal.reason : err;
      lastErr = e;
      if (attempt < maxRetries) {
        const delay = backoffMs(attempt);
        onRetry?.({ attempt, error: e?.message, delayMs: delay });
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error(`${label}: exhausted ${maxRetries} retries`);
}
