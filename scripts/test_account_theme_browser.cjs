'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
const pref = mode => ({version:1,mode,lightStart:'06:00',darkStart:'19:00',timezone:'Asia/Ho_Chi_Minh'});
const user = (id, preference) => ({id,user_metadata:{other_setting:'preserve',...(preference ? {vm_theme_preferences:preference} : {})}});
const fixture = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/js/theme-preflight.js"></script><link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/css/vinhmath.css"></head><body><header class="topbar"><div class="nav"><a class="logo" href="/">VinhMath</a><nav class="navlinks"></nav><div><button id="themeBtn" onclick="toggleTheme()">Sáng/tối</button></div></div></header><main class="wrap"><h1>Giao diện tài khoản</h1></main><script src="/js/vinhmath.js"></script><script src="/js/menu-v5.js"></script></body></html>`;

async function create(browser, role, width, initial, remember=true, clockTime) {
  const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.addInitScript(({role, initial, remember}) => {
    if (!sessionStorage.getItem('fixture-initialized')) {
      window.localStorage.clear(); window.sessionStorage.clear();
      localStorage.setItem('vm-auth-remember',remember ? '1' : '0');
      localStorage.setItem('vm-theme','dark');
      localStorage.setItem('vm-theme-schedule',JSON.stringify({mode:'manual',theme:'dark'}));
      (remember ? localStorage : sessionStorage).setItem('vmauth-shared',JSON.stringify({user:initial}));
      sessionStorage.setItem('fixture-initialized','1');
    }
    const storage = localStorage.getItem('vm-auth-remember') === '0' ? sessionStorage : localStorage;
    window.__sessionUser = JSON.parse(storage.getItem('vmauth-shared') || 'null')?.user || null;
    window.__serverUser = JSON.parse(sessionStorage.getItem('fixture-server-user') || 'null') || structuredClone(window.__sessionUser);
    window.__writes=[]; window.__tableWrites=0; window.__events=[]; window.__themeHandlers=[];
    window.__globalTheme='dark';
    function query(table) {
      let single=false;
      const q=new Proxy({}, {get(_,key) {
        if(key==='then') return resolve => resolve({error:null,count:0,data:table==='profiles'&&single?{id:window.__sessionUser?.id,role}:table==='app_settings'?[{key:'theme_mode',value:'manual'},{key:'theme_theme',value:window.__globalTheme}]:[]});
        return ()=>{if(key==='single'||key==='maybeSingle')single=true;if(['upsert','insert','update','delete'].includes(key))window.__tableWrites++;return q;};
      }});return q;
    }
    window.__authEmit=(event, nextUser)=>window.__events.forEach(fn=>fn(event,nextUser?{user:nextUser}:null));
    const client={
      auth:{
        getSession:async()=>({data:{session:window.__sessionUser?{user:structuredClone(window.__sessionUser)}:null},error:null}),
        getUser:async()=>({data:{user:structuredClone(window.__serverUser)},error:null}),
        onAuthStateChange:fn=>{window.__events.push(fn);return{data:{subscription:{unsubscribe(){}}}};},
        updateUser:async payload=>{
          window.__writes.push(structuredClone(payload));
          if(window.__holdSave) await new Promise(resolve=>{window.__releaseSave=resolve;});
          if(window.__failSave)return{data:{user:null},error:{message:'offline'}};
          if(!window.__sessionUser)return{data:{user:null},error:{message:'not authenticated'}};
          const next={...window.__serverUser,user_metadata:{...window.__serverUser.user_metadata,...payload.data}};
          if(window.__omitAck) return{data:{user:window.__serverUser},error:null};
          window.__serverUser=next;window.__sessionUser=next;
          storage.setItem('vmauth-shared',JSON.stringify({user:next}));
          sessionStorage.setItem('fixture-server-user',JSON.stringify(next));
          window.__authEmit('USER_UPDATED',next);
          return{data:{user:structuredClone(next)},error:null};
        }
      },
      from:query,rpc:async()=>({data:null,error:null}),
      channel:name=>({on(type,filter,fn){if(name==='realtime-system-theme-settings')window.__themeHandlers.push(fn);return this;},subscribe(){return this;}})
    };
    window.VINHMATH_CONFIG={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test'};
    window.supabase={createClient:()=>client};
    window.__firstTheme=null;
    document.addEventListener('DOMContentLoaded',()=>{window.__firstTheme ||= document.documentElement.dataset.theme;});
  },{role,initial,remember});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='theme.test')return route.fulfill({body:'',contentType:'text/css'});
    if(url.pathname==='/fixture.html')return route.fulfill({body:fixture,contentType:'text/html; charset=utf-8'});
    const file=path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'text/plain'});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(clockTime)await page.clock.install({time:new Date(clockTime)});
  page.on('console',msg=>{if(msg.type()==='error')console.error('fixture console:',msg.text().slice(0,250));});
  await page.goto('http://theme.test/fixture.html');
  try { await page.waitForSelector('#ccPersonalSave',{state:'attached',timeout:5000}); }
  catch(error) { throw new Error(error.message+'; page errors: '+errors.join('; ')); }
  await openSettings(page);
  return{context,page,errors};
}
const theme=page=>page.evaluate(()=>document.documentElement.dataset.theme);
async function openSettings(page){
  if(!(await page.locator('#themeBtn').isVisible()))await page.locator('#navBurger').click();
  await page.locator('#themeBtn').click();
  await page.locator('#ccPersonalMode').waitFor({state:'visible'});
}
async function screenshot(page,label){if(process.env.VM_ACCOUNT_THEME_QA_DIR){fs.mkdirSync(process.env.VM_ACCOUNT_THEME_QA_DIR,{recursive:true});await page.waitForTimeout(350);await page.screenshot({path:path.join(process.env.VM_ACCOUNT_THEME_QA_DIR,label+'.png')});}}
async function save(page,mode){
  await page.locator('#ccPersonalMode').selectOption(mode);
  await page.locator('#ccPersonalSave').click();
  await page.waitForFunction(()=>document.getElementById('ccPersonalStatus').textContent.startsWith('Đã lưu'));
}
async function allRoleWorkflow(browser,role,width){
  const {context,page,errors}=await create(browser,role,width,user('account-a'));
  try{
    assert.equal(await theme(page),'dark');
    await save(page,'light');assert.equal(await theme(page),'light');
    if(role==='admin')await screenshot(page,role+'-'+width+'-light');
    await page.evaluate(async()=>{window.__globalTheme='dark';await taiCaiDatHeThongGlobal();window.__themeHandlers.forEach(fn=>fn({new:{key:'theme_theme',value:'dark'}}));});
    assert.equal(await theme(page),'light','Global fetch/realtime must not overwrite personal light');
    await page.reload();await page.waitForSelector('#ccPersonalSave',{state:'attached'});
    assert.equal(await theme(page),'light','Saved account choice survives reload');
    assert.equal(await page.evaluate(()=>window.__firstTheme),'light','No wrong global first paint after reload');
    await openSettings(page);await save(page,'dark');assert.equal(await theme(page),'dark');
    if(role==='student')await screenshot(page,role+'-'+width+'-dark');
    await page.locator('#ccPersonalMode').selectOption('schedule');
    await page.locator('#ccPersonalLightStart').fill('07:00');await page.locator('#ccPersonalDarkStart').fill('07:00');
    const before=await page.evaluate(()=>window.__writes.length);
    await page.locator('#ccPersonalSave').click();
    assert((await page.locator('#ccPersonalStatus').textContent()).includes('khác nhau'));
    assert.equal(await page.evaluate(()=>window.__writes.length),before,'Invalid schedule must not write');
    await page.locator('#ccPersonalDarkStart').fill('20:30');
    await page.locator('#ccPersonalSave').click();
    await page.waitForFunction(()=>document.getElementById('ccPersonalStatus').textContent.startsWith('Đã lưu'));
    const copied=await page.evaluate(()=>window.__serverUser);
    assert.equal(copied.user_metadata.other_setting,'preserve','Do not clobber unrelated metadata');
    const expected=await page.evaluate(()=>window.VMThemePreflight.resolvePreference(vmThemeCaNhan()));
    assert.equal(await theme(page),expected,'Schedule follows personal times');
    const device=await create(browser,role,width,copied,false);
    assert.equal(await theme(device.page),expected,'New device/session-only login reads the same account preference');
    await device.context.close();
    await page.evaluate(()=>{window.__failSave=true;});
    await page.locator('#ccPersonalMode').selectOption('light');await page.locator('#ccPersonalSave').click();
    await page.waitForFunction(()=>document.getElementById('ccPersonalStatus').textContent.includes('Chưa lưu'));
    assert.equal(await theme(page),expected,'Save failure retains previous confirmed setting');
    assert(await page.locator('#ccPersonalSave').isEnabled());
    await page.evaluate(()=>{window.__failSave=false;});
    await save(page,'system');
    await page.evaluate(async()=>{window.__globalTheme='light';await taiCaiDatHeThongGlobal();});
    assert.equal(await theme(page),'light','Explicit system choice follows global updates again');
    const state=await page.evaluate(()=>({writes:window.__writes,tableWrites:window.__tableWrites,bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert.equal(state.tableWrites,0,'Personal saves never write app_settings/profiles');
    assert(state.writes.every(w=>Object.keys(w).join()==='data'&&Object.keys(w.data).join()==='vm_theme_preferences'),'Only cosmetic current-user metadata is sent');
    assert(state.bodyWidth<=state.viewport+1,'No horizontal overflow');assert.deepEqual(errors,[]);
  }finally{await context.close();}
}
async function edgeCases(browser){
  const {context,page,errors}=await create(browser,'admin',390,user('account-a',pref('light')));
  try{
    assert.equal(await theme(page),'light');
    await page.evaluate(()=>{window.__serverUser.user_metadata.vm_theme_preferences={version:1,mode:'dark'};sessionStorage.setItem('fixture-server-user',JSON.stringify(window.__serverUser));return vmTaiThemeCaNhan(true);});
    assert.equal(await theme(page),'dark','Refresh picks up a preference changed on another device');
    await page.evaluate(()=>window.__authEmit('SIGNED_IN',window.__sessionUser));
    await page.waitForTimeout(40);assert.equal(await theme(page),'dark','Stale sign-in event must not roll back fresh preferences');
    await page.reload();await page.waitForSelector('#ccPersonalSave',{state:'attached'});
    assert.equal(await page.evaluate(()=>window.__firstTheme),'dark','Fresh preference cache survives stale stored session metadata');
    await openSettings(page);
    await page.evaluate(()=>{window.__holdSave=true;});
    await page.locator('#ccPersonalMode').selectOption('light');await page.locator('#ccPersonalSave').click();
    await page.waitForFunction(()=>!!window.__releaseSave);assert(!(await page.locator('#ccPersonalSave').isEnabled()),'Disable Save while pending');
    assert.equal(await theme(page),'dark','Do not claim/preview unconfirmed server writes');
    await page.evaluate(()=>window.__releaseSave());await page.waitForFunction(()=>document.getElementById('ccPersonalStatus').textContent.startsWith('Đã lưu'));
    await page.evaluate(()=>{window.__sessionUser={id:'account-b',user_metadata:{}};window.__serverUser=structuredClone(window.__sessionUser);localStorage.setItem('vmauth-shared',JSON.stringify({user:window.__sessionUser}));window.__authEmit('SIGNED_IN',window.__sessionUser);});
    await page.waitForFunction(()=>vmThemeAccountUser.id==='account-b');assert.equal(await theme(page),'dark','Account B does not inherit A light preference');
    await page.evaluate(()=>{window.__sessionUser=null;localStorage.removeItem('vmauth-shared');window.__authEmit('SIGNED_OUT',null);});
    await page.waitForFunction(()=>!vmThemeAccountUser);assert(!(await page.locator('#ccPersonalSave').isEnabled()),'Signed out cannot save preferences');
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
  const timed=await create(browser,'student',390,user('account-schedule',pref('schedule')),true,'2026-10-17T11:59:50Z');
  try{
    assert.equal(await theme(timed.page),'light','18:59 Vietnam uses personal daytime');
    await timed.page.clock.runFor(31000);
    assert.equal(await theme(timed.page),'dark','Timer crosses personal night boundary without a navigation');
    await timed.page.locator('#ccQuickToggle').click();assert.equal(await theme(timed.page),'light','Temporary preview is explicit');
    await timed.page.locator('#ccEndTemporary').click();assert.equal(await theme(timed.page),'dark','Return to saved personal schedule');
    assert.deepEqual(timed.errors,[]);
  }finally{await timed.context.close();}
}
(async()=>{const browser=await chromium.launch({executablePath:process.env.VM_CHROME_PATH||undefined,headless:true});try{
  for(const role of ['admin','teacher','assistant','student','parent'])for(const width of [390,1440])await allRoleWorkflow(browser,role,width);
  await edgeCases(browser);
  console.log('PASS account themes: all 5 roles desktop/mobile; server-confirmed light/dark/schedule/system saves; reload/new-device/session-only persistence; no global overwrite; validation/failure/concurrent save; account/signout isolation; stale metadata refresh; cosmetic-only payloads');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
