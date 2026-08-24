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
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${baseUrl}/vmtool`, { waitUntil:'domcontentloaded' });
    let lazy = await page.evaluate(() => ({plane:!!window.VMToolPlaneState,spatial:!!window.VMTool3DState,scripts:[...document.scripts].map(s=>s.src)}));
    if (lazy.plane || lazy.spatial || lazy.scripts.some(s=>/vmtool-(plane|3d)\.js/.test(s))) throw new Error('Geometry modules loaded before tab selection');
    await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
    await page.waitForTimeout(60);
    let darkPixel=await page.evaluate(()=>{const c=document.getElementById('graphCanvas'),x=c.getContext('2d').getImageData(8,8,1,1).data;return [...x];});
    if(darkPixel[0]+darkPixel[1]+darkPixel[2]>230)throw new Error(`Inequality canvas stayed light in dark theme: ${darkPixel}`);
    await page.click('[data-vmtool-tab="plane"]');
    await page.waitForFunction(() => window.VMToolPlaneState && document.getElementById('planeCanvas').width > 500);
    let result=await page.evaluate(()=>({
      width:document.getElementById('planeCanvas').getBoundingClientRect().width,
      height:document.getElementById('planeCanvas').getBoundingClientRect().height,
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      planeVisible:!document.getElementById('planeTool').hidden,
      inequalityHidden:document.getElementById('inequalityTool').hidden,
      pointCount:window.VMToolPlaneState.points.length,
      objectCount:window.VMToolPlaneState.objects.length,
      latex:window.VMToolPlaneExport.latex()
    }));
    if(result.width<1000||result.height<540||result.overflow||!result.planeVisible||!result.inequalityHidden||result.pointCount<3||result.objectCount<1)throw new Error(`Desktop plane workspace failed: ${JSON.stringify(result)}`);
    darkPixel=await page.evaluate(()=>{const c=document.getElementById('planeCanvas'),x=c.getContext('2d').getImageData(8,8,1,1).data;return [...x];});
    if(darkPixel[0]+darkPixel[1]+darkPixel[2]>230)throw new Error(`Plane canvas stayed light in dark theme: ${darkPixel}`);
    await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
    await page.waitForTimeout(50);
    if(!result.latex.includes('\\begin{tikzpicture}')||!result.latex.includes('\\documentclass'))throw new Error('LaTeX export is incomplete');
    await page.evaluate(()=>{const card=document.getElementById('planeCanvasCard');Object.defineProperty(card,'requestFullscreen',{configurable:true,value:()=>Promise.reject(new Error('blocked in regression test'))});});
    await page.click('#planeFullscreen');
    await page.waitForFunction(()=>document.getElementById('planeCanvasCard').classList.contains('vmtool-pseudo-fullscreen'));
    result=await page.evaluate(()=>{const card=document.getElementById('planeCanvasCard'),rect=card.getBoundingClientRect();return{left:Math.round(rect.left),top:Math.round(rect.top),width:Math.round(rect.width),height:Math.round(rect.height),innerWidth,innerHeight,label:document.getElementById('planeFullscreen').textContent};});
    if(result.left!==0||result.top!==0||result.width!==result.innerWidth||result.height!==result.innerHeight||!result.label.includes('Thu nhỏ'))throw new Error(`Plane fullscreen fallback failed: ${JSON.stringify(result)}`);
    await page.click('#planeFullscreen');
    await page.waitForFunction(()=>!document.getElementById('planeCanvasCard').classList.contains('vmtool-pseudo-fullscreen'));
    await page.click('[data-plane-preset="medians"]');
    result=await page.evaluate(()=>({points:window.VMToolPlaneState.points.length,objects:window.VMToolPlaneState.objects.length,derived:window.VMToolPlaneState.points.filter(p=>p.kind!=='free').length}));
    if(result.points!==6||result.objects!==4||result.derived!==3)throw new Error(`Median preset failed: ${JSON.stringify(result)}`);
    const before=await page.evaluate(()=>{const s=window.VMToolPlaneState,p=s.points.find(p=>p.label==='A'),c=document.getElementById('planeCanvas');return{x:p.x,y:p.y,origin:s.origin,scale:s.scale,clientWidth:c.clientWidth,clientHeight:c.clientHeight,screenX:c.clientWidth/2+s.origin.x+p.x*s.scale,screenY:c.clientHeight/2+s.origin.y-p.y*s.scale};});
    const box=await page.locator('#planeCanvas').boundingBox();
    if(!box||![box.x,box.y,before.screenX,before.screenY].every(Number.isFinite))throw new Error(`Invalid drag coordinates: ${JSON.stringify({box,before})}`);
    await page.mouse.move(box.x+before.screenX,box.y+before.screenY); await page.mouse.down(); await page.mouse.move(box.x+before.screenX+85,box.y+before.screenY-65,{steps:8}); await page.mouse.up();
    const after=await page.evaluate(()=>{const p=window.VMToolPlaneState.points.find(p=>p.label==='A');return{x:p.x,y:p.y};});
    if(Math.hypot(after.x-before.x,after.y-before.y)<.2)throw new Error('Dragging did not move a free point');
    if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.screenshot({path:`${screenshotDir}/vmtool-plane-workspace-desktop.png`,fullPage:true});}
    await page.click('#planeCompile');
    if(!await page.locator('#planeLatexDialog').evaluate(d=>d.open))throw new Error('LaTeX publishing dialog did not open');
    await page.evaluate(()=>{window.sb={auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},functions:{invoke:async()=>({data:new Blob(['%PDF-1.4'],{type:'application/pdf'}),error:null})}};});
    await page.click('#planeRunLatex');
    await page.waitForFunction(()=>document.getElementById('planeLatexPreview').querySelector('iframe')&&document.getElementById('planeLatexStatus').textContent.includes('thành công'));
    if(!await page.locator('#planePdfDownload').isVisible())throw new Error('Compiled PDF download was not exposed');
    if(screenshotDir)await page.screenshot({path:`${screenshotDir}/vmtool-plane-desktop.png`,fullPage:true});
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
    result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,width:document.getElementById('planeCanvas').getBoundingClientRect().width,visible:!document.getElementById('planeTool').hidden}));
    if(result.overflow||result.width>390||!result.visible)throw new Error(`Mobile plane overflow: ${JSON.stringify(result)}`);
    if(screenshotDir)await page.screenshot({path:`${screenshotDir}/vmtool-plane-mobile.png`,fullPage:true});
    const relevant=errors.filter(x=>!/supabase|Failed to fetch|NetworkError/i.test(x));if(relevant.length)throw new Error(relevant.join(' | '));
    console.log('PASS VMTool plane desktop/mobile, lazy loading, dynamic drag and LaTeX dialog');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
