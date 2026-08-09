const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const source = fs.readFileSync('luyen-de.html', 'utf8');
  const css = [...source.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  const pdfButton = source.match(/<button[^>]*id="wkPdfBtn"[^>]*>[\s\S]*?<\/button>/i);
  if (!pdfButton) throw new Error('Missing mobile workspace PDF button');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/138 Safari/537.36',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      :root{--line:#ddd;--accent:#c77b00;--surface:#fff;--ink:#171717}
      .tab-btn{padding:12px 22px;border:1px solid var(--line);background:var(--surface)}
      .btn{display:inline-flex}
      ${css}
    </style>
    <div id="tabLopHocSinh" style="display:flex">
      ${['ĐGNL ĐHQG TPHCM','Toán 11','Toán 12 Gò Dầu','Toán 9 - N','Toán 8 - Q5','Toán 7 - Q5'].map((name) => `<button class="tab-btn">${name}</button>`).join('')}
    </div>
    <div class="exam-actions">${pdfButton[0]}</div>
    <div id="modalPdfConfig"></div>`);
    await page.addScriptTag({ content: `
      window.__pdfMode = null;
      window.moConfigPDF = function(mode){ window.__pdfMode = mode; };
    ` });

    const before = await page.locator('#tabLopHocSinh').evaluate((el) => ({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, scrollLeft: el.scrollLeft }));
    if (before.scrollWidth <= before.clientWidth) throw new Error(`Class strip does not overflow horizontally: ${JSON.stringify(before)}`);
    await page.locator('#tabLopHocSinh').evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    const after = await page.locator('#tabLopHocSinh').evaluate((el) => el.scrollLeft);
    if (after <= 0) throw new Error('Class strip cannot be moved horizontally');

    const pdf = page.locator('#wkPdfBtn');
    if (!(await pdf.isVisible())) throw new Error('PDF action is hidden in the mobile exam workspace');
    await pdf.click();
    const mode = await page.evaluate(() => window.__pdfMode);
    if (mode !== 'exam') throw new Error(`PDF action opened the wrong mode: ${mode}`);

    console.log('PASS mobile class strip scrolls and exam PDF action is reachable');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
