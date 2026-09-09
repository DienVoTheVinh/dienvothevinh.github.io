const {chromium}=require('C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('child_process'),assert=require('assert/strict'),fs=require('fs');
const target=process.env.VMTOOLS_TEST_URL||'http://127.0.0.1:8796/';
fs.mkdirSync('.tools/test-artifacts/vmtools-launch',{recursive:true});
const server=process.env.VMTOOLS_TEST_URL?null:spawn('C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['scripts/serve.py','--port','8796'],{windowsHide:true,stdio:'ignore'});
(async()=>{await new Promise(r=>setTimeout(r,700));const b=await chromium.launch({channel:'chrome',headless:true});try{
for(const mobile of [false,true]){
 const p=await b.newPage({viewport:{width:mobile?390:1366,height:900},hasTouch:true,isMobile:mobile,serviceWorkers:'block'});
 await p.addInitScript(()=>{window.cosmosTrace={frames:0,streaks:0,maxStreaks:0,stars:[]};const clear=CanvasRenderingContext2D.prototype.clearRect,move=CanvasRenderingContext2D.prototype.moveTo,arc=CanvasRenderingContext2D.prototype.arc;
 CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.classList.contains('vm-cosmos')){const t=window.cosmosTrace;t.maxStreaks=Math.max(t.maxStreaks,t.streaks);t.frames++;t.streaks=0;t.stars=[];}return clear.apply(this,args);};
 CanvasRenderingContext2D.prototype.moveTo=function(...args){if(this.canvas.classList.contains('vm-cosmos'))window.cosmosTrace.streaks++;return move.apply(this,args);};
 CanvasRenderingContext2D.prototype.arc=function(x,y,r,...args){if(this.canvas.classList.contains('vm-cosmos')&&r<3&&y>180)window.cosmosTrace.stars.push({x,y});return arc.call(this,x,y,r,...args);};
 });
 await p.goto(target);await p.locator('#vm-preloader').waitFor({state:'hidden'});const host=p.locator('.vm-launch'),canvas=host.locator('.vm-cosmos');await host.scrollIntoViewIfNeeded();await p.waitForTimeout(200);
 assert.equal(await host.locator('.vm-orbit-scene,.vm-orbit-tools,.vm-orbit-canvas,.vm-motion').count(),0,'no framed scene or controls');assert.equal(await canvas.getAttribute('aria-hidden'),'true');
 const box=await host.boundingBox(),r=await canvas.boundingBox();assert.ok(r.y<box.y&&r.width>=box.width-2,'scene extends above whole section');assert.equal(await canvas.evaluate(e=>getComputedStyle(e).pointerEvents),'none');
 const first=await p.evaluate(()=>cosmosTrace.frames);await p.waitForTimeout(350);assert.ok((await p.evaluate(()=>cosmosTrace.frames))-first>5,'continuous animation');
 // Keyboard activation proves the gallery itself emits a reaction, without a pointer pressing particles.
 const tab=host.locator('[data-vm-view="solid"]');await tab.focus();await p.evaluate(()=>cosmosTrace.maxStreaks=0);await p.keyboard.press('Enter');await p.waitForTimeout(500);assert.equal(await tab.getAttribute('aria-pressed'),'true');assert.ok(await p.evaluate(()=>cosmosTrace.maxStreaks)>8,'gallery wave moves particles');
 await p.reload();await p.locator('#vm-preloader').waitFor({state:'hidden'});await host.scrollIntoViewIfNeeded();await p.waitForTimeout(200);
 const cr=await canvas.boundingBox();const star=await p.evaluate(({x,y})=>cosmosTrace.stars.find(s=>s.x+x>30&&s.x+x<innerWidth-30&&s.y+y>100&&s.y+y<innerHeight-100),cr);assert.ok(star,'visible ambient star');
 await p.mouse.move(cr.x+star.x,cr.y+star.y);await p.waitForTimeout(350);assert.ok(await p.evaluate(()=>cosmosTrace.maxStreaks)>4,'hover pushes particles without dragging');
 // Wheel is page scrolling, never canvas zoom.
 const scroll=await p.evaluate(()=>scrollY);await p.mouse.wheel(0,180);await p.waitForTimeout(250);assert.ok((await p.evaluate(()=>scrollY))>scroll+70);
 await p.reload();await p.locator('#vm-preloader').waitFor({state:'hidden'});await host.scrollIntoViewIfNeeded();await p.mouse.move(0,0);await p.waitForTimeout(200);
 const tr=await canvas.boundingBox(),ts=await p.evaluate(({x,y})=>{const controls=[...document.querySelectorAll('a,button')].map(e=>e.getBoundingClientRect());return cosmosTrace.stars.find(s=>s.x+x>30&&s.x+x<innerWidth-30&&s.y+y>120&&s.y+y<innerHeight-120&&controls.every(r=>s.x+x<r.left-50||s.x+x>r.right+50||s.y+y<r.top-50||s.y+y>r.bottom+50));},tr);assert.ok(ts);
 const cdp=await p.context().newCDPSession(p);const touch={id:1,x:tr.x+ts.x,y:tr.y+ts.y,radiusX:4,radiusY:4,force:1};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});await p.waitForTimeout(350);assert.ok(await p.evaluate(()=>cosmosTrace.maxStreaks)>4,'finger touch pushes particles');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(200);assert.ok(!p.url().includes('#download'));
 if(mobile){const beforePan=await p.evaluate(()=>scrollY);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,y:touch.y-i*15}]});await p.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(200);assert.ok((await p.evaluate(()=>scrollY))>beforePan+20,'finger swipe still scrolls the page');}


 await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(200);const off=await p.evaluate(()=>cosmosTrace.frames);await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>cosmosTrace.frames),off,'offscreen suspension');
 await host.scrollIntoViewIfNeeded();await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(150);const quiet=await p.evaluate(()=>cosmosTrace.frames);await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>cosmosTrace.frames),quiet,'reduced motion');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.evaluate(()=>scrollBy(0,-180));await p.waitForTimeout(80);await p.screenshot({path:`.tools/test-artifacts/vmtools-launch/ambient-${mobile?'mobile':'desktop'}.png`});await p.close();
}
console.log('PASS desktop/mobile: unframed full-section scene, continuous animation, particle repulsion on hover/touch, gallery wave, native scrolling, offscreen suspension, reduced motion');
}finally{await b.close();server?.kill();}})().catch(e=>{console.error(e);server?.kill();process.exitCode=1;});
