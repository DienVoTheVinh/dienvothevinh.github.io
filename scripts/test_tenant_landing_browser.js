const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

function expect(value, message) {
  if (!value) throw new Error(message);
}

function functionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${name}`);
  const brace = source.indexOf('{', start + marker.length);
  if (brace < 0) throw new Error(`Missing body for ${name}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed body for ${name}`);
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
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

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error('VM_CHROME_PATH must point to Chrome');
  }

  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/__tenant-preview-host') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(`<!doctype html><html><body>
        <script>window.__previewMessages=[];window.addEventListener('message',function(event){window.__previewMessages.push(event.data);});<\/script>
        <iframe id="preview" src="/khong-gian?tenant=uyenmath&preview=1&embed=builder&channel=0123456789abcdef0123456789abcdef"></iframe>
      </body></html>`);
      return;
    }
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(`http://127.0.0.1:${port}/khong-gian?tenant=uyenmath`, { waitUntil: 'domcontentloaded' });
    await page.locator('#spaceContent:not([hidden])').waitFor({ timeout: 20000 });
    expect((await page.title()).startsWith('UYENMATH'), 'Generic landing did not adopt the tenant title.');
    expect((await page.locator('#spaceTitle').textContent()).includes('UYENMATH'), 'Tenant home title did not render.');
    expect(await page.locator('#spacePreviewNote').isHidden(), 'Public landing leaked the admin preview banner.');
    expect((await page.locator('#spacePrimaryAction').getAttribute('href')).includes('tenant=uyenmath'), 'Login action lost tenant routing.');
    expect((await page.locator('#spaceLogo').getAttribute('href')).includes('tenant=uyenmath'), 'Brand logo does not return to the tenant landing.');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#spaceContent:not([hidden])').waitFor({ timeout: 20000 });
    const mobileWidth = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    expect(mobileWidth.content <= mobileWidth.viewport + 1, `Tenant landing overflows on mobile: ${JSON.stringify(mobileWidth)}`);

    await page.goto(`http://127.0.0.1:${port}/uyenmath?ref=legacy#spaceHighlights`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/khong-gian\?ref=legacy&tenant=uyenmath#spaceHighlights/, { timeout: 10000 });
    await page.locator('#spaceContent:not([hidden])').waitFor({ timeout: 20000 });
    expect((await page.title()).startsWith('UYENMATH'), 'Legacy UYENMATH URL did not reach the shared renderer.');

    const builderSource = fs.readFileSync('quan-tri-khong-gian.html', 'utf8');
    const landingSource = fs.readFileSync('khong-gian.html', 'utf8');
    const builderStyle = (builderSource.match(/<style>([\s\S]*?)<\/style>/i) || [])[1] || '';
    expect(builderSource.includes('id="tenantLivePreviewFrame"'), 'Tenant builder is missing its live HTML iframe.');
    expect(/sandbox="allow-scripts allow-same-origin"/.test(builderSource), 'Live preview iframe must keep a bounded same-origin sandbox.');
    expect(!/\bsrcdoc\s*=/.test(builderSource), 'Live preview must reuse khong-gian.html instead of forking it through srcdoc.');
    const previewUrlSource = functionSource(builderSource, 'previewUrl');
    expect(/new URL\(['"]khong-gian['"],\s*location\.href\)/.test(previewUrlSource), 'Embedded preview must always use the canonical shared tenant renderer.');
    expect(/searchParams\.set\(['"]embed['"],\s*['"]builder['"]\)/.test(previewUrlSource), 'Embedded preview URL is missing its builder capability marker.');
    expect(/searchParams\.set\(['"]channel['"],\s*livePreviewChannel\)/.test(previewUrlSource), 'Embedded preview URL is missing its per-frame channel.');
    const previewMessageSource = functionSource(landingSource, 'handleBuilderPreviewMessage');
    expect(/!previewAuthorized/.test(previewMessageSource), 'Preview child must reject draft messages before admin authorization.');
    expect(/event\.origin\s*!==\s*location\.origin/.test(previewMessageSource), 'Preview child must reject cross-origin draft messages.');
    expect(/event\.source\s*!==\s*window\.parent/.test(previewMessageSource), 'Preview child must only accept its embedding parent window.');
    expect(/data\.channel\s*!==\s*previewChannel/.test(previewMessageSource), 'Preview child must bind draft messages to its per-frame channel.');
    const landingInitSource = functionSource(landingSource, 'initLanding');
    expect(/await loadPreview\(\)[\s\S]*previewAuthorized\s*=\s*true/.test(landingInitSource),
      'Preview authorization must be enabled only after the protected preview load succeeds.');

    // Keep the preview child deliberately before authentication completes. A
    // draft message at this point must never render, even when origin, source,
    // slug and channel are otherwise correct.
    const preAuthPage = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await preAuthPage.route('**/supabase.min.js', async (route) => {
      await route.fulfill({
        contentType: 'text/javascript; charset=utf-8',
        body: `window.supabase={createClient:function(){return {
          auth:{getSession:function(){return new Promise(function(resolve){window.__resolvePreviewSession=resolve;});}},
          storage:{from:function(){return {getPublicUrl:function(){return {data:{publicUrl:''}};}};}},
          from:function(){throw new Error('Database access before preview authentication');}
        };}};`
      });
    });
    await preAuthPage.goto(`http://127.0.0.1:${port}/__tenant-preview-host`, { waitUntil: 'domcontentloaded' });
    const previewFrame = preAuthPage.frameLocator('#preview');
    await previewFrame.locator('#spaceStateTitle').waitFor({ timeout: 10000 });
    await preAuthPage.locator('#preview').evaluate((iframe) => new Promise((resolve) => {
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') resolve();
      else iframe.addEventListener('load', resolve, { once: true });
    }));
    await preAuthPage.evaluate(() => {
      document.querySelector('#preview').contentWindow.postMessage({
        type: 'vm:tenant-preview:draft',
        version: 1,
        channel: '0123456789abcdef0123456789abcdef',
        slug: 'uyenmath',
        context: {
          slug: 'uyenmath', full_site: true, is_active: true,
          name: 'DRAFT KHÔNG ĐƯỢC ÁP DỤNG', short_name: 'DRAFT',
          home_title: 'DRAFT KHÔNG ĐƯỢC ÁP DỤNG', landing_copy: {}
        }
      }, location.origin);
    });
    await preAuthPage.waitForTimeout(250);
    expect(await previewFrame.locator('#spaceContent').getAttribute('hidden') !== null,
      'A tenant draft rendered before the child authenticated the admin session.');
    expect((await previewFrame.locator('#spaceTitle').textContent()) !== 'DRAFT KHÔNG ĐƯỢC ÁP DỤNG',
      'Pre-auth tenant draft changed the landing content.');
    await previewFrame.locator('body').evaluate(() => window.__resolvePreviewSession({ data: { session: null }, error: null }));
    await previewFrame.locator('#spaceStateTitle').filter({ hasText: 'Cần đăng nhập quản trị' }).waitFor({ timeout: 5000 });
    await preAuthPage.close();

    // Exercise the complete authorized handshake with the real shared landing
    // renderer. Only the Supabase transport is mocked; DOM, identity and theme
    // code all come from khong-gian.html and js/vinhmath.js.
    const authorizedPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await authorizedPage.route('**/supabase.min.js', async (route) => {
      await route.fulfill({
        contentType: 'text/javascript; charset=utf-8',
        body: `window.supabase={createClient:function(){
          var portal={
            id:'tenant-uyenmath',slug:'uyenmath',name:'UYENMATH',short_name:'UM',description:'Mô tả đã lưu',support_text:'Hỗ trợ đã lưu',
            is_active:true,login_suffix:'hsum',teacher_login_suffix:'gvum',experience_mode:'full_site',home_path:'khong-gian?tenant=uyenmath',
            home_title:'Tiêu đề đã lưu',home_subtitle:'Mô tả trang chủ đã lưu',home_image_path:'site:img/logo.png',landing_copy:{kicker:'Dòng đã lưu'},
            brand:{id:'brand-uyenmath',slug:'uyenmath',name:'UYENMATH',short_name:'UM',wordmark_primary_text:'UYEN',wordmark_secondary_text:'MATH',
              wordmark_primary_color:'#1D4ED8',wordmark_secondary_color:'#172747',tagline:'Học Toán cùng Cô Uyên',logo_path:'site:img/logo.png',preset:'vinhmath',
              primary_color:'#2563EB',secondary_color:'#1D4ED8',accent_color:'#2563EB',accent_soft_color:'#DBEAFE',surface_color:'#FFFFFF',text_color:'#172747',
              topbar_color:'#F8FAFC',topbar_text_color:'#172747',logo_scale:100,logo_x:50,logo_y:50,radius_px:14,is_active:true}
          };
          function result(data){return Promise.resolve({data:data,error:null});}
          function query(table){var api={
            select:function(){return api;},eq:function(){return api;},order:function(){return api;},
            maybeSingle:function(){return result(table==='exam_portals'?portal:null);},
            single:function(){return result(table==='profiles'?{id:'admin-user',role:'admin'}:null);},
            then:function(resolve,reject){return result(table==='exam_portal_feature_rules'?[]:[]).then(resolve,reject);}
          };return api;}
          return {
            auth:{getSession:function(){return result({session:{user:{id:'admin-user'}}});}},
            storage:{from:function(){return {getPublicUrl:function(path){return {data:{publicUrl:'/mock-storage/'+path}};}};}},
            from:query
          };
        }};`
      });
    });
    await authorizedPage.goto(`http://127.0.0.1:${port}/__tenant-preview-host`, { waitUntil: 'domcontentloaded' });
    await authorizedPage.waitForFunction(() => window.__previewMessages.some((message) =>
      message && message.type === 'vm:tenant-preview:ready' && message.channel === '0123456789abcdef0123456789abcdef'
    ), null, { timeout: 10000 });
    const maliciousText = '<img src=x onerror="window.__tenantPreviewXss=1">';
    await authorizedPage.evaluate((payload) => {
      const target = document.querySelector('#preview').contentWindow;
      target.postMessage({
        type: 'vm:tenant-preview:draft', version: 1,
        channel: '0123456789abcdef0123456789abcdef', slug: 'uyenmath',
        context: {
          name: 'Không gian đang sửa', short_name: 'LIVE', description: '', support_text: 'Hỗ trợ trực tiếp',
          home_title: 'Tiêu đề trực tiếp', home_subtitle: 'Mô tả chưa lưu', home_image_path: 'site:img/logo.png',
          landing_copy: { kicker: 'Dòng giới thiệu trực tiếp', highlight_1_title: payload },
          brand: {
            id: 'brand-live', slug: 'live', name: 'Không gian đang sửa', short_name: 'LIVE',
            wordmark_primary_text: 'LIVE', wordmark_secondary_text: '', wordmark_primary_color: '#7C3AED', wordmark_secondary_color: '#172747',
            tagline: 'Bản dựng trực tiếp', logo_path: 'site:img/logo.png', preset: 'vinhmath', primary_color: '#7C3AED', secondary_color: '#6D28D9',
            accent_color: '#7C3AED', accent_soft_color: '#EDE9FE', surface_color: '#FFFFFF', text_color: '#172747', topbar_color: '#FAF5FF',
            topbar_text_color: '#172747', logo_scale: 100, logo_x: 50, logo_y: 50, radius_px: 16, is_active: true
          }
        }
      }, location.origin);
      target.postMessage({
        type: 'vm:tenant-preview:theme', version: 1,
        channel: '0123456789abcdef0123456789abcdef', slug: 'uyenmath', theme: 'dark'
      }, location.origin);
    }, maliciousText);
    const authorizedFrame = authorizedPage.frameLocator('#preview');
    await authorizedFrame.locator('#spaceTitle').filter({ hasText: 'Tiêu đề trực tiếp' }).waitFor({ timeout: 5000 });
    expect((await authorizedFrame.locator('#spaceKicker').textContent()) === 'Dòng giới thiệu trực tiếp',
      'Authorized draft did not update landing copy through the shared renderer.');
    expect((await authorizedFrame.locator('#spaceHighlight1Title').textContent()) === maliciousText,
      'Authorized preview did not preserve HTML-like copy as literal text.');
    expect(await authorizedFrame.locator('#spaceHighlight1Title img').count() === 0,
      'HTML-like tenant copy was interpreted as an element inside live preview.');
    expect(await authorizedFrame.locator('body').evaluate(() => window.__tenantPreviewXss !== 1),
      'Tenant preview executed an injected event handler.');
    expect(await authorizedFrame.locator('html').getAttribute('data-theme') === 'dark',
      'Authorized theme message did not update the embedded renderer.');
    await authorizedPage.locator('#preview').evaluate((iframe) => iframe.contentWindow.postMessage({
      type: 'vm:tenant-preview:theme', version: 1,
      channel: '0123456789abcdef0123456789abcdef', slug: 'uyenmath', theme: 'light'
    }, location.origin));
    await authorizedFrame.locator('html[data-theme="light"]').waitFor({ timeout: 5000 });
    const accent = await authorizedFrame.locator('body').evaluate((body) => body.style.getPropertyValue('--accent').trim().toUpperCase());
    expect(accent === '#7C3AED', `Live brand color did not reach the shared theme renderer: ${accent}`);
    await authorizedPage.close();

    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}${builderStyle}</style>
      <main class="tenant-admin"><div class="tenant-layout"><aside class="tenant-list"><div class="tenant-list-scroll"><button class="tenant-item">Không gian mẫu</button></div></aside>
      <section class="tenant-panel"><div class="tenant-content"><div class="feature-board"><section class="feature-role"><div class="feature-list">
      <div class="feature-row"><button class="feature-grip">⠿</button><div class="feature-label"><input value="Chức năng có tên dài"><div class="feature-key">feature</div></div><select><option>Đang hiện</option></select><div class="feature-move"><button>↑</button><button>↓</button></div></div>
      </div></section><section class="feature-role"><div class="feature-list"></div></section></div></div></section></div></main>`);
    for (const width of [320, 390, 981]) {
      await page.setViewportSize({ width, height: 800 });
      const layoutWidth = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      expect(layoutWidth.content <= layoutWidth.viewport + 1, `Tenant builder overflows at ${width}px: ${JSON.stringify(layoutWidth)}`);
    }

    const resizePreviewSource = functionSource(builderSource, 'resizeLivePreview');
    await page.setContent(`<style>*{box-sizing:border-box}:root{--surface:#fff;--surface-2:#f4f5f7;--surface-solid:#fff;--line:#ddd;--line-2:#bbb;--accent:#d89200;--accent-soft:#fff4d8;--shadow:none}body{margin:0}${builderStyle}</style>
      <main class="tenant-admin live-preview-open"><div class="tenant-layout">
        <aside class="tenant-list">Không gian mẫu</aside><section class="tenant-panel">Biểu mẫu chỉnh sửa</section>
        <aside class="tenant-live-preview" id="tenantLivePreview">
          <header class="tenant-preview-head"><div class="tenant-preview-title"><strong>Bản xem trước</strong></div><div class="tenant-preview-tools"><button class="tenant-preview-tool">PC</button><button class="tenant-preview-tool">Điện thoại</button></div></header>
          <div class="tenant-preview-stage" id="tenantPreviewStage"><div class="tenant-preview-canvas" id="tenantPreviewCanvas"><div class="tenant-preview-device" id="tenantPreviewDevice"><iframe title="Bản xem trước"></iframe></div></div></div>
          <div class="tenant-preview-help"><span id="tenantPreviewViewport"></span></div>
        </aside>
      </div></main>
      <script>var PREVIEW_DEVICES={desktop:{label:'PC',width:1280,height:800},mobile:{label:'Điện thoại',width:390,height:844}},livePreviewDevice='desktop',livePreviewFit=true;${resizePreviewSource}<\/script>`);
    for (const width of [1600, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const desktop = await page.evaluate(() => {
        resizeLivePreview();
        const stage = document.querySelector('#tenantPreviewStage');
        const canvas = document.querySelector('#tenantPreviewCanvas');
        const device = document.querySelector('#tenantPreviewDevice');
        return {
          viewport: innerWidth,
          content: document.documentElement.scrollWidth,
          stage: stage.clientWidth,
          canvas: canvas.getBoundingClientRect().width,
          deviceWidth: device.offsetWidth,
          transform: device.style.transform
        };
      });
      expect(desktop.content <= desktop.viewport + 1, `Live tenant preview overflows at ${width}px: ${JSON.stringify(desktop)}`);
      expect(desktop.deviceWidth === 1280, `Desktop preview lost its true 1280px viewport at ${width}px.`);
      expect(desktop.canvas <= desktop.stage + 1, `Scaled desktop preview does not fit its stage at ${width}px.`);
      expect(/^scale\(/.test(desktop.transform), 'Desktop preview did not apply fit-to-stage scaling.');

      const mobile = await page.evaluate(() => {
        livePreviewDevice = 'mobile';
        resizeLivePreview();
        const stage = document.querySelector('#tenantPreviewStage');
        const canvas = document.querySelector('#tenantPreviewCanvas');
        const device = document.querySelector('#tenantPreviewDevice');
        return {
          viewport: innerWidth,
          content: document.documentElement.scrollWidth,
          stage: stage.clientWidth,
          canvas: canvas.getBoundingClientRect().width,
          deviceWidth: device.offsetWidth
        };
      });
      expect(mobile.content <= mobile.viewport + 1, `Mobile tenant preview overflows at ${width}px: ${JSON.stringify(mobile)}`);
      expect(mobile.deviceWidth === 390, `Mobile preview lost its true 390px viewport at ${width}px.`);
      expect(mobile.canvas <= mobile.stage + 1, `Scaled mobile preview does not fit its stage at ${width}px.`);
      await page.evaluate(() => { livePreviewDevice = 'desktop'; });
    }

    console.log('PASS tenant browser: shared renderer, authenticated live-preview boundary, canonical iframe and responsive builder');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
