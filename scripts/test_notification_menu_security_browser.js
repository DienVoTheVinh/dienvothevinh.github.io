'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const menuPaths = [
  'js/menu-v5.js',
  'web/trang-web/js/menu-v5.js'
];

function extractBetween(source, startMarker, endMarker, relativePath) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${relativePath}: missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${relativePath}: missing marker after ${startMarker}`);
  return source.slice(start, end);
}

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const browser = await chromium.launch({ executablePath, headless:true });
  try {
    for (const relativePath of menuPaths) {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
      const render = extractBetween(
        source,
        'async function veDanhSachThongBao()',
        'function vmDichDenThongBao(',
        relativePath
      );
      const router = extractBetween(
        source,
        'function vmDichDenThongBao(',
        '// Đóng mở dropdown',
        relativePath
      );

      const page = await browser.newPage();
      await page.route('http://vinhmath.test/**', (route) => route.fulfill({
        status:200,
        contentType:'text/html',
        body:'<!doctype html><html><body><div id="dsThongBao"></div></body></html>'
      }));
      await page.goto('http://vinhmath.test/menu-security');
      await page.addScriptTag({ content:`
        var chuongUserId = 'teacher-1';
        var demThongBao = function () {};
        window.__xss = 0;
        window.__notificationRows = [{
          id:'notice-1',
          title:'<img src=x onerror="window.__xss=1"> Tiêu đề',
          body:'</span><img src=x onerror="window.__xss=2"> Nội dung',
          link:'javascript:window.__xss=3',
          kind:'bank_issue_report',
          read_at:null,
          created_at:'2026-08-26T06:00:00.000Z'
        }];
        var sb = {
          from:function () {
            return {
              select:function () { return this; },
              update:function () { return this; },
              eq:function () { return this; },
              order:function () { return this; },
              limit:function () { return Promise.resolve({ data:window.__notificationRows }); }
            };
          }
        };
        ${render}
        ${router}
      ` });

      await page.evaluate(() => veDanhSachThongBao());
      const rendered = await page.evaluate(() => ({
        text:document.getElementById('dsThongBao').textContent,
        images:document.querySelectorAll('#dsThongBao img').length,
        xss:window.__xss,
        titleTag:document.querySelector('#dsThongBao .bell-item b')?.tagName || '',
        bodyTag:document.querySelector('#dsThongBao .bell-item span')?.tagName || ''
      }));
      if (rendered.images !== 0 || rendered.xss !== 0) {
        throw new Error(`${relativePath}: notification title/body executed as HTML`);
      }
      if (!rendered.text.includes('<img src=x onerror="window.__xss=1"> Tiêu đề') ||
          !rendered.text.includes('</span><img src=x onerror="window.__xss=2"> Nội dung')) {
        throw new Error(`${relativePath}: hostile notification text was not preserved as literal text`);
      }
      if (rendered.titleTag !== 'B' || rendered.bodyTag !== 'SPAN') {
        throw new Error(`${relativePath}: notification renderer stopped using explicit DOM text nodes`);
      }

      const routes = await page.evaluate(() => ({
        javascript:vmDichDenThongBao('javascript:window.__xss=4', '', ''),
        data:vmDichDenThongBao('data:text/html,<img src=x onerror=alert(1)>', '', ''),
        vbscript:vmDichDenThongBao('vbscript:msgbox(1)', '', ''),
        quote:vmDichDenThongBao('javascript:alert(1)\" onclick=\"window.__xss=5', '', ''),
        local:vmDichDenThongBao('/bai-hoc.html?lesson=1', '', ''),
        external:vmDichDenThongBao('https://example.test/resource?q=1', '', '')
      }));
      if (routes.javascript || routes.data || routes.vbscript || routes.quote) {
        throw new Error(`${relativePath}: notification router accepts an unsafe URL scheme`);
      }
      if (routes.local !== '/bai-hoc.html?lesson=1' || routes.external !== 'https://example.test/resource?q=1') {
        throw new Error(`${relativePath}: notification router rejected a valid HTTP(S) destination`);
      }

      const beforeClick = page.url();
      await page.evaluate(async () => {
        const item = document.querySelector('#dsThongBao .bell-item[data-id]');
        await item.onclick();
      });
      if (page.url() !== beforeClick || await page.evaluate(() => window.__xss) !== 0) {
        throw new Error(`${relativePath}: unsafe notification click navigated or executed script`);
      }
      await page.close();
    }

    console.log('PASS notification menu DOM/XSS and URL allow-list browser contract');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
