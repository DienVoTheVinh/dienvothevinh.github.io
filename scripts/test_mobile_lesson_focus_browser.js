const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const lesson = fs.readFileSync('bai-hoc.html', 'utf8');
  const sharedCss = fs.readFileSync('css/vinhmath.css', 'utf8');
  const inlineCss = [...lesson.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to an installed Chromium browser');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${sharedCss}\n${inlineCss}</style>
      <header class="topbar-lesson"><div class="left"><button class="lesson-menu-btn">☰</button><a class="back-btn">‹</a><div id="badgeGiaoVien"><span class="badge">Thầy Vinh</span><span class="badge lesson-partner-chip">M.A.P</span></div></div><button id="themeBtn">☀</button></header>
      <nav class="sidebar open" id="mucLuc"><div class="sidebar-inner"><div class="sb-head"><span>Mục lục bài giảng</span><button class="sb-close">×</button></div><div class="ml-topic open"><div class="ml-topic-hd">Chuyên đề 1</div><div class="ml-topic-body"><div class="ml-bai"><div class="ml-bai-hd"><span class="ten">Bài học mẫu</span></div></div></div></div></div></nav>
      <div class="lesson-action-shell is-collapsed" data-action-key="linked-exam"><a id="linkedExamBanner">Vào làm ngay</a><button class="lesson-action-collapse">−</button><button class="lesson-action-restore"><span>📝 Bài kiểm tra</span><small>Mở lại →</small></button></div>`);

    const metrics = await page.evaluate(() => {
      const sidebar = document.getElementById('mucLuc').getBoundingClientRect();
      return {
        sidebarWidth: sidebar.width,
        viewportWidth: innerWidth,
        restoreDisplay: getComputedStyle(document.querySelector('.lesson-action-restore')).display,
        bannerDisplay: getComputedStyle(document.getElementById('linkedExamBanner')).display,
        partnerDisplay: getComputedStyle(document.querySelector('.lesson-partner-chip')).display,
        closeDisplay: getComputedStyle(document.querySelector('.sb-close')).display,
      };
    });

    if (metrics.sidebarWidth > metrics.viewportWidth * 0.8) throw new Error('Mobile table of contents still occupies nearly the full screen');
    if (metrics.restoreDisplay === 'none' || metrics.bannerDisplay !== 'none') throw new Error('Lesson focus control does not collapse to a restore bar');
    if (metrics.partnerDisplay !== 'none') throw new Error('Partner logo still competes for mobile header space');
    if (metrics.closeDisplay === 'none') throw new Error('Mobile table of contents lacks its close control');
    console.log('PASS mobile lesson focus layout browser checks');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
