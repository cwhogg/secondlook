/**
 * Client-side session tracker. Emits events to /api/session-track that
 * powers /admin/sessions.
 *
 * Two entry points:
 *   - trackEvent(eventType, opts) — call from React components on
 *     mount / interaction (step-view, step-complete, analysis-complete)
 *   - installGlobalTracking() — call once from the top-level layout to
 *     wire visibilitychange + beforeunload hooks (via sendBeacon so
 *     final events land even as the tab closes).
 *
 * Session ID lives in localStorage and is generated lazily on first
 * event. Same ID persists across the visit; a new one starts on next
 * localStorage-clear or explicit reset.
 */

export type ClientEventType =
  | 'session-start'
  | 'step-view'
  | 'step-complete'
  | 'analysis-start'
  | 'analysis-complete'
  | 'form-snapshot'
  | 'session-heartbeat';

export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface TrackEventOpts {
  step?: StepIndex;
  data?: Record<string, unknown>;
  form?: {
    age?: string;
    sex?: string;
    symptoms?: Array<{ originalPhrase: string; medicalTerm?: string }>;
    narrativeChars?: number;
    labResultCount?: number;
    photoCount?: number;
    hasClarifications?: boolean;
  };
  analysis?: {
    requestId?: string;
    top1Diagnosis?: string;
    top1Confidence?: number;
  };
}

const SESSION_ID_KEY = 'sl_session_id';
const REFERRER_KEY = 'sl_session_referrer';
const UTM_KEY = 'sl_session_utm';

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `s_${crypto.randomUUID()}`;
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = generateSessionId();
    window.localStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

function stashReferrerAndUtm(): {
  referrer?: string;
  utmParams?: Record<string, string>;
} {
  if (typeof window === 'undefined') return {};
  let referrer = window.localStorage.getItem(REFERRER_KEY) || undefined;
  let utmRaw = window.localStorage.getItem(UTM_KEY) || '';
  if (!referrer && document.referrer) {
    referrer = document.referrer;
    window.localStorage.setItem(REFERRER_KEY, referrer);
  }
  let utmParams: Record<string, string> | undefined;
  if (!utmRaw) {
    // Only stash on first landing so we don't overwrite the acquisition
    // source with an internal navigation later in the visit.
    const collected: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(window.location.search)) {
      if (k.startsWith('utm_')) collected[k] = v.slice(0, 300);
    }
    if (Object.keys(collected).length > 0) {
      utmRaw = JSON.stringify(collected);
      window.localStorage.setItem(UTM_KEY, utmRaw);
    }
  }
  if (utmRaw) {
    try {
      utmParams = JSON.parse(utmRaw);
    } catch {
      /* ignore */
    }
  }
  return { referrer, utmParams };
}

/**
 * Fire an event to the tracking endpoint. Fails silently (session
 * tracking must never break user flow). Uses fetch by default; when
 * called during pagehide/visibilitychange handoff, opts.beacon=true
 * switches to navigator.sendBeacon which survives page close.
 */
export function trackEvent(
  type: ClientEventType,
  opts: TrackEventOpts & { beacon?: boolean } = {},
): void {
  if (typeof window === 'undefined') return;
  const sessionId = getSessionId();
  const { referrer, utmParams } = stashReferrerAndUtm();
  const body = JSON.stringify({
    sessionId,
    event: {
      type,
      step: opts.step,
      path: window.location.pathname,
      data: opts.data,
    },
    referrer,
    utmParams,
    form: opts.form,
    analysis: opts.analysis,
  });

  try {
    if (opts.beacon && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/session-track', blob);
      return;
    }
    // Fire-and-forget POST. keepalive=true lets small requests survive
    // the immediate teardown of the page in modern browsers.
    void fetch('/api/session-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* ignore — telemetry must never surface */
  }
}

let globalInstalled = false;
let visibilityHandler: (() => void) | null = null;

/**
 * Install page-lifetime hooks. Idempotent — safe to call from multiple
 * layouts. Sends a heartbeat every 30s while the tab is visible, and
 * fires a final beacon on visibilitychange:hidden or pagehide so we
 * capture the last-known step even on abandonment.
 */
export function installGlobalTracking(): void {
  if (typeof window === 'undefined' || globalInstalled) return;
  globalInstalled = true;

  // Initial "landed on the site" event. Fires once per visit.
  const initialFlagKey = 'sl_session_landed';
  if (!window.sessionStorage.getItem(initialFlagKey)) {
    trackEvent('session-start', { step: 0 });
    window.sessionStorage.setItem(initialFlagKey, '1');
  }

  // Heartbeat: keep the session marked "active" so time-on-site is
  // measurable even during a long thoughtful pause on step-2.
  const HEARTBEAT_MS = 30_000;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const startHeartbeat = () => {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      trackEvent('session-heartbeat');
    }, HEARTBEAT_MS);
  };
  const stopHeartbeat = () => {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };
  startHeartbeat();

  visibilityHandler = () => {
    if (document.visibilityState === 'hidden') {
      // Final beacon: capture the last-known position on abandonment.
      trackEvent('session-heartbeat', { beacon: true });
      stopHeartbeat();
    } else {
      startHeartbeat();
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
  window.addEventListener('pagehide', () => {
    trackEvent('session-heartbeat', { beacon: true });
    stopHeartbeat();
  });
}
