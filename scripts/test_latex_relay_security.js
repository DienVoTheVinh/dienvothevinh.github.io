'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

(async () => {
  const moduleUrl = pathToFileURL(path.resolve('supabase/functions/latex/security.ts')).href;
  const { LatexValidationError, validateLatexSource } = await import(moduleUrl);
  const expectRejected = async (source, purpose = 'document') => {
    let rejected = false;
    try { await validateLatexSource(source, purpose); }
    catch (error) { rejected = error instanceof LatexValidationError; }
    if (!rejected) throw new Error(`Unsafe LaTeX was accepted: ${source.slice(0, 100)}`);
  };

  await validateLatexSource(String.raw`\documentclass{article}\begin{document}Hợp lệ $x^2$.\end{document}`, 'document');
  await validateLatexSource(String.raw`\documentclass{standalone}\usepackage{tikz}\newcommand{\safe}[1]{\textbf{#1}}\definecolor{vmblue}{RGB}{0,90,180}\tikzset{every node/.style={vmblue}}\begin{document}\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}\end{document}`, 'tikz');

  const style = fs.readFileSync('ex_test.sty','utf8').replace(/\r\n?/g,'\n');
  await validateLatexSource(`\\begin{filecontents*}{ex_test.sty}\n${style}\n\\end{filecontents*}\n\\documentclass{article}\\begin{document}Đề hợp lệ\\end{document}`, 'document');
  const virtualBundle = [
    ['ex_test.sty',style],
    ['titledot.sty',fs.readFileSync('titledot.sty','utf8')],
    ['casiovn.sty',fs.readFileSync('casiovn.sty','utf8')],
    ['casio580x.sty',fs.readFileSync('casio580x.sty','utf8')],
    ['chuong-1.tex',String.raw`Nội dung chương có macro an toàn $x^2$.`],
  ].map(([name, body]) => `\\begin{filecontents*}{${name}}\n${String(body).replace(/\r\n?/g,'\n')}\n\\end{filecontents*}`).join('\n');
  await validateLatexSource(`${virtualBundle}\n\\documentclass{article}\\usepackage{ex_test,titledot,casiovn,casio580x}\\begin{document}\\input{chuong-1.tex}\\IfFileExists{logo/VinhMath_logo.png}{\\includegraphics[width=6cm]{logo/VinhMath_logo.png}}{}\\end{document}`, 'document');

  const canonicalStyles = new Map([
    ['ex_test.sty', fs.readFileSync('ex_test.sty', 'utf8')],
    ['titledot.sty', fs.readFileSync('titledot.sty', 'utf8')],
    ['casiovn.sty', fs.readFileSync('casiovn.sty', 'utf8')],
    ['casio580x.sty', fs.readFileSync('casio580x.sty', 'utf8')],
  ]);
  const fetchCanonicalStyle = async (name) => ({
    ok: canonicalStyles.has(String(name)),
    text: async () => canonicalStyles.get(String(name)) || '',
  });
  const extractSource = (pageSource, startMarker, endMarker) => {
    const startAt = pageSource.indexOf(startMarker);
    const endAt = pageSource.indexOf(endMarker, startAt + startMarker.length);
    if (startAt < 0 || endAt < 0) {
      throw new Error('Không tìm thấy hàm dựng TeX giữa ' + startMarker + ' và ' + endMarker);
    }
    return pageSource.slice(startAt, endAt);
  };
  const assertCanonicalCasioBlocks = async (pageName, tex) => {
    for (const styleName of ['casiovn.sty', 'casio580x.sty']) {
      const expected = '\\begin{filecontents*}{' + styleName + '}\n' +
        canonicalStyles.get(styleName) + '\n\\end{filecontents*}\n';
      if (!String(tex).includes(expected)) {
        throw new Error(pageName + ' không nhúng nguyên văn ' + styleName + ' chuẩn');
      }
    }
  };

  for (const [pageName, builderName, startMarker, endMarker] of [
    ['bai-hoc.html', 'chuanHoaTexBaiHoc', 'async function chuanHoaTexBaiHoc', 'async function hienTaiLieuTex'],
    ['quan-tri-bai-hoc.html', 'chuanHoaTexTestLatex', 'async function chuanHoaTexTestLatex', 'async function bienDichTestLatex'],
    ['quan-tri-lop.html', 'chuanHoaTexTestLatex', 'async function chuanHoaTexTestLatex', 'async function bienDichLatexXem'],
  ]) {
    const pageSource = fs.readFileSync(pageName, 'utf8');
    if (/\\ProvidesPackage\{(?:casiovn|casio580x)\}/u.test(pageSource)) {
      throw new Error(pageName + ' vẫn chứa bản Casio chép cứng');
    }
    const sandbox = {
      fetch: fetchCanonicalStyle,
      console,
      processVirtualFiles: async (value) => value,
    };
    vm.runInNewContext(
      extractSource(pageSource, startMarker, endMarker) +
        '\nthis.__casioBuilder = ' + builderName + ';',
      sandbox,
      { filename: pageName },
    );
    const tex = await sandbox.__casioBuilder('Nội dung kiểm thử.');
    await assertCanonicalCasioBlocks(pageName, tex);
  }

  {
    const pageName = 'luyen-de.html';
    const pageSource = fs.readFileSync(pageName, 'utf8');
    if (/\\ProvidesPackage\{(?:casiovn|casio580x)\}/u.test(pageSource)) {
      throw new Error(pageName + ' vẫn chứa bản Casio chép cứng');
    }
    const sandbox = {
      vmChuanHoaNoiDungDePdf: (value) => String(value || ''),
    };
    vm.runInNewContext(
      extractSource(pageSource, 'function ghepTexCode', 'async function moConfigPDF') +
        '\nthis.__casioBuilder = ghepTexCode;',
      sandbox,
      { filename: pageName },
    );
    const tex = sandbox.__casioBuilder(
      canonicalStyles.get('ex_test.sty'),
      canonicalStyles.get('titledot.sty'),
      canonicalStyles.get('casiovn.sty'),
      canonicalStyles.get('casio580x.sty'),
      '\\documentclass{article}',
      'Nội dung kiểm thử.',
    );
    await assertCanonicalCasioBlocks(pageName, tex);
  }

  const legacyFiles = ['mausac-minimal.tex','Khai-bao-minimal.tex','BosungK.tex','LT-3.tex'];
  const legacyBundle = legacyFiles.map((name) => {
    const body = fs.readFileSync(path.join('cautruc13', name),'utf8').replace(/\r\n?/g,'\n');
    return `\\begin{filecontents*}{${name}}\n${body}\n\\end{filecontents*}`;
  }).join('\n');
  await validateLatexSource(`${virtualBundle}\n${legacyBundle}\n\\documentclass{book}\\begin{document}\\input{mausac-minimal.tex}\\input{Khai-bao-minimal.tex}\\input{BosungK.tex}\\input{LT-3.tex}Nội dung hợp lệ.\\end{document}`, 'document');

  for (const pageName of ['bai-hoc.html','quan-tri-bai-hoc.html','quan-tri-lop.html','luyen-de.html']) {
    const pageSource = fs.readFileSync(pageName,'utf8');
    if (!pageSource.includes("fetch('casiovn.sty')") || !pageSource.includes("fetch('casio580x.sty')") ||
        !pageSource.includes("\\\\begin{filecontents*}{casiovn.sty}") || !pageSource.includes("\\\\begin{filecontents*}{casio580x.sty}") ||
        /ProvidesPackage\{(?:casiovn|casio580x)\}[^\n]*Mock/.test(pageSource)) {
      throw new Error(`${pageName} must embed the hash-pinned canonical Casio styles instead of a copied mock body`);
    }
  }

  for (const source of [
    String.raw`\documentclass{article}\input{secret}\begin{document}x\end{document}`,
    String.raw`\documentclass{article}\include private\begin{document}x\end{document}`,
    String.raw`\documentclass{article}\newcommand{\bad}{
\input{secret}}\begin{document}x\end{document}`,
    String.raw`\documentclass{article}\csname input\endcsname{secret}\begin{document}x\end{document}`,
    String.raw`\documentclass{article}\write18{whoami}\begin{document}x\end{document}`,
    String.raw`\documentclass{article}\begin{document}\pdffiledump offset 0 length 500{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\begin{document}\pdfextension obj stream file{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\begin{document}\pdffeedback filesize{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\begin{document}\pdfprimitive\input{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\begin{document}\primitive\input{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\catcode37=12\begin{document}x\end{document}`,
    String.raw`\documentclass{article}\usepackage{minted}\begin{document}x\end{document}`,
    String.raw`\documentclass{article}\usepackage{verbatim}\begin{document}\verbatiminput{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\usepackage{fancyvrb}\begin{document}\VerbatimInput{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\usepackage{listings}\begin{document}\lstinputlisting{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\usepackage{minted}\begin{document}\inputminted{tex}{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\usepackage{pdfpages}\begin{document}\includepdf{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\usepackage{pgf}\begin{document}\pgfimage{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\usepackage{ex_test}\begin{document}\inputans{1}{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\usepackage{ex_test}\begin{document}\inputansbox{1}{/etc/passwd}\end{document}`,
    String.raw`\documentclass{article}\usepackage{ex_test}\begin{document}\bankEX{/etc/passwd}{1}\end{document}`,
    String.raw`\documentclass{article}\usepackage{ex_test}\begin{document}\randombank{1}\end{document}`,
    String.raw`\documentclass{article}\begin{document}\begin{fileEX}{leak.tex}secret\end{fileEX}\end{document}`,
    String.raw`\documentclass{article}\begin{document}\begin{VerbatimOut}{leak.tex}secret\end{VerbatimOut}\end{document}`,
    String.raw`\documentclass{article}\begin{filecontents*}{evil.sty}payload\end{filecontents*}\begin{document}x\end{document}`,
    String.raw`\begin{filecontents*}{../escape.tex}payload\end{filecontents*}\documentclass{article}\begin{document}x\end{document}`,
    String.raw`\begin{filecontents*}{source.tex}\write18{whoami}\end{filecontents*}\documentclass{article}\begin{document}\input{source.tex}\end{document}`,
    String.raw`\begin{filecontents*}{source.tex}safe\end{filecontents*}\documentclass{article}\begin{document}\input{missing.tex}\end{document}`,
    `\\begin{filecontents*}{ex_test.sty}\n${style}\n% tampered\n\\end{filecontents*}\n\\documentclass{article}\\begin{document}x\\end{document}`,
    `\\begin{filecontents*}{titledot.sty}\n${fs.readFileSync('titledot.sty','utf8')}\n% tampered\n\\end{filecontents*}\n\\documentclass{article}\\begin{document}x\\end{document}`,
  ]) await expectRejected(source);

  await expectRejected(String.raw`\documentclass{article}\begin{document}\begin{tikzpicture}\draw(0,0)--(1,1);\end{tikzpicture}\end{document}`, 'tikz');
  await expectRejected(String.raw`\documentclass{standalone}\begin{document}Không có hình\end{document}`, 'tikz');

  const edge = fs.readFileSync('supabase/functions/latex/index.ts','utf8');
  const validationAt = edge.indexOf('await validateLatexSource(tex, purpose)');
  const compileAt = edge.indexOf('const result = await compile');
  if (validationAt < 0 || compileAt < 0 || validationAt > compileAt) throw new Error('Edge relay must validate before compile');
  if (!edge.includes('error instanceof LatexValidationError') || !edge.includes('status === 400')) throw new Error('Validation errors must return a bounded 400 response');
  console.log('PASS LaTeX relay blocks file, shell and dynamic control sequences before compilation');
})().catch((error) => { console.error(error); process.exit(1); });
