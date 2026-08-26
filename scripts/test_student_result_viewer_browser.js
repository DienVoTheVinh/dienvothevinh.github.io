const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const css = fs.readFileSync('css/student-result-viewer.css','utf8');
  const source = fs.readFileSync('js/student-result-viewer.js','utf8');
  const browser = await chromium.launch({executablePath,headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1024,height:768},hasTouch:true});
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--font-sans:Arial}${css}</style></head><body><dialog id="resultDialog"><button id="origin">Mở ảnh</button><p>Nội dung kết quả phía dưới</p></dialog></body></html>`);
    await page.addScriptTag({content:source});
    await page.evaluate(() => document.getElementById('resultDialog').showModal());
    await page.focus('#origin');
    await page.evaluate(() => {
      const svg = (color,text) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="100%" height="100%" fill="${color}"/><text x="80" y="130" font-size="72">${text}</text></svg>`)}`;
      window.testItems = [{url:svg('#fff4cf','Trang 1'),name:'Bài sửa trang 1'},{url:svg('#dff3ff','Trang 2'),name:'Bài sửa trang 2'},{url:svg('#e9ffe3','Trang 3'),name:'Đáp án chung'}];
      VMStudentResultUI.openMedia(window.testItems,0,{title:'Bài giáo viên đã sửa'});
    });
    let state = await page.evaluate(() => {
      const viewer=document.getElementById('vmResultMediaViewer');
      const shell=viewer.querySelector('.vm-result-media-shell').getBoundingClientRect();
      const top=document.elementFromPoint(shell.left+shell.width/2,shell.top+20);
      return {open:viewer.classList.contains('open'),nativeOpen:viewer.open,tag:viewer.tagName,counter:document.querySelector('[data-media-counter]').textContent,thumbs:document.querySelectorAll('[data-media-index]').length,closeVisible:document.querySelector('[data-media-action="close"]').getBoundingClientRect().width>0,topLayer:viewer.contains(top),parentOpen:document.getElementById('resultDialog').open,overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    if (!state.open || !state.nativeOpen || state.tag !== 'DIALOG' || !state.topLayer || !state.parentOpen || state.counter !== 'Ảnh 1/3' || state.thumbs !== 3 || !state.closeVisible || state.overflow) throw new Error(`Initial nested gallery is wrong: ${JSON.stringify(state)}`);
    await page.click('[data-media-action="next"]');
    state = await page.evaluate(() => ({counter:document.querySelector('[data-media-counter]').textContent,name:document.querySelector('[data-media-name]').textContent,active:document.querySelector('[data-media-index].active span').textContent}));
    if (state.counter !== 'Ảnh 2/3' || state.name !== 'Bài sửa trang 2' || state.active !== '2') throw new Error(`Gallery navigation failed: ${JSON.stringify(state)}`);
    await page.evaluate(() => {
      const stage=document.querySelector('[data-media-stage]');
      stage.dispatchEvent(new PointerEvent('pointerdown',{pointerId:4,pointerType:'touch',clientX:700,clientY:300,bubbles:true}));
      stage.dispatchEvent(new PointerEvent('pointerup',{pointerId:4,pointerType:'touch',clientX:590,clientY:305,bubbles:true}));
    });
    state = await page.evaluate(() => document.querySelector('[data-media-counter]').textContent);
    if (state !== 'Ảnh 3/3') throw new Error(`Touch swipe did not change image: ${state}`);
    await page.setViewportSize({width:390,height:844});
    state = await page.evaluate(() => ({right:document.querySelector('[data-media-action="close"]').getBoundingClientRect().right,width:document.querySelector('.vm-result-media-shell').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth+1}));
    if (state.right>390 || state.width>390 || state.overflow) throw new Error(`Mobile gallery overflow: ${JSON.stringify(state)}`);
    await page.click('[data-media-action="close"]');
    state = await page.evaluate(() => ({open:document.getElementById('vmResultMediaViewer').classList.contains('open'),nativeOpen:document.getElementById('vmResultMediaViewer').open,parentOpen:document.getElementById('resultDialog').open,focus:document.activeElement&&document.activeElement.id,rejected:VMStudentResultUI.openMedia([{url:'javascript:alert(1)',fallbackUrl:'javascript:alert(2)',name:'Không an toàn'}],0)}));
    if (state.open || state.nativeOpen || !state.parentOpen || state.focus !== 'origin' || state.rejected !== false) throw new Error(`Gallery close, parent preservation, focus restore or URL allowlist failed: ${JSON.stringify(state)}`);
    console.log('PASS shared result gallery top-layer nesting, navigation, swipe, mobile layout and safe close');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
