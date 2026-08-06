const fs = require('fs');
const { chromium } = require('playwright');

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
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
    else if (ch === '}' && --depth === 0) return source.slice(asyncStart, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

(async () => {
  const lesson = fs.readFileSync('bai-hoc.html', 'utf8');
  const reader = fs.readFileSync('js/latex-view.js', 'utf8');
  const inlineCss = [...lesson.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const sample = String.raw`\documentclass[12pt]{article}
\usepackage{ex_test}
\begin{document}
\section{Tập hợp và phép toán}
Nội dung \textbf{trọng tâm} với công thức $A\subset B$.

\begin{ex}
Cho $A=\{1;2\}$. Khẳng định nào đúng?
\choice{$3\in A$}{\True $2\in A$}{$A=\varnothing$}{$1\notin A$}
\loigiai{NỘI DUNG BÍ MẬT KHÔNG ĐƯỢC HIỆN}
\end{ex}

\begin{bt}
Tính $1+2+3$.
\loigiai{Đáp số 6}
\end{bt}
\end{document}`;

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--bg:#fafafa;--surface:#fff;--surface-solid:#fff;--surface-2:#f6f4ef;--line:#ddd;--line-2:#ccc;--accent:#d97706;--accent-soft:#fff4dc;--ink:#171717;--ink-3:#666;--ok:#16865a;--ok-soft:#e9f8f1}${inlineCss}</style><main id="root" class="vm-tex-scroll"></main><input id="texFile" type="file"><textarea id="texSource"></textarea><span id="texStatus"></span>`);
    await page.addScriptTag({ content: reader });
    await page.evaluate((tex) => {
      document.getElementById('root').innerHTML = latexTaiLieuRaHTML(tex, { title: 'Đề mẫu', kind: 'test', showSolutions: false });
    }, sample);

    const desktop = await page.evaluate(() => {
      const root = document.getElementById('root');
      const readerEl = root.querySelector('.vm-tex-reader');
      return {
        text: root.textContent,
        blockCount: root.querySelectorAll('.vm-tex-block').length,
        choiceCount: root.querySelectorAll('.vm-tex-choice').length,
        choiceColumns: getComputedStyle(root.querySelector('.vm-tex-choices')).gridTemplateColumns.split(' ').length,
        readerWidth: readerEl.getBoundingClientRect().width,
        overflow: readerEl.scrollWidth > readerEl.clientWidth + 1,
      };
    });
    if (!desktop.text.includes('Tập hợp và phép toán') || !desktop.text.includes('Đề mẫu')) throw new Error('Document title or section is missing');
    if (desktop.text.includes('documentclass') || desktop.text.includes('usepackage')) throw new Error('LaTeX preamble leaked into the reader');
    if (desktop.text.includes('NỘI DUNG BÍ MẬT') || desktop.text.includes('Đáp số 6') || desktop.text.includes('True')) throw new Error('Solutions or answer markers leaked to students');
    if (desktop.blockCount !== 2 || desktop.choiceCount !== 4 || desktop.choiceColumns !== 2) throw new Error(`Desktop document structure is wrong: ${JSON.stringify(desktop)}`);
    if (desktop.readerWidth > 921 || desktop.overflow) throw new Error(`Desktop reader overflows: ${JSON.stringify(desktop)}`);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      const article = document.querySelector('.vm-tex-reader');
      return {
        columns: getComputedStyle(document.querySelector('.vm-tex-choices')).gridTemplateColumns.split(' ').length,
        articleWidth: article.getBoundingClientRect().width,
        viewportWidth: innerWidth,
        bodyOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    if (mobile.columns !== 1 || mobile.articleWidth > mobile.viewportWidth || mobile.bodyOverflow) throw new Error(`Mobile reader is not responsive: ${JSON.stringify(mobile)}`);

    await page.evaluate(() => { document.getElementById('texFile').onchange = function () { return napFileTexVaoO(this, 'texSource', 'texStatus'); }; });
    await page.setInputFiles('#texFile', { name: 'bai-hoc.tex', mimeType: 'text/x-tex', buffer: Buffer.from(sample, 'utf8') });
    await page.waitForFunction(() => document.getElementById('texSource').value.includes('begin{document}'));
    const upload = await page.evaluate(() => ({ value: document.getElementById('texSource').value, status: document.getElementById('texStatus').textContent }));
    if (!upload.value.includes('Tập hợp và phép toán') || !upload.status.includes('Đã nạp bai-hoc.tex')) throw new Error('Uploading a .tex file does not populate the source field');

    const docFn = extractFunction(lesson, 'hienTaiLieuTex');
    const testFn = extractFunction(lesson, 'hienTestTex');
    if (/functions\.invoke\(['"]latex/.test(docFn) || /functions\.invoke\(['"]latex/.test(testFn)) throw new Error('Opening a LaTeX document still compiles PDF automatically');
    if (!lesson.includes("vmTaiPdfLatex") || !lesson.includes("⬇ Tạo &amp; tải PDF")) throw new Error('On-demand PDF download action is missing');
    if (!lesson.includes("renderPDFWithJS(buildPdfUrl(b.docPath), pdfBox)")) throw new Error('PDF-only homework does not use the web viewer');
    console.log('PASS native LaTeX reader, upload, solution safety, PDF fallback, desktop and mobile checks');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
