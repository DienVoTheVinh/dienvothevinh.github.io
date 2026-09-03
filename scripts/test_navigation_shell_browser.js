'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'vinhmath.css'), 'utf8');
const menu = fs.readFileSync(path.join(root, 'js', 'menu-v5.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const chrome = process.env.VM_CHROME_PATH;
if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');

function pageHtml() {
  return `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><style>${css}</style></head><body>
    <header class="topbar"><div class="nav">
      <a class="logo" href="index"><span class="brand-container-el"><span class="brand-vinh">Vinh</span><span class="brand-math">Math</span></span></a>
      <nav class="navlinks"></nav><button id="themeBtn">☼</button>
    </div></header>
    <script>function daKetNoi(){return false}${menu}</script>
  </body></html>`;
}

(async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(pageHtml());
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${port}/quan-tri-cham-bai`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => apDungMenu('admin', null, null, null));
    assert.strictEqual(await page.locator('.navlinks > a').count(), 7, 'Admin menu was not generated');
    assert(await page.evaluate(() => !!sessionStorage.getItem('vm-menu-shell-v1')), 'Menu shell was not cached in the session');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('.navlinks a[href="quan-tri-lop"]').click(),
    ]);
    const state = await page.evaluate(() => ({
      links: document.querySelectorAll('.navlinks > a').length,
      active: document.querySelector('.navlinks a.active') && document.querySelector('.navlinks a.active').textContent,
      ready: document.documentElement.classList.contains('vm-menu-shell-ready'),
      role: document.body.classList.contains('vm-role-admin'),
      topbarTransitionName: getComputedStyle(document.querySelector('.topbar')).viewTransitionName,
    }));
    assert.strictEqual(state.links, 7, `Cached menu disappeared after navigation: ${JSON.stringify(state)}`);
    assert.strictEqual(state.active, 'Lớp học', `Cached menu did not update its active tab: ${JSON.stringify(state)}`);
    assert(state.ready && state.role, `Cached menu did not restore the session shell: ${JSON.stringify(state)}`);
    assert.strictEqual(state.topbarTransitionName, 'vm-stable-topbar', 'Topbar is not isolated from the root fade');
    console.log('PASS navigation keeps a stable topbar and restores the session menu before async permission refresh');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exit(1); });
