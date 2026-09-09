const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {chromium}=require('C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=spawn('C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['scripts/serve.py','--port','8794'],{windowsHide:true,stdio:'ignore'});
(async()=>{await new Promise(r=>setTimeout(r,700));const b=await chromium.launch({channel:'chrome',headless:true});const out='.tools/test-artifacts/vmtools-launch';fs.mkdirSync(out,{recursive:true});try{
for(const width of [1366,390])for(const theme of ['dark','light']){
 const p=await b.newPage({viewport:{width,height:900}});await p.addInitScript(t=>localStorage.setItem('vmtools-promo-theme',t),theme);await p.goto('http://127.0.0.1:8794/');await p.locator('#vm-preloader').waitFor({state:'hidden'});const host=p.locator('.vm-launch');await host.scrollIntoViewIfNeeded();const img=host.locator('.vm-window img');await img.evaluate(i=>i.decode());
 const [area,logo,preview,benefits]=await Promise.all([host,host.locator('.vm-app-logo'),img,host.locator('.vm-teaching-grid')].map(l=>l.boundingBox()));assert.ok(logo.width>=80);assert.ok(preview.y<benefits.y);assert.ok(preview.y-area.y<(width>760?130:650));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await host.screenshot({path:`${out}/launch-${width}-${theme}.png`});
 for(const key of ['workspace','calculator','geometry','solid','graphs','cubic','geometry-code','variation-code']){await host.locator(`[data-vm-view="${key}"]`).click();await img.evaluate(i=>i.decode());assert.ok(await img.evaluate(i=>i.naturalWidth===1680));if(['workspace','solid'].includes(key))assert.ok((await img.getAttribute('src')).includes('-053-'));}
 assert.equal(await p.locator('[data-vinh-contact] a[href*="zalo"]').count(),0);await p.getByRole('button',{name:'Quét mã Zalo',exact:true}).click();assert.equal(await p.locator('dialog a[href^="https://zalo"]').count(),0);assert.equal(await p.locator('dialog img').getAttribute('src'),'/assets/vmtools/zalo-the-vinh.png');await p.keyboard.press('Escape');
 await host.locator('.vm-motion').click();assert.equal(await host.locator('.vm-motion').getAttribute('aria-pressed'),'false');await p.evaluate(()=>scrollBy(0,-150));await p.waitForTimeout(50);assert.equal(await host.evaluate(e=>e.style.getPropertyValue('--vm-scroll-y')),'0px');
 await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await host.locator('.vm-launch-preview').evaluate(e=>getComputedStyle(e).transform),'none');await p.close();
}
console.log('PASS launch: real gallery images, corrected replacements, enlarged logo, image before teaching copy, desktop/mobile, dark/light, QR-only contact, motion off and reduced motion');
}finally{await b.close();server.kill();}})().catch(e=>{console.error(e);server.kill();process.exitCode=1});
