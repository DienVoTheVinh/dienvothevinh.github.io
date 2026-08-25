'use strict';
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const browser = await chromium.launch({ executablePath:chrome, headless:true });
  try {
    const page = await browser.newPage({ viewport:{ width:900,height:600 } });
    await page.setContent('<!doctype html><html data-theme="dark"><head><style>:root{--surface-2:#151922;--line-2:#394150;--ink-3:#aab3c2;--accent:#e7a10c}body{margin:0;background:#090b10}</style></head><body><div id="root"></div></body></html>');
    await page.addScriptTag({ path:'js/latex-view.js' });
    const state = await page.evaluate(() => {
      const figure=document.createElement('figure');
      figure.className='vm-tex-tikz';
      figure.setAttribute('data-vm-tikz-ready','done');
      const canvas=document.createElement('canvas'); canvas.width=120; canvas.height=80; figure.appendChild(canvas);
      document.getElementById('root').appendChild(figure);
      const fs=getComputedStyle(figure), cs=getComputedStyle(canvas);
      const hugePage={getViewport:({scale})=>({width:10000*scale,height:8000*scale})};
      const safeViewport=vmTikzViewportAnToan(hugePage,3);
      return { figureBackground:fs.backgroundColor, border:fs.borderTopColor, canvasBackground:cs.backgroundColor, minHeight:fs.minHeight, filter:cs.filter, safeViewport };
    });
    if (state.figureBackground !== 'rgba(0, 0, 0, 0)' || state.canvasBackground !== 'rgba(0, 0, 0, 0)' || state.minHeight !== '0px' || !state.filter.includes('invert(1)')) {
      throw new Error(`TikZ dark-mode transparency failed: ${JSON.stringify(state)}`);
    }
    if (Math.max(state.safeViewport.width,state.safeViewport.height) > 4096 || state.safeViewport.width*state.safeViewport.height > 12000001) {
      throw new Error(`TikZ viewport safety cap failed: ${JSON.stringify(state.safeViewport)}`);
    }
    console.log('PASS TikZ canvas blends into dark/light page without a white frame');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
