const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const source = fs.readFileSync('quan-tri-cham-bai.html', 'utf8');
  const tokens = fs.readFileSync('css/tokens.css', 'utf8');
  const shared = fs.readFileSync('css/vinhmath.css', 'utf8');
  const inline = [...source.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  const bodyMatch = source.match(/<body>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) throw new Error('Grading page body is missing');
  const body = bodyMatch[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${tokens}\n${shared}\n${inline}</style></head><body>${body}</body></html>`);
    const desktop = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('.chb-filter-selects select')].map((el) => el.id);
      const rects = ids.map((id) => document.getElementById(id).getBoundingClientRect());
      return {
        ids,
        sameRow: rects.every((rect) => Math.abs(rect.top - rects[0].top) < 2),
        noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      };
    });
    if (desktop.ids.join(',') !== 'selKhoi,selLop,selBai' || !desktop.sameRow || !desktop.noOverflow) {
      throw new Error(`Desktop grading filters failed: ${JSON.stringify(desktop)}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      const wrap = document.querySelector('.chb-filter-selects').getBoundingClientRect();
      const selects = [...document.querySelectorAll('.chb-filter-selects select')].map((el) => el.getBoundingClientRect());
      return {
        oneColumn: selects.every((rect, index) => index === 0 || rect.top > selects[index - 1].bottom),
        fullWidth: selects.every((rect) => Math.abs(rect.width - wrap.width) < 2),
        noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      };
    });
    if (!mobile.oneColumn || !mobile.fullWidth || !mobile.noOverflow) {
      throw new Error(`Mobile grading filters failed: ${JSON.stringify(mobile)}`);
    }
    console.log('PASS grading grade filter desktop/mobile geometry');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
