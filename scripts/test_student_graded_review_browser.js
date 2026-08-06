const fs = require('fs');
const { chromium } = require('playwright');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const asyncStart = source.slice(Math.max(0, start - 6), start) === 'async ' ? start - 6 : start;
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}' && --depth === 0) return source.slice(asyncStart, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

(async () => {
  const source = fs.readFileSync('bai-hoc.html', 'utf8');
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0}.workspace{display:flex;height:700px}.pane{display:none}.workspace.show-content .pane-content{display:flex}.content-body{display:flex;flex:1;flex-direction:column}.sidebar{position:fixed;inset:0 90px 0 0;transform:none}.sidebar:not(.open){transform:translateX(-110%)}.no-content{padding:30px;text-align:center}
    </style><nav id="mucLuc" class="sidebar open"></nav><button id="mucLucScrim"></button><button id="nutMucLuc"></button><button id="tabNoiDung"></button><button id="tabVideo"></button><main id="khongGianHoc" class="workspace show-video"><section class="pane pane-content"><div id="thanNoiDung" class="content-body"></div></section></main><div id="bhAnhLightbox"></div>`);
    const functions = ['btvnEsc','thanhCongCu','batTatMucLuc','hienMobilePane','bhThumbId','extractDriveId','bhXemAnh','bhAnhLightboxLoi','bhAnhThumbLoi','bhAnhThumbs','layKetQuaChamHtml','xemKetQua']
      .map((name) => extractFunction(source, name)).join('\n');
    await page.addScriptTag({ content: `
      function $(id){return document.getElementById(id)}
      var lessonId='lesson-1',nguoiDung={id:'student-1'},details={},window_khongCoVideo=false;
      function switchLesson(){return Promise.resolve()}
      ${functions}
    ` });
    await page.evaluate(() => {
      sb = { from() { return { select() { return this }, eq() { return this }, order() { return this }, limit() { return this }, async maybeSingle() { return { data: { id:'sub-1',submitted_at:'2026-08-05T10:00:00Z',files:[],status:'graded',score:8,feedback:'Làm tốt',graded_files:[{id:'drive-1',link:'https://drive.google.com/file/d/drive-1/view',name:'Bài đã chấm.png'}],is_late:false,student_reflection:null,reviewed_at:null }, error:null }; } }; } };
    });
    await page.evaluate(() => xemKetQua('lesson-1','homework'));
    const success = await page.evaluate(() => ({
      sidebarOpen: document.querySelector('#mucLuc').classList.contains('open'),
      workspaceClass: document.querySelector('#khongGianHoc').className,
      text: document.querySelector('#thanNoiDung').textContent,
      thumbnailCount: document.querySelectorAll('#thanNoiDung img').length,
    }));
    if (success.sidebarOpen) throw new Error('Mobile lesson sidebar still covers the graded result');
    if (!success.workspaceClass.includes('show-content')) throw new Error('Graded result does not activate the mobile content pane');
    if (!success.text.includes('Đã hoàn thành') || !success.text.includes('Làm tốt') || success.thumbnailCount !== 1) throw new Error(`Graded result is incomplete: ${JSON.stringify(success)}`);

    await page.evaluate(() => {
      document.querySelector('#mucLuc').classList.add('open');
      sb = { from() { return { select() { return this }, eq() { return this }, order() { return this }, limit() { return this }, async maybeSingle() { return { data:null, error:{message:'network failed'} }; } }; } };
    });
    await page.evaluate(() => xemKetQua('lesson-1','homework'));
    const failure = await page.evaluate(() => document.querySelector('#thanNoiDung').textContent);
    if (!failure.includes('Chưa tải được bài đã chấm') || !failure.includes('Tải lại kết quả')) throw new Error(`Query failure becomes a blank screen: ${failure}`);

    await page.evaluate(() => {
      document.querySelector('#thanNoiDung').innerHTML = bhAnhThumbs([{id:'drive-2',link:'https://drive.google.com/file/d/drive-2/view',name:'Ảnh chấm.png'}]);
      const img = document.querySelector('#thanNoiDung img');
      bhAnhThumbLoi(img);
    });
    const fallbackVisible = await page.$eval('.bh-thumb-fallback', (el) => getComputedStyle(el).display !== 'none' && el.textContent.includes('Mở ảnh'));
    if (!fallbackVisible) throw new Error('Broken Drive thumbnail has no direct-link fallback');
    console.log('PASS student graded review browser checks');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
