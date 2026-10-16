'use strict';

// Exercise the real documents and scripts, but never contact production or write
// account data. Hold the shared runtime and profile responses independently to
// inspect the intermediate paints that ordinary loaded-page tests miss.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const home = read('trang-chu.html');
assert(!home.includes('id="vm-preloader"'), 'No fading full-screen logo/background over the real page');
assert(home.indexOf("$('loiChao').textContent = chao() + ', ' + tenChao") < home.indexOf('await vmRoleHomeRender(hoSo)'), 'Greeting must not wait for dashboard queries');
assert(home.includes('vm-home-pending') && home.includes('})().catch(function (error)'), 'Profile failure must stay neutral and offer retry');
for (const file of ['trang-chu.html','hoc-tap.html','lop-hoc.html']) {
  assert(!/<h1 id="loiChao">Chào em/.test(read(file)), file + ': no student-specific static greeting');
}

async function setup(context, options) {
  await context.addInitScript(({theme, role, failure, personal, guest, emptySettings}) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('vm-theme', theme);
    localStorage.setItem('vm-theme-schedule', JSON.stringify({mode:'fixed',theme}));
    localStorage.setItem('vm-accent', 'amber');
    localStorage.setItem('vm-transparency', '.4');
    localStorage.setItem('vm-blur', '24');
    localStorage.setItem('vm-canvas-opacity', '.3');
    if (personal) localStorage.setItem('vm-theme-color', '#5684cf');
    // Deliberately stale student shell/demo flag on a real staff account.
    sessionStorage.setItem('vm-menu-shell-v3-responsive', JSON.stringify({role:'student',html:'<a href="lop-hoc">Lớp của em</a>',savedAt:Date.now()}));
    sessionStorage.setItem('vm-guest-mode', 'true');
    window.__profileGate = new Promise(resolve => { window.__releaseProfile = resolve; });
    const user = guest ? null : {id:'11111111-1111-4111-8111-111111111111'};
    const profile = {id:user && user.id,role,full_name:'Nguyễn Văn Vinh',gender:'Nam',class_students:[]};
    function query(table) {
      let single = false;
      const builder = new Proxy({}, {get(_, key) {
        if (key === 'then') return (resolve, reject) => (async () => {
          if (table === 'profiles' && single) {
            await window.__profileGate;
            return failure ? {data:null,error:{message:'Mock profile unavailable'}} : {data:{...profile},error:null};
          }
          if (table === 'app_settings' && !emptySettings) return {data:[
            {key:'theme_mode',value:'manual'}, {key:'theme_theme',value:theme}, {key:'theme_accent',value:'amber'},
            {key:'theme_transparency',value:'.4'}, {key:'theme_blur',value:'24'}, {key:'theme_canvas_opacity',value:'.3'}
          ],error:null};
          return {data:[], count:0, error:null};
        })().then(resolve, reject);
        return () => { if (key === 'single' || key === 'maybeSingle') single = true; return builder; };
      }});
      return builder;
    }
    const client = {
      auth: {
        getSession:async()=>({data:{session:user ? {user} : null},error:null}),
        getUser:async()=>({data:{user},error:null}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
      },
      from:query,
      rpc:async name => ({data:name === 'vm_my_services' ? {classroom:true} : name === 'hs_ho_so' ? {} : null,error:null}),
      channel:()=>({on(){return this;},subscribe(){return this;}}), removeChannel(){}
    };
    window.supabase = { createClient:()=>client };
    window.__startupFrames = [];
    function frame() {
      const h = document.getElementById('loiChao'), b = document.body, s = getComputedStyle(document.documentElement);
      if (h && b) window.__startupFrames.push({greeting:h.textContent,roles:b.className,accent:s.getPropertyValue('--accent').trim()});
      if (window.__startupFrames.length < 1200) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, options);
}

async function run(browser, options) {
  const context = await browser.newContext({viewport:{width:options.width,height:900},serviceWorkers:'block'});
  await setup(context, options);
  let releaseRuntime;
  const runtimeGate = new Promise(resolve => { releaseRuntime = resolve; });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'startup.test') return route.fulfill({body:'',contentType:route.request().resourceType() === 'stylesheet' ? 'text/css' : 'application/javascript'});
    if (url.pathname === '/js/config.js') return route.fulfill({body:'window.VINHMATH_CONFIG={SUPABASE_URL:"https://test.supabase.co",SUPABASE_ANON_KEY:"test-public-key"};',contentType:'application/javascript'});
    if (url.pathname === '/js/vinhmath.js') await runtimeGate;
    const relative = decodeURIComponent(url.pathname).slice(1) || 'index.html';
    const file = path.resolve(root, path.extname(relative) ? relative : relative + '.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)] || 'application/octet-stream'});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const label = [options.public ? 'public' : options.role, options.theme, options.width, options.failure ? 'offline' : options.guest ? 'demo' : options.personal ? 'personal' : 'restored'].join('-');
  try {
    await page.goto('http://startup.test/' + (options.public ? 'index.html' : 'trang-chu.html'), {waitUntil:'commit'});
    await page.waitForSelector(options.public ? '.hero-copy h1' : '#loiChao', {state:'attached'});
    const snapshot = () => page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {theme:document.documentElement.dataset.theme,accent:s.getPropertyValue('--accent').trim(),grad:s.getPropertyValue('--accent-gradient').trim(),glass:s.getPropertyValue('--glass-opacity').trim(),blur:s.getPropertyValue('--glass-blur-radius').trim(),background:document.documentElement.style.backgroundColor,greeting:document.getElementById('loiChao')?.textContent,roles:document.body.className,pseudo:getComputedStyle(document.body,'::before').content};
    });
    const before = await snapshot();
    assert.equal(before.theme, options.theme, label);
    assert.equal(before.accent, options.personal ? '#5684cf' : options.theme === 'dark' ? '#d97706' : '#DD9400', label + ': correct first-paint accent');
    assert.equal(before.blur, '24px', label);
    if (!options.public) {
      assert.equal(before.greeting, 'Chào mừng đến VinhMath', label + ': neutral first greeting');
      assert(!/vm-role-student/.test(before.roles), label + ': no stale cached role');
    } else {
      assert.equal(before.pseudo, 'none', label + ': no legacy background layer');
      assert.equal(before.background, options.theme === 'dark' ? 'rgb(9, 9, 9)' : 'rgb(250, 248, 245)', label);
    }
    releaseRuntime();
    await page.waitForFunction(() => typeof window.layHoSo === 'function');
    // Force past the old loader timeout while the account is still unresolved.
    if (!options.public && !options.guest) {
      await page.evaluate(() => window.hideLoader && window.hideLoader());
      await page.waitForTimeout(100);
      assert.equal((await snapshot()).greeting, 'Chào mừng đến VinhMath', label + ': slow profile stays neutral');
    }
    await page.evaluate(() => window.__releaseProfile());
    if (!options.public) {
      if (options.failure) {
        await page.waitForFunction(() => document.getElementById('loiChaoSub').textContent.includes('Vui lòng thử lại'));
        assert(await page.getByRole('button',{name:'Thử lại',exact:true}).isVisible(), label + ': actionable failure');
      } else {
        await page.waitForFunction(() => !document.body.classList.contains('vm-home-pending'));
        if (options.guest) assert((await snapshot()).greeting.includes('Nghiệm'), label);
        else if (options.role !== 'student') assert((await snapshot()).greeting.includes('Thầy Vinh'), label + ': staff greeting');
        assert(await page.evaluate(() => !sessionStorage.getItem('vm-guest-mode')) || options.guest, label + ': stale demo cleared');
      }
    }
    await page.waitForTimeout(120);
    const after = await snapshot();
    if (options.public && !options.guest) assert.equal(await page.locator('.topbar a[href="dang-nhap"]').count(), 0, label + ': no stale login action on an authenticated header');
    assert.equal(after.accent, before.accent, label + ': runtime/settings must not repaint gold');
    assert.equal(after.grad, before.grad, label + ': gradient stable');
    assert.equal(Number(after.glass), Number(before.glass), label + ': no glass flash');
    const frames = await page.evaluate(() => window.__startupFrames);
    if (!options.public && !options.guest && options.role !== 'student') assert(frames.every(x => !/Chào em|vm-role-student|vm-home-student/.test(x.greeting + ' ' + x.roles)), label + ': never paint student shell for staff');
    assert(frames.every(x => x.accent === before.accent), label + ': every sampled frame retains its palette');
    assert(!errors.length, label + ': browser errors: ' + errors.join('; '));
    if (process.env.VM_STARTUP_QA_DIR && (options.public || options.role === 'admin') && !options.failure) {
      fs.mkdirSync(process.env.VM_STARTUP_QA_DIR,{recursive:true});
      await page.screenshot({path:path.join(process.env.VM_STARTUP_QA_DIR,label+'.png')});
    }
    return label;
  } finally { releaseRuntime(); await context.close(); }
}

(async () => {
  const browser = await chromium.launch({executablePath:process.env.VM_CHROME_PATH || undefined,headless:true});
  let count = 0;
  try {
    for (const width of [390,1440]) for (const theme of ['light','dark']) {
      for (const role of ['admin','teacher','assistant','student']) { await run(browser,{width,theme,role}); count++; }
      await run(browser,{width,theme,role:'admin',public:true}); count++;
    }
    for (const extra of [{failure:true},{personal:true},{guest:true,role:'student'},{emptySettings:true}]) {
      await run(browser,{width:390,theme:'dark',role:'admin',...extra}); count++;
    }
    console.log(`PASS ${count} real-document startup scenarios: delayed runtime/profile, restored roles, stale demo/menu, error retry, public layers, personal accents, desktop/mobile, light/dark`);
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
