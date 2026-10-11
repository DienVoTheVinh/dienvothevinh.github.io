const fs = require('node:fs');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const lesson = fs.readFileSync('bai-hoc.html', 'utf8');
function extract(start, end) {
  const from = lesson.indexOf(start), to = lesson.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'Missing lesson function: ' + start);
  return lesson.slice(from, to);
}
const submit = extract('async function guiBaiNop()', 'function vmXemLoiGiaiVuaMo(');
const celebration = extract('function bhConfetti()', 'function buildPdfUrl(');
const styles = [...lesson.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
const shared = fs.readFileSync('js/vinhmath.js', 'utf8');
const popupManager = shared.slice(shared.indexOf('(function () {', shared.indexOf('/* ---------- POPUP THEO')), shared.indexOf('/* ---------- THƯỞNG NÓNG'));
const modal = lesson.slice(lesson.indexOf('<div id="modalNopBai"'), lesson.indexOf('<!-- Cấu hình và xem trước PDF LaTeX.'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9E0AAAAASUVORK5CYII=', 'base64');

async function fixture(browser, options = {}) {
  const page = await browser.newPage({viewport:options.mobile ? {width:390, height:844} : {width:1280, height:900}, reducedMotion:options.reduced ? 'reduce' : 'no-preference'});
  page.fixtureErrors = [];
  page.on('pageerror', error => page.fixtureErrors.push(error.message));
  await page.route('https://fixture.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/css/vm-progress.css') return route.fulfill({body:fs.readFileSync('css/vm-progress.css', 'utf8'), contentType:'text/css'});
    if (path === '/js/vm-progress.js' || path === '/js/submission-upload.js') return route.fulfill({body:fs.readFileSync('.' + path, 'utf8'), contentType:'text/javascript; charset=utf-8'});
    return route.fulfill({body:'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>', contentType:'text/html; charset=utf-8'});
  });
  await page.goto('https://fixture.test');
  await page.setContent(`<style>${fs.readFileSync('css/tokens.css', 'utf8')}\n${fs.readFileSync('css/vinhmath.css', 'utf8')}\n${styles}</style>${modal}<div id="thanNoiDung"></div>`);
  await page.evaluate(({dark, native}) => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    let el = document.getElementById('modalNopBai');
    el.style.display = 'flex';
    el.querySelector('button').id = 'closeModal';
    if (native) {
      const dialog = document.createElement('dialog');
      [...el.attributes].forEach(attr => dialog.setAttribute(attr.name, attr.value));
      dialog.innerHTML = el.innerHTML; el.replaceWith(dialog); el = dialog;
      Object.assign(el.style, {width:'100%', height:'100%', maxWidth:'none', maxHeight:'none', border:'0', margin:'0', boxSizing:'border-box'});
      el.showModal();
    }
  }, {dark:!!options.dark, native:!!options.native});
  await page.evaluate(({mode}) => {
    window.$ = id => document.getElementById(id);
    window.nopBaiPhanLoai = 'homework'; window.lessonId = 'fixture-lesson'; window.noiDungDangChon = 'btvn';
    window.sb = {auth:{getSession:async () => ({data:{session:{user:{id:'fixture-student'}, access_token:'fixture'}}})}};
    window.vmDatLaiFileDaChon = id => { $(id).value = ''; };
    window.vmThemFileDaChon = () => {};
    window.events = []; window.receipts = {}; window.mode = mode;
    window.transferGate = new Promise(resolve => { window.releaseTransfer = resolve; });
    window.finishGate = new Promise(resolve => { window.releaseFinish = resolve; });
    window.solutionGate = new Promise(resolve => { window.releaseSolution = resolve; });
    window.vmGoiHamFormData = async (_, fd, opts) => {
      const kind = fd.get('kind'); events.push(kind);
      if (kind === 'nop_begin') {
        const id = fd.get('request_id'); receipts[id] ||= {};
        return {upload_id:id, uploaded_files:receipts[id]};
      }
      if (kind === 'nop_file') {
        if (opts.onUploadProgress) opts.onUploadProgress(.5);
        await transferGate;
        if (window.mode === 'file-error') throw Error('Tệp đã thay đổi');
        receipts[fd.get('upload_id')][fd.get('file_index')] = {id:'fixture-file'};
        if (opts.onUploadProgress) opts.onUploadProgress(1);
        return {};
      }
      if (kind === 'nop_finish') {
        await finishGate;
        if (window.mode === 'finish-error') throw Error('Máy chủ chưa ghi nhận bài');
        return {ok:true};
      }
    };
    window.vmLayNguonLatexTheoQuyen = async () => {
      events.push('solution'); await solutionGate;
      if (window.mode === 'solution-error') throw Error('Không tải được lời giải');
      return {unlocked:true, hasSolution:true};
    };
    window.taiBaiDaNop = async () => {
      events.push('refresh');
      if (window.mode === 'refresh-error') throw Error('Không tải được danh sách');
    };
    window.chonNoiDung = async () => {};
    window.renderBTVN = async () => {};
    window.taiMucLuc = async () => {};
    $('closeModal').onclick = () => { $('modalNopBai').remove(); };
  }, {mode:options.mode || 'success'});
  await page.addScriptTag({content:popupManager});
  await page.addScriptTag({url:'https://fixture.test/js/vm-progress.js'});
  await page.addScriptTag({url:'https://fixture.test/js/submission-upload.js'});
  await page.addScriptTag({content:submit + '\n' + celebration + '\n$("nbGui").onclick = function () { window.submitPromise = guiBaiNop(); };'});
  await page.evaluate(({legacyPopover}) => {
    const original = bhConfetti;
    window.bhConfetti = function () { events.push('celebrate'); return original(); };
    if (legacyPopover) HTMLElement.prototype.showPopover = undefined;
  }, {legacyPopover:!!options.legacyPopover});
  await page.locator('#nbFiles').setInputFiles({name:'bai-lam.png', mimeType:'image/png', buffer:png});
  return page;
}

