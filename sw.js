/* VinhMath PWA service worker — chi cache tai nguyen cong khai cung ten mien. */
const VM_CACHE = 'vinhmath-shell-v9';
const VM_SHELL = [
  '/',
  '/index.html',
  '/dang-nhap.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/css/tokens.css',
  '/css/vinhmath.css',
  '/js/config.js',
  '/js/vinhmath.js',
  '/js/menu-v5.js',
  '/js/push-notifications.js',
  '/icons/vinhmath-192.png',
  '/icons/vinhmath-512.png',
  '/favicon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VM_CACHE)
      .then(function (cache) { return cache.addAll(VM_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (key) {
          return key.indexOf('vinhmath-') === 0 && key !== VM_CACHE;
        }).map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function vmLaTaiNguyenTinh(url) {
  return /\.(?:css|js|png|jpe?g|webp|svg|gif|woff2?)$/i.test(url.pathname);
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(VM_CACHE).then(function (cache) { cache.put(request, copy); });
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            return cached || caches.match('/offline.html');
          });
        })
    );
    return;
  }

  if (vmLaTaiNguyenTinh(url)) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        var fresh = fetch(request).then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(VM_CACHE).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        }).catch(function () { return cached; });
        return cached || fresh;
      })
    );
  }
});

/* Standards-based Web Push for installed VinhMath apps and supported browsers. */
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    data = { body: event.data ? event.data.text() : '' };
  }
  var options = {
    body: data.body || 'Bạn có thông báo mới.',
    icon: '/icons/vinhmath-192.png',
    badge: '/favicon.png',
    data: {
      url: data.url || '/trang-chu',
      notificationId: data.notificationId || null,
      kind: data.kind || 'info'
    },
    tag: data.tag || 'vinhmath-notification',
    renotify: true,
    timestamp: Date.now()
  };
  var tasks = [self.registration.showNotification(data.title || 'VinhMath', options)];
  if (typeof self.navigator.setAppBadge === 'function' && Number(data.badgeCount) > 0) {
    tasks.push(self.navigator.setAppBadge(Number(data.badgeCount)));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || '/trang-chu';
  try {
    var parsed = new URL(target, self.location.origin);
    target = parsed.origin === self.location.origin ? parsed.href : '/trang-chu';
  } catch (_) { target = '/trang-chu'; }
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i++) {
        if ('focus' in windows[i]) {
          windows[i].navigate(target);
          return windows[i].focus();
        }
      }
      return clients.openWindow ? clients.openWindow(target) : null;
    })
  );
});
