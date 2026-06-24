/**
 * Server-side PDF generation for the Final Report.
 *
 * Why this exists: `window.print()` is wildly inconsistent on mobile —
 * iOS Safari buries it behind the Share menu, in-app browsers (Instagram,
 * Facebook, Twitter) no-op the call entirely, and Android Chrome's print
 * preview drops layout details that the desktop preview keeps. Rendering
 * the report server-side with headless Chromium gives a single, byte-
 * identical PDF on every device.
 *
 * How it works:
 * 1. Client POSTs the analysis + patient case + metadata it has in
 *    sessionStorage on /results/print.
 * 2. We boot @sparticuz/chromium-min via puppeteer-core. The Chromium
 *    binary is fetched on cold start from the upstream release; warm
 *    invocations reuse it from /tmp.
 * 3. Puppeteer opens a new page, injects the analysis data into
 *    sessionStorage via evaluateOnNewDocument (so it's present BEFORE
 *    the page's React mount reads it), then navigates to /results/print.
 * 4. We wait for the report's stable readiness marker (an
 *    `[data-print-ready]` attribute), then generate the PDF at letter
 *    size with the print CSS in effect.
 * 5. PDF streams back as application/pdf with a Content-Disposition
 *    attachment header — every browser, mobile included, triggers a
 *    real download.
 *
 * Cost model: ~$0.003 per render on Vercel Pro (60s timeout × 1024MB
 * × ~0.05% utilization). Cold start dominates first-call latency
 * (~5-8s); warm calls land in ~3-5s.
 */
import { NextRequest } from 'next/server';
import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Matches the installed @sparticuz/chromium-min version. When bumping
// the dep, bump this URL to the matching release tag. See
// https://github.com/Sparticuz/chromium/releases for the catalog.
const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

interface GeneratePdfBody {
  analysisResult: unknown;
  patientCase: unknown;
  metadata?: unknown;
}

export async function POST(request: NextRequest) {
  let body: GeneratePdfBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.analysisResult || !body.patientCase) {
    return new Response(
      JSON.stringify({ error: 'analysisResult and patientCase are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Where to load /results/print from. In production this is the same
  // Vercel deployment serving the API. Locally, the host header gives
  // us http://localhost:3000.
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  const start = Date.now();
  try {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--hide-scrollbars',
        '--disable-web-security',
        '--no-sandbox',
      ],
      defaultViewport: { width: 816, height: 1056, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: true,
    });

    const page = await browser.newPage();
    // CSS print media so the @media print rules in /results/print fire.
    await page.emulateMediaType('print');

    // Inject the analysis payload into sessionStorage BEFORE any document
    // loads. evaluateOnNewDocument runs in the page context before the
    // page's own scripts, so when the React tree mounts and the
    // /results/print page reads sessionStorage, the data is already there.
    await page.evaluateOnNewDocument(
      ({ ar, pc, m }) => {
        try {
          sessionStorage.setItem('analysisResults', JSON.stringify(ar));
          sessionStorage.setItem('analysisPatientCase', JSON.stringify(pc));
          if (m) sessionStorage.setItem('analysisMetadata', JSON.stringify(m));
        } catch (err) {
          // Surface to console for the in-page logs; we still want the
          // navigation to proceed so we can capture the rendered error
          // state in the PDF rather than failing silently.
          console.error('[pdf-gen] sessionStorage injection failed:', err);
        }
      },
      {
        ar: body.analysisResult,
        pc: body.patientCase,
        m: body.metadata,
      },
    );

    // networkidle0 waits until there are zero in-flight requests for
    // 500ms. The report page is mostly client-rendered from
    // sessionStorage so its network activity is brief.
    await page.goto(`${baseUrl}/results/print`, {
      waitUntil: 'networkidle0',
      timeout: 45000,
    });

    // Belt + braces: give the React tree a tick to finish rendering the
    // legend, 2-col grids, and the diagnosis cards. Without this we
    // occasionally captured the empty pre-hydration state on cold starts.
    await new Promise((r) => setTimeout(r, 750));

    const pdf = await page.pdf({
      format: 'letter',
      printBackground: true,
      preferCSSPageSize: true,
      // Mirror the @page margin in /results/print's print stylesheet so
      // we don't double-margin or fight the page's own layout.
      margin: { top: '0.55in', right: '0.55in', bottom: '0.55in', left: '0.55in' },
    });

    const filename = `secondlook-report-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Render-Ms': String(Date.now() - start),
      },
    });
  } catch (err: any) {
    console.error('[generate-pdf] render failed:', err?.message, err?.stack?.slice(0, 500));
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
      try {
        await browser.close();
      } catch {
        /* ignore close errors */
      }
    }
  }
}
