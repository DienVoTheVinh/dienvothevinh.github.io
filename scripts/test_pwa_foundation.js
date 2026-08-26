const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => { throw new Error(message); };
const expect = (condition, message) => { if (!condition) fail(message); };

const manifest = JSON.parse(read('manifest.webmanifest'));
expect(manifest.name && manifest.short_name, 'Manifest must define app names');
expect(manifest.display === 'standalone', 'Manifest must use standalone display');
expect(manifest.scope === '/', 'Manifest scope must cover the website');
expect(manifest.launch_handler && manifest.launch_handler.client_mode === 'navigate-existing', 'Installed links should reuse the existing VinhMath app window');
expect(manifest.handle_links === 'preferred', 'Supported browsers should prefer the installed VinhMath app for in-scope links');
expect(manifest.prefer_related_applications === false, 'The web app must remain the preferred install target');
expect(manifest.orientation === 'portrait-primary', 'Installed mobile app must stay in portrait orientation');
expect(Array.isArray(manifest.icons) && manifest.icons.length >= 1, 'Manifest needs the VinhMath app icon');
expect(manifest.icons.some((icon) => icon.src === '/icons/vinhmath-192.png' && icon.sizes === '192x192'), 'Manifest needs the 192px VinhMath logo');
expect(manifest.icons.some((icon) => icon.src === '/icons/vinhmath-512.png' && icon.sizes === '512x512'), 'Manifest needs the 512px VinhMath logo');
expect((manifest.shortcuts || []).every((item) => (item.icons || []).every((icon) => icon.src === '/icons/vinhmath-192.png')), 'PWA shortcuts must use the website VinhMath logo');

const worker = read('sw.js');
expect(worker.includes("vinhmath-shell-v62"), 'Service worker cache version must publish the lesson-bound student-result media fix');
expect(worker.includes("'/js/vmtool-loader.js'") && !worker.includes("'/js/vmtool-plane.js'") && !worker.includes("'/js/vmtool-3d.js'"), 'Heavy geometry modules must be fetched only when their tabs are opened');
expect(worker.includes("VM_SHELL_PREFIX = 'vinhmath-shell-'"), 'Service worker must detect every previous application shell, not only one version');
expect(worker.includes("'/logo/toan-thay-truong-logo.svg'"), 'The Toán Thầy Trường logo must be available in the offline shell');
expect(worker.includes("target.searchParams.get('vm_refresh') === '62'"), 'Open apps must not enter a refresh loop on shell v62');
expect(worker.includes("target.searchParams.set('vm_refresh', '62'"), 'Open apps must reload once after the new shell activates');
expect(worker.includes("'/khong-gian.html'"), 'Generic tenant landing must be available offline after first install');
expect(worker.includes("key.indexOf(VM_SHELL_PREFIX) === 0 && key !== VM_CACHE"), 'Any skipped shell generation must trigger a one-time refresh');
expect(worker.includes("'/js/exam-portal.js'"), 'Partner exam portal client must be available offline after installation');
expect(worker.includes("'/js/portal-classroom.js'"), 'Partner classroom authoring client must be available offline after installation');
expect(worker.includes("'/js/latex-view.js'"), 'Partner lesson and exam TeX parser must be available offline after installation');
expect(worker.includes("'/js/role-home.js'"), 'Role-focused home client must be available offline after installation');
expect(worker.includes("'/ket-qua.html'") && worker.includes("'/js/student-results.js'") && worker.includes("'/css/student-experience.css'"), 'Student results and compact experience assets must be available offline after installation');
expect(worker.includes("'/js/student-result-viewer.js'") && worker.includes("'/css/student-result-viewer.css'"), 'The shared student result gallery must be available offline after installation');
expect(worker.includes("'/thanh-tuu.html'") && worker.includes("'/js/student-achievement-map.js'"), 'Achievement roadmap must be available offline after installation');
expect(worker.includes('function vmLaMaNguonGiaoDien(url)'), 'CSS and JavaScript need a dedicated freshness strategy');
expect(worker.includes('if (!vmLaMaNguonGiaoDien(url))'), 'Only critical UI source should bypass a stale cache online');
expect(worker.includes("self.addEventListener('fetch'"), 'Service worker must handle fetch');
expect(worker.includes("request.mode === 'navigate'"), 'Navigation must use the offline fallback');
expect(worker.includes("caches.match('/offline.html')"), 'Offline page must be cached');
expect(worker.includes("self.addEventListener('push'"), 'Push display foundation must exist');
expect(worker.includes("'/js/push-notifications.js'"), 'Web Push client must be available offline after installation');
expect(worker.includes("'/js/tex-environments.js'"), 'TeX environment registry must be available offline after installation');
expect(worker.includes("'/icons/vinhmath-192.png'"), 'Service worker must cache the 192px VinhMath logo');
expect(worker.includes("'/icons/vinhmath-512.png'"), 'Service worker must cache the 512px VinhMath logo');
expect(!worker.includes('supabase.co'), 'Service worker must not cache Supabase traffic');

