const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const source = fs.readFileSync('quan-tri-lop.html', 'utf8');
  const sharedCss = fs.readFileSync('css/vinhmath.css', 'utf8');
  const sharedJs = fs.readFileSync('js/vinhmath.js', 'utf8');
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/i);
  const helperMatch = source.match(/function moFormBaiGiangTrenManHinh([\s\S]*?)async function moFormThemBaiGiang/);
  const popupStart = sharedJs.indexOf('/* ---------- POPUP THEO');
  const popupCodeStart = sharedJs.indexOf('(function () {', popupStart);
  const popupEnd = sharedJs.indexOf('/* ----------', popupCodeStart + 20);
  if (!styleMatch || !helperMatch || popupStart < 0 || popupCodeStart < 0 || popupEnd < 0) {
    throw new Error('Stable lesson editor or popup helper is missing');
  }
  const popupCode = sharedJs.slice(popupCodeStart, popupEnd);
  if (!source.includes('id="modalForm" data-vm-popup-position="native"')) {
    throw new Error('Lesson editor must opt out of click-positioned popup handling');
  }

  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>:root{--bg:#fff;--surface:#fff;--surface-2:#f7f5f1;--line:#ddd;--line-2:#ccc;--accent:#d97706;--ink:#211;--ink-3:#766;--shadow:none}${sharedCss}</style>
      <style>${styleMatch[1]}</style>
      <div class="modal" id="modalForm" data-vm-popup-position="native" style="display:none"><div class="modal-content" style="max-width:750px"><div id="lessonEditorLoading" style="position:absolute;inset:0;z-index:999999;background:#000"></div><h2 id="modalTieuDe"></h2><div class="modal-tabs">${'<button>Thông tin</button>'.repeat(6)}</div><form><div class="form-row" style="display:grid;grid-template-columns:1fr 1fr"><input id="lessonTitle"><input></div><div style="height:1200px">Nội dung</div></form></div></div>`);
    await page.evaluate(({ helper, popup }) => {
      window.$ = (id) => document.getElementById(id);
      (0, eval)(popup);
      (0, eval)(`function moFormBaiGiangTrenManHinh${helper}`);
      const modal = document.getElementById('modalForm');
      const content = modal.querySelector('.modal-content');
      modal.style.display = 'flex';
      window.legacyLoaderDisabled = getComputedStyle(document.getElementById('lessonEditorLoading')).display === 'none';
      modal.scrollTop = modal.scrollHeight;
      content.scrollTop = content.scrollHeight;
      window.moFormBaiGiangTrenManHinh('Chỉnh sửa bài giảng');
    }, { helper: helperMatch[1], popup: popupCode });
    await page.waitForTimeout(50);
    const metrics = await page.evaluate(() => {
      const modal = document.getElementById('modalForm');
      const content = modal.querySelector('.modal-content');
      const input = document.getElementById('lessonTitle');
      const rect = content.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      const hit = document.elementFromPoint(inputRect.left + inputRect.width / 2, inputRect.top + inputRect.height / 2);
      return {
        visible: rect.top >= 0 && rect.top < innerHeight && rect.bottom > 0,
        reset: modal.scrollTop === 0 && content.scrollTop === 0,
        interactive: getComputedStyle(content).pointerEvents !== 'none',
        cachedLoaderDisabledByCss: window.legacyLoaderDisabled === true,
        noBlockingLoader: !document.getElementById('lessonEditorLoading'),
        inputReceivesTouch: hit === input,
        nativePopupMode: modal.getAttribute('data-vm-popup-position') === 'native' && getComputedStyle(content).position !== 'fixed',
        singleColumn: getComputedStyle(document.querySelector('.form-row')).gridTemplateColumns.split(' ').length === 1,
        bodyLocked: document.body.classList.contains('vm-modal-open'),
      };
    });
    for (const [name, passed] of Object.entries(metrics)) if (!passed) throw new Error(`Stable lesson editor failed: ${name}`);
    console.log('PASS stable mobile lesson editor visibility and interaction');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
