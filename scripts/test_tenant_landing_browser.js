const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

function expect(value, message) {
  if (!value) throw new Error(message);
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
  })[ext] || 'application/octet-stream';
}

function localFile(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const root = path.resolve(process.cwd());
  let candidate = path.resolve(root, relative);
  if (!candidate.startsWith(root + path.sep) && candidate !== root) return null;
  if (!path.extname(candidate) && fs.existsSync(candidate + '.html')) candidate += '.html';
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error('VM_CHROME_PATH must point to Chrome');
  }

  const server = http.createServer((request, response) => {
    const file = localFile(request.url);
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath, headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(`http://127.0.0.1:${port}/khong-gian?tenant=uyenmath`, { waitUntil: 'domcontentloaded' });
    await page.locator('#spaceContent:not([hidden])').waitFor({ timeout: 20000 });
    expect((await page.title()).startsWith('UYENMATH'), 'Generic landing did not adopt the tenant title.');
    expect((await page.locator('#spaceTitle').textContent()).includes('UYENMATH'), 'Tenant home title did not render.');
    expect(await page.locator('#spacePreviewNote').isHidden(), 'Public landing leaked the admin preview banner.');
    expect((await page.locator('#spacePrimaryAction').getAttribute('href')).includes('tenant=uyenmath'), 'Login action lost tenant routing.');
    expect((await page.locator('#spaceLogo').getAttribute('href')).includes('tenant=uyenmath'), 'Brand logo does not return to the tenant landing.');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#spaceContent:not([hidden])').waitFor({ timeout: 20000 });
    const mobileWidth = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    expect(mobileWidth.content <= mobileWidth.viewport + 1, `Tenant landing overflows on mobile: ${JSON.stringify(mobileWidth)}`);

    await page.goto(`http://127.0.0.1:${port}/uyenmath?ref=legacy#spaceHighlights`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/khong-gian\?ref=legacy&tenant=uyenmath#spaceHighlights/, { timeout: 10000 });
    await page.locator('#spaceContent:not([hidden])').waitFor({ timeout: 20000 });
    expect((await page.title()).startsWith('UYENMATH'), 'Legacy UYENMATH URL did not reach the shared renderer.');

    const builderSource = fs.readFileSync('quan-tri-khong-gian.html', 'utf8');
    const builderStyle = (builderSource.match(/<style>([\s\S]*?)<\/style>/i) || [])[1] || '';
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}${builderStyle}</style>
      <main class="tenant-admin"><div class="tenant-layout"><aside class="tenant-list"><div class="tenant-list-scroll"><button class="tenant-item">Không gian mẫu</button></div></aside>
      <section class="tenant-panel"><div class="tenant-content"><div class="feature-board"><section class="feature-role"><div class="feature-list">
      <div class="feature-row"><button class="feature-grip">⠿</button><div class="feature-label"><input value="Chức năng có tên dài"><div class="feature-key">feature</div></div><select><option>Đang hiện</option></select><div class="feature-move"><button>↑</button><button>↓</button></div></div>
      </div></section><section class="feature-role"><div class="feature-list"></div></section></div></div></section></div></main>`);
    for (const width of [320, 390, 981]) {
      await page.setViewportSize({ width, height: 800 });
      const layoutWidth = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      expect(layoutWidth.content <= layoutWidth.viewport + 1, `Tenant builder overflows at ${width}px: ${JSON.stringify(layoutWidth)}`);
    }

    console.log('PASS tenant browser: shared renderer, live context, routing, legacy redirect and responsive builder');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
