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
expect(Array.isArray(manifest.icons) && manifest.icons.length >= 1, 'Manifest needs the VinhMath app icon');
expect(manifest.icons.some((icon) => icon.src === '/icons/vinhmath-192.png' && icon.sizes === '192x192'), 'Manifest needs the 192px VinhMath logo');
expect(manifest.icons.some((icon) => icon.src === '/icons/vinhmath-512.png' && icon.sizes === '512x512'), 'Manifest needs the 512px VinhMath logo');
expect((manifest.shortcuts || []).every((item) => (item.icons || []).every((icon) => icon.src === '/icons/vinhmath-192.png')), 'PWA shortcuts must use the website VinhMath logo');

const worker = read('sw.js');
expect(worker.includes("self.addEventListener('fetch'"), 'Service worker must handle fetch');
expect(worker.includes("request.mode === 'navigate'"), 'Navigation must use the offline fallback');
expect(worker.includes("caches.match('/offline.html')"), 'Offline page must be cached');
expect(worker.includes("self.addEventListener('push'"), 'Push display foundation must exist');
expect(worker.includes("'/icons/vinhmath-192.png'"), 'Service worker must cache the 192px VinhMath logo');
expect(worker.includes("'/icons/vinhmath-512.png'"), 'Service worker must cache the 512px VinhMath logo');
expect(!worker.includes('supabase.co'), 'Service worker must not cache Supabase traffic');

const sharedJs = read('js/vinhmath.js');
expect(sharedJs.includes("navigator.serviceWorker.register('/sw.js'"), 'Shared JS must register the service worker');
expect(sharedJs.includes("window.addEventListener('beforeinstallprompt'"), 'Install prompt must be captured');
expect(sharedJs.includes('vm-install-btn'), 'Install action must be rendered');
expect(sharedJs.includes("document.getElementById('vmInstallHero')"), 'Prominent homepage install action must be synchronized');
expect(sharedJs.includes('Thêm vào Màn hình chính'), 'iOS installation guidance must exist');
expect(sharedJs.includes("href: '/icons/vinhmath-192.png'"), 'Apple install metadata must use the website VinhMath logo');
expect(!/Notification\.requestPermission\s*\(/.test(sharedJs), 'Notification permission must not be requested automatically');

const menuJs = read('js/menu-v5.js');
expect(menuJs.includes('vmCapNhatNutCaiDatPwa'), 'Role-based menu must restore the install action');
expect(menuJs.includes('navigator.setAppBadge'), 'Installed app badge must mirror unread notifications');

const sharedCss = read('css/vinhmath.css');
expect(sharedCss.includes('--vm-safe-top: env(safe-area-inset-top'), 'Safe-area support is required');
expect(sharedCss.includes('height: 100dvh !important'), 'Modal must be pinned to the dynamic viewport');
expect(sharedCss.includes('@media (prefers-reduced-motion: reduce)'), 'Reduced-motion support is required');

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
  expect(html.includes('rel="manifest" href="/manifest.webmanifest"'), `${file}: missing manifest link`);
  expect(html.includes('rel="apple-touch-icon" href="/icons/vinhmath-192.png"'), `${file}: stale Apple app icon`);
  expect(!/css\/vinhmath\.css\?v=(?!7\.6)/.test(html), `${file}: stale shared CSS version`);
  if (html.includes('js/vinhmath.js')) {
    expect(html.includes('js/vinhmath.js?v=7.6'), `${file}: stale shared JS version`);
  }
  if (html.includes('js/menu-v5.js')) {
    expect(html.includes('js/menu-v5.js?v=7.6'), `${file}: stale shared menu version`);
  }
}

console.log(`PWA/mobile foundation OK (${htmlFiles.length} HTML pages checked)`);