async function start(page) {
  await page.locator('#nbGui').click();
  try { await page.waitForFunction(() => events.includes('nop_file'), null, {timeout:5000}); }
  catch (error) { throw new Error(error.message + '\n' + JSON.stringify(await page.evaluate(() => ({events, notice:$('nbThongBao').textContent, files:$('nbFiles').files.length})))); }
  try { await page.waitForFunction(() => [...document.querySelectorAll('.vm-progress-item')].some(el => el.textContent.includes('Nộp bài') && el.querySelector('progress').value > 20), null, {timeout:2500}); }
  catch (error) { throw new Error(error.message + '\n' + await page.locator('body').innerHTML()); }
  assert.equal(await page.locator('#nbThongBao').textContent().then(t => t.includes('Nộp bài thành công')), false);
  assert.equal(await page.locator('#bh-celebration').count(), 0);
}
async function confirm(page) {
  await page.evaluate(() => releaseTransfer());
  await page.waitForFunction(() => events.includes('nop_finish'));
  const value = await page.locator('.vm-progress-item').filter({hasText:'Nộp bài'}).locator('progress').getAttribute('value');
  assert.ok(Number(value) < 100, 'Must await server confirmation, not just uploaded bytes');
  assert.equal(await page.locator('#bh-celebration').count(), 0);
  await page.evaluate(() => { window.focusBeforeReceipt = document.activeElement; releaseFinish(); });
}
async function success(page, reduced = false) {
  await page.waitForFunction(() => $('nbThongBao').textContent.includes('Nộp bài thành công'), null, {timeout:2500});
  await page.waitForFunction(() => [...document.querySelectorAll('.vm-progress-item')].some(el => el.textContent.includes('Nộp bài') && el.querySelector('progress').value === 100));
  assert.equal(await page.locator('#nbGui').isDisabled(), false);
  assert.equal(await page.locator('#nbFiles').evaluate(el => el.files.length), 0);
  if (reduced) {
    assert.equal(await page.locator('#bh-celebration').count(), 0);
  } else {
    await page.waitForFunction(() => document.querySelector('#bh-celebration'));
    const layer = await page.locator('#bh-celebration').evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return {pieces:el.children.length, hidden:el.getAttribute('aria-hidden'), passive:el.dataset.vmPassiveOverlay, pointerEvents:getComputedStyle(el).pointerEvents, topLayer:el.matches(':popover-open'), supported:typeof el.showPopover === 'function', width:bounds.width, height:bounds.height, vw:innerWidth, vh:innerHeight};
    });
    assert.equal(layer.pieces, 60); assert.equal(layer.hidden, 'true'); assert.equal(layer.passive, 'true');
    assert.equal(layer.pointerEvents, 'none'); assert.equal(layer.topLayer, layer.supported);
    assert.equal(layer.width, layer.vw); assert.equal(layer.height, layer.vh);
    assert.equal(await page.locator('#bh-celebration .bh-confetti-piece').first().evaluate(el => getComputedStyle(el).animationName), 'bhFall');
  }
}

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.VM_CHROME_PATH});
  try {
    for (const options of [{}, {dark:true}, {mobile:true}, {mobile:true, dark:true}, {native:true, dark:true}, {native:true, mobile:true}, {mobile:true, legacyPopover:true}]) {
      const page = await fixture(browser, options);
      await start(page);
      await page.evaluate(() => guiBaiNop()); // The existing guard still ignores double submission.
      assert.equal(await page.evaluate(() => events.filter(e => e === 'nop_begin').length), 1);
      await confirm(page); await success(page);
      assert.equal(await page.evaluate(() => document.activeElement === focusBeforeReceipt), true, 'Celebration must not steal focus');
      if (process.env.VM_QA_OUTPUT && !options.native) {
        fs.mkdirSync(process.env.VM_QA_OUTPUT, {recursive:true});
        await page.waitForTimeout(600);
        await page.screenshot({path:require('node:path').join(process.env.VM_QA_OUTPUT, `${options.mobile ? 'mobile' : 'desktop'}-${options.dark ? 'dark' : 'light'}.png`)});
      }
      await page.evaluate(() => releaseSolution());
      await page.waitForFunction(() => $('nbThongBao').textContent.includes('Xem lời giải ngay'));
      assert.equal(await page.evaluate(() => events.filter(e => e === 'celebrate').length), 1);
      // The passive overlay must never intercept clicks or hold the scroll lock.
      await page.locator('#closeModal').click();
      await page.waitForFunction(() => !document.body.classList.contains('vm-popup-open'));
      if (!options.mobile && !options.dark) await page.waitForFunction(() => !document.querySelector('#bh-celebration'), null, {timeout:6000});
      assert.deepEqual(page.fixtureErrors, []);
      await page.close();
    }
    for (const mode of ['solution-error', 'refresh-error']) {
      const page = await fixture(browser, {mode});
      await start(page); await confirm(page); await success(page);
      await page.evaluate(() => releaseSolution());
      await page.waitForTimeout(100);
      assert.match(await page.locator('#nbThongBao').textContent(), /Nộp bài thành công/);
      assert.deepEqual(page.fixtureErrors, []);
      await page.close();
    }
    for (const mode of ['file-error', 'finish-error']) {
      const page = await fixture(browser, {mode});
      await start(page);
      await page.evaluate(() => { releaseTransfer(); releaseFinish(); });
      await page.waitForFunction(() => $('nbThongBao').textContent.startsWith('Lỗi:'));
      assert.equal(await page.locator('#bh-celebration').count(), 0);
      assert.equal(await page.locator('#nbFiles').evaluate(el => el.files.length), 1, 'Keep files for retry');
      assert.equal(await page.locator('#nbGui').isDisabled(), false);
      await page.waitForFunction(() => [...document.querySelectorAll('.vm-progress-item')].some(el => el.textContent.includes('Nộp bài') && el.dataset.state === 'error' && el.querySelector('progress').value < 100));
      assert.equal(await page.evaluate(() => events.includes('solution')), false);
      const before = await page.evaluate(() => events.filter(e => e === 'nop_file').length);
      await page.evaluate(() => { window.mode = 'success'; });
      await page.locator('#nbGui').click();
      await success(page);
      const after = await page.evaluate(() => events.filter(e => e === 'nop_file').length);
      assert.equal(after - before, mode === 'finish-error' ? 0 : 1, 'Retry only missing files');
      assert.deepEqual(page.fixtureErrors, []);
      await page.close();
    }
    const reduced = await fixture(browser, {mobile:true, reduced:true});
    await start(reduced); await confirm(reduced); await success(reduced, true);
    await reduced.close();
    const switched = await fixture(browser);
    await start(switched); await confirm(switched); await success(switched);
    await switched.evaluate(() => { nopBaiPhanLoai = 'homework_bonus'; $('nbThongBao').textContent = 'Bài tập khác'; releaseSolution(); });
    await switched.waitForTimeout(100);
    assert.equal(await switched.locator('#nbThongBao').textContent(), 'Bài tập khác');
    await switched.close();
    const visualFailure = await fixture(browser);
    await visualFailure.evaluate(() => { window.bhConfetti = () => { throw Error('Animation unavailable'); }; });
    await start(visualFailure); await confirm(visualFailure); await success(visualFailure, true);
    await visualFailure.close();
    console.log('PASS: confirmed submissions celebrate once; percentages, desktop/mobile themes, native dialogs, cleanup, reduced motion, failures/retry and stale views');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
