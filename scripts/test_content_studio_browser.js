const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const source = fs.readFileSync('quan-tri-tai-lieu.html', 'utf8');
  const tokens = fs.readFileSync('css/tokens.css', 'utf8');
  const shared = fs.readFileSync('css/vinhmath.css', 'utf8');
  const inline = [...source.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const bodyMatch = source.match(/<body>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) throw new Error('Content studio body is missing');
  const body = bodyMatch[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.setContent(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${tokens}\n${shared}\n${inline}</style></head><body>${body}</body></html>`);
    await page.evaluate(() => {
      document.getElementById('contentSetupZone').style.display = '';
      document.querySelectorAll('.content-metric b').forEach((el, index) => { el.textContent = [34, 7, 1][index]; });
      document.querySelectorAll('.content-metric small').forEach((el) => { if (el.textContent.includes('Đang tải')) el.textContent = 'Đã xuất bản'; });
    });
    const desktop = await page.evaluate(() => ({
      tools: document.querySelectorAll('.content-tool').length,
      setups: document.querySelectorAll('.setup-link').length,
      summaryColumns: getComputedStyle(document.querySelector('.content-summary')).gridTemplateColumns.split(' ').length,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      thpt: document.body.textContent.includes('Đề thi chuẩn THPTQG') && document.body.textContent.includes('THPTQG có lời giải'),
    }));
    if (desktop.tools !== 6 || desktop.setups < 6 || desktop.summaryColumns !== 3 || desktop.overflow || !desktop.thpt) throw new Error(`Desktop content studio layout failed: ${JSON.stringify(desktop)}`);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({
      toolColumns: getComputedStyle(document.querySelector('.content-tools')).gridTemplateColumns.split(' ').length,
      setupColumns: getComputedStyle(document.querySelector('.setup-grid')).gridTemplateColumns.split(' ').length,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    if (mobile.toolColumns !== 1 || mobile.setupColumns !== 1 || mobile.overflow) throw new Error(`Mobile content studio layout failed: ${JSON.stringify(mobile)}`);

    await page.evaluate(() => { document.getElementById('modalPreamble').style.display = 'flex'; });
    const modal = await page.evaluate(() => {
      const card = document.querySelector('#modalPreamble .modal-content').getBoundingClientRect();
      return { visible: card.width > 0 && card.height > 0, withinViewport: card.width <= innerWidth && card.height <= innerHeight, configColumns: getComputedStyle(document.querySelector('.config-grid')).gridTemplateColumns.split(' ').length };
    });
    if (!modal.visible || !modal.withinViewport || modal.configColumns !== 1) throw new Error(`Mobile authoring settings modal failed: ${JSON.stringify(modal)}`);
    console.log('PASS complete content studio desktop/mobile layout and settings modal');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
