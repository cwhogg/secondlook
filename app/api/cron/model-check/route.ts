/**
 * GET /api/cron/model-check — daily: send a tiny request to every model in
 * lib/models.ts (plus the embedding model) and alert on any failure.
 *
 * Exists because gpt-4.1-nano was retired without warning on 2026-11-21 and
 * every diagnostic run failed silently at triage. Failures are logged as
 * [ALERT] lines and sent to Sentry.
 *
 * Auth: Vercel Cron's `Authorization: Bearer <CRON_SECRET>`, or the admin
 * password (same pattern as /api/cron/session-rollup).
 */
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireAdmin } from '@/lib/admin/prod-runs';
import { MODELS, openaiStyle, openaiLimits } from '@/lib/models';

export const runtime = 'nodejs';
export const maxDuration = 120;

const EMBEDDING_MODEL = 'text-embedding-3-large';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.cron_secret;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth === `Bearer ${secret}`) return true;
  }
  return requireAdmin(request) === null;
}

interface CheckResult {
  model: string;
  roles: string[];
  ok: boolean;
  status?: number;
  error?: string;
}

async function checkClaude(model: string): Promise<Omit<CheckResult, 'roles'>> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'ok' }] }),
  });
  return res.ok ? { model, ok: true } : { model, ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
}

async function checkOpenAIChat(model: string): Promise<Omit<CheckResult, 'roles'>> {
  const reasoning = openaiStyle(model).reasoning;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ok' }],
      // Reasoning models spend tokens thinking before answering.
      ...openaiLimits(model, reasoning ? 500 : 5),
      ...(reasoning ? { reasoning_effort: 'low' } : {}),
    }),
  });
  return res.ok ? { model, ok: true } : { model, ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
}

async function checkEmbedding(model: string): Promise<Omit<CheckResult, 'roles'>> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: 'ok', dimensions: 256 }),
  });
  return res.ok ? { model, ok: true } : { model, ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const roles = new Map<string, string[]>();
  for (const [role, model] of Object.entries(MODELS)) {
    roles.set(model, [...(roles.get(model) || []), role]);
  }

  const checks: CheckResult[] = await Promise.all([
    ...[...roles.keys()].map(async (model) => {
      try {
        const r = model.startsWith('claude-') ? await checkClaude(model) : await checkOpenAIChat(model);
        return { ...r, roles: roles.get(model)! };
      } catch (err: any) {
        return { model, roles: roles.get(model)!, ok: false, error: err?.message || 'request failed' };
      }
    }),
    checkEmbedding(EMBEDDING_MODEL)
      .then((r) => ({ ...r, roles: ['embeddings'] }))
      .catch((err: any) => ({ model: EMBEDDING_MODEL, roles: ['embeddings'], ok: false, error: err?.message })),
  ]);

  const failed = checks.filter((c) => !c.ok);
  for (const f of failed) {
    console.error(`[ALERT] model-check: ${f.model} (${f.roles.join(', ')}) failed ${f.status ?? ''}: ${f.error}`);
  }
  if (failed.length) {
    Sentry.captureMessage(`model-check: ${failed.length} model(s) failing: ${failed.map((f) => f.model).join(', ')}`, {
      level: 'error',
      extra: { failed },
    });
  }

  return NextResponse.json({ ok: failed.length === 0, checked: checks.length, failed, checks });
}
