'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

const chrome = process.env.VM_CHROME_PATH;
if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');

function isolatedPage() {
  const source = fs.readFileSync('vmtool.html', 'utf8');
  const bodyMatch = source.match(/<body([^>]*)>([\s\S]*?)<script\b/i);
  if (!bodyMatch) throw new Error('Missing VMTool body');
  const css = ['css/tokens.css', 'css/vinhmath.css', 'css/vmtool.css'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const body = bodyMatch[2].replace(/<script\b[\s\S]*?<\/script>/gi, '');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body${bodyMatch[1]}>${body}</body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    for (const viewport of [{width:1440,height:900,name:'desktop'}, {width:390,height:844,name:'mobile'}]) {
      await page.setViewportSize(viewport);
      await page.setContent(isolatedPage(), {waitUntil:'domcontentloaded'});
      const result = await page.evaluate(() => {
        const topbar = document.querySelector('.topbar');
        const switcher = document.querySelector('.vmtool-tool-switcher');
        const tabs = document.querySelector('.vmtool-tabs');
        const workspace = document.querySelector('.vmtool-workspace');
        const mark = document.querySelector('.vmtool-mark');
        if (!topbar || !switcher || !tabs || !workspace || !mark) return {missing:true};
        const topbarRect = topbar.getBoundingClientRect(), switcherRect = switcher.getBoundingClientRect(), workspaceRect = workspace.getBoundingClientRect();
        return {
          largeTitle: !!document.querySelector('.vmtool-hero,h1'),
          topGap: switcherRect.top - topbarRect.bottom,
          workspaceGap: workspaceRect.top - switcherRect.bottom,
          tabsVisible: tabs.getBoundingClientRect().height > 30,
          markDisplay: getComputedStyle(mark).display,
          overflow: document.documentElement.scrollWidth > innerWidth + 1
        };
      });
      if (result.missing || result.largeTitle || result.topGap < -1 || result.topGap > 24 || result.workspaceGap < 0 || result.workspaceGap > 18 || !result.tabsVisible || result.overflow) {
        throw new Error(`VMTool compact header ${viewport.name} failed: ${JSON.stringify(result)}`);
      }
      if (viewport.name === 'desktop' && result.markDisplay === 'none') throw new Error('Desktop must keep current VMTool mode badge');
      if (viewport.name === 'mobile' && result.markDisplay !== 'none') throw new Error('Mobile must spend the first row on tool tabs');
    }
    console.log('PASS VMTool compact header desktop/mobile layout');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
