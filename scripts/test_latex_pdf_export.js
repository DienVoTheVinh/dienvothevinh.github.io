const fs = require('fs');

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${name}`);
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
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

function extractRange(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`Missing range ${from} -> ${to}`);
  return source.slice(start, end);
}

const lesson = fs.readFileSync('bai-hoc.html', 'utf8');
const reader = fs.readFileSync('js/latex-view.js', 'utf8');
const source = [
  extractRange(reader, 'function xoaLenhKhoiLatex', 'function dinhDangVanBanTaiLieuLatex'),
  extractRange(lesson, 'function vmChenTruocDocument', 'async function vmBatDauXuatPdf'),
  'return { configure: vmCauHinhNoiDungPdf, answers: vmBienDoiLoiGiaiPdf, repair: vmSuaXungDotGeometry };',
].join('\n');
const helpers = new Function(source)();
const configure = helpers.configure;

const sample = String.raw`\documentclass[12pt,a4paper]{article}
\usepackage[dethi]{ex_test}
\begin{document}
\begin{ex}Tinh $1+1$.\choice{1}{\True 2}{3}{4}\loigiai{Vi $1+1=2$.}\end{ex}
\begin{bt}Tinh $2+2$.\solution{Ket qua la 4.}\end{bt}
\end{document}`;

const study = configure(sample, { answers: 'show', dotLines: 4, layout: 'one', margins: 'normal', fontSize: '12' });
if (!/\\usepackage\[dethi,loigiai\]\{ex_test\}/.test(study) || !study.includes('Vi $1+1=2$')) throw new Error('Study preset does not preserve existing ex_test options and solutions');

const worksheet = configure(sample, { answers: 'dots', dotLines: 4, layout: 'one', margins: 'loose', fontSize: '12' });
if (worksheet.includes('Vi $1+1=2$') || worksheet.includes('Ket qua la 4') || (worksheet.match(/\\dotfill/g) || []).length !== 8) throw new Error('Worksheet preset does not replace two solutions with four dotted lines each');

const environmentSample = String.raw`\documentclass{article}
\begin{document}
\begin{bt}Bai 1.\begin{loigiai}LOI GIAI MOI TRUONG\end{loigiai}\end{bt}
\begin{bt}Bai 2.\begin{sol}DAP AN MOI TRUONG\end{sol}\end{bt}
\end{document}`;
const environmentDots = configure(environmentSample, { answers: 'dots', dotLines: 3, layout: 'one', margins: 'normal', fontSize: '12' });
if (environmentDots.includes('LOI GIAI MOI TRUONG') || environmentDots.includes('DAP AN MOI TRUONG') || (environmentDots.match(/\\dotfill/g) || []).length !== 6) throw new Error('Worksheet preset does not replace solution environments with dotted lines');
const safeFallback = helpers.answers(sample, { answers: 'dots', dotLines: 4 });
if (safeFallback.includes('Vi $1+1=2$') || safeFallback.includes('Ket qua la 4') || (safeFallback.match(/\\dotfill/g) || []).length !== 8) throw new Error('Answer-safe fallback leaks original solutions');

const compact = configure(sample, { answers: 'hide', dotLines: 2, layout: 'two', margins: 'tight', fontSize: '10' });
if (compact.includes('Vi $1+1=2$') || compact.includes('Ket qua la 4') || !/10pt,twocolumn/.test(compact)) throw new Error('Compact preset is wrong');
if (!/\\PassOptionsToPackage\{top=1\.2cm,bottom=1\.2cm,left=1cm,right=1cm\}\{geometry\}/.test(compact) || !compact.includes('\\usepackage{geometry}')) throw new Error('Compact margins are not conflict-safe');

const conflictingGeometry = String.raw`\documentclass{article}
\usepackage[top=2cm]{geometry}
\usepackage[left=1cm]{geometry}
\begin{document}A\end{document}`;
const repaired = helpers.repair(conflictingGeometry, 'top=1.5cm,left=1.5cm');
if ((repaired.match(/\\usepackage\{geometry\}/g) || []).length !== 1 || /\\usepackage\[[^\]]+\]\{geometry\}/.test(repaired)) throw new Error('Duplicate geometry packages were not collapsed');
if (repaired.indexOf('\\PassOptionsToPackage{top=1.5cm,left=1.5cm}{geometry}') > repaired.indexOf('\\documentclass')) throw new Error('Geometry options must be passed before documentclass');

const spacedGeometry = String.raw`\documentclass{article}
\usepackage [top=2cm] { geometry }
\RequirePackage[left=1cm]{ geometry }
\begin{document}A\end{document}`;
const repairedSpaced = helpers.repair(spacedGeometry, 'top=1.5cm,left=1.5cm');
if ((repairedSpaced.match(/\\usepackage\{geometry\}/g) || []).length !== 1 || /\\(?:usepackage|RequirePackage)\s*\[[^\]]+\]\s*\{\s*geometry\s*\}/.test(repairedSpaced)) throw new Error('Spaced or RequirePackage geometry declarations were not collapsed');


const preambleSolutionSample = String.raw`\documentclass{article}
\newcommand{\presetSolution}{\loigiai{PREAMBLE SENTINEL}}
\begin{document}
\begin{ex}Bai tap.\loigiai{BODY SOLUTION}\end{ex}
\end{document}`;
const preambleSolutionDots = configure(preambleSolutionSample, { answers: 'dots', dotLines: 4, layout: 'one', margins: 'normal', fontSize: '12' });
if (!preambleSolutionDots.includes(String.raw`\newcommand{\presetSolution}{\loigiai{PREAMBLE SENTINEL}}`) ||
    !preambleSolutionDots.includes(String.raw`\begin{document}`) ||
    !preambleSolutionDots.includes(String.raw`\end{document}`) ||
    preambleSolutionDots.includes('BODY SOLUTION') ||
    (preambleSolutionDots.match(/\\dotfill/g) || []).length !== 4) {
  throw new Error('Worksheet transformation must preserve the complete LaTeX preamble and document boundary');
}

if (!lesson.includes('id="vmPdfExportModal"') || !lesson.includes('id="vmPdfProgressPane"') || !lesson.includes('id="vmPdfResultPane"')) throw new Error('Single-state export modal is incomplete');
if (!lesson.includes('data-preset="original"') || !lesson.includes("vmPdfPresetName = 'original'")) throw new Error('Stable original-source PDF preset is missing');
if (!lesson.includes('vmBienDoiLoiGiaiPdf(originalTex, config)') || !lesson.includes('Đang thử lại và vẫn giữ chế độ ẩn lời giải')) throw new Error('Advanced PDF fallback does not preserve the selected answer mode');
if (!lesson.includes('Option clash for package geometry') || !lesson.includes('Đang tự sửa xung đột lề trang')) throw new Error('Geometry clash auto-repair is missing');
if (!/if \(\/\\\\documentclass\/\.test\(trimmed\)\) \{[\s\S]{0,240}?return trimmed;\s*\}/.test(lesson)) throw new Error('Complete TeX documents must keep the stable unmodified PDF source path');
if (!lesson.includes('.vm-pdf-preview { height:min(62dvh,620px); min-height:360px; overflow:hidden; display:flex; flex-direction:column;') || !lesson.includes('min-height:0; overscroll-behavior:contain; -webkit-overflow-scrolling:touch')) throw new Error('Exported PDF preview cannot scroll through all rendered pages');
console.log('PASS configurable PDF export presets and single popup flow');
