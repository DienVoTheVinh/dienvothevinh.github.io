const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const {spawnSync} = require('node:child_process');
const {configure} = require('./test_latex_pdf_export.js');

(async () => {
  const root = path.resolve(__dirname, '..');
  const {validateLatexSource, LatexValidationError} = await import(pathToFileURL(path.join(root, 'supabase/functions/latex/security.ts')));
  const {prepareValidatedLatexForCompile: prepare} = await import(pathToFileURL(path.join(root, 'supabase/functions/latex/compat.ts')));
  const styles = ['casiovn.sty', 'casio580x.sty'].map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]);
  const blocks = styles.map(([name, body]) => `\\begin{filecontents*}{${name}}\n${body}\n\\end{filecontents*}`).join('\n');
  const document = String.raw`\documentclass{article}
\usepackage{casiovn,casio580x}
\begin{document}Exercise $\exp(x)+x^2$.\end{document}`;
  const original = blocks + '\n' + document;
  await validateLatexSource(original, 'document');
  const repaired = prepare(original);
  for (const name of ['exp2k', 'mul10expk', 'log10k']) {
    assert.ok(repaired.includes('\\expandafter\\DeclareRobustCommand\\csname ' + name + '\\endcsname'));
    assert.ok(!repaired.includes('\\DeclareRobustCommand{\\' + name + '}'));
  }
  assert.equal(prepare(repaired), repaired, 'Repair must be idempotent');
  assert.ok(repaired.endsWith(document), 'Do not alter the author body or normal math commands');
  const outsideStyle = String.raw`\documentclass{article}\DeclareRobustCommand{\mul10expk}{outside}\begin{document}X\end{document}`;
  assert.equal(prepare(outsideStyle), outsideStyle, 'No global declaration rewrites');
  assert.equal(prepare(blocks.replace(/casiovn\.sty/g, 'unknown.sty').replace(/casio580x\.sty/g, 'other.tex')), blocks.replace(/casiovn\.sty/g, 'unknown.sty').replace(/casio580x\.sty/g, 'other.tex'));
  await assert.rejects(validateLatexSource(original.replace('\\RequirePackage{xspace}', '\\RequirePackage{xspace}\n\\input{/etc/passwd}'), 'document'), LatexValidationError, 'Tampered canonical styles still fail validation');
  await assert.rejects(validateLatexSource(repaired, 'document'), LatexValidationError, 'Only the original hash-verified source may enter the API');
  const relay = fs.readFileSync(path.join(root, 'supabase/functions/latex/index.ts'), 'utf8');
  assert.ok(relay.indexOf('await validateLatexSource(tex, purpose)') < relay.indexOf('prepareValidatedLatexForCompile(tex)'));
  assert.match(relay, /compile\(compilationTex, engine, DOCUMENT_TIMEOUT_MS\)/);
  assert.match(relay, /compile\(compilationTex, engine, TIKZ_TIMEOUT_MS\)/);
  const tikz = String.raw`\documentclass{standalone}\usepackage{tikz}\begin{document}\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}\end{document}`;
  await validateLatexSource(tikz, 'tikz'); assert.equal(prepare(tikz), tikz);

  // Exercise the real lesson wrapper and its canonical dependencies, rather
  // than a mock preamble that would omit the broken automatically loaded sty.
  const page = fs.readFileSync(path.join(root, 'bai-hoc.html'), 'utf8');
  const start = page.indexOf('async function processVirtualFiles(');
  const end = page.indexOf('async function hienTaiLieuTex(', start);
  const context = {console, fetch:async url => {
    const asset = path.resolve(root, String(url).replace(/^\//, ''));
    assert.ok(asset.startsWith(root + path.sep));
    return {ok:fs.existsSync(asset), text:async () => fs.readFileSync(asset, 'utf8')};
  }};
  vm.runInNewContext(page.slice(start, end) + '\nthis.build = chuanHoaTexBaiHoc;', context);
  const lesson = process.env.VM_TEST_LESSON_SOURCE
    ? fs.readFileSync(process.env.VM_TEST_LESSON_SOURCE, 'utf8')
    : String.raw`\begin{ex}[1,5 điểm]
Rút gọn biểu thức $A=\dfrac{\sqrt{15}-\sqrt5}{\sqrt3-1}$.
\loigiai{VMSOLUTIONSENTINEL. Ta có $A=\sqrt5$. Kiểm tra kết quả và điều kiện xác định.}
\end{ex}
\begin{ex}Cho tam giác $ABC$. Quan sát hình vẽ.
\begin{center}\begin{tikzpicture}\draw (0,0) node[below]{$A$}--(3,0) node[below]{$B$}--(1,2) node[above]{$C$}--cycle;\end{tikzpicture}\end{center}
\loigiai{Tổng ba góc trong tam giác bằng $180^\circ$.}\end{ex}`;
  const generated = await context.build(lesson);
  await validateLatexSource(generated, 'document');
  assert.notEqual(prepare(generated), generated, 'The real wrapper exercises the Casio compatibility repair');
  const variants = [
    ['original', null],
    ['study', {answers:'show', dotLines:4, layout:'one', margins:'normal', fontSize:'12'}],
    ['hide', {answers:'hide', dotLines:4, layout:'one', margins:'normal', fontSize:'12'}],
    ...[2,4,6,8].map(n => ['dots-' + n, {answers:'dots', dotLines:n, layout:'one', margins:'loose', fontSize:'12'}]),
    ['compact', {answers:'hide', dotLines:2, layout:'two', margins:'tight', fontSize:'10'}],
    ['study-two-columns', {answers:'show', dotLines:4, layout:'two', margins:'tight', fontSize:'11'}],
    ['dots-two-columns', {answers:'dots', dotLines:4, layout:'two', margins:'tight', fontSize:'10'}],
  ];
  for (const [file, next, name] of [
    ['quan-tri-bai-hoc.html', 'async function bienDichTestLatex', 'teacher-lesson'],
    ['quan-tri-lop.html', 'async function bienDichLatexXem', 'teacher-class'],
  ]) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const from = html.indexOf('async function chuanHoaTexTestLatex(');
    const scope = {...context};
    vm.runInNewContext(html.slice(from, html.indexOf(next, from)) + '\nthis.buildTeacher = chuanHoaTexTestLatex;', scope);
    variants.push([name, null, await scope.buildTeacher(lesson)]);
  }
  const practice = fs.readFileSync(path.join(root, 'luyen-de.html'), 'utf8');
  const preambleLiteral = practice.match(/var PREAMBLE_MAC_DINH = (`[\s\S]*?`);/)[1];
  const practiceScope = {vmChuanHoaNoiDungDePdf:value => value};
  const practiceStart = practice.indexOf('function ghepTexCode(');
  vm.runInNewContext('var PREAMBLE_MAC_DINH = ' + preambleLiteral + ';\n' + practice.slice(practiceStart, practice.indexOf('async function moConfigPDF(', practiceStart)) + '\nthis.buildPractice = ghepTexCode;', practiceScope);
  const readStyle = name => fs.readFileSync(path.join(root, name), 'utf8');
  variants.push(['practice', null, practiceScope.buildPractice(...['ex_test.sty','titledot.sty','casiovn.sty','casio580x.sty'].map(readStyle), practiceScope.PREAMBLE_MAC_DINH, lesson)]);
  for (const [name, config, explicit] of variants) {
    const candidate = explicit || (config ? configure(generated, config) : generated);
    await validateLatexSource(candidate, 'document');
    if (!process.env.VM_TEST_LESSON_SOURCE && config) assert.equal(candidate.includes('VMSOLUTIONSENTINEL'), config.answers === 'show', name + ': do not expose answers');
  }
  if (process.argv.includes('--compile')) {
    fs.mkdirSync(path.join(root, 'output/pdf-render-qa'), {recursive:true});
    const work = fs.mkdtempSync(path.join(root, 'output/pdf-render-qa/compile-'));
    for (const [name, config, explicit] of variants) {
    const folder = path.join(work, name); fs.mkdirSync(folder);
    const candidate = explicit || (config ? configure(generated, config) : generated);
    fs.writeFileSync(path.join(folder, 'document.tex'), prepare(candidate));
    fs.writeFileSync(path.join(folder, 'request.tex'), candidate);
    for (let pass = 0; pass < 2; pass++) {
      const result = spawnSync(process.env.VM_PDFLATEX_PATH || 'pdflatex', ['-interaction=nonstopmode', '-halt-on-error', '-file-line-error', 'document.tex'], {cwd:folder, encoding:'utf8', timeout:120000});
      if (result.error) throw result.error;
      assert.equal(result.status, 0, name + ': ' + (result.stdout || '').slice(-3500));
    }
    assert.ok(fs.statSync(path.join(folder, 'document.pdf')).size > 1000);
    const text = spawnSync(process.env.VM_PDFTOTEXT_PATH || 'pdftotext', ['-layout', path.join(folder, 'document.pdf'), '-'], {encoding:'utf8'});
    if (text.error) throw text.error;
    assert.equal(text.status, 0);
    if (!process.env.VM_TEST_LESSON_SOURCE && config) assert.equal(text.stdout.includes('VMSOLUTIONSENTINEL'), config.answers === 'show', name + ': verify answers in the rendered PDF, not only TeX');
    console.log('PDF compile, text and second-pass references verified:', path.join(folder, 'document.pdf'));
    }
  }
  console.log('PASS: trusted Casio declarations, real lesson source, no author/style mutations, malicious inputs rejected, normal/TikZ paths unchanged');
})().catch(error => {console.error(error); process.exitCode = 1;});
