/**
 * Hebrew RTL PDF generation via headless Chromium.
 *
 * Browsers are the only rendering engines with fully correct Unicode bidi and
 * Hebrew shaping, so reports are built as RTL HTML documents and printed to
 * PDF with Chromium (playwright-core, no bundled browser download).
 *
 * The executable is resolved from CHROMIUM_PATH, falling back to common
 * locations. In the Docker image, `chromium` is installed via apt.
 */
import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";

const CANDIDATE_PATHS = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter((p): p is string => !!p);

function chromiumPath(): string {
  for (const p of CANDIDATE_PATHS) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "Chromium executable not found. Set CHROMIUM_PATH (see DEPLOYMENT.md) to enable PDF export.",
  );
}

// Reuse one browser instance across requests (launch is ~300ms).
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        executablePath: chromiumPath(),
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      })
      .then((browser) => {
        browser.on("disconnected", () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

/** Render a self-contained HTML document to an A4 PDF buffer. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="width:100%;text-align:center;font-size:8px;color:#888;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
