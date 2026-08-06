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
  'return vmCauHinhNoiDungPdf;',
].join('\n');
const configure = new Function(source)();

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

const compact = configure(sample, { answers: 'hide', dotLines: 2, layout: 'two', margins: 'tight', fontSize: '10' });
if (compact.includes('Vi $1+1=2$') || compact.includes('Ket qua la 4') || !/10pt,twocolumn/.test(compact)) throw new Error('Compact preset is wrong');
if (!/\\usepackage\[top=1\.2cm,bottom=1\.2cm,left=1cm,right=1cm\]\{geometry\}/.test(compact)) throw new Error('Compact margins are missing');

if (!lesson.includes('id="vmPdfExportModal"') || !lesson.includes('id="vmPdfProgressPane"') || !lesson.includes('id="vmPdfResultPane"')) throw new Error('Single-state export modal is incomplete');
if (!lesson.includes('data-preset="original"') || !lesson.includes("vmPdfPresetName = 'original'")) throw new Error('Stable original-source PDF preset is missing');
if (!lesson.includes('vmBienDichPdfTex(originalTex)') || !lesson.includes('Đang thử lại bằng bản TeX gốc')) throw new Error('Advanced PDF configuration has no original-source fallback');
console.log('PASS configurable PDF export presets and single popup flow');
