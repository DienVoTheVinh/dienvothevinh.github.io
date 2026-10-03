/* Run with NODE_PATH pointing to Playwright and VM_CHROME_PATH to an installed Chrome. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.VM_BASE_URL || 'http://127.0.0.1:8765';
const url = `${base}/assets/council-preview/`;
const output = process.env.VM_PREVIEW_QA_DIR;
const key = 'vinhmath-council-preview-v1';
(async () => {
  const browser = await chromium.launch({executablePath:process.env.VM_CHROME_PATH,headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  const errors=[], external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))external.push(r.url());});
  const state=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  const click=async(action,id)=>page.locator(`[data-action="${action}"]${id?`[data-id="${id}"]`:''}`).first().click();
  const nav=async(view)=>{await page.locator(`#navigation a[href^="#${view}/"]`).click();await page.locator(`#navigation a[href^="#${view}/"][aria-current="page"]`).waitFor();};
  const shot=async(name)=>{if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}};
  try {
    await page.goto(url,{waitUntil:'networkidle'});
    await shot('desktop-explore');
    assert.equal(await page.locator('.region-tab').count(),8);
    for(const id of ['us','cn','jp','kr','fr','gb','nd','vn']) {await click('region',id);await page.locator(`.region-tab[data-id="${id}"][aria-pressed="true"]`).waitFor();}
    await click('visit');assert(await page.locator('dialog').isVisible());await page.keyboard.press('Escape');assert(!await page.locator('dialog').isVisible());
    await click('landmark');await page.locator('dialog .close').click();
    await nav('scholars');
    for(const id of ['ren','lin','yuna','celine','ellis','maya','ivar','minh','chi','an','ren']) {await click('scholar',id);await click('choose-scholar',id);assert.equal((await state()).scholar,id);assert(!await page.locator('dialog').isVisible());assert.equal(await page.locator('.scholar-card.selected').count(),1);}
    for(const id of ['lin','yuna']){await click('scholar',id);await click('add-member',id);await page.locator('dialog .close').click();}
    await click('scholar','maya');assert(await page.locator('[data-action="add-member"]').isDisabled());await page.keyboard.press('Escape');
    await click('scholar','lin');await click('remove-member','lin');await page.keyboard.press('Escape');assert.equal((await state()).council.length,3);
    await shot('desktop-scholars');
    await nav('council');
    for(const id of ['library','bridge','observatory']){await click('building',id);await click('build',id);}
    assert.equal((await state()).built.length,3);assert.equal(await page.locator('.resource strong').innerText(),'120');
    await click('building','library');assert.equal(await page.locator('[data-action="build"]').count(),0);await page.keyboard.press('Escape');
    await page.reload({waitUntil:'networkidle'});assert.equal((await state()).built.length,3);assert.equal((await state()).scholar,'ren');
    await shot('desktop-council');
    await nav('travel');await click('map-region','jp');await page.waitForFunction(()=>location.hash==='#travel/jp');await click('travel');await page.waitForFunction(()=>location.hash==='#explore/jp');assert((await state()).visited.includes('jp'));
    await page.goBack();await page.waitForFunction(()=>location.hash==='#travel/jp');assert.equal(await page.locator('.destination>small').first().innerText(),'Nhật Bản');
    await page.selectOption('#destination-select','fr');await page.waitForFunction(()=>location.hash==='#travel/fr');await shot('desktop-travel');
    await nav('explore');await click('competition');await page.locator('[data-action="answer"][data-index="0"]').click();assert((await page.locator('#answer-result').innerText()).includes('Thử một góc nhìn'));await page.locator('[data-action="answer"][data-index="2"]').click();assert.equal(await page.locator('[data-action="answer"]:disabled').count(),3);await page.keyboard.press('Escape');
    await click('competition');await page.locator('[data-action="answer"][data-index="2"]').click();await page.keyboard.press('Escape');assert.equal((await state()).completed.filter(x=>x==='fr').length,1);
    await page.locator('#settings').click();await page.locator('#motion-setting').uncheck();await page.selectOption('#quality-setting','low');assert.equal(await page.locator('body').getAttribute('data-motion'),'off');assert.equal(await page.locator('body').getAttribute('data-quality'),'low');assert.equal(await page.locator('.mote').first().evaluate(e=>getComputedStyle(e).display),'none');await page.keyboard.press('Escape');
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('body').getAttribute('data-motion'),'off');
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#settings').click();await page.locator('#motion-setting').check();await page.keyboard.press('Escape');assert.equal(await page.locator('.clouds').evaluate(e=>getComputedStyle(e).animationName),'none');assert.equal(await page.locator('body').getAttribute('data-motion'),'off');await page.emulateMedia({reducedMotion:'no-preference'});
    for(const width of [320,390,768,1440]) {await page.setViewportSize({width,height:width<600?844:1000});for(const view of ['explore','scholars','council','travel']) {await nav(view);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert(overflow<=1,`${width} ${view} overflow ${overflow}`);if(width===390){await shot('mobile-'+view);}}}
    await page.setViewportSize({width:390,height:844});await nav('scholars');await click('scholar','maya');await click('choose-scholar','maya');await nav('travel');await page.selectOption('#destination-select','nd');await page.waitForFunction(()=>location.hash==='#travel/nd');await click('travel');await page.waitForFunction(()=>location.hash==='#explore/nd');
    await page.locator('#settings').click();await click('reset-dialog');await click('close');assert.equal((await state()).scholar,'maya');await page.locator('#settings').click();await click('reset-dialog');await click('reset');await page.waitForFunction(()=>location.hash==='#explore/vn');assert.deepEqual((await state()).built,[]);assert.equal((await state()).scholar,'an');
    await page.locator('#about').click();assert((await page.locator('#dialog-body').innerText()).includes('2.5D'));await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    const denied=await browser.newContext();await denied.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage disabled');}});});const deniedPage=await denied.newPage();await deniedPage.goto(url);await deniedPage.locator('[data-action="motion"]').click();assert.equal(await deniedPage.locator('#main h1').innerText(),'Miền sen ngọc');await denied.close();
    const corrupt=await browser.newContext();await corrupt.addInitScript(k=>localStorage.setItem(k,'{"scholar":"<script>","built":["bad","library","library"],"council":["an","bad"],"quality":"invalid"}'),key);const corruptPage=await corrupt.newPage();await corruptPage.goto(url+'#council/vn');assert.equal(await corruptPage.locator('.resource strong').innerText(),'920');assert.equal(await corruptPage.locator('.council-seat .scholar-seal').count(),1);await corrupt.close();
    console.log('PASS: 8 regions, 10 scholar selection/reselection, council capacity/removal, construction cost/idempotency, local persistence, travel/back, answers/retry, settings/reduced-motion, reset/cancel, 16 responsive layouts, storage denied/corrupt, no external requests or page errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
