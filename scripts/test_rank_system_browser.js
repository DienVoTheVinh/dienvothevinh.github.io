const { chromium } = require('playwright');
const fs = require('fs');

const executablePath = process.env.VM_CHROME_PATH;
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error('VM_CHROME_PATH must point to Chrome');
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => sessionStorage.setItem('vm-guest-mode', 'true'));
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('http://127.0.0.1:8000/trang-chu?preview=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vmRankHome .vm-rank-home-card', { timeout: 15000 });
    await page.waitForSelector('#vmCompanionDock .vm-pet-egg', { timeout: 15000 });
    if (await page.locator('.vm-egg-choice').count()) throw new Error('Guest preview must not open a state-changing egg chooser');
    if (!await page.getByText('Bảng xếp hạng', { exact: true }).count()) throw new Error('Leaderboard is missing from student navigation');
    const homeText = await page.locator('#vmRankHome').innerText();
    if (!homeText.includes('Tân Thủ') || !homeText.includes('Kim Cương')) throw new Error(`Current rank is missing on Today: ${homeText}`);
    const toolbar = await page.evaluate(() => ({
      roleBadges: document.querySelectorAll('.topbar .logo > .role-badge').length,
      title: document.querySelector('.vm-rank-logo-tag .vm-rank-pill b')?.textContent || '',
      medalLabelVisible: (() => {
        const label = document.querySelector('.vm-rank-logo-tag .vm-rank-medal-label');
        return label ? getComputedStyle(label).display !== 'none' : true;
      })(),
      medalAria: document.querySelector('.vm-rank-logo-tag .vm-rank-medal')?.getAttribute('aria-label') || '',
      overflow: document.querySelector('.topbar .nav')?.scrollWidth - document.querySelector('.topbar .nav')?.clientWidth,
    }));
    if (toolbar.roleBadges || toolbar.title !== 'Tân Thủ' || toolbar.medalLabelVisible || toolbar.medalAria !== 'Huy chương Kim Cương' || toolbar.overflow > 1) {
      throw new Error(`Student toolbar is not compact: ${JSON.stringify(toolbar)}`);
    }

    await page.goto('http://127.0.0.1:8000/thanh-tuu?preview=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.achievement-region', { timeout: 15000 });
    const map = {
      regions: await page.locator('.achievement-region').count(),
      levels: await page.locator('.achievement-node').count(),
      gates: await page.locator('.achievement-gate').count(),
      sanctuary: await page.locator('#companionSanctuary').isVisible(),
      badges: await page.locator('.achievement-badge').count(),
      openDialogs: await page.locator('dialog[open]').count(),
    };
    if (process.env.VM_RANK_DIAGNOSTIC) {
      map.fixedLayers = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return { element, style, rect };
      }).filter((item) => item.style.position === 'fixed' && item.style.display !== 'none' && item.style.visibility !== 'hidden' && item.rect.width > innerWidth * .8 && item.rect.height > innerHeight * .8).map((item) => ({
        tag: item.element.tagName,
        id: item.element.id,
        className: item.element.className,
        background: item.style.backgroundColor,
        opacity: item.style.opacity,
        zIndex: item.style.zIndex,
      })));
      console.log(`DIAGNOSTIC ${JSON.stringify(map.fixedLayers)}`);
      console.log(`THEME ${JSON.stringify(await page.evaluate(() => ({ html:document.documentElement.getAttribute('data-theme'), body:document.body.getAttribute('data-theme'), bg:getComputedStyle(document.body).backgroundColor, ink:getComputedStyle(document.body).getPropertyValue('--ink-2'), heading:getComputedStyle(document.querySelector('.achievement-map-head h2')).color })))}`);
    }
    if (map.regions !== 11 || map.levels !== 44 || map.gates !== 10 || !map.sanctuary || map.badges < 15 || map.openDialogs !== 0) {
      throw new Error(`Rank map is incomplete: ${JSON.stringify(map)}`);
    }
    if (process.env.VM_RANK_SCREENSHOT) {
      await page.screenshot({ path: process.env.VM_RANK_SCREENSHOT, fullPage: true });
    }

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('http://127.0.0.1:8000/trang-chu?preview=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vmCompanionDock', { timeout: 15000 });
    const mobile = await page.evaluate(() => {
      const dock = document.querySelector('#vmCompanionDock').getBoundingClientRect();
      const logo = document.querySelector('.topbar .logo');
      const brandVinh = document.querySelector('.topbar .brand-vinh');
      const brandMath = document.querySelector('.topbar .brand-math');
      const pill = document.querySelector('.vm-rank-logo-tag .vm-rank-pill');
      const title = pill && pill.querySelector('b');
      const brandRight = brandMath && brandMath.getBoundingClientRect().right;
      const pillLeft = pill && pill.getBoundingClientRect().left;
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dockInside: dock.left >= 0 && dock.right <= innerWidth && dock.top >= 0 && dock.bottom <= innerHeight,
        brandVisible: !!(brandVinh && brandMath && brandVinh.getBoundingClientRect().width > 8 && brandMath.getBoundingClientRect().width > 8 && brandRight <= pillLeft),
        logoOverflow: logo ? logo.scrollWidth - logo.clientWidth : 999,
        logoWidth: logo ? logo.getBoundingClientRect().width : 0,
        logoScrollWidth: logo ? logo.scrollWidth : 0,
        rankTitleVisible: title ? getComputedStyle(title).display !== 'none' : true,
        rankWidth: pill ? pill.getBoundingClientRect().width : 999,
        rankLabel: pill ? pill.getAttribute('aria-label') : '',
      };
    });
    if (mobile.overflow > 1 || !mobile.dockInside || !mobile.brandVisible || mobile.logoOverflow > 1 || mobile.rankTitleVisible || mobile.rankWidth > 31 || mobile.rankLabel !== 'Cấp bậc Tân Thủ · Kim Cương') throw new Error(`Mobile rank UI overflows or hides the brand: ${JSON.stringify(mobile)}`);
    if (process.env.VM_RANK_MOBILE_SCREENSHOT) await page.screenshot({ path: process.env.VM_RANK_MOBILE_SCREENSHOT, fullPage: false });
    if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join(' | ')}`);

    console.log(`PASS rank system browser: ${map.regions} major ranks, ${map.levels} levels, companion and mobile layout`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
