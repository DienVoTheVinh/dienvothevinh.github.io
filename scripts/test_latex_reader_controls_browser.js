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
    await page.addScriptTag({ content: 'window.$ = function(id){ return document.getElementById(id); }; window.renderToanTrong=function(){}; window.toggleTheme=function(){ var root=document.documentElement; root.setAttribute("data-theme", root.getAttribute("data-theme") === "dark" ? "light" : "dark"); };' });
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
    const tikzCompatibility = await page.evaluate(() => {
      const raw = String.raw`\begin{tikzpicture}
\IntervalLR{-1}{1/2}
\def\skipInterval{0.5cm}
\IntervalGRF{}{}{\big[}{a}
\def\firstellipse{(0,0) ellipse (1 and .5)}
\draw \firstellipse;
\end{tikzpicture}`;
      const cleaned = tachNoiDungTaiLieuLatex(raw);
      const doc = vmTexTikzDoc({ preamble: '', source: cleaned });
      return {
        keptSkip: cleaned.includes(String.raw`\def\skipInterval`),
        keptEllipse: cleaned.includes(String.raw`\def\firstellipse`),
        hasIntervalFallback: doc.includes(String.raw`\providecommand{\IntervalGRF}`),
        normalizedDelimiter: doc.includes(String.raw`{\lbrack}`) && !doc.includes(String.raw`{\big[}`),
        loadsUnneededPackage: doc.includes(String.raw`\usepackage{tkz-tab}`),
      };
    });
    if (!tikzCompatibility.keptSkip || !tikzCompatibility.keptEllipse || !tikzCompatibility.hasIntervalFallback || !tikzCompatibility.normalizedDelimiter || tikzCompatibility.loadsUnneededPackage) throw new Error(`TikZ source compatibility failed: ${JSON.stringify(tikzCompatibility)}`);
    const tikzFast = await page.evaluate(async () => {
      const batch = vmTexTikzPreview([
        { preamble: '', source: String.raw`\begin{tikzpicture}\node{A};\end{tikzpicture}` },
        { preamble: '', source: String.raw`\begin{tikzpicture}\node{B};\end{tikzpicture}` },
      ], true);
      try { Object.defineProperty(window, 'caches', { configurable: true, value: undefined }); } catch (e) {}
      let calls = 0;
      window.sb = { functions: { invoke: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { data: new Blob(['fake-pdf'], { type: 'application/pdf' }) };
      } } };
      const unique = `dedupe-${Date.now()}`;
      await Promise.all([vmLayTikzPdfNhanh(unique), vmLayTikzPdfNhanh(unique), vmLayTikzPdfNhanh(unique)]);
      return { calls, multi: batch.includes('multi=tikzpicture'), pictures: (batch.match(/\\begin\{tikzpicture\}/g) || []).length };
    });
    if (tikzFast.calls !== 1 || !tikzFast.multi || tikzFast.pictures !== 2) throw new Error(`Fast TikZ batching/deduplication failed: ${JSON.stringify(tikzFast)}`);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' });
      const chrome = document.createElement('header');
      chrome.id = 'site-chrome';
      chrome.textContent = 'Thanh dieu huong';
      document.body.prepend(chrome);
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
      scrollable: document.querySelector('.katex-display').classList.contains('vm-math-scrollable'),
      fittedTransform: document.querySelector('.katex-display > .katex').style.transform,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    if (state.zoom !== '110%' || state.scale !== '1.1' || parseFloat(state.computedSize) < 16 || !state.scrollable || state.fittedTransform || state.overflow) throw new Error(`Zoom/uniform formula scrolling failed: ${JSON.stringify(state)}`);

    await page.click('[data-vm-zoom-label="reader-test"]');
    state = await page.evaluate(() => ({
      zoom: document.querySelector('[data-vm-zoom-label="reader-test"]').textContent,
      scale: document.querySelector('.vm-tex-reader').style.getPropertyValue('--vm-reader-scale'),
    }));
    if (state.zoom !== '100%' || state.scale !== '1') throw new Error(`Zoom reset failed: ${JSON.stringify(state)}`);

    await page.click('[data-vm-fullscreen-btn="reader-test"]');
    state = await page.evaluate(() => ({
      active: document.querySelector('[data-reader-key="reader-test"]').classList.contains('vm-tex-fullscreen-active'),
      locked: document.body.classList.contains('vm-reader-locked'),
      enterHidden: document.querySelector('[data-vm-fullscreen-btn="reader-test"]').offsetParent === null,
      exitVisible: (() => { const e=document.querySelector('[data-vm-fullscreen-exit="reader-test"]'),r=e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; })(),
      exitText: document.querySelector('[data-vm-fullscreen-exit="reader-test"]').textContent,
      exitOutsideTools: !document.querySelector('.vm-tex-actions').contains(document.querySelector('[data-vm-fullscreen-exit="reader-test"]')),
      exitPosition: (() => { const r = document.querySelector('[data-vm-fullscreen-exit="reader-test"]').getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top) }; })(),
      directChild: document.querySelector('[data-reader-key="reader-test"]').parentElement === document.body,
      chromeHidden: getComputedStyle(document.getElementById('site-chrome')).visibility === 'hidden',
      copyHidden: getComputedStyle(document.querySelector('.vm-tex-actions-copy')).display === 'none',
      toolsHidden: getComputedStyle(document.querySelector('.vm-tex-action-tools')).display === 'none',
      toolbarVisible: getComputedStyle(document.querySelector('.vm-tex-toolbar-toggle')).display !== 'none',
      toolbarDisplay: getComputedStyle(document.querySelector('.vm-tex-toolbar-toggle')).display,
      toolbarExpanded: document.querySelector('.vm-tex-toolbar-toggle').getAttribute('aria-expanded'),
      themeVisible: document.querySelector('.vm-tex-theme-toggle').offsetParent !== null,
    }));
    if (!state.active || !state.locked || !state.enterHidden || !state.exitVisible || !state.exitText.includes('Thoát') || !state.exitOutsideTools || state.exitPosition.left > 20 || state.exitPosition.top > 20 || !state.directChild || !state.chromeHidden || !state.copyHidden || !state.toolsHidden || !state.toolbarVisible || state.toolbarExpanded !== 'false' || state.themeVisible) throw new Error(`Collapsed fullscreen reading mode failed: ${JSON.stringify(state)}`);
    await page.click('.vm-tex-toolbar-toggle');
    state = await page.evaluate(() => ({
      open: document.querySelector('[data-reader-key="reader-test"]').classList.contains('vm-tex-tools-open'),
      expanded: document.querySelector('.vm-tex-toolbar-toggle').getAttribute('aria-expanded'),
      downloadVisible: getComputedStyle(document.querySelector('.vm-tex-download')).display !== 'none',
    }));
    if (!state.open || state.expanded !== 'true' || !state.downloadVisible) throw new Error(`Fullscreen reader tools did not expand: ${JSON.stringify(state)}`);
    await page.click('.vm-tex-download');
    state = await page.evaluate(() => {
      const shell = document.querySelector('[data-reader-key="reader-test"]');
      const modal = document.getElementById('vmPdfExportModal');
      return {
        visible: modal.style.display === 'flex' && getComputedStyle(modal).visibility === 'visible',
        insideFullscreen: shell.contains(modal),
        aboveFullscreen: Number(getComputedStyle(modal).zIndex) > Number(getComputedStyle(shell).zIndex),
        toolsCollapsed: !shell.classList.contains('vm-tex-tools-open'),
      };
    });
    if (!state.visible || !state.insideFullscreen || !state.aboveFullscreen || !state.toolsCollapsed) throw new Error(`PDF popup escaped fullscreen reader: ${JSON.stringify(state)}`);
    await page.evaluate(() => vmDongPdfExport());
    await page.click('.vm-tex-toolbar-toggle');
    await page.click('.vm-tex-theme-toggle');
    state = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      darkIconHidden: getComputedStyle(document.querySelector('.vm-tex-theme-dark')).display === 'none',
      lightIconVisible: getComputedStyle(document.querySelector('.vm-tex-theme-light')).display !== 'none',
    }));
    if (state.theme !== 'dark' || !state.darkIconHidden || !state.lightIconVisible) throw new Error(`Fullscreen theme toggle failed: ${JSON.stringify(state)}`);
    if (process.env.VM_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.VM_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.VM_SCREENSHOT_DIR}/latex-reader-mobile-fullscreen.png`, fullPage: false });
    }

    await page.click('[data-vm-fullscreen-exit="reader-test"]');
    state = await page.evaluate(() => ({
      active: document.querySelector('[data-reader-key="reader-test"]').classList.contains('vm-tex-fullscreen-active'),
      locked: document.body.classList.contains('vm-reader-locked'),
      restored: document.querySelector('[data-reader-key="reader-test"]').parentElement.id === 'root',
      themeHidden: getComputedStyle(document.querySelector('.vm-tex-theme-toggle')).display === 'none',
    }));
    if (state.active || state.locked || !state.restored || !state.themeHidden) throw new Error(`Fullscreen restore failed: ${JSON.stringify(state)}`);

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

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => {
      const root = document.getElementById('root');
      root.className = 'content-body';
      root.removeAttribute('data-reader-key');
      root.innerHTML = vmLatexActionHTML('lesson-theory', String.raw`\\documentclass{article}\\begin{document}Noi dung\\end{document}`, 'ly-thuyet.pdf', 'theory') +
        '<div class="theory-reading-container"><article class="vm-tex-reader">Nội dung lý thuyết</article></div>';
    });
    state = await page.evaluate(() => {
      const reading = document.querySelector('.theory-reading-container');
      const article = reading.querySelector('.vm-tex-reader');
      const style = getComputedStyle(reading);
      return {
        readingWidth: Math.round(reading.getBoundingClientRect().width),
        articleWidth: Math.round(article.getBoundingClientRect().width),
        contentWidth: Math.round(reading.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
        viewportWidth: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    if (state.readingWidth < 1450 || Math.abs(state.articleWidth - state.contentWidth) > 1 || state.overflow) throw new Error(`Theory reader does not use the wide desktop canvas: ${JSON.stringify(state)}`);
    if (process.env.VM_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.VM_SCREENSHOT_DIR}/latex-reader-wide-desktop.png`, fullPage: false });
    await page.click('[data-vm-reader-key="lesson-theory"][data-vm-reader-delta=".1"]');
    state = await page.evaluate(() => {
      const root = document.getElementById('root');
      return {
        key: root.getAttribute('data-reader-key'),
        zoom: root.querySelector('[data-vm-zoom-label="lesson-theory"]').textContent,
        scale: root.querySelector('.vm-tex-reader').style.getPropertyValue('--vm-reader-scale'),
      };
    });
    if (state.key !== 'lesson-theory' || state.zoom !== '110%' || state.scale !== '1.1') throw new Error(`Split theory reader zoom fallback failed: ${JSON.stringify(state)}`);
    await page.click('[data-vm-fullscreen-btn="lesson-theory"]');
    state = await page.evaluate(() => {
      const root = document.querySelector('[data-reader-key="lesson-theory"]');
      const reading = root.querySelector('.theory-reading-container');
      return {
        active: root.classList.contains('vm-tex-fullscreen-active'),
        locked: document.body.classList.contains('vm-reader-locked'),
        enterHidden: root.querySelector('[data-vm-fullscreen-btn="lesson-theory"]').offsetParent === null,
        exitVisible: (() => { const e=root.querySelector('[data-vm-fullscreen-exit="lesson-theory"]'),r=e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; })(),
        exitOutsideTools: !root.querySelector('.vm-tex-actions').contains(root.querySelector('[data-vm-fullscreen-exit="lesson-theory"]')),
        readingOverflow: getComputedStyle(reading).overflowY,
      };
    });
    if (!state.active || !state.locked || !state.enterHidden || !state.exitVisible || !state.exitOutsideTools || state.readingOverflow !== 'auto') throw new Error(`Split theory reader fullscreen fallback failed: ${JSON.stringify(state)}`);
    await page.click('.vm-tex-toolbar-toggle');
    await page.click('[data-vm-fullscreen-exit="lesson-theory"]');
    console.log('PASS reader zoom, mobile fullscreen and configurable PDF popup controls');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
