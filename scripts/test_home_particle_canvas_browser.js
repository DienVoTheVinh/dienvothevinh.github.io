'use strict';

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
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json'
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

async function inspectState(page, theme, festivalOn) {
  await page.evaluate(({ themeName, showFestival }) => {
    document.documentElement.setAttribute('data-theme', themeName);
    document.documentElement.style.backgroundColor = themeName === 'dark' ? '#000000' : '#faf8f5';
    window.VMFestival.remove();
    if (showFestival) window.VMFestival.render({ mode: 'on', festival: 'mid_autumn', intensity: 'balanced' }, { force: true });
  }, { themeName: theme, showFestival: festivalOn });

  await page.waitForTimeout(180);
  const state = await page.evaluate(() => {
    const canvas = document.getElementById('cyberCanvas');
    const bodyStyle = getComputedStyle(document.body);
    const canvasStyle = getComputedStyle(canvas);
    const context = canvas.getContext('2d');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let index = 3; index < pixels.length; index += 64) {
      if (pixels[index] > 0) painted += 1;
    }

    const festival = document.getElementById('vmFestivalLayer');
    return {
      isolation: bodyStyle.isolation,
      canvasDisplay: canvasStyle.display,
      canvasVisibility: canvasStyle.visibility,
      canvasOpacity: Number(canvasStyle.opacity),
      canvasZIndex: canvasStyle.zIndex,
      canvasPointerEvents: canvasStyle.pointerEvents,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      painted,
      festivalPresent: Boolean(festival),
      festivalPointerEvents: festival ? getComputedStyle(festival).pointerEvents : null
    };
  });

  expect(state.isolation === 'isolate', `Homepage stacking context is missing for ${theme}/${festivalOn}: ${JSON.stringify(state)}`);
  expect(state.canvasDisplay !== 'none' && state.canvasVisibility === 'visible' && state.canvasOpacity > 0,
    `Particle canvas is hidden for ${theme}/${festivalOn}: ${JSON.stringify(state)}`);
  expect(state.canvasPointerEvents === 'none',
    `Particle canvas blocks page interaction for ${theme}/${festivalOn}: ${JSON.stringify(state)}`);
  expect(state.canvasWidth > 0 && state.canvasHeight > 0 && state.painted > 0,
    `Particle canvas is not drawing for ${theme}/${festivalOn}: ${JSON.stringify(state)}`);

  await page.evaluate(() => {
    const canvas = document.getElementById('cyberCanvas');
    canvas.dataset.previousBackground = canvas.style.backgroundColor;
    canvas.dataset.previousOpacity = canvas.style.opacity;
    canvas.style.setProperty('background-color', 'rgb(255, 0, 255)', 'important');
    canvas.style.setProperty('opacity', '1', 'important');
  });
  const visibleProbe = await page.screenshot({ clip: { x: 2, y: 790, width: 4, height: 4 } });
  await page.evaluate(() => {
    document.getElementById('cyberCanvas').style.setProperty('visibility', 'hidden', 'important');
  });
  const hiddenProbe = await page.screenshot({ clip: { x: 2, y: 790, width: 4, height: 4 } });
  await page.evaluate(() => {
    const canvas = document.getElementById('cyberCanvas');
    canvas.style.removeProperty('visibility');
    canvas.style.backgroundColor = canvas.dataset.previousBackground || '';
    canvas.style.opacity = canvas.dataset.previousOpacity || '';
    delete canvas.dataset.previousBackground;
    delete canvas.dataset.previousOpacity;
  });
  expect(!visibleProbe.equals(hiddenProbe),
    `Particle canvas is still behind the page paint for ${theme}/${festivalOn}: ${JSON.stringify(state)}`);
  expect(state.festivalPresent === festivalOn,
    `Festival fixture state is wrong for ${theme}/${festivalOn}: ${JSON.stringify(state)}`);
  if (festivalOn) {
    expect(state.festivalPointerEvents === 'none', `Festival layer blocks interaction: ${JSON.stringify(state)}`);
  }
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
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('#cyberCanvas').waitFor({ state: 'attached', timeout: 10000 });
    await page.addScriptTag({ path: path.resolve(process.cwd(), 'js/festival-theme.js') });
    for (const theme of ['light', 'dark']) {
      for (const festivalOn of [false, true]) {
        await inspectState(page, theme, festivalOn);
      }
    }

    const tiltBefore = await page.evaluate(() => ({ x: tiltX, y: tiltY }));
    await page.mouse.move(1100, 100);
    await page.waitForTimeout(220);
    const tiltAfter = await page.evaluate(() => ({ x: tiltX, y: tiltY, mouseX, mouseY }));
    expect(tiltAfter.mouseX === 1100 && tiltAfter.mouseY === 100,
      `Particle canvas did not receive mouse coordinates: ${JSON.stringify(tiltAfter)}`);
    expect(Math.abs(tiltAfter.x - tiltBefore.x) > 0.001 || Math.abs(tiltAfter.y - tiltBefore.y) > 0.001,
      `Particle field did not react to pointer movement: ${JSON.stringify({ tiltBefore, tiltAfter })}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await inspectState(page, 'dark', true);
    console.log('PASS homepage particle spheres stay visible in light/dark with festival on/off');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
