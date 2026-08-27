'use strict';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const browser = await chromium.launch({ executablePath:chrome, headless:true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    await page.evaluate(() => { window.vmDisableGlobalTikzAuto = true; });
    await page.addScriptTag({ path:'js/latex-view.js' });
    const result = await page.evaluate(() => {
      const tex = String.raw`
\immini[thm]{Cho hàm số $y=f(x)$.}{\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}}
\begin{tabular}{|c|cc|}
\begin{tabular}{c}Khoảng\\ điểm\end{tabular} & $[6,5;7)$ & $[7;7,5)$\\
Tần số & 8 & 10
\end{tabular}
Tính $m+n$. \shortans[oly]{216}`;
      return dinhDangVanBanTaiLieuLatex(tex);
    });
    assert.ok(!/\\immini|\\begin\{tabular\}|\\end\{tabular\}|\\shortans/.test(result), result);
    assert.ok(result.includes('vm-tex-table') && result.includes('Khoảng') && result.includes('điểm'), result);
    assert.ok(result.includes('vm-tex-short-answer') && !result.includes('216'), 'HTML preview must not leak or display raw short-answer markup');
    assert.ok(result.includes('vm-tex-tikz'), 'immini optional arguments must preserve its TikZ illustration');
    const css = fs.readFileSync('css/vinhmath.css','utf8');
    const renderer = fs.readFileSync('js/latex-view.js','utf8');
    assert.ok(css.includes('.vm-tex-table .katex') && css.includes('background:transparent'), 'table math must inherit light/dark theme');
    assert.ok(renderer.includes('pixels.data[p+3] = 0'), 'TikZ page-white pixels must become transparent');
    console.log('latex legacy render repairs: passed');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
