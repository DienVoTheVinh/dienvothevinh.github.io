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
    await page.waitForSelector('#khungMeetHoc.vm-meet-card', { state:'visible', timeout: 15000 });
    await page.waitForSelector('#vmCompanionDock .vm-pet-egg', { timeout: 15000 });
    if (await page.locator('.vm-egg-choice').count()) throw new Error('Guest preview must not open a state-changing egg chooser');
    if (!await page.getByText('BXH', { exact: true }).count()) throw new Error('BXH is missing from student navigation');
    if (!await page.getByText('Bài tập', { exact: true }).count()) throw new Error('Bài tập is missing from student navigation');
    const homeText = await page.locator('#vmRankHome').innerText();
    if (!homeText.includes('Tân Thủ') || !homeText.includes('Kim Cương')) throw new Error(`Current rank is missing on Today: ${homeText}`);
    const studentHome = await page.evaluate(() => {
      const live = document.querySelector('#vmStudentLiveSlot').getBoundingClientRect();
      const grid = document.querySelector('.vm-student-home-grid').getBoundingClientRect();
      const main = document.querySelector('.vm-student-main-card').getBoundingClientRect();
      const time = document.querySelector('#vmStudentClockTime')?.textContent || '';
      const progress = document.querySelector('.vm-rank-home-progress');
      const rank = document.querySelector('.vm-rank-home-card').getBoundingClientRect();
      const schedule = document.querySelector('.vm-meet-schedule-panel').getBoundingClientRect();
      const clock = document.querySelector('.vm-meet-clock').getBoundingClientRect();
      return {
        liveRightOfFeed: live.left >= main.right - 1 && live.right <= grid.right + 1,
        columnsAligned: Math.abs(live.top - main.top) < 2,
        time,
        progressValue: Number(progress?.getAttribute('aria-valuenow')),
        progressWidth: progress?.querySelector('i')?.getBoundingClientRect().width || 0,
        rankHeight: rank.height,
        largeRankIcon: document.querySelectorAll('.vm-rank-home-icon').length,
        clockInsideSchedule: clock.left >= schedule.left && clock.right <= schedule.right && clock.top >= schedule.top && clock.bottom <= schedule.bottom,
        vietnamLabel: document.querySelector('.vm-meet-clock')?.textContent.includes('GIỜ VIỆT NAM') || false,
      };
    });
    if (!studentHome.liveRightOfFeed || !studentHome.columnsAligned || !/^\d{2}:\d{2}:\d{2}$/.test(studentHome.time) || studentHome.progressValue !== 14 || studentHome.progressWidth <= 0 || studentHome.rankHeight > 90 || studentHome.largeRankIcon || !studentHome.clockInsideSchedule || studentHome.vietnamLabel) throw new Error(`Student home priority blocks are incomplete: ${JSON.stringify(studentHome)}`);
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
    if (process.env.VM_HOME_SCREENSHOT) {
      const dailyPopup = page.locator('#popupChaoNgay');
      if (await dailyPopup.count()) await page.evaluate(() => window.dongPopupChaoNgay && window.dongPopupChaoNgay());
      await page.waitForTimeout(700);
      await page.screenshot({ path: process.env.VM_HOME_SCREENSHOT, fullPage: true });
    }

    await page.goto('http://127.0.0.1:8000/thanh-tuu?preview=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.realm-landmark', { timeout: 15000 });
    const map = {
      landmarks: await page.locator('.realm-landmark').count(),
      levels: await page.locator('.realm-detail .achievement-node').count(),
      gates: await page.locator('.achievement-gate').count(),
      route: await page.locator('.realm-route-progress').count(),
      detail: await page.locator('#realmDetail').isVisible(),
      sanctuary: await page.locator('#companionSanctuary').isVisible(),
      badges: await page.locator('.achievement-badge').count(),
      timeline: await page.locator('.timeline-entry').count(),
      currentRealms: await page.locator('.realm-landmark.realm-current').count(),
      selectedRealms: await page.locator('.realm-landmark.selected').count(),
      openDialogs: await page.locator('dialog[open]').count(),
      sunkenEffect: await page.evaluate(() => getComputedStyle(document.querySelector('.achievement-map'), '::before').content),
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
    if (map.landmarks !== 11 || map.levels !== 4 || map.gates !== 1 || map.route !== 1 || !map.detail || !map.sanctuary || map.badges < 15 || map.timeline < 2 || map.currentRealms !== 1 || map.selectedRealms !== 1 || map.openDialogs !== 0 || map.sunkenEffect !== 'none') {
      throw new Error(`Rank map is incomplete: ${JSON.stringify(map)}`);
    }
    await page.locator('.realm-landmark[data-realm-index="3"]').click();
    const selectedRealm = await page.evaluate(() => ({
      title: document.querySelector('#realmDetail h3')?.textContent || '',
      medals: document.querySelectorAll('#realmDetail .achievement-node').length,
      selected: document.querySelectorAll('.realm-landmark.selected').length,
    }));
    if (selectedRealm.title !== 'Học Giỏi' || selectedRealm.medals !== 4 || selectedRealm.selected !== 1) throw new Error(`Realm detail selection failed: ${JSON.stringify(selectedRealm)}`);
    await page.locator('.realm-landmark.realm-current').click();
    const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.locator('#themeBtn').click();
    const themeAfter = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      mapBackground: getComputedStyle(document.querySelector('.achievement-map')).backgroundColor,
      detailBackground: getComputedStyle(document.querySelector('#realmDetail')).backgroundColor,
    }));
    if (themeAfter.theme === themeBefore || themeAfter.mapBackground === 'rgba(0, 0, 0, 0)' || themeAfter.detailBackground === 'rgba(0, 0, 0, 0)') throw new Error(`Realm map theme switch failed: ${JSON.stringify({themeBefore, themeAfter})}`);
    await page.locator('#themeBtn').click();
    if (process.env.VM_RANK_SCREENSHOT) {
      await page.screenshot({ path: process.env.VM_RANK_SCREENSHOT, fullPage: true });
    }

    await page.goto('http://127.0.0.1:8000/luyen-de?preview=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vmPracticeClassFilter', { state: 'visible', timeout: 15000 });
    const practice = await page.evaluate(() => {
      const filter = document.querySelector('#vmPracticeClassFilter').getBoundingClientRect();
      const content = document.querySelector('.practice-content').getBoundingClientRect();
      const tag = document.querySelector('.practice-specialized-tag');
      const tagStyle = tag && getComputedStyle(tag);
      return {
        filterBeforeContent: filter.right < content.left,
        columns: getComputedStyle(document.querySelector('.practice-shell')).gridTemplateColumns,
        specializedVisible: !tag || tag.getBoundingClientRect().width > 20,
        specializedContrast: !tagStyle || tagStyle.color !== tagStyle.backgroundColor,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    if (!practice.filterBeforeContent || !practice.specializedVisible || !practice.specializedContrast || practice.overflow > 1) throw new Error(`Practice desktop layout is incomplete: ${JSON.stringify(practice)}`);
    if (process.env.VM_PRACTICE_SCREENSHOT) await page.screenshot({ path: process.env.VM_PRACTICE_SCREENSHOT, fullPage: true });

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
    if (process.env.VM_HOME_MOBILE_SCREENSHOT) {
      if (await page.locator('#popupChaoNgay').count()) await page.evaluate(() => window.dongPopupChaoNgay && window.dongPopupChaoNgay());
      await page.waitForTimeout(700);
      await page.screenshot({ path: process.env.VM_HOME_MOBILE_SCREENSHOT, fullPage: true });
    }
    if (process.env.VM_RANK_MOBILE_SCREENSHOT) await page.screenshot({ path: process.env.VM_RANK_MOBILE_SCREENSHOT, fullPage: false });
    await page.goto('http://127.0.0.1:8000/thanh-tuu?preview=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.timeline-entry', { timeout: 15000 });
    const mobileMap = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      landmarksInside: Array.from(document.querySelectorAll('.realm-landmark')).every((item) => { const r=item.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
      detailInside: (() => { const r=document.querySelector('#realmDetail').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })(),
      timelineInside: Array.from(document.querySelectorAll('.timeline-entry')).every((item) => { const r=item.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
    }));
    if (mobileMap.overflow > 1 || !mobileMap.landmarksInside || !mobileMap.detailInside || !mobileMap.timelineInside) throw new Error(`Realm map overflows on mobile: ${JSON.stringify(mobileMap)}`);
    if (process.env.VM_RANK_MAP_MOBILE_SCREENSHOT) await page.screenshot({ path: process.env.VM_RANK_MAP_MOBILE_SCREENSHOT, fullPage: true });
    if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join(' | ')}`);

    console.log(`PASS rank system browser: ${map.landmarks} map landmarks, focused medal detail, companion and mobile layout`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
