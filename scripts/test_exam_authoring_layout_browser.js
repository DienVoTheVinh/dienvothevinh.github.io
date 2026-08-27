const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const tokens = fs.readFileSync('css/tokens.css', 'utf8');
  const shared = fs.readFileSync('css/vinhmath.css', 'utf8');
  const pageSource = fs.readFileSync('quan-tri-de.html', 'utf8');
  if (!/css\/exam-admin\.css\?v=4\.2/.test(pageSource) || !/js\/exam-admin\.js\?v=4\.3/.test(pageSource)) throw new Error('Exam admin layout assets were not cache-busted together');
  const examCss = fs.readFileSync('css/exam-admin.css', 'utf8');
  const examScript = fs.readFileSync('js/exam-admin.js', 'utf8');
  if (!examScript.includes("document.body.classList.remove('bank-import-mode')") || !examScript.includes("document.body.classList.toggle('bank-can-import'") || examScript.includes("document.body.classList.toggle('bank-import-mode'")) {
    throw new Error('Import capability must not reuse the bank-import-mode component class on body');
  }
  const body = pageSource.match(/<body>([\s\S]*?)<script/)[1];
  if (!body.includes('topbar exam-admin-topbar')) throw new Error('Exam admin topbar is missing its isolated layout class');
  const practiceSource = fs.readFileSync('luyen-de.html', 'utf8');
  const practiceCss = [...practiceSource.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 800 } });
    await page.setContent(`<!doctype html><html><head><style>${tokens}\n${shared}\n${examCss}</style></head><body>${body}</body></html>`);
    await page.addScriptTag({ path: 'js/menu-v5.js' });
    await page.evaluate(() => {
      window.apDungMenu('admin', null, null, null);
      window.apDungLogoBadge('admin');
      // Reproduce the authenticated-admin state that exposed the former class
      // collision: legacy JS added this class to body while the import buttons
      // used the same class for their grid layout.
      document.body.classList.add('bank-import-mode');
    });
    const mixedCache = await page.evaluate(() => ({
      bodyDisplay: getComputedStyle(document.body).display,
      importModeDisplay: getComputedStyle(document.querySelector('.bank-import-mode-switch > .bank-import-mode')).display,
    }));
    if (mixedCache.bodyDisplay === 'grid' || mixedCache.importModeDisplay !== 'grid') {
      throw new Error(`New CSS must remain safe with cached legacy JS: ${JSON.stringify(mixedCache)}`);
    }
    await page.addScriptTag({ path: 'js/exam-admin.js' });
    await page.evaluate(() => {
      window.sb = { rpc: async () => ({ data:null, error:{ code:'PGRST202', message:'not installed in layout fixture' } }) };
      window.VMExamAdmin._bankConfigureAccess({ role:'admin' });
      window.VMExamAdmin._syncAuthoringRail();
    });
    const desktop = await page.evaluate(() => {
      const workflow = document.querySelector('.exam-workflow').getBoundingClientRect();
      const stackEl = document.querySelector('.exam-stack');
      const stack = stackEl.getBoundingClientRect();
      const editor = document.querySelector('.exam-editor-card').getBoundingClientRect();
      const topbar = document.querySelector('.topbar').getBoundingClientRect();
      const tabs = document.querySelector('.exam-tabs').getBoundingClientRect();
      const nav = document.querySelector('.topbar .nav').getBoundingClientRect();
      const importModeButton = document.querySelector('.bank-import-mode-switch > .bank-import-mode');
      return {
        bodyDisplay: getComputedStyle(document.body).display,
        legacyImportClassRemoved: !document.body.classList.contains('bank-import-mode'),
        importCapabilityClassPresent: document.body.classList.contains('bank-can-import'),
        columns: getComputedStyle(document.querySelector('.exam-workflow')).gridTemplateColumns.split(' ').length,
        stackWidth: stack.width,
        editorWidth: editor.width,
        toolboxInsideRail: !!document.querySelector('.exam-stack .exam-toolbox-card'),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        workflowWidth: workflow.width,
        railBottom: stack.bottom,
        viewportHeight: innerHeight,
        railScrollable: stackEl.scrollHeight > stackEl.clientHeight + 1,
        railTabIndex: stackEl.tabIndex,
        topbarTop: topbar.top,
        topbarBottom: topbar.bottom,
        tabsTop: tabs.top,
        navWidth: nav.width,
        importModeDisplay: importModeButton ? getComputedStyle(importModeButton).display : '',
      };
    });
    await page.locator('.exam-stack').hover({ position: { x: 120, y: 320 } });
    await page.mouse.wheel(0, 520);
    await page.waitForTimeout(80);
    const railScrollTop = await page.locator('.exam-stack').evaluate((node) => node.scrollTop);
    if (desktop.bodyDisplay === 'grid' || !desktop.legacyImportClassRemoved || !desktop.importCapabilityClassPresent || desktop.importModeDisplay !== 'grid' || desktop.columns !== 2 || desktop.stackWidth > 360 || desktop.editorWidth < 1000 || !desktop.toolboxInsideRail || desktop.overflow || desktop.workflowWidth < 1500 || desktop.railBottom > desktop.viewportHeight - 8 || !desktop.railScrollable || desktop.railTabIndex !== 0 || railScrollTop < 100 || Math.abs(desktop.topbarTop) > 1 || desktop.tabsTop < desktop.topbarBottom || desktop.navWidth < 1500) {
      throw new Error(`Desktop exam authoring is not screen-efficient: ${JSON.stringify(desktop)}`);
    }

    await page.setViewportSize({ width: 2560, height: 1080 });
    const wide = await page.evaluate(() => {
      const workflow = document.querySelector('.exam-workflow').getBoundingClientRect();
      const editor = document.querySelector('.exam-editor-card').getBoundingClientRect();
      const nav = document.querySelector('.topbar .nav').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        workflowWidth: workflow.width,
        editorWidth: editor.width,
        navWidth: nav.width,
      };
    });
    if (wide.overflow || wide.workflowWidth < 2400 || wide.editorWidth < 2050 || wide.navWidth < 1800) {
      throw new Error(`Wide-screen exam authoring wastes or overflows the viewport: ${JSON.stringify(wide)}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      window.VMExamAdmin._syncAuthoringRail();
      const rail = document.querySelector('.exam-stack');
      return {
        columns: getComputedStyle(document.querySelector('.exam-workflow')).gridTemplateColumns.split(' ').length,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        railExpands: rail.clientHeight >= rail.scrollHeight - 1,
      };
    });
    if (mobile.columns !== 1 || mobile.overflow || !mobile.railExpands) throw new Error(`Mobile exam authoring overflow: ${JSON.stringify(mobile)}`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(`<!doctype html><html><head><style>${tokens}\n${shared}\n${practiceCss}</style></head><body><div class="wrap"><div class="practice-shell"><aside class="practice-class-filter" style="display:none"></aside><main class="practice-content">Nội dung</main></div></div></body></html>`);
    const practice = await page.evaluate(() => ({
      columns: getComputedStyle(document.querySelector('.practice-shell')).gridTemplateColumns.split(' ').length,
      contentWidth: document.querySelector('.practice-content').getBoundingClientRect().width,
    }));
    if (practice.columns !== 1 || practice.contentWidth < 1100) throw new Error(`Hidden class filter still collapses the practice page: ${JSON.stringify(practice)}`);
    console.log('PASS wide exam authoring rail + mobile layout + practice exit layout');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
