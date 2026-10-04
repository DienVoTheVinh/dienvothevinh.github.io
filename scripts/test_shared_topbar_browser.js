'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const standalone = new Set(['bai-hoc.html', 'khong-gian.html', 'thi.html']);
const menuPages = fs.readdirSync(ROOT).filter(file => file.endsWith('.html') && !standalone.has(file))
  .filter(file => /js\/menu-v5\.js(?:\?[^"']*)?/.test(read(file))).sort();
assert(menuPages.length >= 37, 'Every shared-menu page must be covered; VMTools uses an independent portal');
for (const required of ['index.html', 'trang-chu.html', 'quan-tri-lop.html', 'phu-huynh.html', 'blog.html']) assert(menuPages.includes(required));
for (const file of menuPages) {
  const logo = read(file).match(/<a\s+class="logo"[^>]*>([\s\S]*?)<\/a>/i);
  assert(logo && /class="brand-vinh"/.test(logo[1]) && /class="brand-math"/.test(logo[1]), file + ': shared wordmark');
}
const sharedCss = ['css/tokens.css', 'css/vinhmath.css', 'css/rank-system.css'].map(read).join('\n');
const script = read('js/menu-v5.js').replace(/<\/script/gi, '<\\/script');
function fixture(theme, role, publicLayout = role === 'admin' || role === 'guest') {
  const login = role === 'admin' || role === 'guest';
  return `<!doctype html><html lang="vi" data-theme="${theme}"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><style>${sharedCss}\n${publicLayout ? read('css/public-home.css') : ''}</style></head>
  <body class="${publicLayout ? 'vm-public-home ' : ''}${role !== 'guest' ? 'vm-authenticated vm-role-' + role : ''}">
  <header class="topbar"><div class="nav"><a class="logo" href="index">
  <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="VinhMath">
  <span><span class="brand-vinh">Vinh</span><span class="brand-math">Math</span></span><small>· Quản trị</small></a>
  <nav class="navlinks" aria-label="Điều hướng chính"><a href="index">Trang chủ</a><a href="vmgame">VMGame</a><a href="#he-thong">Hệ thống</a><a href="#cong-cu">Công cụ</a><a href="#lich-hoc">Lớp học</a><a href="blog">Blog</a></nav>
  <div class="${publicLayout ? 'home-nav-actions' : 'topbar-actions'}" style="display:flex;gap:10px;align-items:center">
  <button id="vmInstallBtn" class="vm-install-btn is-available" aria-label="Cài VinhMath"><span class="vm-install-icon">⇩</span><span class="vm-install-label">Cài ứng dụng</span></button>
  <button class="btn btn-ghost btn-sm" id="themeBtn" onclick="window.__themeClicks=(window.__themeClicks||0)+1" type="button">☼</button>
  ${login ? '<a class="btn btn-primary btn-sm" href="dang-nhap">Đăng nhập</a>' : '<button class="btn btn-secondary btn-sm" type="button" onclick="dangXuat()">Đăng xuất</button>'}
  </div></div></header><main style="padding:24px"><h1>Kiểm tra thanh điều hướng</h1></main><script>${script}</script></body></html>`;
}
const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function check(page, label, width) {
  await settled(page);
  const state = await page.evaluate(() => {
    const nav = document.querySelector('.topbar .nav'), links = nav.querySelector('.navlinks');
    const rect = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width }; };
    const controls = [...nav.children].filter(el => el !== links && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none').map(rect);
    const auth = nav.querySelector('a[href="dang-nhap"]');
    const range = document.createRange(); if (auth) range.selectNodeContents(auth);
    return { controls, nav:rect(nav), height:document.querySelector('.topbar').getBoundingClientRect().height,
      compact:nav.classList.contains('vm-nav-compact'), menu:getComputedStyle(links).display,
      burger:getComputedStyle(document.getElementById('navBurger')).display, authLines:auth ? range.getClientRects().length : 1,
      overflow:document.documentElement.scrollWidth-innerWidth, labels:[...links.querySelectorAll(':scope > a')].map(el => el.textContent.trim()),
      anchorRects:[...links.querySelectorAll(':scope > a')].map(rect),
      first:getComputedStyle(document.querySelector('.brand-vinh')).color, second:getComputedStyle(document.querySelector('.brand-math')).color,
      themeInMenu:links.contains(document.getElementById('themeBtn')), themeCount:document.querySelectorAll('#themeBtn').length };
  });
  assert(state.nav.left >= -1 && state.nav.right <= width + 1 && state.overflow <= 1, label + ': viewport bounds');
  assert(state.height <= 80, label + ': compact single-row header height ' + state.height);
  assert.equal(state.authLines, 1, label + ': login text must not wrap');
  assert.notEqual(state.first, state.second, label + ': two-color wordmark');
  assert.equal(state.themeCount, 1, label + ': no cloned controls');
  assert.equal(state.themeInMenu, width <= 600, label + ': small-screen tools remain accessible in menu');
  for (let i=0; i<state.controls.length; i++) {
    const r=state.controls[i]; assert(r.left>=-1 && r.right<=width+1, label + ': control outside viewport ' + JSON.stringify(r));
    if(i) assert(state.controls[i-1].right <= r.left + 1, label + ': controls overlap');
  }
  if (state.compact) {
    assert.equal(state.menu, 'none', label + ': menu starts collapsed');
    assert.notEqual(state.burger, 'none', label + ': burger visible');
    await page.click('#navBurger');
    assert.equal(await page.locator('#navBurger').getAttribute('aria-expanded'), 'true');
    assert(await page.locator('.navlinks').isVisible(), label + ': menu opens');
    const open = await page.locator('.navlinks').boundingBox();
    assert(open.x >= -1 && open.x + open.width <= width + 1, label + ': open-menu viewport bounds');
    await page.locator('#themeBtn').click();
    assert.equal(await page.evaluate(() => window.__themeClicks), 1, label + ': original theme handler preserved');
    if(width<=600) {
      const tools=await page.evaluate(()=>[...document.querySelector('.vm-nav-utilities').children].filter(el=>getComputedStyle(el).display!=='none').map(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,scroll:el.scrollWidth,width:el.clientWidth})));
      for(let i=0;i<tools.length;i++){assert(tools[i].scroll<=tools[i].width+1,label+': tool text fits its button');if(i)assert(tools[i-1].right<=tools[i].left+1,label+': tool row overlaps');}
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#navBurger').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'navBurger', label + ': keyboard focus restored');
  } else {
    assert.equal(state.menu, 'flex', label + ': desktop links visible');
    assert.equal(state.burger, 'none', label + ': desktop burger hidden');
    const all=[state.controls[0],...state.anchorRects,...state.controls.slice(1)];
    for (let i=1;i<all.length;i++) assert(all[i-1].right <= all[i].left + 1, label + ': link/action overlap');
  }
  assert(state.labels.includes('Blog') && state.labels.includes('VMGame'), label + ': no feature lost');
  return state;
}

(async () => {
  const browser = await chromium.launch({ executablePath:process.env.VM_CHROME_PATH, headless:true });
  const errors=[];
  try {
    let cases=0;
    for (const theme of ['light','dark']) for (const role of ['guest','admin','teacher','assistant','student','parent']) {
      const page=await browser.newPage(); page.on('pageerror', e=>errors.push(e.message));
      await page.route('http://vinhmath.test/**', route=>route.fulfill({body:'<!doctype html><html></html>',contentType:'text/html'}));
      await page.goto('http://vinhmath.test/');
      for(const width of [2048,1920,1536,1440,1366,1280,1180,1100,1024,960,820,768,600,540,430,390,375,360,320]) {
        await page.setViewportSize({width,height:844}); await page.setContent(fixture(theme,role));
        await page.evaluate(role=>{
          window.__themeClicks=0;
          if(role!=='guest'){apDungMenu(role,null,null,null);apDungLogoBadge(role);}
          if(role==='student') document.querySelector('.logo').insertAdjacentHTML('beforeend','<span class="vm-rank-logo-tag"><span class="vm-rank-pill compact"><span class="vm-rank-symbol">✦</span><b>Tân thủ</b><span class="vm-rank-medal">◆</span></span></span>');
          if(role!=='guest') document.querySelector('.nav').insertAdjacentHTML('beforeend','<div class="bell-wrap"><button class="nav-bell" aria-label="Thông báo"><span>♧</span><span class="bell-badge">9+</span></button></div>');
          const bell=document.querySelector('.bell-wrap');if(bell)document.querySelector('.nav').insertBefore(bell,document.getElementById('navBurger'));
        },role);
        const label=`${theme} ${role} ${width}px`; await check(page,label,width);cases++;
        if(width===390&&role!=='guest') {
          await page.evaluate(role=>apDungMenu(role,null,null,null),role);await settled(page);
          assert.equal(await page.locator('#themeBtn').count(),1,label+': role hydration kept tool');
          assert(!await page.evaluate(()=>JSON.parse(sessionStorage.getItem(VM_MENU_SHELL_CACHE_KEY)).html.includes('themeBtn')),label+': cache must not duplicate controls');
        }
      }
      await page.close();
    }
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://vinhmath.test/**', route=>route.fulfill({body:'<!doctype html><html></html>',contentType:'text/html'}));
    await page.goto('http://vinhmath.test/');
    await page.setViewportSize({width:1440,height:844});await page.setContent(fixture('light','teacher',false));
    await page.evaluate(()=>{apDungMenu('teacher');apDungLogoBadge('teacher');document.querySelector('.brand-math').textContent='MATH · TRUNG TÂM HỌC TẬP';document.querySelector('.navlinks>a').textContent='Lịch hoạt động của giáo viên';});
    await check(page,'long tenant desktop',1440);
    await page.setViewportSize({width:320,height:844});await page.evaluate(()=>window.__themeClicks=0);await check(page,'long tenant phone',320);
    await page.setViewportSize({width:2560,height:844});await page.evaluate(()=>window.__themeClicks=0);
    assert.equal((await check(page,'resize back to desktop',2560)).compact,false,'full navigation restored on wider screen');
    await page.close();
    assert.deepEqual(errors,[], 'no runtime errors');
    console.log(`PASS shared topbar: ${menuPages.length} pages; ${cases} theme/role/viewport cases; single-line login, no overlaps, responsive tools, role hydration and keyboard/resize`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
