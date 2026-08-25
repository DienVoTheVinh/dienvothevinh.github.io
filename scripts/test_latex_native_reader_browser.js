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
  const lessonAdmin = fs.readFileSync('quan-tri-bai-hoc.html', 'utf8');
  const classAdmin = fs.readFileSync('quan-tri-lop.html', 'utf8');
  const reader = fs.readFileSync('js/latex-view.js', 'utf8');
  const inlineCss = [...lesson.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const sample = String.raw`\documentclass[12pt]{article}
\usepackage{ex_test}
\begin{document}
\section{Tập hợp và phép toán}
Nội dung \textbf{trọng tâm} với công thức $A\subset B$.

\begin{tomtat}
\begin{boxdn}
Một \textbf{tập hợp} là một nhóm đối tượng xác định.
\end{boxdn}
\begin{luuy}
Dùng từ \lq\lq tập\rq\rq thay cho cụm từ tập hợp.
\end{luuy}
\begin{dang}{Xác định tập hợp}
\begin{enumEX}{2}
\item Liệt kê các phần tử.
\item Chỉ ra tính chất đặc trưng.
\end{enumEX}
\end{dang}
\end{tomtat}

Khoảng cách \quad ngoài công thức không được lộ lệnh.
\begin{tabular}{|m{5cm}|m{7cm}|}
Tên gọi & Ký hiệu \\
Đoạn & $[a;b]$ \\
\end{tabular}

\begin{ex}
Cho $A=\{1;2\}$. Khẳng định nào đúng?
\choice{$3\in A$}{\True $2\in A$}{$A=\varnothing$}{$1\notin A$}
\loigiai{NỘI DUNG BÍ MẬT KHÔNG ĐƯỢC HIỆN
\begin{align*}
x &= 1+1 \\
  &= 2\quad \text{(thế $x=1$ vào biểu thức)}.
\end{align*}}
\end{ex}

\begin{bt}
Tính $1+2+3$.
\loigiai{Đáp số 6}
\end{bt}
\begin{itemize}
[leftmargin=*]
\item Danh sach khong duoc lo tham so. \text{(HDT 1.1)}
\end{itemize}
\begin{tikzpicture}
\draw[brandGold] (0,0)--(1,1);
\end{tikzpicture}
\end{document}`;

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--bg:#fafafa;--surface:#fff;--surface-solid:#fff;--surface-2:#f6f4ef;--line:#ddd;--line-2:#ccc;--accent:#d97706;--accent-soft:#fff4dc;--ink:#171717;--ink-3:#666;--ok:#16865a;--ok-soft:#e9f8f1}${inlineCss}</style><main id="root" class="vm-tex-scroll"></main><main id="theoryRoot" class="vm-tex-scroll"></main><input id="texFile" type="file"><textarea id="texSource"></textarea><span id="texStatus"></span>`);
    await page.addScriptTag({ content: reader });
    await page.evaluate((tex) => {
      document.getElementById('root').innerHTML = latexTaiLieuRaHTML(tex, { title: 'Đề mẫu', kind: 'test', showSolutions: false });
      document.getElementById('theoryRoot').innerHTML = latexTaiLieuRaHTML(tex, { title: 'Ly thuyet mau', kind: 'theory', showSolutions: true });
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
        tikzCount: root.querySelectorAll('.vm-tex-tikz').length,
        calloutCount: root.querySelectorAll('.vm-tex-callout').length,
        enumItemCount: root.querySelectorAll('.vm-tex-callout-form ol li').length,
        tableCellCount: root.querySelectorAll('.vm-tex-table-wrap td').length,
        leakedTableSpec: /m\{(?:5|7)cm\}|\\begin\{tabular\}/.test(root.textContent),
        leakedSpacing: /\\(?:quad|qquad|enspace|thinspace)\b/.test(root.textContent),
        leakedListOption: root.textContent.includes('leftmargin=*') || root.textContent.includes('\\text{'),
        leakedDgnlLatex: /\\(?:begin|end)\{(?:boxdn|luuy|dang|enumEX|tomtat)\}|\\(?:lq|rq)\b/.test(root.textContent),
      };
    });
    if (!desktop.text.includes('Tập hợp và phép toán') || !desktop.text.includes('Đề mẫu')) throw new Error('Document title or section is missing');
    if (desktop.text.includes('documentclass') || desktop.text.includes('usepackage')) throw new Error('LaTeX preamble leaked into the reader');
    if (desktop.text.includes('NỘI DUNG BÍ MẬT') || desktop.text.includes('Đáp số 6') || desktop.text.includes('True')) throw new Error('Solutions or answer markers leaked to students');
    if (desktop.blockCount !== 2 || desktop.choiceCount !== 4 || desktop.choiceColumns !== 2) throw new Error(`Desktop document structure is wrong: ${JSON.stringify(desktop)}`);
    if (desktop.tikzCount !== 1 || desktop.leakedListOption) throw new Error(`TikZ/list conversion is wrong: ${JSON.stringify(desktop)}`);
    if (desktop.calloutCount !== 3 || desktop.enumItemCount !== 2 || desktop.leakedDgnlLatex || !desktop.text.includes('“tập”')) throw new Error(`DGNL environments or quote commands leaked: ${JSON.stringify(desktop)}`);
    if (desktop.tableCellCount !== 4 || desktop.leakedTableSpec || desktop.leakedSpacing) throw new Error(`Table column spec or spacing command leaked: ${JSON.stringify(desktop)}`);
    if (desktop.readerWidth > 921 || desktop.overflow) throw new Error(`Desktop reader overflows: ${JSON.stringify(desktop)}`);
    const theory = await page.evaluate(() => ({
      text: document.getElementById('theoryRoot').textContent,
      solutions: document.querySelectorAll('#theoryRoot .vm-tex-solution').length,
    }));
    if (!theory.text.includes('Đáp số 6') || theory.solutions < 2) throw new Error(`Theory solutions disappeared: ${JSON.stringify(theory)}`);
    if (theory.text.includes('undefined') || /\\begin\{align\*?\}/.test(theory.text)) throw new Error(`Aligned solution leaked raw LaTeX: ${JSON.stringify(theory)}`);

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
    if (!lesson.includes('vmMoPdfExport') || !lesson.includes('vmPdfExportModal') || !lesson.includes('vmCauHinhNoiDungPdf')) throw new Error('Configurable on-demand PDF export is missing');
    if (!lesson.includes('vmDoiZoomReader') || !lesson.includes('vmToggleReaderFullscreen')) throw new Error('Reader zoom/fullscreen controls are missing');
    const fullscreenFn = extractFunction(lesson, 'vmToggleReaderFullscreen');
    if (/\.requestFullscreen\s*\(/.test(fullscreenFn) || /\.webkitRequestFullscreen\s*\(/.test(fullscreenFn)) throw new Error('Reader fullscreen still delegates to the browser/PWA native fullscreen lifecycle');
    if (!lesson.includes('.vm-tex-kind-document .vm-tex-reader,.vm-tex-kind-test .vm-tex-reader { width:100%; max-width:none; }')) throw new Error('Desktop document/test readers are still constrained to the narrow reading column');
    if (!lesson.includes('.theory-reading-container { width:100%; max-width:1520px;') || !lesson.includes('.theory-reading-container > .vm-tex-reader { width:100%; max-width:none; }')) throw new Error('Lesson theory reader is still constrained to the old 900px paper column');
    if (!lesson.includes('vmLayKhaiBaoTikz') || !lesson.includes('tkz-euclide,pgfplots')) throw new Error('TikZ compiler preamble support is missing');
    if (!lesson.includes('vmMauDuPhongTikz') || !lesson.includes('providecolor')) throw new Error('TikZ custom-color fallback is missing');
    if (!lesson.includes('vmTikzMaxConcurrent') || !lesson.includes('vmLayTikzPdfNhanh') || !reader.includes('vmTikzPdfDangTai')) throw new Error('Fast TikZ queue/cache deduplication is missing');
    if (!lessonAdmin.includes('vmRenderTikzPreviewNhanh(output)') || !classAdmin.includes('vmRenderTikzPreviewNhanh(output)')) throw new Error('Admin TikZ preview renderer is not wired');
    if (![lesson, lessonAdmin, classAdmin].every((source) => source.includes('js/latex-view.js?v=11.0'))) throw new Error('LaTeX reader cache version was not bumped');
    if (!/\.vm-tex-reader\s*\{[\s\S]*?flex:0 0 auto;[\s\S]*?overflow:visible;/.test(inlineCss)) throw new Error('Long reader content can still be clipped by flex sizing');
    if (lesson.includes('id="btnMaxContent"')) throw new Error('Legacy transparent content fullscreen button still exists');
    if (!lesson.includes('vmReaderLoadingHTML') || !lesson.includes('Đang dựng nội dung lý thuyết')) throw new Error('Visible reader build state is missing');
    if (!/var\s+pdfUrl\s*=\s*buildPdfUrl\(b\.docPath\);[\s\S]*?renderPDFWithJS\(pdfUrl,\s*pdfBox\)/.test(lesson)) throw new Error('PDF-only homework does not use the web viewer');
    console.log('PASS native LaTeX reader, upload, solution safety, PDF fallback, desktop and mobile checks');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