const sharedJs = read('js/vinhmath.js');
expect(sharedJs.includes("navigator.serviceWorker.register('/sw.js?v=52'") && sharedJs.includes("updateViaCache: 'none'"), 'Shared JS must bypass stale HTTP cache when updating the service worker');
expect(worker.includes("'/js/festival-theme.js'") && worker.includes("'/css/festival-theme.css'"), 'Festival runtime and styles must be available offline after the first visit');
expect(sharedJs.includes('registration.update()'), 'An open application must request a service worker update immediately');
expect(sharedJs.includes('function vmKhoaHuongDocTrenPwa()'), 'Installed mobile app needs a runtime portrait lock');
expect(sharedJs.includes("mode === 'landscape' ? 'landscape-primary' : 'portrait-primary'"), 'Runtime orientation lock must support both primary directions');
expect(sharedJs.includes('vmKhoaHuongDocTrenPwa();'), 'PWA startup must activate the portrait lock');
expect(sharedJs.includes('function vmTaoDieuKhienHuongManHinh()'), 'Mobile pages need a visible orientation shortcut');
expect(sharedJs.includes("data-vm-orientation=\"landscape\""), 'Orientation panel must offer landscape mode');
expect(sharedJs.includes("data-vm-orientation=\"auto\""), 'Orientation panel must offer automatic device mode');
expect(sharedJs.includes("document.documentElement.requestFullscreen({ navigationUI: 'hide' })"), 'Browser tabs must enter fullscreen before requesting an orientation lock');
expect(sharedJs.includes("localStorage.setItem(VM_HUONG_MAN_HINH_KEY"), 'Orientation preference must persist between pages');
expect(sharedJs.includes("VM_HUONG_MAN_HINH_VERSION = '2'"), 'Legacy automatic orientation must migrate to a stable portrait default');
expect(sharedJs.includes("window.addEventListener('orientationchange', vmLenLichKhoaLaiHuongManHinh)"), 'Installed app must restore the selected lock after device rotation');
expect(sharedJs.includes("['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay']"), 'Installed-app detection must cover every supported display mode');
expect(sharedJs.includes("if (!vmLaDienThoaiCamUng()) return;"), 'Orientation recovery must not depend only on a fragile display-mode query');

