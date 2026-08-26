'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

const chrome = process.env.VM_CHROME_PATH;
if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');

const commonCss = ['css/tokens.css', 'css/vinhmath.css']
  .map((file) => fs.readFileSync(file, 'utf8')).join('\n');

function isolatedPage(file) {
  const source = fs.readFileSync(file, 'utf8');
  const bodyMatch = source.match(/<body([^>]*)>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) throw new Error(`Missing body in ${file}`);
  const inlineCss = Array.from(source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi), (match) => match[1]).join('\n');
  const body = bodyMatch[2].replace(/<script\b[\s\S]*?<\/script>/gi, '');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${commonCss}\n${inlineCss}</style></head><body${bodyMatch[1]}>${body}</body></html>`;
}

const pages = [
  { file:'quan-tri.html', first:'.admin-toolbar', essential:'#adminToolSearch', redundant:'Trung tâm quản trị' },
  { file:'quan-tri-lop.html', first:'.sidebar-classes', essential:'.sidebar-classes-head button', redundant:'Quản lý Khối & Lớp học' },
  { file:'quan-tri-cham-bai.html', first:'.filters', essential:'#loc-cho', redundant:'Chấm bài học sinh nộp' },
  { file:'quan-tri-lich.html', first:'.quick-card', essential:'.quick-card-head a[href="trang-chu#weekCal"]', redundant:'Lịch dạy & phòng học' },
  { file:'quan-tri-hoc-sinh.html', first:'.stat-strip', essential:'#locLop', redundant:'Quản lý học sinh' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    for (const viewport of [{ width:1440, height:900, name:'desktop' }, { width:390, height:844, name:'mobile' }]) {
      await page.setViewportSize({ width:viewport.width, height:viewport.height });
      for (const config of pages) {
        await page.setContent(isolatedPage(config.file), { waitUntil:'domcontentloaded' });
        const result = await page.evaluate(({ firstSelector, essentialSelector, redundant }) => {
          const topbar=document.querySelector('.topbar');
          const first=document.querySelector(firstSelector);
          const essential=document.querySelector(essentialSelector);
          if(!topbar||!first||!essential)return {missing:{topbar:!topbar,first:!first,essential:!essential}};
          const topbarRect=topbar.getBoundingClientRect(),firstRect=first.getBoundingClientRect(),essentialRect=essential.getBoundingClientRect();
          const essentialStyle=getComputedStyle(essential);
          return {
            gap:firstRect.top-topbarRect.bottom,
            firstWidth:firstRect.width,
            essentialVisible:essentialStyle.display!=='none'&&essentialStyle.visibility!=='hidden'&&essentialRect.width>0&&essentialRect.height>0,
            essentialInside:essentialRect.left>=-1&&essentialRect.right<=innerWidth+1,
            pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
            redundantVisible:document.body.innerText.includes(redundant),
          };
        }, { firstSelector:config.first, essentialSelector:config.essential, redundant:config.redundant });
        if (result.missing || result.gap < -1 || result.gap > 24 || !result.firstWidth || !result.essentialVisible || !result.essentialInside || result.pageOverflow || result.redundantVisible) {
          throw new Error(`${config.file} ${viewport.name} compact header failed: ${JSON.stringify(result)}`);
        }
      }
    }
    console.log('PASS authenticated compact headers desktop/mobile layout');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
