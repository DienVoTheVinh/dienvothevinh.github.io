const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const html = fs.readFileSync('quan-tri-cham-bai.html', 'utf8');
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  const start = html.indexOf('/* ===== Viết trực tiếp lên ảnh bài nộp');
  const end = html.indexOf('/* ===== Ảnh chấm trả', start);
  if (start < 0 || end < 0) throw new Error('Cannot extract the image annotation module');
  const moduleSource = html.slice(start, end);
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>:root{--surface:#fff;--surface-2:#f5f4f1;--line:#ddd;--accent:#d79008;--accent-soft:#fff3d6;--ink:#171717;--ink-2:#444;--ink-3:#666}${css}</style>
      <div id="danchamtt-sub"></div>`);
    await page.addScriptTag({ content: `
      window.$ = (id) => document.getElementById(id);
      window._chbGalleries = { gallery: [
        { id:'image-a', name:'trang-1.jpg' },
        { id:'image-b', name:'trang-2.jpg' },
        { id:'image-c', name:'trang-3.jpg' }
      ] };
      window._attachedFiles = [];
      window._alerts = [];
      window.confirm = () => true;
      window.alert = (message) => window._alerts.push(message);
      window.batSuaCham = () => {};
      window.chamThemFile = (_subId, files) => { window._attachedFiles = files; };
      window.vmGoiHamFormDataBlob = async (_name, fd) => {
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = 1100;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = fd.get('file_id') === 'image-a' ? '#fff8e7' : '#eef6ff';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = '#222'; ctx.font = '42px sans-serif';
        ctx.fillText(String(fd.get('file_id')), 60, 90);
        return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      };
    ` });
    await page.addScriptTag({ content: moduleSource });
    await page.evaluate(() => chamMoVe('sub', 'gallery', 0));
    await page.waitForFunction(() => !chamVeState.loading && chamVeState.index === 0);

    let state = await page.evaluate(() => ({
      open: document.getElementById('chbDrawModal').classList.contains('open'),
      page: document.getElementById('chbDrawPage').textContent,
      prevDisabled: document.getElementById('chbDrawPrev').disabled,
      nextDisabled: document.getElementById('chbDrawNext').disabled,
    }));
    if (!state.open || state.page !== 'Ảnh 1/3' || !state.prevDisabled || state.nextDisabled) throw new Error(`Initial image navigation is wrong: ${JSON.stringify(state)}`);

    await page.evaluate(() => {
      chamVeState.strokes.push({ tool:'pen', color:'#e11d48', width:8, points:[{x:40,y:40},{x:180,y:160}] });
      chamVeDongBoTrang(); chamVeVeLai(false); chamVeCapNhatNut();
    });
    await page.click('#chbDrawNext');
    await page.waitForFunction(() => !chamVeState.loading && chamVeState.index === 1);
    await page.evaluate(() => {
      chamVeState.strokes.push({ tool:'pen', color:'#2563eb', width:8, points:[{x:80,y:80},{x:220,y:200}] });
      chamVeDongBoTrang(); chamVeVeLai(false); chamVeCapNhatNut();
    });
    await page.click('#chbDrawFullscreen');
    state = await page.evaluate(() => {
      const modal = document.getElementById('chbDrawModal');
      const dialog = modal.querySelector('.chb-draw-dialog').getBoundingClientRect();
      return { fullscreen:modal.classList.contains('fullscreen'), width:Math.round(dialog.width), height:Math.round(dialog.height), label:document.getElementById('chbDrawFullscreen').textContent };
    });
    if (!state.fullscreen || state.width !== 1600 || state.height !== 1000 || !state.label.includes('Thu nhỏ')) throw new Error(`Fullscreen annotation does not fill the viewport: ${JSON.stringify(state)}`);
    if (process.env.VM_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.VM_SCREENSHOT_DIR, { recursive:true });
      await page.screenshot({ path:`${process.env.VM_SCREENSHOT_DIR}/grading-annotation-fullscreen.png`, fullPage:false });
    }

    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => !chamVeState.loading && chamVeState.index === 0);
    state = await page.evaluate(() => ({ page:document.getElementById('chbDrawPage').textContent, strokes:chamVeState.strokes.length, save:document.getElementById('chbDrawSave').textContent }));
    if (state.page !== 'Ảnh 1/3' || state.strokes !== 1 || !state.save.includes('2 bản sửa')) throw new Error(`Per-image strokes were not preserved: ${JSON.stringify(state)}`);

    await page.setViewportSize({ width:390, height:844 });
    state = await page.evaluate(() => ({
      dialogWidth:Math.round(document.querySelector('.chb-draw-dialog').getBoundingClientRect().width),
      fullscreenButton:getComputedStyle(document.getElementById('chbDrawFullscreen')).display,
      nextVisible:document.getElementById('chbDrawNext').getBoundingClientRect().right <= innerWidth,
      overflow:document.documentElement.scrollWidth > innerWidth + 1,
    }));
    if (state.dialogWidth > 390 || state.fullscreenButton !== 'none' || !state.nextVisible || state.overflow) throw new Error(`Mobile annotation navigation is not responsive: ${JSON.stringify(state)}`);

    await page.evaluate(() => chamLuuAnhVe());
    await page.waitForFunction(() => window._attachedFiles.length === 2);
    state = await page.evaluate(() => ({ files:window._attachedFiles.map((file) => ({ name:file.name, type:file.type, size:file.size })), open:document.getElementById('chbDrawModal').classList.contains('open'), status:document.getElementById('danchamtt-sub').textContent, alerts:window._alerts }));
    if (state.open || state.files.length !== 2 || state.files.some((file) => file.type !== 'image/jpeg' || file.size < 1000) || !state.status.includes('2 bản viết trực tiếp') || state.alerts.length) throw new Error(`Multi-image annotation export failed: ${JSON.stringify(state)}`);

    console.log('PASS fullscreen multi-image grading annotation, arrows, preserved strokes and batch export');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