expect(sharedJs.includes("window.addEventListener('beforeinstallprompt'"), 'Install prompt must be captured');
expect(sharedJs.includes('vm-install-btn'), 'Install action must be rendered');
expect(sharedJs.includes("document.getElementById('vmInstallHero')"), 'Prominent homepage install action must be synchronized');
expect(sharedJs.includes('Thêm vào Màn hình chính'), 'iOS installation guidance must exist');
expect(sharedJs.includes('await prompt.prompt()'), 'Supported browsers must open their native install prompt directly');
expect(sharedJs.includes('function vmLaSafariApple()'), 'Apple Safari detection must use a dedicated browser check');
expect(sharedJs.includes("vmMoHuongDanApple('ios')"), 'iOS must open its Safari-specific installation guide');
expect(sharedJs.includes("vmMoHuongDanApple('mac')"), 'macOS Safari must open its Add to Dock guide');
expect(!sharedJs.includes('await navigator.share({'), 'Web Share must not be presented as Add to Home Screen because Safari does not expose that action to websites');
expect(sharedJs.includes("heroBtn.addEventListener('click', vmBatDauCaiPwa)"), 'Homepage install button must skip the old intermediary modal');
expect(sharedJs.includes("btn.addEventListener('click', vmBatDauCaiPwa)"), 'Navigation install button must use the direct install flow');
expect(!sharedJs.includes("heroBtn.addEventListener('click', vmMoBangCaiDat)"), 'Homepage must not open the old intermediary modal');
expect(sharedJs.includes('File → Add to Dock'), 'Safari on macOS needs the official Add to Dock fallback');
expect(sharedJs.includes('macOS Sonoma 14+'), 'Safari on macOS must state the minimum Add to Dock version');
expect(sharedJs.includes('Mở dưới dạng ứng dụng web (Open as Web App)'), 'Current iOS guidance must include the Open as Web App switch');
expect(sharedJs.includes('Sửa tác vụ'), 'iOS guidance must explain how to restore a missing Add to Home Screen action');
expect(sharedJs.includes("href: '/icons/vinhmath-192.png'"), 'Apple install metadata must use the website VinhMath logo');
expect(!/Notification\.requestPermission\s*\(/.test(sharedJs), 'Notification permission must not be requested automatically');

const menuJs = read('js/menu-v5.js');
expect(menuJs.includes('vmCapNhatNutCaiDatPwa'), 'Role-based menu must restore the install action');
expect(menuJs.includes('navigator.setAppBadge'), 'Installed app badge must mirror unread notifications');
expect(menuJs.includes("script.src = 'js/push-notifications.js?v=3'"), 'Signed-in notification menu must load the current Web Push client');

const pushClient = read('js/push-notifications.js');
expect(pushClient.includes("Notification.requestPermission()"), 'Permission must be requested from the device opt-in action');
expect(pushClient.includes("applicationServerKey: decodeApplicationServerKey"), 'Push subscription must use the VAPID public key');
expect(pushClient.includes("action: 'subscribe'"), 'Device subscriptions must be registered server-side');
expect(pushClient.includes("action: 'unsubscribe'"), 'Users must be able to disable an individual device');
expect(pushClient.includes("action: 'test'"), 'Users need an end-to-end test notification');
expect(pushClient.includes("isIOS() && !isStandalone()"), 'iPhone and iPad must require an installed Home Screen app');
expect(pushClient.includes('await sb.auth.refreshSession()'), 'An expired Safari session must refresh once before Web Push registration fails');
expect(pushClient.includes("result.response.status === 401"), 'Web Push registration must handle authorization expiry explicitly');
expect(pushClient.includes('class="vm-push-state" id="vmPushState"'), 'Notification state must be embedded in the device notification card');
expect(!pushClient.includes("head.insertBefore(button"), 'Notification opt-in must not float as a separate bell header control');

const pushSql = read('web/supabase/create_web_push_subscriptions.sql');
expect(pushSql.includes('alter table public.push_subscriptions enable row level security'), 'Push subscriptions require RLS');
expect(pushSql.includes('to authenticated'), 'Push subscription policies must target authenticated users');
expect(pushSql.includes('(select auth.uid()) = user_id'), 'Every subscription policy must enforce ownership');
expect(!/VAPID_PRIVATE_KEY\s*=/.test(pushSql), 'Private VAPID material must never be stored in SQL');

const subscribeFunction = read('supabase/functions/web-push-subscribe/index.ts');
expect(subscribeFunction.includes('userClient.auth.getUser(tokenMatch[1])'), 'Subscription function must verify the exact bearer token');
expect(subscribeFunction.includes('existing.user_id !== user.id'), 'A device endpoint cannot be reassigned across accounts');
expect(subscribeFunction.includes('jsr:@supabase/supabase-js@2.95.0'), 'Supabase Edge dependency must be pinned');

const dispatchFunction = read('supabase/functions/web-push-dispatch/index.ts');
expect(dispatchFunction.includes('constantTimeEqual'), 'Webhook secret must use constant-time comparison');
expect(dispatchFunction.includes('WEB_PUSH_WEBHOOK_SECRET'), 'Notification dispatch must require a separate webhook secret');

const pushShared = read('supabase/functions/_shared/web_push.ts');
expect(pushShared.includes('npm:web-push@3.6.7'), 'Web Push dependency must be pinned');
expect(pushShared.includes('statusCode === 404 || statusCode === 410'), 'Expired push endpoints must be removed');

const sharedCss = read('css/vinhmath.css');
expect(sharedCss.includes('.vm-orientation-btn'), 'Shared CSS must style the visible orientation shortcut');
expect(sharedCss.includes('.vm-orientation-panel.is-open'), 'Shared CSS must render the orientation control panel');
expect(sharedCss.includes('#lessonEditorLoading'), 'Cached lesson editor loaders must be disabled globally');
expect(sharedCss.includes('--vm-safe-top: env(safe-area-inset-top'), 'Safe-area support is required');
expect(sharedCss.includes('height: 100dvh !important'), 'Modal must be pinned to the dynamic viewport');
expect(sharedCss.includes('@media (prefers-reduced-motion: reduce)'), 'Reduced-motion support is required');
expect(sharedCss.includes('.vm-install-toast.is-visible'), 'Install fallback must be non-blocking instead of a secondary modal');
expect(sharedCss.includes('.vm-install-apple-guide.is-mac'), 'macOS Safari guidance must point to the top-right Share control');
expect(sharedCss.includes('.vm-install-apple-guide.is-ios'), 'iOS Safari guidance must use the mobile safe area');
expect(!sharedCss.includes('.vm-install-sheet'), 'The obsolete blocking install modal must be removed');
expect(sharedCss.includes('.vm-push-panel'), 'Notification bell needs a responsive device settings panel');

const home = read('trang-chu.html');
expect(home.includes('id="vmInstallHero"'), 'Homepage must include a prominent install panel');
expect(home.includes('id="vmInstallHeroBtn"'), 'Homepage install panel needs an action button');
expect(home.includes('@media (max-width: 700px)'), 'Homepage install panel needs a mobile layout');

const publicLanding = read('index.html');
expect(publicLanding.includes('id="vmInstallHero"'), 'Public landing page must expose install as a first-screen action');
expect(publicLanding.includes('class="home-install-first"'), 'Public landing install action needs its dedicated first-screen layout');
expect(publicLanding.indexOf('id="vmInstallHero"') < publicLanding.indexOf('<section class="hero">'), 'Install action must appear before the public hero content');
expect(publicLanding.includes('home-install-first-action'), 'Public landing install action needs a mobile full-width button');

const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html') && file !== 'offline.html');
expect(htmlFiles.length > 20, 'Expected the canonical root HTML pages');
for (const file of htmlFiles) {
  const html = read(file);
  const tenantLanding = file === 'uyenmath.html';
  expect(html.includes(tenantLanding
    ? 'rel="manifest" href="/manifest-uyenmath.webmanifest"'
    : 'rel="manifest" href="/manifest.webmanifest"'), `${file}: missing manifest link`);
  expect(html.includes(tenantLanding
    ? 'rel="apple-touch-icon" href="logo/uyenmath/uyenmath-apple-um-final.png"'
    : 'rel="apple-touch-icon" href="/icons/vinhmath-192.png"'), `${file}: stale Apple app icon`);
  expect(!/css\/vinhmath\.css\?v=(?!8\.4)/.test(html), `${file}: stale shared CSS version`);
  expect(!/css\/tokens\.css\?v=(?!8\.4)/.test(html), `${file}: stale design token version`);
  if (html.includes('js/vinhmath.js')) {
    const sharedVersion = html.match(/js\/vinhmath\.js\?v=([0-9.]+)/);
    expect(sharedVersion && Number(sharedVersion[1]) >= 7.9, `${file}: stale shared JS version`);
  }
  if (html.includes('js/menu-v5.js')) {
    const menuVersion = html.match(/js\/menu-v5\.js\?v=([0-9.]+)/);
    expect(menuVersion && Number(menuVersion[1]) >= 8.5, `${file}: stale shared menu version`);
  }
}

console.log(`PWA/mobile foundation OK (${htmlFiles.length} HTML pages checked)`);
