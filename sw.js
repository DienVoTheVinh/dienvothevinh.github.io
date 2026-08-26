/* VinhMath PWA service worker — chi cache tai nguyen cong khai cung ten mien. */
const VM_CACHE = 'vinhmath-shell-v62';
const VM_SHELL_PREFIX = 'vinhmath-shell-';
const VM_SHELL = [
  '/',
  '/index.html',
  '/dang-nhap.html',
  '/thi.html',
  '/ket-qua.html',
  '/thanh-tuu.html',
  '/vmtool.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/manifest-uyenmath.webmanifest',
  '/uyenmath.html',
  '/khong-gian.html',
  '/css/tokens.css',
  '/css/vinhmath.css',
  '/css/festival-theme.css',
  '/css/exam-portal.css',
  '/css/role-home.css',
  '/css/student-experience.css',
  '/css/student-result-viewer.css',
  '/css/vmtool.css',
  '/js/config.js',
  '/js/vinhmath.js',
  '/js/festival-theme.js',
  '/js/menu-v5.js',
  '/js/exam-portal.js',
  '/js/portal-classroom.js',
  '/js/latex-view.js',
  '/js/role-home.js',
  '/js/student-results.js',
  '/js/student-result-viewer.js',
  '/js/student-achievement-map.js',
  '/js/tex-environments.js',
  '/js/push-notifications.js',
  '/js/vmtool.js',
  '/js/vmtool-loader.js',
  '/icons/vinhmath-192.png',
  '/icons/vinhmath-512.png',
  '/logo/toan-thay-truong-logo.svg',
  '/logo/uyenmath/uyenmath-apple-um-final.png',
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
        /* Một số thiết bị có thể bỏ qua vài bản phát hành. Chỉ kiểm tra một bản sẽ
           khiến tab đang mở ở v29/v30 tiếp tục giữ giao diện cũ. */
        var needsShellRefresh = keys.some(function (key) {
          return key.indexOf(VM_SHELL_PREFIX) === 0 && key !== VM_CACHE;
        });
        return Promise.all(keys.filter(function (key) {
          return key.indexOf('vinhmath-') === 0 && key !== VM_CACHE;
        }).map(function (key) { return caches.delete(key); }))
          .then(function () { return needsShellRefresh; });
      })
      .then(function (needsShellRefresh) {
        return self.clients.claim().then(function () { return needsShellRefresh; });
      })
      .then(function (needsShellRefresh) {
        if (!needsShellRefresh) return;
        /* Tải lại một lần để cửa sổ ứng dụng đang mở nhận điều hướng theo vai trò. */
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(function (windows) {
            return Promise.all(windows.map(function (client) {
              try {
                var target = new URL(client.url);
                if (target.origin !== self.location.origin) return null;
                if (target.searchParams.get('vm_refresh') === '62') return null;
                target.searchParams.set('vm_refresh', '62');
                return client.navigate(target.href);
              } catch (_) { return null; }
            }));
          });
      })
  );
});

function vmLaTaiNguyenTinh(url) {
  return /\.(?:css|js|png|jpe?g|webp|svg|gif|woff2?)$/i.test(url.pathname);
}

function vmLaMaNguonGiaoDien(url) {
  return /\.(?:css|js)$/i.test(url.pathname);
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
    if (!vmLaMaNguonGiaoDien(url)) {
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
      return;
    }
    event.respondWith(
      fetch(request).then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(VM_CACHE).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        }).catch(function () { return caches.match(request); })
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

function vmNotificationTarget(rawTarget, kind, body) {
  var target = rawTarget || '/trang-chu';
  try {
    var parsed = new URL(target, self.location.origin);
    if (parsed.origin !== self.location.origin) return parsed.href;
    if (kind === 'graded' && /\/bai-hoc(?:\.html)?$/.test(parsed.pathname)) {
      parsed.searchParams.set('action', 'graded');
      if (!parsed.searchParams.has('kind')) {
        var text = String(body || '').toLowerCase();
        parsed.searchParams.set('kind', text.indexOf('thưởng') !== -1 ? 'homework_bonus' : (text.indexOf('kiểm tra') !== -1 ? 'test' : 'homework'));
      }
    }
    return parsed.href;
  } catch (_) {
    return self.location.origin + '/trang-chu';
  }
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var notificationData = event.notification.data || {};
  var target = vmNotificationTarget(notificationData.url, notificationData.kind, event.notification.body);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
      var sameOrigin = target.indexOf(self.location.origin + '/') === 0;
      if (!sameOrigin) return clients.openWindow ? clients.openWindow(target) : null;
      for (var i = 0; i < windows.length; i++) {
        if ('focus' in windows[i]) {
          return windows[i].navigate(target).then(function (client) {
            return client && 'focus' in client ? client.focus() : null;
          });
        }
      }
      return clients.openWindow ? clients.openWindow(target) : null;
    })
  );
});
