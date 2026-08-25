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
        alphaSelects: document.querySelectorAll('#planeASelects select').length,
        betaSelects: document.querySelectorAll('#planeBSelects select').length,
      };
    });
    if (!result.hidden2d || result.overflow || result.canvas.width < 1000 || result.canvas.height < 580 || result.stageWidth <= result.panelWidth || result.alphaSelects !== 4 || result.betaSelects !== 4) {
      throw new Error(`Desktop 3D workspace is not using the screen well: ${JSON.stringify(result)}`);
    }

    await page.evaluate(() => {
      const s = window.VMTool3DState;
      s.yaw = -.62; s.pitch = .32;
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(60);
    const frontC = await page.evaluate(() => window.VMTool3DState.renderMeta.hiddenEdges.slice());
    for (const edge of ['S-A', 'A-B', 'D-A']) if (!frontC.includes(edge)) throw new Error(`Missing rear edge ${edge}: ${frontC.join(', ')}`);
    for (const edge of ['S-C', 'B-C', 'C-D']) if (frontC.includes(edge)) throw new Error(`Front edge ${edge} is dashed: ${frontC.join(', ')}`);

    await page.selectOption('#planeASelects select:nth-child(4)', 'D');
    await page.click('#findIntersection');
    const invalidFourth = await page.locator('#intersectionResult').innerText();
    if (!invalidFourth.includes('không đồng phẳng')) throw new Error(`Fourth-point coplanarity was not validated: ${invalidFourth}`);
    await page.selectOption('#planeASelects select:nth-child(4)', '');

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.waitForTimeout(50);
    const yawBefore = await page.evaluate(() => window.VMTool3DState.yaw);
    const renderBefore = await page.evaluate(() => ({
      hidden: window.VMTool3DState.renderMeta.hiddenEdges.slice(),
      colors: window.VMTool3DState.renderMeta.faceColors.slice(),
    }));
    const box = await page.locator('#spatialCanvas').boundingBox();
    await page.mouse.move(box.x + box.width * .55, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .68, box.y + box.height * .58, { steps: 8 });
    await page.mouse.up();
    const yawAfter = await page.evaluate(() => window.VMTool3DState.yaw);
    if (Math.abs(yawAfter - yawBefore) < .1) throw new Error('Drag did not rotate the solid');
    const renderAfter = await page.evaluate(() => ({
      hidden: window.VMTool3DState.renderMeta.hiddenEdges.slice(),
      colors: window.VMTool3DState.renderMeta.faceColors.slice(),
    }));
    if (JSON.stringify(renderBefore.hidden) === JSON.stringify(renderAfter.hidden)) throw new Error('Hidden-edge set did not react to the camera angle');
    if (JSON.stringify(renderBefore.colors) !== JSON.stringify(renderAfter.colors)) throw new Error(`Face colors changed after rotation: ${JSON.stringify({ before: renderBefore.colors, after: renderAfter.colors })}`);

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
        segment: s.renderMeta.intersectionSegment,
      };
    });
    if (result.step !== 3 || !result.hasPlanes || !result.hasLine || !result.segment || result.distanceS > 1e-6 || result.activeSteps !== 3 || !result.resultText.includes('d qua S')) {
      throw new Error(`Pyramid intersection demo failed: ${JSON.stringify(result)}`);
    }
    await page.click('#fullscreen3d');
    await page.waitForFunction(() => document.getElementById('spatialCanvasCard').classList.contains('vmtool-pseudo-fullscreen'));
    result = await page.evaluate(() => {
      const card = document.getElementById('spatialCanvasCard');
      const rect = card.getBoundingClientRect();
      const exit = card.querySelector('.vmtool-fullscreen-exit');
      const exitRect = exit.getBoundingClientRect();
      return { left:Math.round(rect.left), top:Math.round(rect.top), width:Math.round(rect.width), height:Math.round(rect.height), innerWidth, innerHeight, label:document.getElementById('fullscreen3d').textContent, locked:document.documentElement.classList.contains('vmtool-fullscreen-open'), exitVisible:getComputedStyle(exit).display !== 'none', exitLeft:Math.round(exitRect.left), exitTop:Math.round(exitRect.top) };
    });
    if (result.left !== 0 || result.top !== 0 || result.width !== result.innerWidth || result.height !== result.innerHeight || !result.label.includes('Thu nhỏ') || !result.locked || !result.exitVisible || result.exitLeft < 0 || result.exitTop < 0) throw new Error(`3D fullscreen overlay did not cover the viewport: ${JSON.stringify(result)}`);
    await page.click('#spatialCanvasCard .vmtool-fullscreen-exit');
    await page.waitForFunction(() => !document.getElementById('spatialCanvasCard').classList.contains('vmtool-pseudo-fullscreen'));
    result = await page.evaluate(() => ({ label:document.getElementById('fullscreen3d').textContent, locked:document.documentElement.classList.contains('vmtool-fullscreen-open') }));
    if (!result.label.includes('Toàn màn hình') || result.locked) throw new Error(`3D fullscreen overlay did not exit cleanly: ${JSON.stringify(result)}`);
    result = await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      const wrap = document.getElementById('spatialCanvasWrap');
      const status = document.querySelector('.vmtool-3d-status');
      return { wrapBackground: getComputedStyle(wrap).backgroundImage, statusBackground: getComputedStyle(status).backgroundColor };
    });
    await page.waitForTimeout(50);
    if (!/rgb\(23, 35, 49\)|rgb\(16, 24, 33\)|rgb\(10, 17, 24\)/.test(result.wrapBackground) || !/rgba\(10, 20, 29/.test(result.statusBackground)) {
      throw new Error(`Dark 3D workspace did not apply: ${JSON.stringify(result)}`);
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
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
    console.log('PASS VMTool 3D desktop/mobile, viewport fullscreen overlay, visible exit control, depth-based hidden edges, optional coplanar fourth point, dark theme and clipped plane intersection');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
