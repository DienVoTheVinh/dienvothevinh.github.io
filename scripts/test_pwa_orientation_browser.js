const fs = require('fs');
const { chromium } = require('playwright');

function pwaSection(source) {
  const marker = 'PWA + TOI UU TAI NGUYEN';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error('Missing PWA section in js/vinhmath.js');
  const start = source.lastIndexOf('(function () {', markerIndex);
  if (start < 0) throw new Error('Missing PWA wrapper in js/vinhmath.js');
  return source.slice(start);
}

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const shared = fs.readFileSync('js/vinhmath.js', 'utf8');
  const source = pwaSection(shared);
  const browser = await chromium.launch({ executablePath, headless: true });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/138 Safari/537.36',
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.route('https://vinhmath.com/**', (route) => route.fulfill({
      status: 200,
      contentType: route.request().url().endsWith('/sw.js') ? 'text/javascript' : 'text/html; charset=utf-8',
      body: route.request().url().endsWith('/sw.js') ? 'self.addEventListener("fetch", function () {});' : '<main>VinhMath</main>',
    }));
    await page.goto('https://vinhmath.com/test-orientation');
    await page.addScriptTag({ content: `
      window.__vmOrientationLocks = [];
      window.matchMedia = function(query) {
        return { matches: query === '(display-mode: standalone)', media: query, addEventListener: function(){}, removeEventListener: function(){} };
      };
      Object.defineProperty(window.screen, 'orientation', {
        configurable: true,
        value: { lock: function(value) { window.__vmOrientationLocks.push(value); return Promise.resolve(); } }
      });
      ${source}
    ` });
    await page.waitForTimeout(50);
    const locks = await page.evaluate(() => window.__vmOrientationLocks.slice());
    if (!locks.includes('portrait-primary')) {
      throw new Error(`Installed mobile PWA did not request portrait-primary: ${JSON.stringify(locks)}`);
    }
    console.log('PASS installed mobile VinhMath requests portrait-primary orientation');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
