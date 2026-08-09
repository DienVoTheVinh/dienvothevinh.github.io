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
  const sharedCss = fs.readFileSync('css/vinhmath.css', 'utf8');
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
      body: route.request().url().endsWith('/sw.js') ? 'self.addEventListener("fetch", function () {});' : '<meta name="viewport" content="width=device-width, initial-scale=1"><main>VinhMath</main>',
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
    if (!(await page.locator('#vmOrientationBtn').isVisible())) {
      throw new Error('Installed mobile PWA does not expose the orientation shortcut');
    }

    const browserContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/138 Safari/537.36',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const browserPage = await browserContext.newPage();
    await browserPage.route('https://vinhmath.com/**', (route) => route.fulfill({
      status: 200,
      contentType: route.request().url().endsWith('/sw.js') ? 'text/javascript' : 'text/html; charset=utf-8',
      body: route.request().url().endsWith('/sw.js') ? 'self.addEventListener("fetch", function () {});' : '<meta name="viewport" content="width=device-width, initial-scale=1"><main>VinhMath</main>',
    }));
    await browserPage.goto('https://vinhmath.com/test-orientation-browser');
    await browserPage.evaluate((css) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }, sharedCss);
    await browserPage.addScriptTag({ content: `
      window.__vmOrientationLocks = [];
      window.__vmOrientationUnlocks = 0;
      window.__vmFullscreenRequests = 0;
      window.__vmFullscreenElement = null;
      window.matchMedia = function(query) {
        return { matches: false, media: query, addEventListener: function(){}, removeEventListener: function(){} };
      };
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: function () { return window.__vmFullscreenElement; }
      });
      document.documentElement.requestFullscreen = function () {
        window.__vmFullscreenRequests += 1;
        window.__vmFullscreenElement = document.documentElement;
        return Promise.resolve();
      };
      document.exitFullscreen = function () {
        window.__vmFullscreenElement = null;
        return Promise.resolve();
      };
      Object.defineProperty(window.screen, 'orientation', {
        configurable: true,
        value: {
          lock: function(value) { window.__vmOrientationLocks.push(value); return Promise.resolve(); },
          unlock: function() { window.__vmOrientationUnlocks += 1; }
        }
      });
      ${source}
    ` });
    await browserPage.locator('#vmOrientationBtn').click();
    if (!(await browserPage.locator('#vmOrientationPanel').isVisible())) {
      throw new Error('Orientation shortcut does not open its control panel');
    }
    const viewport = browserPage.viewportSize();
    const { buttonBox, panelBox } = await browserPage.evaluate(() => {
      const readBox = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      return {
        buttonBox: readBox('#vmOrientationBtn'),
        panelBox: readBox('#vmOrientationPanel'),
      };
    });
    if (!viewport || !buttonBox || !panelBox
      || buttonBox.x < 0 || buttonBox.y < 0
      || buttonBox.x + buttonBox.width > viewport.width
      || buttonBox.y + buttonBox.height > viewport.height
      || panelBox.x < 0 || panelBox.y < 0
      || panelBox.x + panelBox.width > viewport.width
      || panelBox.y + panelBox.height > viewport.height) {
      throw new Error(`Orientation controls are outside the mobile viewport: ${JSON.stringify({ viewport, buttonBox, panelBox })}`);
    }
    await browserPage.locator('[data-vm-orientation="landscape"]').click();
    await browserPage.waitForTimeout(30);
    const landscape = await browserPage.evaluate(() => ({
      fullscreenRequests: window.__vmFullscreenRequests,
      locks: window.__vmOrientationLocks.slice(),
      label: document.querySelector('.vm-orientation-label').textContent,
      saved: localStorage.getItem('vm_orientation_preference'),
      status: document.getElementById('vmOrientationStatus').textContent,
    }));
    if (landscape.fullscreenRequests !== 1 || !landscape.locks.includes('landscape-primary') || landscape.saved !== 'landscape' || landscape.label !== 'Ngang' || !/Đã khóa/.test(landscape.status)) {
      throw new Error(`Browser orientation control did not lock landscape via fullscreen: ${JSON.stringify(landscape)}`);
    }
    await browserPage.locator('[data-vm-orientation="auto"]').click();
    await browserPage.waitForTimeout(30);
    const automatic = await browserPage.evaluate(() => ({
      unlocks: window.__vmOrientationUnlocks,
      saved: localStorage.getItem('vm_orientation_preference'),
      label: document.querySelector('.vm-orientation-label').textContent,
    }));
    if (automatic.unlocks !== 1 || automatic.saved !== 'auto' || automatic.label !== 'Theo máy') {
      throw new Error(`Automatic orientation mode did not unlock correctly: ${JSON.stringify(automatic)}`);
    }
    await browserContext.close();
    console.log('PASS visible mobile orientation shortcut, portrait lock, fullscreen landscape and automatic mode');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
