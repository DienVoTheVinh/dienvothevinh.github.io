const { chromium } = require('playwright');
const baseUrl = (process.env.VM_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const fs = require('fs');

const executablePath = process.env.VM_CHROME_PATH;
if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => sessionStorage.setItem('vm-guest-mode', 'true'));
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}/trang-chu?preview=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.vm-student-home-grid', { timeout: 15000 });
    await page.evaluate(() => {
      const meet = document.getElementById('khungMeetHoc');
      if (meet && getComputedStyle(meet).display === 'none') meet.style.display = 'block';
    });
    const desktop = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const live = rect('#vmStudentLiveSlot');
      const main = rect('.vm-student-main-card');
      const quick = rect('.vm-student-quick-grid');
      const side = rect('.vm-student-side');
      return {
        roleHead: getComputedStyle(document.querySelector('.vm-role-focus-head')).display,
        liveRight: live.left >= main.right - 1 && live.right <= side.right + 1,
        quickNearLive: quick.top >= live.bottom && quick.top - live.bottom <= 20,
        sideContainsLive: document.querySelector('.vm-student-side').firstElementChild.id === 'vmStudentLiveSlot',
        overflow: document.querySelector('.topbar .nav').scrollWidth - document.querySelector('.topbar .nav').clientWidth,
        menu: [...document.querySelectorAll('.navlinks>a')].map(item => item.textContent.trim())
      };
    });
    if (desktop.roleHead !== 'none' || !desktop.liveRight || !desktop.quickNearLive || !desktop.sideContainsLive || desktop.overflow > 1) {
      throw new Error(`Desktop home layout is invalid: ${JSON.stringify(desktop)}`);
    }
    for (const label of ['BXH', 'VMTool']) if (!desktop.menu.includes(label)) throw new Error(`${label} is missing from primary student navigation`);
    if (desktop.menu.includes('Thêm')) throw new Error('Student navigation still contains the Thêm dropdown');

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      const top = selector => document.querySelector(selector).getBoundingClientRect().top;
      return {
        live: top('#vmStudentLiveSlot'),
        main: top('.vm-student-main-card'),
        quick: top('.vm-student-quick-grid'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    if (!(mobile.live < mobile.main && mobile.main < mobile.quick) || mobile.overflow > 1) throw new Error(`Mobile home order is invalid: ${JSON.stringify(mobile)}`);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}/ket-qua?preview=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-result-id]', { timeout: 15000 });
    await page.locator('[data-result-id]').first().click();
    await page.waitForSelector('#studentResultDialog[open] .student-result-viewer-bar', { timeout: 15000 });
    const viewer = await page.evaluate(() => {
      const dialog = document.getElementById('studentResultDialog').getBoundingClientRect();
      const bar = document.querySelector('.student-result-viewer-bar').getBoundingClientRect();
      const content = document.querySelector('.student-result-viewer-content').getBoundingClientRect();
      return {
        dialog:{ left:dialog.left, top:dialog.top, width:dialog.width, height:dialog.height },
        viewport:{ width:innerWidth, height:innerHeight },
        barTop:bar.top,
        contentWidth:content.width,
        closeVisible:document.querySelector('.student-result-dialog-close').getBoundingClientRect().width > 0,
        contextLink:!!document.querySelector('.student-result-viewer-actions a[href*="action=graded"]')
      };
    });
    if (Math.abs(viewer.dialog.left) > 1 || Math.abs(viewer.dialog.top) > 1 || Math.abs(viewer.dialog.width - viewer.viewport.width) > 1 || Math.abs(viewer.dialog.height - viewer.viewport.height) > 1 || viewer.barTop !== 0 || viewer.contentWidth < 1100 || !viewer.closeVisible || !viewer.contextLink) {
      throw new Error(`Fullscreen result viewer is invalid: ${JSON.stringify(viewer)}`);
    }
    await page.locator('.student-result-dialog-close').click();
    if (await page.locator('#studentResultDialog[open]').count()) throw new Error('Result viewer did not close back to the result list');
    if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join(' | ')}`);

    console.log('PASS compact student home, primary BXH/VMTool and fullscreen result viewer');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
