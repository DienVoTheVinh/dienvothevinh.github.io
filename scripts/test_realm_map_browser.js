const fs = require('fs');
const { chromium } = require('playwright');

const baseUrl = (process.env.VM_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const executablePath = process.env.VM_CHROME_PATH;
if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      sessionStorage.setItem('vm-guest-mode', 'true');
      localStorage.setItem('vm-theme', 'light');
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message || String(error)));
    await page.goto(`${baseUrl}/thanh-tuu?preview=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.realm-landmark[data-realm-index="10"]', { timeout: 15000 });

    const desktop = await page.evaluate(() => {
      const map = document.querySelector('#achievementMap').getBoundingClientRect();
      const landmarks = [...document.querySelectorAll('.realm-landmark')];
      const markClasses = landmarks.map(item => [...item.querySelector('.vm-realm-mark').classList].find(name => /^realm-mark-\d+$/.test(name)));
      const copiesInside = landmarks.every(item => {
        const rect = item.querySelector('.realm-landmark-copy').getBoundingClientRect();
        return rect.left >= map.left - 1 && rect.right <= map.right + 1 && rect.top >= map.top - 1 && rect.bottom <= map.bottom + 1;
      });
      return {
        landmarks: landmarks.length,
        uniqueMarks: new Set(markClasses).size,
        firstMark: markClasses[0],
        talentMark: markClasses[6],
        scholarGodMark: markClasses[8],
        copiesInside,
        campus: document.querySelectorAll('.realm-map-campus').length,
        library: document.querySelectorAll('.realm-map-library').length,
        observatory: document.querySelectorAll('.realm-map-observatory').length,
        zoneLabels: document.querySelectorAll('.realm-map-zones text').length,
        emojiPlaces: document.querySelectorAll('.map-place').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    if (desktop.landmarks !== 11 || desktop.uniqueMarks !== 11 || desktop.firstMark === desktop.talentMark || desktop.scholarGodMark !== 'realm-mark-8' || !desktop.copiesInside || desktop.campus !== 1 || desktop.library !== 1 || desktop.observatory !== 1 || desktop.zoneLabels < 5 || desktop.emojiPlaces !== 0 || desktop.overflow > 1) {
      throw new Error(`Desktop realm map is invalid: ${JSON.stringify(desktop)}`);
    }

    if (process.env.VM_REALM_MAP_SCREENSHOT) await page.screenshot({ path: process.env.VM_REALM_MAP_SCREENSHOT, fullPage: true });

    await page.locator('#themeBtn').click();
    const darkTheme = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      map: getComputedStyle(document.querySelector('#achievementMap')).backgroundColor,
      detail: getComputedStyle(document.querySelector('#realmDetail')).backgroundColor
    }));
    if (darkTheme.theme !== 'dark' || darkTheme.map === 'rgba(0, 0, 0, 0)' || darkTheme.detail === 'rgba(0, 0, 0, 0)') throw new Error(`Dark realm map is invalid: ${JSON.stringify(darkTheme)}`);
    await page.locator('#themeBtn').click();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      const map = document.querySelector('#achievementMap').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        pinsInside: [...document.querySelectorAll('.realm-landmark-pin')].every(item => {
          const rect = item.getBoundingClientRect();
          return rect.left >= map.left - 1 && rect.right <= map.right + 1 && rect.top >= map.top - 1 && rect.bottom <= map.bottom + 1;
        }),
        copiesInside: [...document.querySelectorAll('.realm-landmark-copy')].every(item => {
          const rect = item.getBoundingClientRect();
          return rect.left >= map.left - 1 && rect.right <= map.right + 1 && rect.top >= map.top - 1 && rect.bottom <= map.bottom + 1;
        }),
        detailInside: (() => { const rect = document.querySelector('#realmDetail').getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; })()
      };
    });
    if (mobile.overflow > 1 || !mobile.pinsInside || !mobile.copiesInside || !mobile.detailInside) throw new Error(`Mobile realm map is invalid: ${JSON.stringify(mobile)}`);
    if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join(' | ')}`);
    console.log('PASS detailed realm map with 11 distinct VinhMath crests on desktop and mobile');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
