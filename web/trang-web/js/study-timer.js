// ============================================================
// VINHMATH — ĐỒNG HỒ TỰ HỌC (Forest-style) DÙNG CHUNG
// - Đếm lên (stopwatch) hoặc đếm ngược (pomodoro)
// - Sống sót khi chuyển trang trong web (lưu localStorage) -> ô trôi nổi
// - Phát hiện chuyển tab/thu nhỏ: cảnh báo + ghi nhận, TẠM DỪNG đếm
// - Thoát web: lần mở sau sẽ tự chốt phiên với thời gian đã học
// - Phiên Pomodoro hoàn thành = 1 cây + điểm tự học
// Nạp sau vinhmath.js (cần biến sb). menu.js sẽ tự chèn file này.
// ============================================================
(function () {
  if (window.__vmStudyLoaded) return;
  window.__vmStudyLoaded = true;

  var KEY = 'vm_study_session';
  var tickInt = null;
  var ME = null; // id tài khoản đang đăng nhập (chủ sở hữu phiên)

  function now() { return Date.now(); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function clearS() { try { localStorage.removeItem(KEY); } catch (e) {} }

  async function uid() {
    try { var s = await sb.auth.getSession(); return s.data.session ? s.data.session.user.id : null; }
    catch (e) { return null; }
  }

  // Giai đoạn cây theo số giây đã tập trung
  function tree(sec, withered) {
    if (withered) return { e: '🥀', t: 'Cây héo' };
    var m = sec / 60;
    if (m < 4) return { e: '🌱', t: 'Hạt mầm' };
    if (m < 12) return { e: '🌿', t: 'Nảy mầm' };
    if (m < 20) return { e: '🪴', t: 'Cây non' };
    if (m < 25) return { e: '🌳', t: 'Cây lớn' };
    return { e: '🌸', t: 'Đơm hoa' };
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function ensureStyle() {
    if (document.getElementById('vmStudyStyle')) return;
    var st = document.createElement('style');
    st.id = 'vmStudyStyle';
    st.textContent =
      '#vmStudyWidget{position:fixed;left:18px;bottom:18px;z-index:9999;background:var(--surface-solid,#fff);border:1px solid var(--line-2,#ddd);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:12px 14px;display:flex;align-items:center;gap:12px;font-family:inherit;min-width:180px;animation:vmsPop .25s ease}' +
      '@keyframes vmsPop{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}' +
      '#vmStudyWidget .vms-tree{font-size:2rem;line-height:1}' +
      '#vmStudyWidget .vms-time{font-weight:800;font-size:1.15rem;color:var(--ink,#111);font-variant-numeric:tabular-nums}' +
      '#vmStudyWidget .vms-label{font-size:.7rem;color:var(--ink-3,#888);font-weight:600}' +
      '#vmStudyWidget .vms-stop{border:none;background:var(--err-soft,#fee);color:var(--err,#e23);font-weight:700;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:.8rem}' +
      '#vmStudyWidget .vms-open{border:none;background:transparent;color:var(--accent,#d90);cursor:pointer;font-size:.72rem;font-weight:700;text-decoration:underline}' +
      '.vms-toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:10000;background:var(--surface-solid,#fff);border:1px solid var(--line-2,#ddd);border-left:4px solid var(--accent,#d90);border-radius:10px;padding:12px 18px;box-shadow:0 8px 24px rgba(0,0,0,.18);font-weight:600;color:var(--ink,#111);max-width:90vw;animation:vmsPop .2s ease}' +
      '.vms-toast.warn{border-left-color:var(--warn,#f59e0b)}.vms-toast.ok{border-left-color:var(--ok,#10b981)}';
    document.head.appendChild(st);
  }

  function ensureWidget() {
    var w = document.getElementById('vmStudyWidget');
    if (w) return w;
    ensureStyle();
    w = document.createElement('div');
    w.id = 'vmStudyWidget';
    w.innerHTML =
      '<div class="vms-tree" id="vmsTree">🌱</div>' +
      '<div style="display:flex;flex-direction:column;gap:2px">' +
        '<div class="vms-time" id="vmsTime">00:00</div>' +
        '<div class="vms-label" id="vmsLabel">Đang học…</div>' +
        '<button class="vms-open" id="vmsOpen">Mở Góc tự học</button>' +
      '</div>' +
      '<button class="vms-stop" id="vmsStop">Dừng</button>';
    document.body.appendChild(w);
    document.getElementById('vmsStop').onclick = function () { window.VMStudy.stop(); };
    document.getElementById('vmsOpen').onclick = function () { window.location.href = 'goc-tu-hoc'; };
    return w;
  }
  function removeWidget() { var w = document.getElementById('vmStudyWidget'); if (w) w.remove(); }

  function renderUpdate(s) {
    var w = ensureWidget();
    var shown = s.mode === 'pomodoro' ? (s.targetSeconds - s.focusSeconds) : s.focusSeconds;
    var tr = tree(s.focusSeconds, false);
    document.getElementById('vmsTree').textContent = tr.e;
    document.getElementById('vmsTime').textContent = fmt(shown);
    document.getElementById('vmsLabel').textContent =
      (s.mode === 'pomodoro' ? '🍅 Pomodoro · ' : '⏱️ Đếm lên · ') + tr.t;
  }

  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'vms-toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 400); }, 3200);
  }

  function startTick() { if (tickInt) clearInterval(tickInt); tickInt = setInterval(tick, 1000); }
  function stopTick() { if (tickInt) { clearInterval(tickInt); tickInt = null; } }

  function tick() {
    var s = load();
    if (!s || !s.active) { stopTick(); removeWidget(); return; }
    if (document.visibilityState === 'visible') s.focusSeconds = (s.focusSeconds || 0) + 1;
    s.lastSeen = now();
    if (s.mode === 'pomodoro' && s.focusSeconds >= s.targetSeconds) {
      s.active = false; save(s);
      finalize(true);
      return;
    }
    save(s);
    renderUpdate(s);
  }

  async function finalize(completed) {
    var s = load();
    if (!s) return;
    stopTick();
    var focus = s.focusSeconds || 0;
    var pts;
    if (s.mode === 'pomodoro') pts = completed ? 1 : 0;
    else pts = Math.floor(focus / 1500); // mỗi 25 phút = 1 điểm cho chế độ đếm lên
    clearS();
    removeWidget();
    var id = await uid();
    if (id && focus >= 60) {
      try {
        await sb.from('study_sessions').insert({
          student_id: id, mode: s.mode,
          started_at: new Date(s.startedAt).toISOString(),
          ended_at: new Date().toISOString(),
          focus_seconds: focus, tab_switches: s.tabSwitches || 0,
          completed: !!completed, points: pts
        });
      } catch (e) {}
    }
    if (completed) toast('🌸 Tuyệt vời! Hoàn thành 1 phiên học — +' + pts + ' điểm tự học!', 'ok');
    else if (focus >= 60) toast('⏹️ Đã dừng. Đã ghi nhận ' + Math.floor(focus / 60) + ' phút tự học.', '');
    try { window.dispatchEvent(new CustomEvent('vmstudy-finalized', { detail: { completed: !!completed, points: pts, focus: focus } })); } catch (e) {}
  }

  // Phát hiện chuyển tab / thu nhỏ cửa sổ
  document.addEventListener('visibilitychange', function () {
    var s = load();
    if (!s || !s.active) return;
    if (s.ownerId && s.ownerId !== ME) return; // không phải phiên của mình
    if (document.visibilityState === 'hidden') {
      s.tabSwitches = (s.tabSwitches || 0) + 1; save(s);
    } else {
      toast('⚠️ Em vừa rời trang học — đồng hồ đã tạm dừng và ghi nhận. Tập trung lại nhé!', 'warn');
    }
  });

  window.VMStudy = {
    start: function (mode, minutes) {
      var s = {
        active: true, mode: mode, startedAt: now(),
        targetSeconds: (minutes || 25) * 60, focusSeconds: 0,
        tabSwitches: 0, lastSeen: now(), completed: false,
        ownerId: ME // gắn phiên với đúng tài khoản đang đăng nhập
      };
      save(s); startTick(); renderUpdate(s);
      toast(mode === 'pomodoro' ? '🍅 Bắt đầu phiên Pomodoro ' + (minutes || 25) + ' phút. Cố lên!' : '⏱️ Bắt đầu học. Cây của em đang lớn dần…', 'ok');
    },
    stop: function () { var s = load(); if (s) { s.active = false; save(s); } finalize(false); },
    isActive: function () { var s = load(); return !!(s && s.active); },
    state: load
  };

  // Khởi động: xác định tài khoản đang đăng nhập, chỉ tiếp tục phiên CỦA ĐÚNG người đó
  (async function init() {
    try { ME = await uid(); } catch (e) {}
    var s = load();
    if (!s || !s.active) return;
    // Phiên do tài khoản khác tạo (đăng nhập chung máy) -> không hiển thị
    if (s.ownerId && s.ownerId !== ME) { removeWidget(); return; }
    if (now() - (s.lastSeen || 0) > 25000) {
      // Rời web khá lâu -> chốt phiên cũ với thời gian đã học
      finalize(s.mode === 'pomodoro' ? false : true);
    } else {
      startTick(); renderUpdate(s);
    }
  })();
})();
