const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const source = process.env.VM_PDF_SOURCE_URL
    ? await (await fetch(process.env.VM_PDF_SOURCE_URL)).text()
    : fs.readFileSync(path.join(root, 'bai-hoc.html'), 'utf8');
  const css = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const reader = source.slice(source.indexOf('var vmPdfViewerSeq ='), source.indexOf('function veTaiLieuTex()'));
  assert(reader.includes('function renderPDFWithJS'));
  const browser = await chromium.launch({headless: true, executablePath: process.env.VM_CHROME_PATH});
  try {
    for (const width of [1920, 820, 390]) {
      const page = await browser.newPage({viewport: {width, height: 960}});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}
        :root{--line:#ddd;--surface-solid:#fff;--surface-2:#eee;--ink:#222;--ink-3:#444}
        body{margin:0;display:block} #fixture{height:840px;display:flex;flex-direction:column;overflow:hidden;width:100%}
      </style><div id="fixture"></div>`);
      // Deterministic PDF.js adapter: real canvas drawing, page viewport dimensions,
      // asynchronous rendering and the browser's real IntersectionObserver/layout.
      await page.addScriptTag({content: `window.pdfjsLib={getDocument:()=>({promise:Promise.resolve({numPages:24,
        getPage:async n=>({getViewport:({scale})=>({width:(n%3===0?842:595)*scale,height:(n%3===0?595:842)*scale}),
        render:({canvasContext:c,viewport:v})=>({promise:new Promise(resolve=>setTimeout(()=>{
          c.fillStyle='#fff';c.fillRect(0,0,v.width,v.height);c.fillStyle='#182643';
          c.font='bold 28px sans-serif';c.fillText('VINHMATH - Page '+n,30,60);
          c.font='20px sans-serif';for(let y=110;y<v.height-30;y+=44)c.fillText('Mathematics: x + 2 = 5     |     x = 3',30,y);
          resolve();},35))})})})})};${reader}
        renderPDFWithJS('blob:fixture',document.getElementById('fixture'));`});
      const pages = page.locator('#fixture .pdfjs-page');
      await page.waitForFunction(() => document.querySelector('.pdfjs-page')?.dataset.renderState === 'done');
      async function checkShape(index) {
        const shape = await pages.nth(index).evaluate(cv => ({
          w:cv.clientWidth, h:cv.clientHeight, ratio:cv.width/cv.height,
          top:cv.getBoundingClientRect().top, bottom:cv.getBoundingClientRect().bottom
        }));
        assert(shape.h > 80 && Math.abs(shape.w/shape.h - shape.ratio) < .015,
          `${width}px page ${index+1} is squashed: ${JSON.stringify(shape)}`);
      }
      await checkShape(0);
      assert(await pages.evaluateAll(cvs => cvs.filter(cv => cv.dataset.renderState==='done').length) < 24,
        'Long documents must remain lazy-rendered');
      const plus = page.getByRole('button', {name:'Phóng to tài liệu', exact:true});
      const minus = page.getByRole('button', {name:'Thu nhỏ tài liệu', exact:true});
      const originalWidth = await pages.first().evaluate(cv => cv.clientWidth);
      await plus.click();
      assert(Math.abs((await pages.first().evaluate(cv => cv.clientWidth))/originalWidth - 1.2) < .02,
        'Zoom must be relative to the fitted width, including on mobile');
      for (let step=0;step<4;step++) await plus.click();
      for (let index=0;index<24;index++) {
        await pages.nth(index).evaluate(cv => cv.scrollIntoView({block:'start',inline:'start'}));
        await page.waitForFunction(i => document.querySelectorAll('#fixture .pdfjs-page')[i].dataset.renderState==='done', index);
        await checkShape(index);
        assert(Math.abs(await pages.nth(index).evaluate(cv => cv.clientWidth) - originalWidth*2) < 4,
          'Lazy rendering must preserve the selected zoom');
      }
      const bounds = await pages.evaluateAll(cvs => cvs.map(cv => {const r=cv.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
      for (let i=1;i<bounds.length;i++) assert(bounds[i].top>=bounds[i-1].bottom+10,'PDF pages overlap');
      const scroll = page.locator('#fixture [id^="pdfCanvasContainer-"]');
      const edges = await scroll.evaluate(el => {
        el.scrollLeft=0;const left=el.querySelector('canvas').getBoundingClientRect().left-el.getBoundingClientRect().left;
        el.scrollLeft=el.scrollWidth;const right=el.querySelector('canvas').getBoundingClientRect().right-el.getBoundingClientRect().right;
        return {left,right};
      });
      assert(edges.left>=0 && edges.right<=1,'Zoom must keep both page edges reachable');
      for(let step=0;step<10;step++) await minus.click();
      await checkShape(0);
      await page.getByRole('button',{name:'↔ Vừa khung',exact:true}).click();
      assert(Math.abs(await pages.first().evaluate(cv=>cv.clientWidth)-originalWidth)<2);
      await page.setViewportSize({width:width===1920?900:600,height:960});
      await checkShape(0);
      assert(await pages.first().evaluate(cv=>cv.getBoundingClientRect().width<=cv.parentElement.clientWidth), 'Fit must follow resize');
      await page.setViewportSize({width,height:960});
      await scroll.evaluate(el=>{el.scrollTop=0;el.scrollLeft=0;});
      if(process.env.VM_PDF_SCREENSHOTS){
        fs.mkdirSync(process.env.VM_PDF_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:path.join(process.env.VM_PDF_SCREENSHOTS,`pdf-${width}.png`)});
      }
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}px: 24 portrait/landscape pages, lazy rendering, zoom, fit, resize, scroll edges`);
      await page.close();
    }
    if (process.env.VM_PDF_REAL) {
      const urls = [
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js',
        'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf'
      ];
      const responses = await Promise.all(urls.map(async url => {
        const response = await fetch(url);
        assert(response.ok, `PDF fixture download failed: ${url}`);
        return response;
      }));
      const engine = await responses[0].text(), worker = await responses[1].text();
      const pdf = Array.from(new Uint8Array(await responses[2].arrayBuffer()));
      const page = await browser.newPage({viewport:{width:1280,height:960}});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.setContent(`<!doctype html><style>${css}
        :root{--line:#444;--surface-solid:#171717;--surface-2:#252525;--ink-3:#ddd}
        body{margin:0;display:block;background:#252525}
      </style><div class="vm-pdf-preview" id="realPdf" style="height:900px;max-height:none"></div>`);
      await page.addScriptTag({content:engine});
      await page.evaluate(({worker,pdf})=>{
        pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([worker],{type:'application/javascript'}));
        window.fixturePdfUrl=URL.createObjectURL(new Blob([new Uint8Array(pdf)],{type:'application/pdf'}));
      },{worker,pdf});
      await page.addScriptTag({content:`${reader}\nrenderPDFWithJS(window.fixturePdfUrl,document.getElementById('realPdf'));`});
      await page.waitForFunction(()=>document.querySelector('.pdfjs-page')?.dataset.renderState==='done');
      assert.equal(await page.locator('.pdfjs-page').count(),14);
      for(let i=0;i<14;i++){
        await page.locator('.pdfjs-page').nth(i).evaluate(cv=>cv.scrollIntoView({block:'start'}));
        await page.waitForFunction(i=>document.querySelectorAll('.pdfjs-page')[i]?.dataset.renderState==='done',i);
        assert(await page.locator('.pdfjs-page').nth(i).evaluate(cv=>cv.clientHeight>800&&Math.abs(cv.clientWidth/cv.clientHeight-cv.width/cv.height)<.015), 'Real PDF page was flattened');
      }
      await page.locator('.vm-pdf-pages').evaluate(el=>{el.scrollTop=0;});
      if(process.env.VM_PDF_SCREENSHOTS) await page.screenshot({path:path.join(process.env.VM_PDF_SCREENSHOTS,'real-pdf-dark.png')});
      assert.deepEqual(errors,[]);
      console.log('PASS real PDF.js 2.16.105: 14-page PDF in dark preview, all pages rendered at correct proportions');
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
