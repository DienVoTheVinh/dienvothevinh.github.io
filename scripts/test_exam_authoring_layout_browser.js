const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const tokens = fs.readFileSync('css/tokens.css', 'utf8');
  const shared = fs.readFileSync('css/vinhmath.css', 'utf8');
  const pageSource = fs.readFileSync('quan-tri-de.html', 'utf8');
  const examCss = fs.readFileSync('css/exam-admin.css', 'utf8');
  const body = pageSource.match(/<body>([\s\S]*?)<script/)[1];
  const practiceSource = fs.readFileSync('luyen-de.html', 'utf8');
  const practiceCss = [...practiceSource.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
    await page.setContent(`<!doctype html><html><head><style>${tokens}\n${shared}\n${examCss}</style></head><body>${body}</body></html>`);
    const desktop = await page.evaluate(() => {
      const workflow = document.querySelector('.exam-workflow').getBoundingClientRect();
      const stack = document.querySelector('.exam-stack').getBoundingClientRect();
      const editor = document.querySelector('.exam-editor-card').getBoundingClientRect();
      return {
        columns: getComputedStyle(document.querySelector('.exam-workflow')).gridTemplateColumns.split(' ').length,
        stackWidth: stack.width,
        editorWidth: editor.width,
        toolboxInsideRail: !!document.querySelector('.exam-stack .exam-toolbox-card'),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        workflowWidth: workflow.width,
      };
    });
    if (desktop.columns !== 2 || desktop.stackWidth > 360 || desktop.editorWidth < 1000 || !desktop.toolboxInsideRail || desktop.overflow || desktop.workflowWidth < 1500) {
      throw new Error(`Desktop exam authoring is not screen-efficient: ${JSON.stringify(desktop)}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({
      columns: getComputedStyle(document.querySelector('.exam-workflow')).gridTemplateColumns.split(' ').length,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    if (mobile.columns !== 1 || mobile.overflow) throw new Error(`Mobile exam authoring overflow: ${JSON.stringify(mobile)}`);

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
