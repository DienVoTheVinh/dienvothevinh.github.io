const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const source = fs.readFileSync('quan-tri-lop.html', 'utf8');
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/i);
  const helperMatch = source.match(/var lessonEditorTrigger = null;([\s\S]*?)async function moFormThemBaiGiang/);
  if (!styleMatch || !helperMatch) throw new Error('Lesson editor styles or open helper are missing');

  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>:root{--bg:#fff;--surface:#fff;--surface-solid:#fff;--surface-2:#f7f5f1;--line:#ddd;--line-2:#ccc;--accent:#d97706;--ink:#211;--ink-2:#433;--ink-3:#766;--err:#b22;--shadow:none}${styleMatch[1]}</style>
      <button id="trigger">Chỉnh sửa</button>
      <div class="modal lesson-editor-modal" id="modalForm" style="display:none">
        <div class="modal-content lesson-editor-content">
          <div class="lesson-editor-loading" id="lessonEditorLoading" hidden><div><span class="lesson-editor-spinner"></span><span>Đang chuẩn bị nội dung…</span></div></div>
          <div class="lesson-editor-head"><span class="lesson-editor-kicker">Không gian soạn bài</span><h2 id="modalTieuDe">Bài giảng</h2><button class="modal-close">×</button></div>
          <div class="lesson-editor-tabs">${Array.from({ length: 6 }, (_, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}">Mục bài giảng ${i + 1}</button>`).join('')}</div>
          <form class="lesson-editor-form"><div class="lesson-editor-scroll" id="lessonEditorScroll">
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div class="field"><label>Giáo viên</label><input class="input"></div><div class="field"><label>Ngày dạy</label><input class="input"></div></div>
            <div style="height:1100px">Nội dung dài</div>
          </div><div class="lesson-editor-actions"><button id="nutXoa">Xoá bài giảng</button><div class="lesson-editor-actions-main"><button>Huỷ</button><button>Lưu bài giảng</button></div></div></form>
        </div>
      </div>`);

    await page.evaluate((helper) => {
      window.$ = (id) => document.getElementById(id);
      (0, eval)(`var lessonEditorTrigger = null;${helper}`);
      document.getElementById('trigger').focus();
      window.hienFormBaiGiang('Chỉnh sửa bài giảng', false);
    }, helperMatch[1]);
    await page.waitForTimeout(50);

    const metrics = await page.evaluate(() => {
      const modal = document.getElementById('modalForm');
      const content = document.querySelector('.lesson-editor-content');
      const scroll = document.getElementById('lessonEditorScroll');
      const tabs = document.querySelector('.lesson-editor-tabs');
      const row = document.querySelector('.form-row');
      const actions = document.querySelector('.lesson-editor-actions');
      scroll.scrollTop = scroll.scrollHeight;
      window.hienFormBaiGiang('Thêm bài giảng mới', false);
      const contentRect = content.getBoundingClientRect();
      const actionRect = actions.getBoundingClientRect();
      return {
        contentTopVisible: contentRect.top >= 0 && contentRect.top < 24,
        contentFits: contentRect.bottom <= innerHeight + 1,
        resetToTop: scroll.scrollTop === 0 && modal.scrollTop === 0,
        tabsSingleLine: getComputedStyle(tabs).flexWrap === 'nowrap',
        tabsScrollable: tabs.scrollWidth > tabs.clientWidth,
        mobileSingleColumn: getComputedStyle(row).gridTemplateColumns.split(' ').length === 1,
        actionsVisible: actionRect.top >= 0 && actionRect.bottom <= innerHeight + 1,
        bodyLocked: document.body.classList.contains('vm-lesson-editor-open'),
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      };
    });

    for (const [name, passed] of Object.entries(metrics)) {
      if (!passed) throw new Error(`Mobile lesson editor failed: ${name}`);
    }
    console.log('PASS mobile lesson editor position and layout');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
