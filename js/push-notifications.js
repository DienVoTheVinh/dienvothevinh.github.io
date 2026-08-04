(function () {
  'use strict';

  var state = {
    userId: null,
    busy: false,
    initialized: false,
    subscription: null
  };

  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  function deviceLabel() {
    var ua = navigator.userAgent || '';
    if (/iphone/i.test(ua)) return 'iPhone';
    if (/ipad/i.test(ua) || (/macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1)) return 'iPad';
    if (/android/i.test(ua)) return 'Android';
    if (/macintosh|mac os x/i.test(ua)) return 'Mac';
    if (/windows/i.test(ua)) return 'Windows';
    return 'Thiết bị';
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function showMessage(text, kind) {
    var el = document.getElementById('vmPushMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'vm-push-message' + (kind ? ' is-' + kind : '');
    el.hidden = !text;
  }

  function setBusy(busy) {
    state.busy = busy;
    ['vmPushPrimary', 'vmPushTest'].forEach(function (id) {
      var button = document.getElementById(id);
      if (button) button.disabled = busy;
    });
  }

  async function requestSubscription(body, accessToken) {
    var response = await fetch(VM.SUPABASE_URL + '/functions/v1/web-push-subscribe', {
      method: 'POST',
      headers: {
        apikey: VM.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });
    var raw = await response.text();
    var data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { error: raw }; }
    return { response: response, data: data };
  }

  async function invoke(body) {
    if (!window.sb || !window.VM || !VM.SUPABASE_URL || !VM.SUPABASE_ANON_KEY) {
      throw new Error('Chưa kết nối được máy chủ VinhMath.');
    }
    var sessionResult = await sb.auth.getSession();
    var session = sessionResult && sessionResult.data && sessionResult.data.session;
    if (!session || !session.access_token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

    var result = await requestSubscription(body, session.access_token);
    if (result.response.status === 401) {
      var refreshed;
      try { refreshed = await sb.auth.refreshSession(); } catch (_) {
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi bật thông báo.');
      }
      var freshSession = refreshed && refreshed.data && refreshed.data.session;
      if ((refreshed && refreshed.error) || !freshSession || !freshSession.access_token) {
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi bật thông báo.');
      }
      result = await requestSubscription(body, freshSession.access_token);
    }
    if (!result.response.ok || result.data.error) {
      if (result.response.status === 401) {
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi bật thông báo.');
      }
      throw new Error(result.data.error || ('Máy chủ trả lỗi HTTP ' + result.response.status + '.'));
    }
    return result.data;
  }

  function decodeApplicationServerKey(value) {
    var padding = '='.repeat((4 - value.length % 4) % 4);
    var base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var output = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }

  async function currentSubscription() {
    if (!supported()) return null;
    var registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }

  function subscriptionPayload(subscription) {
    var json = subscription.toJSON();
    return {
      action: 'subscribe',
      subscription: {
        endpoint: json.endpoint,
        expirationTime: json.expirationTime || null,
        keys: json.keys || {}
      },
      device: {
        label: deviceLabel(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
        userAgent: (navigator.userAgent || '').slice(0, 500)
      }
    };
  }

  async function refreshUI() {
    var permission = supported() ? Notification.permission : 'unsupported';
    try { state.subscription = await currentSubscription(); } catch (_) { state.subscription = null; }
    var enabled = permission === 'granted' && !!state.subscription;
    var stateBadge = document.getElementById('vmPushState');
    var primary = document.getElementById('vmPushPrimary');
    var test = document.getElementById('vmPushTest');
    var dot = document.getElementById('vmPushDot');

    if (stateBadge) stateBadge.classList.toggle('is-enabled', enabled);
    setText('vmPushSettingsLabel', enabled ? 'Đã bật' : 'Chưa bật');
    if (dot) dot.classList.toggle('is-enabled', enabled);
    if (test) test.hidden = !enabled;

    if (!supported()) {
      setText('vmPushStatus', 'Trình duyệt này chưa hỗ trợ thông báo nổi. Hãy dùng Safari, Chrome hoặc Edge phiên bản mới.');
      if (primary) { primary.textContent = 'Không được hỗ trợ'; primary.disabled = true; }
      return;
    }
    if (isIOS() && !isStandalone()) {
      setText('vmPushStatus', 'Trên iPhone/iPad, hãy cài VinhMath vào Màn hình chính trước rồi mở ứng dụng để bật thông báo.');
      if (primary) { primary.textContent = 'Cài VinhMath trước'; primary.disabled = false; }
      return;
    }
    if (permission === 'denied') {
      setText('vmPushStatus', 'Quyền thông báo đang bị chặn. Hãy mở Cài đặt của thiết bị hoặc trình duyệt và cho phép VinhMath gửi thông báo.');
      if (primary) { primary.textContent = 'Đã bị chặn'; primary.disabled = true; }
      return;
    }
    if (enabled) {
      setText('vmPushStatus', 'Thiết bị ' + deviceLabel() + ' sẽ nhận nhắc lịch học, bài tập và kết quả chấm bài.');
      if (primary) { primary.textContent = 'Tắt trên thiết bị này'; primary.disabled = state.busy; }
    } else {
      setText('vmPushStatus', 'Bật để nhận thông báo kể cả khi VinhMath không mở trên màn hình.');
      if (primary) { primary.textContent = 'Bật thông báo nổi'; primary.disabled = state.busy; }
    }
  }

  async function enable() {
    if (isIOS() && !isStandalone()) {
      if (window.vmMoCaiDatUngDung) window.vmMoCaiDatUngDung();
      showMessage('Sau khi cài, hãy mở VinhMath từ biểu tượng trên Màn hình chính rồi bật thông báo.', 'info');
      return;
    }
    setBusy(true);
    showMessage('', '');
    try {
      var permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Bạn chưa cho phép VinhMath gửi thông báo.');

      var registration = await navigator.serviceWorker.ready;
      var subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        var keyResult = await invoke({ action: 'public-key' });
        if (!keyResult.publicKey) throw new Error('Máy chủ chưa được cấu hình khóa thông báo.');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(keyResult.publicKey)
        });
      }
      await invoke(subscriptionPayload(subscription));
      state.subscription = subscription;
      try { localStorage.setItem('vm-push-sync-at', String(Date.now())); } catch (_) {}
      showMessage('Đã bật thông báo nổi trên ' + deviceLabel() + '.', 'success');
    } catch (error) {
      showMessage(error && error.message ? error.message : 'Không bật được thông báo. Vui lòng thử lại.', 'error');
    } finally {
      setBusy(false);
      await refreshUI();
    }
  }

  async function disable() {
    setBusy(true);
    showMessage('', '');
    try {
      var subscription = await currentSubscription();
      if (subscription) {
        try { await invoke({ action: 'unsubscribe', endpoint: subscription.endpoint }); } catch (_) {}
        await subscription.unsubscribe();
      }
      state.subscription = null;
      showMessage('Đã tắt thông báo trên thiết bị này.', 'success');
    } catch (error) {
      showMessage(error && error.message ? error.message : 'Không tắt được thông báo. Vui lòng thử lại.', 'error');
    } finally {
      setBusy(false);
      await refreshUI();
    }
  }

  async function toggleEnabled() {
    if (state.busy) return;
    var subscription = await currentSubscription().catch(function () { return null; });
    if (Notification.permission === 'granted' && subscription) await disable();
    else await enable();
  }

  async function sendTest() {
    if (state.busy) return;
    setBusy(true);
    showMessage('Đang gửi thông báo thử…', 'info');
    try {
      var result = await invoke({ action: 'test' });
      if (!result.sent) throw new Error('Không có thiết bị nào nhận được thông báo thử.');
      showMessage('Đã gửi. Hãy kiểm tra Trung tâm thông báo của thiết bị.', 'success');
    } catch (error) {
      showMessage(error && error.message ? error.message : 'Không gửi được thông báo thử.', 'error');
    } finally {
      setBusy(false);
      await refreshUI();
    }
  }

  function buildUI() {
    var bellPanel = document.getElementById('bangThongBao');
    var head = bellPanel && bellPanel.querySelector('.bell-head');
    if (!bellPanel || !head || document.getElementById('vmPushPanel')) return;

    var panel = document.createElement('section');
    panel.id = 'vmPushPanel';
    panel.className = 'vm-push-panel';
    panel.setAttribute('aria-label', 'Thông báo nổi trên thiết bị');
    panel.innerHTML =
      '<div class="vm-push-panel-title"><span aria-hidden="true">📲</span><div><b>Thông báo trên thiết bị</b><small id="vmPushStatus">Đang kiểm tra…</small></div>' +
        '<span class="vm-push-state" id="vmPushState"><span class="vm-push-dot" id="vmPushDot" aria-hidden="true"></span><span id="vmPushSettingsLabel">Chưa bật</span></span></div>' +
      '<div class="vm-push-actions">' +
        '<button type="button" class="vm-push-primary" id="vmPushPrimary">Bật thông báo nổi</button>' +
        '<button type="button" class="vm-push-test" id="vmPushTest" hidden>Gửi thử</button>' +
      '</div>' +
      '<p class="vm-push-message" id="vmPushMessage" hidden aria-live="polite"></p>' +
      '<p class="vm-push-privacy">Chỉ thiết bị đã được bạn cho phép mới nhận thông báo. Bạn có thể tắt riêng từng thiết bị bất cứ lúc nào.</p>';
    head.insertAdjacentElement('afterend', panel);

    panel.addEventListener('click', function (event) { event.stopPropagation(); });
    document.getElementById('vmPushPrimary').addEventListener('click', toggleEnabled);
    document.getElementById('vmPushTest').addEventListener('click', sendTest);
  }

  async function syncExistingSubscription() {
    if (!supported() || Notification.permission !== 'granted') return;
    var subscription = await currentSubscription().catch(function () { return null; });
    if (!subscription) return;
    var last = 0;
    try { last = Number(localStorage.getItem('vm-push-sync-at') || 0); } catch (_) {}
    if (Date.now() - last < 12 * 60 * 60 * 1000) return;
    try {
      await invoke(subscriptionPayload(subscription));
      localStorage.setItem('vm-push-sync-at', String(Date.now()));
    } catch (_) {}
  }

  async function init(userId) {
    if (!userId) return;
    state.userId = userId;
    buildUI();
    await refreshUI();
    syncExistingSubscription();
  }

  window.vmKhoiDongWebPush = function (userId) {
    if (state.initialized && state.userId === userId) return;
    state.initialized = true;
    init(userId);
  };
})();
