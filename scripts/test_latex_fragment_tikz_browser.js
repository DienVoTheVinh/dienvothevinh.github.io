'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const browser = await chromium.launch({ executablePath:chrome, headless:true });
  try {
    const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
    await page.setContent('<!doctype html><meta charset="utf-8"><body><main id="student"></main><main id="teacher"></main><div id="math"></div><div id="tikz"></div></body>');
    await page.evaluate(() => { window.vmDisableGlobalTikzAuto = true; });
    await page.addScriptTag({ path:'js/tex-environments.js' });
    await page.addScriptTag({ path:'js/latex-view.js' });

    const source = String.raw`\begin{minipage}[t]{0.9\linewidth}
\begin{boxdn}MÔI TRƯỜNG TÁC GIẢ \begin{luuy}KHỐI LỒNG AN TOÀN\end{luuy}\end{boxdn}
\begin{flushleft}CANH TRÁI\end{flushleft}
\begin{flushright}CANH PHẢI\end{flushright}
\begin{figure}[H]HÌNH BAO NGOÀI\end{figure}
\begin{tcolorbox}[title={Khung [cân bằng]}]KHUNG MÀU\end{tcolorbox}
\begin{scriptsize}CHỮ NHỎ\end{scriptsize}
\begin{tasks}[label=(\alph*)](2)\task NHIỆM VỤ A \task NHIỆM VỤ B\end{tasks}
\begin{taskEX}(2)\task BÀI NHANH A \task BÀI NHANH B\end{taskEX}
\begin{description}[leftmargin=2em]\item[Khái niệm] MÔ TẢ A \item[Ví dụ] MÔ TẢ B\end{description}
\begin{dinglist}{43}\item DÒNG KÝ HIỆU\end{dinglist}
\begin{tblr}{colspec={X[c] X[c]}}CỘT A & CỘT B \\ GIÁ TRỊ 1 & GIÁ TRỊ 2\end{tblr}
\begin{onlysolution}BÍ MẬT ONLYSOLUTION\end{onlysolution}
\end{minipage}`;

    const fragment = await page.evaluate((tex) => {
      const student = document.getElementById('student');
      const teacher = document.getElementById('teacher');
      student.innerHTML = vmLatexFragmentRaHTML(tex, { showSolutions:false, fullSource:tex });
      teacher.innerHTML = vmLatexFragmentRaHTML(tex, { showSolutions:true, fullSource:tex });
      const rawEnv = /\\(?:begin|end)\{(?:minipage|flushleft|flushright|figure|tcolorbox|tasks|taskEX|tblr|onlysolution|scriptsize|description|dinglist)\}/;
      return {
        studentText:student.textContent,
        teacherText:teacher.textContent,
        rawStudent:rawEnv.test(student.textContent),
        rawTeacher:rawEnv.test(teacher.textContent),
        callouts:student.querySelectorAll('.vm-tex-callout').length,
        listItems:student.querySelectorAll('li').length,
        tableCells:student.querySelectorAll('.vm-tex-table-wrap td').length,
        teacherSolutions:teacher.querySelectorAll('.vm-tex-solution').length,
      };
    }, source);
    const expectedText = ['MÔI TRƯỜNG TÁC GIẢ','KHỐI LỒNG AN TOÀN','CANH TRÁI','CANH PHẢI','HÌNH BAO NGOÀI','KHUNG MÀU','CHỮ NHỎ','NHIỆM VỤ A','BÀI NHANH B','MÔ TẢ A','DÒNG KÝ HIỆU','GIÁ TRỊ 2'];
    if (expectedText.some((value) => !fragment.studentText.includes(value)) || fragment.rawStudent || fragment.rawTeacher) {
      throw new Error(`Balanced environment conversion leaked or lost content: ${JSON.stringify(fragment)}`);
    }
    if (fragment.studentText.includes('BÍ MẬT ONLYSOLUTION') || !fragment.teacherText.includes('BÍ MẬT ONLYSOLUTION') || fragment.teacherSolutions !== 1) {
      throw new Error(`onlysolution policy failed: ${JSON.stringify(fragment)}`);
    }
    if (fragment.callouts < 2 || fragment.listItems < 7 || fragment.tableCells !== 4) {
      throw new Error(`Custom environment/list/table HTML failed: ${JSON.stringify(fragment)}`);
    }
    const tikzSemantics = await page.evaluate(() => vmChuanHoaMoiTruongVanBan('\\begin{scope}[shift={(1,2)}]A\\end{scope}\\begin{axis}[xmin=0]B\\end{axis}', { showSolutions:false }));
    if (!tikzSemantics.includes('\\begin{scope}') || !tikzSemantics.includes('\\end{scope}') || !tikzSemantics.includes('\\begin{axis}') || !tikzSemantics.includes('\\end{axis}')) {
      throw new Error(`TikZ scope/axis semantics were altered: ${tikzSemantics}`);
    }

    const math = await page.evaluate(() => {
      let captured = null;
      window.renderMathInElement = (root, options) => { captured = { text:root.textContent, options }; };
      const root = document.getElementById('math');
      root.textContent = String.raw`$\heva{x>0\\y>0}\Rightarrow x+y>0$, $a\perp b$, $P\Leftrightarrow Q$, $\hoac{x=1\\x=2}$`;
      renderToanTrong(root);
      return {
        text:captured.text,
        heva:captured.options.macros['\\heva'],
        hoac:captured.options.macros['\\hoac'],
        strict:captured.options.strict,
        throwOnError:captured.options.throwOnError,
        overridesBuiltins:['\\Rightarrow','\\Leftrightarrow','\\perp'].some((key) => Object.prototype.hasOwnProperty.call(captured.options.macros,key)),
      };
    });
    if (!math.heva || !math.hoac || math.strict !== 'ignore' || math.throwOnError !== false || math.overridesBuiltins || !math.text.includes('\\perp')) {
      throw new Error(`Shared math macro options failed: ${JSON.stringify(math)}`);
    }

    const tikzPreamble = await page.evaluate(() => vmTexTikzPreview({ source:'\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}', preamble:'' }, false));
    ['patterns.meta','decorations.text','snakes','shadows','lindenmayersystems','shadings','fadings','fillbetween'].forEach((library) => {
      if (!tikzPreamble.includes(library)) throw new Error(`Missing safe TikZ/PGFPlots library: ${library}`);
    });

    const sanitizedPreamble = await page.evaluate(() => {
      const preamble = String.raw`\newcommand{\vmSafeMacro}{%
\draw[blue] (0,0)--(1,1);
}
\newcommand{\vmBadInput}{%
\input{../../secret}
}
\def\vmBadWrite{%
\immediate\write18{touch-owned}
}
\providecommand{\vmBadOpen}{\openin1=private.tex}
\newcommand{\vmBadDynamic}{\csname input\endcsname{private.tex}}`;
      return {
        direct:vmKhaiBaoTikzPreview(preamble),
        document:vmTexTikzPreview({ source:'\\begin{tikzpicture}\\vmSafeMacro\\end{tikzpicture}', preamble }, false),
      };
    });
    if (!sanitizedPreamble.direct.includes('vmSafeMacro') || !sanitizedPreamble.document.includes('vmSafeMacro')) {
      throw new Error('Safe multiline TikZ macro was removed by the client sanitizer');
    }
    ['vmBadInput','vmBadWrite','vmBadOpen','vmBadDynamic','\\input','\\write18','\\openin','\\csname'].forEach((blocked) => {
      if (sanitizedPreamble.direct.includes(blocked) || sanitizedPreamble.document.includes(blocked)) {
        throw new Error(`Dangerous multiline TikZ declaration leaked through client sanitizer: ${blocked}`);
      }
    });

    const watchdog = await page.evaluate(async () => {
      let invokeOptions = null;
      window.vmTikzTimeoutOverrides = { invoke:25, invokeGrace:1, pdfjs:25, pdfOpen:25, pdfPage:25, pdfRender:25 };
      window.sb = { functions:{ invoke:(_name, options) => { invokeOptions = options; return new Promise(() => {}); } } };
      const started = performance.now();
      let code = '', message = '';
      try { await vmLayTikzPdfNhanh('WATCHDOG-' + Date.now()); }
      catch (error) { code = error.code || ''; message = error.message || ''; }
      return {
        code,
        message,
        elapsed:performance.now() - started,
        aborted:!!(invokeOptions && invokeOptions.signal && invokeOptions.signal.aborted),
        pending:Object.keys(vmTikzPdfDangTai).length,
      };
    });
    if (watchdog.code !== 'VM_TIKZ_TIMEOUT' || !watchdog.aborted || watchdog.pending !== 0 || watchdog.elapsed > 750) {
      throw new Error(`TikZ invoke watchdog/AbortController failed: ${JSON.stringify(watchdog)}`);
    }

    const pdfReset = await page.evaluate(async () => {
      const originalAppend = document.head.appendChild;
      document.head.appendChild = function (node) { return node; };
      window.pdfjsLib = null;
      window._vmTikzPdfJsPromise = null;
      let code = '';
      try { await vmTaiPdfJsTikz(); } catch (error) { code = error.code || ''; }
      document.head.appendChild = originalAppend;
      return { code, reset:window._vmTikzPdfJsPromise === null };
    });
    if (pdfReset.code !== 'VM_TIKZ_TIMEOUT' || !pdfReset.reset) throw new Error(`pdf.js timeout/reset failed: ${JSON.stringify(pdfReset)}`);

    const orphan = await page.evaluate(async () => {
      const root = document.getElementById('tikz');
      root.innerHTML = '<figure class="vm-tex-tikz" data-vm-tikz="VMTIKZ-ORPHAN"><div class="vm-tex-tikz-state"><span class="vm-tex-tikz-spinner"></span></div></figure>';
      await vmRenderTikzPreviewNhanh(root);
      const figure = root.querySelector('figure');
      const retry = figure.querySelector('.vm-tex-tikz-retry');
      const first = figure.getAttribute('data-vm-tikz-ready');
      retry.click();
      const afterClick = figure.getAttribute('data-vm-tikz-ready');
      await new Promise((resolve) => setTimeout(resolve, 130));
      return {
        first,
        afterClick,
        final:figure.getAttribute('data-vm-tikz-ready'),
        retry:!!figure.querySelector('.vm-tex-tikz-retry'),
        spinner:!!figure.querySelector('.vm-tex-tikz-spinner'),
      };
    });
    if (orphan.first !== 'error' || orphan.afterClick !== 'queued' || orphan.final !== 'error' || !orphan.retry || orphan.spinner) {
      throw new Error(`Orphan TikZ retry/no-infinite-spinner failed: ${JSON.stringify(orphan)}`);
    }

    const adminHtml = fs.readFileSync('quan-tri-de.html','utf8');
    const body = adminHtml.match(/<body>([\s\S]*?)<script/)[1];
    const adminPage = await browser.newPage({ viewport:{ width:1500, height:900 } });
    await adminPage.setContent(`<!doctype html><meta charset="utf-8"><body>${body}</body>`);
    await adminPage.evaluate(() => { window.vmDisableGlobalTikzAuto = true; });
    await adminPage.addScriptTag({ path:'js/tex-environments.js' });
    await adminPage.addScriptTag({ path:'js/latex-view.js' });
    await adminPage.addScriptTag({ path:'js/question-bank.js' });
    await adminPage.addScriptTag({ path:'js/exam-admin.js' });
    const bank = await adminPage.evaluate(() => {
      let sharedCalls = 0;
      const shared = window.vmLatexFragmentRaHTML;
      window.vmLatexFragmentRaHTML = function (value, options) { sharedCalls += 1; return shared(value, options); };
      window.VMExamAdmin._bankConfigureAccess({ role:'teacher' });
      window.VMExamAdmin._bankState.searchItems = [{
        question_type:'multiple_choice',
        content_latex:'\\begin{boxdn}XEM TRƯỚC DÙNG CHUNG\\end{boxdn}\\begin{onlysolution}KHÔNG LỘ LỜI GIẢI\\end{onlysolution}',
        choices:[{ key:'A', latex:'$1$' },{ key:'B', latex:'$2$' }],
      }];
      window.VMExamAdmin.bankOpenSearchPreview(0);
      const pane = document.getElementById('bankPreviewHtml');
      const initial = { text:pane.textContent, callouts:pane.querySelectorAll('.vm-tex-callout').length, sharedCalls };
      pane.innerHTML = 'STALE';
      window.dispatchEvent(new CustomEvent('vm:tex-environments-ready'));
      return { initial, refreshedText:pane.textContent, refreshedCallouts:pane.querySelectorAll('.vm-tex-callout').length };
    });
    if (!bank.initial.text.includes('XEM TRƯỚC DÙNG CHUNG') || bank.initial.text.includes('KHÔNG LỘ LỜI GIẢI') || bank.initial.callouts !== 1 || bank.initial.sharedCalls < 3 || !bank.refreshedText.includes('XEM TRƯỚC DÙNG CHUNG') || bank.refreshedCallouts !== 1) {
      throw new Error(`Question-bank shared renderer/event refresh failed: ${JSON.stringify(bank)}`);
    }

    const bankPreamble = await adminPage.evaluate(() => {
      const fullSource = '\\documentclass{article}\n\\usepackage{tikz}\n\\newcommand{\\vmBankLine}{\\draw[blue]}\n\\newcommand{\\vmImportSentinel}{NGUYEN BAN NHAP}\n\\begin{document}\nNội dung\n\\end{document}';
      const question = {
        _bankDocumentIndex:0,
        source_index:0,
        type:'multiple_choice',
        content_tex:'\\begin{tikzpicture}\\vmBankLine (0,0)--(1,1);\\end{tikzpicture}',
        choices:[{ key:'A', latex:'$1$' },{ key:'B', latex:'$2$' }],
        canonical_tex:'\\begin{ex}Hình minh họa\\end{ex}',
      };
      window.VMExamAdmin._bankConfigureAccess({ role:'admin' });
      window.VMExamAdmin._bankState.documents = [{ fileName:'de-co-preamble.tex', text:fullSource }];
      window.VMExamAdmin._bankState.items = [question];
      window.VMExamAdmin.bankOpenLocalPreview(0);
      window.VMExamAdmin.bankOpenImportPreview();
      const figure = document.querySelector('#bankPreviewHtml .vm-tex-tikz');
      const item = figure && window.vmLatexTikzRegistry[figure.getAttribute('data-vm-tikz')];
      return {
        stateSource:window.VMExamAdmin._bankState.preview.fullSource,
        registryPreamble:item && item.preamble || '',
      };
    });
    if (!bankPreamble.stateSource.includes('\\vmBankLine') || !bankPreamble.registryPreamble.includes('\\vmBankLine')) {
      throw new Error(`Question-bank full-source TikZ preamble was lost: ${JSON.stringify(bankPreamble)}`);
    }
    const bankPdfSource = await adminPage.evaluate(async () => {
      let compiled = '';
      window.vmTaiMoiTruongTex = async () => {};
      window.sb = { functions:{ invoke:async (_name, options) => {
        compiled = options.body.tex;
        return { data:new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}), error:null };
      } } };
      await window.VMExamAdmin.bankCompilePreviewPdf();
      return compiled;
    });
    if (!bankPdfSource.includes('\\documentclass{article}') || !bankPdfSource.includes('\\newcommand{\\vmBankLine}') || !bankPdfSource.includes('\\newcommand{\\vmImportSentinel}{NGUYEN BAN NHAP}') || !bankPdfSource.includes('\\begin{document}')) {
      throw new Error('Question-bank PDF compilation lost the trusted full source and custom preamble');
    }

    const adminSource = fs.readFileSync('js/exam-admin.js','utf8');
    const initStart = adminSource.indexOf('async function init()');
    const initEnd = adminSource.indexOf('window.VMExamAdmin=', initStart);
    const initSource = adminSource.slice(initStart, initEnd);
    const envAt = initSource.indexOf("await vmTaiMoiTruongTex()");
    const accessAt = initSource.indexOf('bankConfigureAccess(profile)');
    const teacherReturnAt = initSource.indexOf("if(!bankAccess.canAdmin)");
    const searchStart = adminSource.indexOf('async function bankSearch(event)');
    const searchEnd = adminSource.indexOf('async function bankGenerateExam', searchStart);
    if (envAt < 0 || accessAt < envAt || teacherReturnAt < accessAt || !adminSource.slice(searchStart,searchEnd).includes('renderLatexFragment')) {
      throw new Error('Teacher/admin environment loading or bank-search shared renderer wiring is missing');
    }

    console.log('PASS shared fragment macros/environments, bank preview refresh, TikZ watchdog/retry/pdf.js reset');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
