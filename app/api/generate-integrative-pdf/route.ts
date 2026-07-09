/**
 * Server-side PDF for the integrative-panel report.
 *
 * Loads the stored IntegrativeAnalysisResult from Upstash by requestId,
 * injects it into sessionStorage on /results/print-integrative, and
 * captures the print-styled render via puppeteer-core + @sparticuz/chromium-min.
 *
 * Kept intentionally separate from the clinical PDF route: different
 * source of truth, different print template, different filename convention.
 */
import { NextRequest } from 'next/server';
import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';
import { getIntegrativeRun } from '@/lib/admin/integrative-runs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

interface Body {
  requestId?: string;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  if (!body.requestId) {
    return new Response(JSON.stringify({ error: 'requestId is required' }), { status: 400 });
  }

  const analysis = await getIntegrativeRun(body.requestId);
  if (!analysis) {
    return new Response(JSON.stringify({ error: 'Integrative report not found' }), { status: 404 });
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  const start = Date.now();
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--hide-scrollbars', '--disable-web-security', '--no-sandbox'],
      defaultViewport: { width: 816, height: 1056, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: true,
    });
    const page = await browser.newPage();
    await page.emulateMediaType('print');

    await page.evaluateOnNewDocument(
      ({ a }) => {
        try {
          sessionStorage.setItem('integrativeAnalysis', JSON.stringify(a));
        } catch (err) {
          console.error('[integrative-pdf] sessionStorage inject failed', err);
        }
      },
      { a: analysis },
    );

    await page.goto(`${baseUrl}/results/print-integrative`, {
      waitUntil: 'networkidle0',
      timeout: 45000,
    });
    await new Promise((r) => setTimeout(r, 750));

    const pdf = await page.pdf({
      format: 'letter',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0.55in', right: '0.55in', bottom: '0.55in', left: '0.55in' },
    });

    const filename = `secondlook-integrative-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Render-Ms': String(Date.now() - start),
      },
    });
  } catch (err: any) {
    console.error('[generate-integrative-pdf] render failed:', err?.message, err?.stack?.slice(0, 500));
    return new Response(
      JSON.stringify({
        error: 'PDF generation failed',
        detail: (err?.message || 'unknown').slice(0, 300),
        durationMs: Date.now() - start,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}
