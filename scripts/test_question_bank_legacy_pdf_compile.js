'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function findFile(root, name) {
  for (const entry of fs.readdirSync(root, { withFileTypes:true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(target, name);
      if (found) return found;
    } else if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return target;
  }
  return '';
}

(async () => {
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const sourcePath = findFile('NganHang', 'Dethamkhao9.tex');
  if (!sourcePath) throw new Error('Dethamkhao9.tex was not found in NganHang');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const style = fs.readFileSync('ex_test.sty', 'utf8');

  const browser = await chromium.launch({ executablePath:chrome, headless:true });
  let tex = '', normalized = '';
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    await page.evaluate((sty) => {
      window.vmDisableGlobalTikzAuto = true;
      window.fetch = async (url) => {
        if (String(url).endsWith('ex_test.sty')) return new Response(sty, {status:200,headers:{'content-type':'text/plain'}});
        throw new Error(`Unexpected fetch in PDF source test: ${url}`);
      };
    }, style);
    await page.addScriptTag({ path:'js/latex-view.js' });
    await page.addScriptTag({ path:'js/exam-admin.js' });
    const generated = await page.evaluate(async ({raw,title}) => ({
      normalized:window.VMExamAdmin._normalizeLegacyPdfFragment(raw),
      tex:await window.VMExamAdmin._buildPdfSource(raw,title,'thpt')
    }), {raw:source,title:'DETHAMKHAO9'});
    normalized = generated.normalized;
    tex = generated.tex;
  } finally {
    await browser.close();
  }

  if (/\\(?:Open|Close)solutionfile\b/.test(normalized)) throw new Error('answer sidecar commands survived fragment normalization');
  if (!tex.includes(String.raw`\providecommand{\indam}[1]{\textbf{#1}}`)) throw new Error('guarded \\indam fallback is missing');

  const form = new FormData();
  form.append('filename[]', 'document.tex');
  form.append('filecontents[]', tex);
  form.append('engine', 'pdflatex');
  form.append('return', 'pdf');
  const response = await fetch('https://texlive.net/cgi-bin/latexcgi', {method:'POST',body:form,signal:AbortSignal.timeout(120000)});
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.toLowerCase().includes('pdf') || bytes.subarray(0,5).toString('ascii') !== '%PDF-') {
    const log = bytes.toString('utf8');
    const errors = log.split(/\r?\n/).filter((line) => line.startsWith('!') || /error/i.test(line)).slice(0,10).join(' ');
    const undefinedAt = log.indexOf('! Undefined control sequence.');
    const context = undefinedAt >= 0 ? log.slice(undefinedAt, undefinedAt + 1200) : '';
    throw new Error(`Dethamkhao9 PDF compile failed: ${errors || log.slice(0,800)}\n${context}`);
  }
  console.log(`PASS Dethamkhao9 legacy PDF compile (${bytes.length} bytes)`);
})().catch((error) => { console.error(error); process.exit(1); });
