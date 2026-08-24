const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const baseUrl = process.env.VM_BASE_URL || 'http://127.0.0.1:8127';
  const screenshotDir = process.env.VM_SCREENSHOT_DIR;
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/vmtool`, { waitUntil: 'domcontentloaded' });
    await page.click('[data-vmtool-tab="spatial"]');
    await page.waitForFunction(() => window.VMTool3DState && document.getElementById('spatialCanvas').width > 500);

    let result = await page.evaluate(() => {
      const canvas = document.getElementById('spatialCanvas');
      const workspace = document.getElementById('spatialTool').getBoundingClientRect();
      const panel = document.querySelector('.vmtool-3d-panel').getBoundingClientRect();
      const stage = document.querySelector('.vmtool-3d-stage').getBoundingClientRect();
      return {
        canvas: { width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height },
        workspaceWidth: workspace.width, panelWidth: panel.width, stageWidth: stage.width,
        hidden2d: document.getElementById('inequalityTool').hidden,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        points: Object.keys(window.VMTool3DState.model.points),
      };
    });
    if (!result.hidden2d || result.overflow || result.canvas.width < 1000 || result.canvas.height < 580 || result.stageWidth <= result.panelWidth) {
      throw new Error(`Desktop 3D workspace is not using the screen well: ${JSON.stringify(result)}`);
    }

    const yawBefore = await page.evaluate(() => window.VMTool3DState.yaw);
    const box = await page.locator('#spatialCanvas').boundingBox();
    await page.mouse.move(box.x + box.width * .55, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .68, box.y + box.height * .58, { steps: 8 });
    await page.mouse.up();
    const yawAfter = await page.evaluate(() => window.VMTool3DState.yaw);
    if (Math.abs(yawAfter - yawBefore) < .1) throw new Error('Drag did not rotate the solid');

    await page.click('#runPyramidDemo');
    await page.click('[data-demo-step="3"] button');
    result = await page.evaluate(() => {
      const s = window.VMTool3DState;
      const math = window.VMTool3DMath;
      return {
        step: s.demoStep,
        hasPlanes: !!s.planes && s.planes.length === 2,
        hasLine: !!s.intersection,
        distanceS: math.distancePointToLine(s.model.points.S, s.intersection),
        resultText: document.getElementById('intersectionResult').textContent,
        activeSteps: document.querySelectorAll('[data-demo-step].active').length,
      };
    });
    if (result.step !== 3 || !result.hasPlanes || !result.hasLine || result.distanceS > 1e-6 || result.activeSteps !== 3 || !result.resultText.includes('d qua S')) {
      throw new Error(`Pyramid intersection demo failed: ${JSON.stringify(result)}`);
    }
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ path: `${screenshotDir}/vmtool-3d-pyramid-desktop.png`, fullPage: true });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      canvasWidth: Math.round(document.getElementById('spatialCanvas').getBoundingClientRect().width),
      panelWidth: Math.round(document.querySelector('.vmtool-3d-panel').getBoundingClientRect().width),
      demoWidth: Math.round(document.getElementById('pyramidDemoCard').getBoundingClientRect().width),
      visible: !document.getElementById('spatialTool').hidden,
    }));
    if (result.overflow || result.canvasWidth > 390 || result.panelWidth > 390 || result.demoWidth > 390 || !result.visible) {
      throw new Error(`Mobile 3D layout overflow: ${JSON.stringify(result)}`);
    }
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/vmtool-3d-pyramid-mobile.png`, fullPage: true });

    const relevantErrors = pageErrors.filter(message => !/supabase|Failed to fetch|NetworkError/i.test(message));
    if (relevantErrors.length) throw new Error(`Browser errors: ${relevantErrors.join(' | ')}`);
    console.log('PASS VMTool 3D desktop/mobile, drag rotation and pyramid plane-intersection demo');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
