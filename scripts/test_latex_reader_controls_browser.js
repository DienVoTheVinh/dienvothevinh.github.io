const fs = require('fs');
const { chromium } = require('playwright');

function between(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`Missing range ${from} -> ${to}`);
  return source.slice(start, end);
}

(async () => {
  const lesson = fs.readFileSync('bai-hoc.html', 'utf8');
  const reader = fs.readFileSync('js/latex-view.js', 'utf8');
  const css = [...lesson.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  const controls = between(lesson, 'var pdfTaiLieuTex = null;', 'async function processVirtualFiles');
  const pdfViewer = between(lesson, 'var vmPdfViewerSeq = 0;', 'function veTaiLieuTex()');
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>:root{--bg:#fafafa;--surface:#fff;--surface-solid:#fff;--surface-2:#f6f4ef;--line:#ddd;--line-2:#ccc;--accent:#d97706;--accent-soft:#fff4dc;--ink:#171717;--ink-2:#333;--ink-3:#666;--err:#c33}${css}</style>
      <main id="root"></main>
      <div id="vmPdfExportModal" style="display:none">
        <div id="vmPdfConfigPane"></div><div id="vmPdfProgressPane"></div><div id="vmPdfResultPane"></div>
        <button class="vm-pdf-preset" data-preset="original"></button><button class="vm-pdf-preset" data-preset="study"></button><button class="vm-pdf-preset" data-preset="worksheet"></button><button class="vm-pdf-preset" data-preset="compact"></button>
        <select id="vmPdfAnswers"><option value="show">show</option><option value="hide">hide</option><option value="dots">dots</option></select>
        <select id="vmPdfDotLines"><option value="2">2</option><option value="4">4</option></select>
        <select id="vmPdfLayout"><option value="one">one</option><option value="two">two</option></select>
        <select id="vmPdfMargins"><option value="normal">normal</option><option value="loose">loose</option><option value="tight">tight</option></select>
        <select id="vmPdfFontSize"><option value="10">10</option><option value="12">12</option></select>
      </div>`);
    await page.addScriptTag({ content: 'window.$ = function(id){ return document.getElementById(id); }; window.renderToanTrong=function(){};' });
    await page.addScriptTag({ content: reader });
    await page.addScriptTag({ content: controls });
    await page.addScriptTag({ content: pdfViewer });
    const tikz = await page.evaluate(() => vmTexTikzDoc({
      preamble: String.raw`\definecolor{vmGold}{RGB}{220,150,0}
\tikzset{
  vm node/.style={draw=vmGold,rounded corners}
}`,
      source: String.raw`\begin{tikzpicture}\node[vm node]{A};\end{tikzpicture}`,
    }));
    if (!tikz.includes('definecolor{vmGold}') || !tikz.includes('vm node/.style') || !tikz.includes('tkz-euclide,pgfplots')) throw new Error('TikZ preamble declarations were lost');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' });
      const tex = String.raw`\documentclass{article}\begin{document}\section{Noi dung dai}\begin{ex}Tinh $1+1$.\loigiai{2}\end{ex}\end{document}`;
      document.getElementById('root').innerHTML = vmLatexNativeHTML('Tai lieu mau', tex, 'reader-test', 'test.pdf', 'test', false);
      document.querySelector('.vm-tex-reader').insertAdjacentHTML('beforeend', '<div class="katex-display"><span class="katex" style="display:inline-block;width:520px;height:56px">Công thức rất dài</span></div>');
      vmFitLongMath(document.getElementById('root'));
    });

    await page.click('[data-vm-zoom-label="reader-test"] + button');
    let state = await page.evaluate(() => ({
      zoom: document.querySelector('[data-vm-zoom-label="reader-test"]').textContent,
      scale: document.querySelector('.vm-tex-reader').style.getPropertyValue('--vm-reader-scale'),
      computedSize: getComputedStyle(document.querySelector('.vm-tex-reader')).fontSize,
      fitted: document.querySelector('.katex-display').classList.contains('vm-math-fitted'),
      fittedTransform: document.querySelector('.katex-display > .katex').style.transform,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    if (state.zoom !== '110%' || state.scale !== '1.1' || parseFloat(state.computedSize) < 16 || !state.fitted || !state.fittedTransform.includes('scale(') || state.overflow) throw new Error(`Zoom/mobile formula fitting failed: ${JSON.stringify(state)}`);

    await page.click('[data-vm-fullscreen-btn="reader-test"]');
    state = await page.evaluate(() => ({
      active: document.querySelector('[data-reader-key="reader-test"]').classList.contains('vm-tex-fullscreen-active'),
      locked: document.body.classList.contains('vm-reader-locked'),
      text: document.querySelector('[data-vm-fullscreen-btn="reader-test"]').textContent,
    }));
    if (!state.active || !state.locked || !state.text.includes('Thoát')) throw new Error(`Fullscreen fallback failed: ${JSON.stringify(state)}`);

    await page.click('.vm-tex-download');
    state = await page.evaluate(() => ({
      modal: document.getElementById('vmPdfExportModal').style.display,
      answers: document.getElementById('vmPdfAnswers').value,
      dots: document.getElementById('vmPdfDotLines').disabled,
      original: document.querySelector('[data-preset="original"]').classList.contains('active'),
    }));
    if (state.modal !== 'flex' || state.answers !== 'show' || !state.dots || !state.original) throw new Error(`PDF configuration popup failed: ${JSON.stringify(state)}`);

    await page.evaluate(() => {
      const preview = document.createElement('div');
      preview.id = 'pdf-preview-test';
      preview.className = 'vm-pdf-preview';
      document.body.appendChild(preview);
      window.pdfjsLib = {
        getDocument() {
          return { promise: Promise.resolve({
            numPages: 3,
            getPage() {
              return Promise.resolve({
                getViewport() { return { width: 800, height: 1120 }; },
                render() { return { promise: Promise.resolve() }; },
              });
            },
          }) };
        },
      };
      renderPDFWithJS('blob:pdf-preview-test', preview);
    });
    await page.waitForFunction(() => document.querySelectorAll('#pdf-preview-test .pdfjs-page').length === 3);
    state = await page.evaluate(() => {
      const preview = document.getElementById('pdf-preview-test');
      const pages = preview.querySelector('[id^="pdfCanvasContainer-"]');
      pages.scrollTop = 500;
      return {
        pageCount: preview.querySelectorAll('.pdfjs-page').length,
        previewDisplay: getComputedStyle(preview).display,
        previewOverflow: getComputedStyle(preview).overflow,
        pagesOverflow: getComputedStyle(pages).overflowY,
        canScroll: pages.scrollHeight > pages.clientHeight && pages.scrollTop > 0,
      };
    });
    if (state.pageCount !== 3 || state.previewDisplay !== 'flex' || state.previewOverflow !== 'hidden' || state.pagesOverflow !== 'auto' || !state.canScroll) throw new Error(`Multi-page PDF preview is not vertically scrollable: ${JSON.stringify(state)}`);
    if (lesson.includes('id="btnMaxContent"')) throw new Error('Legacy content fullscreen button still exists');
    if (process.env.VM_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.VM_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.VM_SCREENSHOT_DIR}/latex-reader-mobile-popup.png`, fullPage: true });
      await page.evaluate(() => vmDongPdfExport());
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.screenshot({ path: `${process.env.VM_SCREENSHOT_DIR}/latex-reader-desktop-fullscreen.png`, fullPage: false });
    }
    console.log('PASS reader zoom, mobile fullscreen and configurable PDF popup controls');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
