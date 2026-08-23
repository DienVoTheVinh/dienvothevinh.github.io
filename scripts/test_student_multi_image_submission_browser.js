const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const executablePath = process.env.VM_CHROME_PATH;
if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

const lesson = fs.readFileSync(path.resolve(__dirname, '..', 'bai-hoc.html'), 'utf8');
const start = lesson.indexOf('var vmFileSelections = Object.create(null);');
const end = lesson.indexOf('async function taiBaiDaNop()', start);
if (start < 0 || end < 0) throw new Error('Cannot locate multi-image picker functions');
const pickerCode = lesson.slice(start, end);
const cssMatch = lesson.match(/\/\* ===== Chọn nhiều ảnh bài nộp:[\s\S]*?@media\(max-width:520px\)\{[^\n]+/);
if (!cssMatch) throw new Error('Cannot locate multi-image picker CSS');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nYQAAAAASUVORK5CYII=', 'base64');
const payload = (name, type = 'image/png') => ({ name, mimeType: type, buffer: png });

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      :root{--accent:#d79008;--accent-soft:#fff5dc;--surface:#fff;--surface-2:#f5f3ee;--line:#ddd;--line-2:#ccc;--ink:#171717;--ink-2:#555;--ink-3:#777;--ok:#16865a;--warn:#b45309}
      ${cssMatch[0]}
      body{margin:0;padding:12px;font-family:Arial;background:#fafafa}.vm-submit-picker{max-width:560px}
    </style><input type="file" class="vm-submit-file-native" id="nbFiles" accept="image/*,application/pdf" multiple onchange="vmThemFileDaChon('nbFiles','nbFileList')"><label class="vm-submit-pick-button" for="nbFiles"><span>📷</span><span id="nbFilePickerText">Chọn ảnh / PDF</span></label><p class="vm-submit-help">📌 <b>Nộp nhiều ảnh:</b> chọn nhiều trong thư viện; nếu máy chỉ chọn từng ảnh, bấm Thêm ảnh / PDF để chọn tiếp.</p><div id="nbSelectionSummary" class="vm-submit-selection-summary"></div><div id="nbFileList" class="vm-submit-file-grid" role="list"></div><div id="nbDanAnhTrangThai"></div>`);
    await page.addScriptTag({ content: `function $(id){return document.getElementById(id)};${pickerCode}` });

    const input = page.locator('#nbFiles');
    await input.setInputFiles(payload('trang-1.png'));
    await input.setInputFiles(payload('trang-2.png'));
    let state = await page.evaluate(() => ({
      files: document.getElementById('nbFiles').files.length,
      cards: document.querySelectorAll('.vm-submit-file-card').length,
      ticks: document.querySelectorAll('.vm-submit-file-check').length,
      picker: document.getElementById('nbFilePickerText').textContent,
      summary: document.getElementById('nbSelectionSummary').textContent,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tickSize: document.querySelector('.vm-submit-file-check').getBoundingClientRect().width,
    }));
    if (state.files !== 2 || state.cards !== 2 || state.ticks !== 2 || state.picker !== 'Thêm ảnh / PDF' || !state.summary.includes('Đã chọn 2 tệp') || state.overflow > 1 || state.tickSize < 28) {
      throw new Error(`Multi-image selection is not clear or cumulative: ${JSON.stringify(state)}`);
    }
    if (process.env.VM_SUBMISSION_SCREENSHOT) await page.screenshot({ path: process.env.VM_SUBMISSION_SCREENSHOT, fullPage: true });

    await page.locator('.vm-submit-file-remove').first().click();
    state = await page.evaluate(() => ({ files: document.getElementById('nbFiles').files.length, cards: document.querySelectorAll('.vm-submit-file-card').length }));
    if (state.files !== 1 || state.cards !== 1) throw new Error(`Removing a selected image failed: ${JSON.stringify(state)}`);

    await page.evaluate(() => vmDatLaiFileDaChon('nbFiles', 'nbFileList'));
    await input.setInputFiles(Array.from({ length: 12 }, (_, i) => payload(`anh-${i + 1}.png`)));
    await input.setInputFiles(payload('anh-13.png'));
    state = await page.evaluate(() => ({
      files: document.getElementById('nbFiles').files.length,
      cards: document.querySelectorAll('.vm-submit-file-card').length,
      warning: document.getElementById('nbDanAnhTrangThai').textContent,
    }));
    if (state.files !== 12 || state.cards !== 12 || !state.warning.includes('giới hạn 12 tệp')) throw new Error(`12-file limit failed: ${JSON.stringify(state)}`);
    if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

    console.log('PASS student multi-image picker: cumulative selection, clear ticks, removal, mobile layout and 12-file limit');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
