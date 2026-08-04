const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const source = fs.readFileSync('quan-tri-lop.html', 'utf8');
  const sharedCss = fs.readFileSync('css/vinhmath.css', 'utf8');
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/i);
  const helperMatch = source.match(/function moFormBaiGiangTrenManHinh([\s\S]*?)async function moFormThemBaiGiang/);
  if (!styleMatch || !helperMatch) throw new Error('Stable lesson editor helper is missing');

  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>:root{--bg:#fff;--surface:#fff;--surface-2:#f7f5f1;--line:#ddd;--line-2:#ccc;--accent:#d97706;--ink:#211;--ink-3:#766;--shadow:none}${sharedCss}</style>
      <style>${styleMatch[1]}</style>
      <div class="modal" id="modalForm" style="display:none"><div class="modal-content" style="max-width:750px"><h2 id="modalTieuDe"></h2><div class="modal-tabs">${'<button>Thông tin</button>'.repeat(6)}</div><form><div class="form-row" style="display:grid;grid-template-columns:1fr 1fr"><input><input></div><div style="height:1200px">Nội dung</div></form></div></div>`);
    await page.evaluate((helper) => {
      window.$ = (id) => document.getElementById(id);
      (0, eval)(`function moFormBaiGiangTrenManHinh${helper}`);
      const modal = document.getElementById('modalForm');
      const content = modal.querySelector('.modal-content');
      modal.style.display = 'flex';
      modal.scrollTop = modal.scrollHeight;
      content.scrollTop = content.scrollHeight;
      window.moFormBaiGiangTrenManHinh('Chỉnh sửa bài giảng');
    }, helperMatch[1]);
    await page.waitForTimeout(50);
    const metrics = await page.evaluate(() => {
      const modal = document.getElementById('modalForm');
      const content = modal.querySelector('.modal-content');
      const rect = content.getBoundingClientRect();
      return {
        visible: rect.top >= 0 && rect.top < innerHeight && rect.bottom > 0,
        reset: modal.scrollTop === 0 && content.scrollTop === 0,
        interactive: getComputedStyle(content).pointerEvents !== 'none',
        noBlockingLoader: !document.querySelector('.lesson-editor-loading'),
        singleColumn: getComputedStyle(document.querySelector('.form-row')).gridTemplateColumns.split(' ').length === 1,
        bodyLocked: document.body.classList.contains('vm-modal-open'),
      };
    });
    for (const [name, passed] of Object.entries(metrics)) if (!passed) throw new Error(`Stable lesson editor failed: ${name}`);
    console.log('PASS stable mobile lesson editor visibility and interaction');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
