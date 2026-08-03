// ============================================================
// VINHMATH — BỘ NÃO DÙNG CHUNG CỦA MỌI TRANG
// Lo 4 việc: (1) chế độ sáng/tối, (2) kết nối Supabase,
// (3) đăng nhập/đăng xuất, (4) chặn trang dành riêng cho người đã đăng nhập.
// File này là JS thuần — không cần build, mở file là chạy.
// ============================================================

/* ---------- MÀU CÁ NHÂN (mua từ Cửa hàng) — áp cho mọi trang ---------- */
(function () {
  function toRgb(hex){ hex=(hex||'').replace('#',''); if(hex.length===3){hex=hex.split('').map(function(c){return c+c;}).join('');}
    var n=parseInt(hex,16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; }
  function darken(hex,f){ var c=toRgb(hex); function h(x){x=Math.round(x*f);return('0'+x.toString(16)).slice(-2);} return '#'+h(c.r)+h(c.g)+h(c.b); }
  window.vmApplyThemeColor = function (color) {
    var root = document.documentElement;
    var keys = ['--accent','--accent-2','--accent-strong','--accent-gradient','--accent-soft','--gold'];
    if (!color) { keys.forEach(function(k){ root.style.removeProperty(k); }); return; }
    try {
      var c = toRgb(color); var d1 = darken(color,.78), d2 = darken(color,.6);
      root.style.setProperty('--accent', color);
      root.style.setProperty('--accent-2', d1);
      root.style.setProperty('--accent-strong', d2);
      root.style.setProperty('--gold', color);
      root.style.setProperty('--accent-gradient', 'linear-gradient(135deg,'+color+','+d2+')');
      root.style.setProperty('--accent-soft', 'rgba('+c.r+','+c.g+','+c.b+',.12)');
    } catch(e){}
  };
  try { var saved = localStorage.getItem('vm-theme-color'); if (saved) window.vmApplyThemeColor(saved); } catch(e){}
})();

/* ---------- POPUP THEO VỊ TRÍ BẤM: luôn nằm trong viewport, không trôi theo chiều dài trang ---------- */
(function () {
  var KHOANG_CACH = 12;
  var CLICK_CON_HIEU_LUC = 2200;
  var trangThai = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var popupDangMo = [];
  var dangCho = [];

  // Giữ các biến cũ để những trang đang dùng chung file không bị mất tương thích.
  window.vmLastClickX = null;
  window.vmLastClickY = null;
  window.vmLastClickTime = 0;

  function ghiNhanToaDo(e) {
    var touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    var x = touch ? touch.clientX : e.clientX;
    var y = touch ? touch.clientY : e.clientY;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    window.vmLastClickX = x;
    window.vmLastClickY = y;
    window.vmLastClickTime = Date.now();
  }
  if (window.PointerEvent) document.addEventListener('pointerdown', ghiNhanToaDo, true);
  else {
    document.addEventListener('mousedown', ghiNhanToaDo, true);
    document.addEventListener('touchstart', ghiNhanToaDo, true);
  }
  document.addEventListener('keydown', function (e) {
    // Popup mở từ bàn phím phải canh giữa, không dùng nhầm vị trí click cũ.
    if (e.key === 'Enter' || e.key === ' ') window.vmLastClickTime = 0;
  }, true);

  function viewport() {
    var vv = window.visualViewport;
    return {
      left: vv ? vv.offsetLeft : 0,
      top: vv ? vv.offsetTop : 0,
      width: vv ? vv.width : window.innerWidth,
      height: vv ? vv.height : window.innerHeight
    };
  }
  function laOverlayFull(el) {
    try {
      if (!el || el.nodeType !== 1 || !el.style) return false;
      var cs = getComputedStyle(el);
      if (cs.position !== 'fixed') return false;
      if (cs.top === '0px' && cs.left === '0px' && cs.right === '0px' && cs.bottom === '0px') return true;
      var r = el.getBoundingClientRect(), vp = viewport();
      return r.width >= vp.width * 0.88 && r.height >= vp.height * 0.88;
    } catch (e) { return false; }
  }
  function dangHien(el) {
    try {
      var cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0 && el.getClientRects().length > 0;
    } catch (e) { return false; }
  }
  function noiDungCua(el) {
    return el.querySelector('[data-vm-popup-content],.modal-content,.lb-modal,.sam-inner') || el.firstElementChild;
  }
  function trongMang(arr, el) { return arr.indexOf(el) !== -1; }
  function themPopupMo(el) { if (!trongMang(popupDangMo, el)) popupDangMo.push(el); }
  function boPopupMo(el) { var i = popupDangMo.indexOf(el); if (i !== -1) popupDangMo.splice(i, 1); }
  function capNhatKhoaCuon() {
    if (!document.documentElement) return;
    if (popupDangMo.length) document.documentElement.classList.add('vm-popup-open');
    else document.documentElement.classList.remove('vm-popup-open');
  }
  function taoTrangThai(el, content) {
    var cs = getComputedStyle(content);
    var state = {
      visible: false,
      anchor: null,
      content: content,
      maxWidth: cs.maxWidth,
      maxHeight: cs.maxHeight,
      overflowY: cs.overflowY,
      resizeObserver: null
    };
    if (trangThai) trangThai.set(el, state); else el._vmPopupState = state;
    return state;
  }
  function layTrangThai(el, content) {
    var state = trangThai ? trangThai.get(el) : el._vmPopupState;
    if (!state || state.content !== content) state = taoTrangThai(el, content);
    return state;
  }
  function giaTriGioiHan(goc, viewportLimit) {
    if (!goc || goc === 'none' || goc === '0px') return viewportLimit;
    return 'min(' + goc + ', ' + viewportLimit + ')';
  }
  function layDiemNeo(el) {
    var vp = viewport();
    var mode = el.getAttribute('data-vm-popup-position') || 'click';
    var fresh = Date.now() - window.vmLastClickTime <= CLICK_CON_HIEU_LUC;
    if (mode === 'center' || !fresh || window.vmLastClickX == null || window.vmLastClickY == null) {
      return { x: vp.left + vp.width / 2, y: vp.top + vp.height / 2, mode: 'center' };
    }
    return {
      x: Math.max(vp.left, Math.min(vp.left + vp.width, window.vmLastClickX + vp.left)),
      y: Math.max(vp.top, Math.min(vp.top + vp.height, window.vmLastClickY + vp.top)),
      mode: 'click'
    };
  }
  function datViTri(el, state) {
    if (!state || !state.content || !state.anchor || !dangHien(el)) return;
    var vp = viewport(), content = state.content;
    var r = content.getBoundingClientRect();
    var maxW = Math.max(0, vp.width - KHOANG_CACH * 2);
    var maxH = Math.max(0, vp.height - KHOANG_CACH * 2);
    var w = Math.min(r.width, maxW), h = Math.min(r.height, maxH);
    var left = state.anchor.x - w / 2;
    var top = state.anchor.y - h / 2;
    left = Math.max(vp.left + KHOANG_CACH, Math.min(left, vp.left + vp.width - w - KHOANG_CACH));
    top = Math.max(vp.top + KHOANG_CACH, Math.min(top, vp.top + vp.height - h - KHOANG_CACH));
    var newLeft = Math.round(left) + 'px', newTop = Math.round(top) + 'px';
    if (content.style.left !== newLeft) content.style.left = newLeft;
    if (content.style.top !== newTop) content.style.top = newTop;
  }
  function canh(el, forceNewAnchor) {
    if (!laOverlayFull(el)) return;
    // Thoát khỏi card/section có transform, filter hoặc overflow tạo containing block.
    // Đây cũng là hành vi tương thích với bộ canh popup cũ của VinhMath.
    if (el.parentElement && el.parentElement !== document.body) {
      try { document.body.appendChild(el); } catch (e) {}
    }
    var content = noiDungCua(el);
    if (!content) return;
    var state = layTrangThai(el, content);
    if (!dangHien(el)) {
      state.visible = false;
      state.anchor = null;
      boPopupMo(el);
      capNhatKhoaCuon();
      return;
    }

    // Chế độ native dành cho bottom-sheet có bố cục riêng trên điện thoại.
    if (el.getAttribute('data-vm-popup-position') === 'native') {
      state.visible = true;
      themPopupMo(el);
      capNhatKhoaCuon();
      return;
    }

    if (!state.visible || forceNewAnchor) state.anchor = layDiemNeo(el);
    state.visible = true;
    themPopupMo(el);
    capNhatKhoaCuon();

    // Fixed trực tiếp theo viewport: không còn phụ thuộc scrollTop hay tổ tiên có transform.
    if (content.style.position !== 'fixed') content.style.position = 'fixed';
    if (content.style.right !== 'auto') content.style.right = 'auto';
    if (content.style.bottom !== 'auto') content.style.bottom = 'auto';
    if (content.style.margin !== '0px') content.style.margin = '0px';
    if (content.style.boxSizing !== 'border-box') content.style.boxSizing = 'border-box';
    var mw = giaTriGioiHan(state.maxWidth, 'calc(100vw - ' + (KHOANG_CACH * 2) + 'px)');
    var mh = giaTriGioiHan(state.maxHeight, 'calc(100dvh - ' + (KHOANG_CACH * 2) + 'px)');
    if (content.style.maxWidth !== mw) content.style.maxWidth = mw;
    if (content.style.maxHeight !== mh) content.style.maxHeight = mh;
    if (state.overflowY === 'visible' && content.style.overflowY !== 'auto') content.style.overflowY = 'auto';
    datViTri(el, state);

    if (!state.resizeObserver && window.ResizeObserver) {
      state.resizeObserver = new ResizeObserver(function () { datViTri(el, state); });
      state.resizeObserver.observe(content);
    }
  }
  function schedule(el, forceNewAnchor) {
    if (!el || el.nodeType !== 1 || trongMang(dangCho, el)) return;
    dangCho.push(el);
    requestAnimationFrame(function () {
      var i = dangCho.indexOf(el); if (i !== -1) dangCho.splice(i, 1);
      canh(el, forceNewAnchor);
    });
  }
  function quetLen(node) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    var limit = 0;
    while (el && el !== document.documentElement && limit++ < 12) {
      if (laOverlayFull(el)) { schedule(el, false); return; }
      el = el.parentElement;
    }
  }
  function quetThem(node) {
    if (!node || node.nodeType !== 1) return;
    if (laOverlayFull(node)) schedule(node, false);
    var list = node.querySelectorAll ? node.querySelectorAll('.modal,[id*="Modal"],[id*="Lightbox"],[style*="position:fixed"],[style*="position: fixed"]') : [];
    for (var i = 0; i < list.length; i++) if (laOverlayFull(list[i])) schedule(list[i], false);
  }
  function canhLaiTatCa() {
    for (var i = 0; i < popupDangMo.length; i++) {
      var el = popupDangMo[i], state = trangThai ? trangThai.get(el) : el._vmPopupState;
      datViTri(el, state);
    }
  }
  function start() {
    try {
      var style = document.createElement('style');
      style.id = 'vmPopupViewportStyle';
      style.textContent = 'html.vm-popup-open,html.vm-popup-open body{overflow:hidden!important;overscroll-behavior:none!important}';
      (document.head || document.documentElement).appendChild(style);
      quetThem(document.body);
      var obs = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          quetLen(m.target);
          for (var j = 0; m.addedNodes && j < m.addedNodes.length; j++) quetThem(m.addedNodes[j]);
        }
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], subtree: true, childList: true });
    } catch (e) {}
  }

  // Trang có thể gọi ngay sau khi đổi display để popup hiện đúng ngay frame đầu tiên.
  window.vmCanhPopup = function (el, options) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return;
    if (options && options.position) el.setAttribute('data-vm-popup-position', options.position);
    schedule(el, true);
  };
  window.addEventListener('resize', canhLaiTatCa, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', canhLaiTatCa, { passive: true });
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

/* ---------- THƯỞNG NÓNG (GV/admin cộng xu + XP trực tiếp cho 1 HS) ---------- */
window.vmThuongNong = function (studentId, studentName) {
  if (!studentId) return;
  var esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); };
  var old = document.getElementById('vmThuongModal'); if (old) old.remove();
  var m = document.createElement('div');
  m.id = 'vmThuongModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100050;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto';
  m.innerHTML =
    '<div style="background:var(--bg,#fff);border:1px solid var(--line,#ddd);border-radius:18px;max-width:440px;width:100%;padding:22px 24px;position:relative;box-shadow:0 24px 70px rgba(0,0,0,.45)">' +
      '<button id="vmTnX" style="position:absolute;top:12px;right:14px;font-size:1.5rem;background:none;border:none;cursor:pointer;color:var(--ink-3,#888)">×</button>' +
      '<h3 style="margin:0 0 2px;font-size:1.15rem;display:flex;align-items:center;gap:8px">🎁 Thưởng nóng</h3>' +
      '<div style="font-size:.86rem;color:var(--ink-2,#555);margin-bottom:14px">Cho: <b>'+esc(studentName||'Học sinh')+'</b></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
        '<button type="button" class="vmTnQuick" data-c="10" data-x="5" style="flex:1;min-width:90px;border:1px solid var(--line,#ddd);background:var(--surface-2,#f5f5f5);border-radius:10px;padding:9px;cursor:pointer;font-weight:700;font-size:.82rem">+10🪙 +5⭐</button>' +
        '<button type="button" class="vmTnQuick" data-c="20" data-x="10" style="flex:1;min-width:90px;border:1px solid var(--line,#ddd);background:var(--surface-2,#f5f5f5);border-radius:10px;padding:9px;cursor:pointer;font-weight:700;font-size:.82rem">+20🪙 +10⭐</button>' +
        '<button type="button" class="vmTnQuick" data-c="50" data-x="25" style="flex:1;min-width:90px;border:1px solid var(--line,#ddd);background:var(--surface-2,#f5f5f5);border-radius:10px;padding:9px;cursor:pointer;font-weight:700;font-size:.82rem">+50🪙 +25⭐</button>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:12px">' +
        '<label style="flex:1;font-size:.82rem;font-weight:600">🪙 Xu<input id="vmTnCoins" type="number" min="0" value="0" style="width:100%;margin-top:4px;padding:8px;border:1px solid var(--line,#ddd);border-radius:8px;box-sizing:border-box"></label>' +
        '<label style="flex:1;font-size:.82rem;font-weight:600">⭐ XP<input id="vmTnXp" type="number" min="0" value="0" style="width:100%;margin-top:4px;padding:8px;border:1px solid var(--line,#ddd);border-radius:8px;box-sizing:border-box"></label>' +
      '</div>' +
      '<label style="font-size:.82rem;font-weight:600">Lý do (HS sẽ thấy)</label>' +
      '<input id="vmTnReason" type="text" placeholder="VD: xung phong giải bài khó trên lớp" style="width:100%;margin:4px 0 16px;padding:9px;border:1px solid var(--line,#ddd);border-radius:8px;box-sizing:border-box">' +
      '<button id="vmTnGo" style="width:100%;border:none;cursor:pointer;padding:12px;border-radius:11px;font-weight:800;font-size:.95rem;background:linear-gradient(135deg,#ffd76a,#f39c12);color:#3a2560">🎁 Thưởng ngay</button>' +
      '<div id="vmTnMsg" style="text-align:center;font-size:.82rem;margin-top:10px;min-height:18px"></div>' +
    '</div>';
  document.body.appendChild(m);
  var close = function(){ m.remove(); };
  m.addEventListener('click', function(e){ if (e.target === m) close(); });
  document.getElementById('vmTnX').onclick = close;
  m.querySelectorAll('.vmTnQuick').forEach(function(b){ b.onclick = function(){
    document.getElementById('vmTnCoins').value = b.getAttribute('data-c');
    document.getElementById('vmTnXp').value = b.getAttribute('data-x');
  }; });
  document.getElementById('vmTnGo').onclick = async function(){
    var coins = parseInt(document.getElementById('vmTnCoins').value,10) || 0;
    var xp = parseInt(document.getElementById('vmTnXp').value,10) || 0;
    var reason = document.getElementById('vmTnReason').value || '';
    var msg = document.getElementById('vmTnMsg');
    if (coins<=0 && xp<=0) { msg.style.color='#e74c3c'; msg.textContent='Nhập xu hoặc XP.'; return; }
    this.disabled = true; msg.style.color='var(--ink-3,#888)'; msg.textContent='Đang thưởng…';
    try {
      var client = window.sb || window.supabase;
      var r = await client.rpc('gv_thuong_nong', { p_student: studentId, p_coins: coins, p_xp: xp, p_reason: reason });
      var res = r && r.data ? r.data : { ok:false, msg:(r&&r.error?r.error.message:'Lỗi') };
      if (res.ok) { msg.style.color='var(--ok,#1a9e5c)'; msg.textContent='✓ '+(res.msg||'Đã thưởng'); setTimeout(close, 1100); }
      else { msg.style.color='#e74c3c'; msg.textContent=res.msg||'Không thưởng được'; document.getElementById('vmTnGo').disabled=false; }
    } catch(e){ msg.style.color='#e74c3c'; msg.textContent='Lỗi: '+e.message; document.getElementById('vmTnGo').disabled=false; }
  };
};
window.vmChonNghi = function(studentId, studentName, callbackName) {
  var old = document.getElementById('vmNghiModal'); if (old) old.remove();
  var m = document.createElement('div');
  m.id = 'vmNghiModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100080;display:flex;align-items:center;justify-content:center;padding:16px';
  m.innerHTML =
    '<div style="background:var(--bg,#fff);border:1px solid var(--line,#ddd);border-radius:16px;max-width:340px;width:100%;padding:20px;position:relative;box-shadow:0 10px 25px rgba(0,0,0,.2)">' +
      '<h4 style="margin:0 0 10px;font-size:1rem;color:var(--ink)">Chọn loại nghỉ cho:</h4>' +
      '<div style="font-weight:700;margin-bottom:16px;font-size:.95rem;color:var(--accent)">' + studentName + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<button id="btnNghiCoPhep" style="padding:10px;background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:10px;font-weight:750;cursor:pointer">🟠 Nghỉ có phép (bỏ qua chuyên cần)</button>' +
        '<button id="btnNghiKhongPhep" style="padding:10px;background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;border-radius:10px;font-weight:750;cursor:pointer">🔴 Nghỉ không phép (trừ điểm)</button>' +
        '<button id="btnNghiCancel" style="padding:8px;background:none;border:1px solid var(--line,#ddd);color:var(--ink-2);border-radius:10px;cursor:pointer;margin-top:6px">Hủy</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  
  var close = function() { m.remove(); };
  document.getElementById('btnNghiCancel').onclick = close;
  m.onclick = function(e) { if (e.target === m) close(); };
  
  document.getElementById('btnNghiCoPhep').onclick = function() {
    if (typeof window[callbackName] === 'function') {
      window[callbackName](studentId, 'excused');
    }
    close();
  };
  document.getElementById('btnNghiKhongPhep').onclick = function() {
    if (typeof window[callbackName] === 'function') {
      window[callbackName](studentId, 'absent');
    }
    close();
  };
};

/* ---------- THẺ NHÂN VẬT + CỬA HÀNG DÙNG CHUNG (ca-nhan, staff...) ---------- */
(function () {
  var VG_COLORS = ['#2E7D32','#00897B','#1565C0','#3949AB','#5E35B1','#8E24AA','#C2185B','#D84315','#EF6C00','#00838F','#455A64','#6D4C41'];
  var VG_BADGES = [['first_btvn','🎬','Bài nộp đầu tiên'],['no_debt','✅','Không nợ bài tập'],['streak_3','🔥','Chuỗi 3 ngày'],['streak_7','⚡','Chuỗi 7 ngày'],['test_5','🛡️','Chiến binh kiểm tra'],['explorer_10','🧭','Nhà thám hiểm'],['level_5','⭐','Ngôi sao Lv.5'],['level_10','🌟','Bậc thầy Lv.10'],['diligent','📚','Siêng năng chăm chỉ'],['score_80','🏆','Học lực giỏi'],['coin_300','💰','Triệu phú nhí'],['perfect10','💯','Điểm 10 tuyệt đối']];
  var _items = null;
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function client(){ return window.sb || window.supabase; }

  var CSS = '.vg-card{position:relative;border-radius:18px;padding:18px 20px;overflow:hidden;background:linear-gradient(135deg,#1f1408,#4a2c11 48%,#7a3f16);color:#fff;box-shadow:0 12px 30px rgba(120,55,15,.3);border:1px solid rgba(243,156,18,.3)}'+
    '.vg-top{display:flex;align-items:center;gap:16px;flex-wrap:wrap}'+
    '.vg-ava{width:66px;height:66px;border-radius:50%;display:grid;place-items:center;font-size:1.9rem;flex-shrink:0;background:radial-gradient(circle at 35% 30%,#ffd76a,#f39c12 70%);box-shadow:0 0 0 4px rgba(255,255,255,.15),0 6px 16px rgba(0,0,0,.3);position:relative}'+
    '.vg-lv{position:absolute;bottom:-5px;right:-5px;min-width:24px;height:24px;padding:0 5px;border-radius:99px;background:#111827;color:#ffd76a;font-weight:800;font-size:.72rem;display:grid;place-items:center;border:2px solid #ffd76a}'+
    '.vg-id{flex:1;min-width:150px}.vg-tier{font-size:1.15rem;font-weight:900}.vg-name{font-size:.82rem;opacity:.85;margin-top:1px}'+
    '.vg-xpbar{height:12px;border-radius:99px;background:rgba(0,0,0,.28);overflow:hidden;margin-top:8px}.vg-xpfill{height:100%;border-radius:99px;background:linear-gradient(90deg,#ffe08a,#F39C12);width:0;transition:width 1s cubic-bezier(.22,1,.36,1)}'+
    '.vg-xptext{display:flex;justify-content:space-between;font-size:.7rem;opacity:.85;margin-top:3px}'+
    '.vg-coins{display:flex;flex-direction:column;align-items:center;padding:5px 12px;background:linear-gradient(135deg,rgba(255,215,106,.22),rgba(255,193,7,.12));border-radius:14px;border:1px solid rgba(255,215,106,.4);cursor:pointer}.vg-coins .n{font-weight:900;font-size:1.05rem;color:#ffe08a}.vg-coins .l{font-size:.58rem;opacity:.8;text-transform:uppercase}'+
    '.vg-score{display:flex;gap:12px;margin-top:14px;flex-wrap:wrap}.vg-scoremain{min-width:100px;background:rgba(0,0,0,.24);border:1px solid rgba(255,215,106,.28);border-radius:14px;padding:10px 14px;text-align:center}.vg-scoremain b{font-size:2.1rem;font-weight:900;color:#ffd76a;display:block;line-height:1}.vg-scoremain span{font-size:.66rem;opacity:.85}'+
    '.vg-pillars{flex:1;min-width:200px;display:grid;grid-template-columns:1fr 1fr;gap:7px 14px;align-content:center}.vg-plhd{display:flex;justify-content:space-between;font-size:.72rem;font-weight:700;margin-bottom:2px}.vg-plhd b{color:#ffe08a}.vg-plbar{height:7px;border-radius:99px;background:rgba(0,0,0,.3);overflow:hidden}.vg-plfill{height:100%;background:linear-gradient(90deg,#ffe08a,#F39C12);width:0;transition:width .9s cubic-bezier(.22,1,.36,1)}'+
    '.vg-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.vg-badge{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-size:1.05rem;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)}.vg-badge.locked{filter:grayscale(1);opacity:.3}'+
    '.vg-shopbtn{display:inline-flex;align-items:center;gap:7px;margin-top:14px;padding:9px 16px;border:none;cursor:pointer;background:linear-gradient(135deg,#ffd76a,#f39c12);color:#3a2560;font-weight:900;border-radius:99px}'+
    '.vg-ava.fx-glow{animation:vgGlow 2s ease-in-out infinite}@keyframes vgGlow{0%,100%{box-shadow:0 0 0 4px rgba(255,255,255,.15),0 0 16px 4px rgba(255,215,106,.7)}50%{box-shadow:0 0 0 4px rgba(255,255,255,.15),0 0 28px 9px rgba(255,215,106,1)}}'+
    '.vg-ava.fx-gold{box-shadow:0 0 0 4px #ffd700,0 0 0 7px #b8860b}.vg-ava.fx-rainbow{animation:vgRb 4s linear infinite}@keyframes vgRb{0%{box-shadow:0 0 0 4px #ff6b6b}25%{box-shadow:0 0 0 4px #ffd76a}50%{box-shadow:0 0 0 4px #2ed573}75%{box-shadow:0 0 0 4px #54a0ff}100%{box-shadow:0 0 0 4px #ff6b6b}}'+
    '#vmShopModal{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100060;display:flex;align-items:flex-start;justify-content:center;padding:36px 16px;overflow-y:auto}'+
    '#vmShopModal .vsh-box{background:var(--bg,#fff);border:1px solid var(--line,#ddd);border-radius:18px;max-width:760px;width:100%;padding:22px 24px;position:relative;box-shadow:0 24px 70px rgba(0,0,0,.45)}'+
    '.vsh-title{font-size:.92rem;font-weight:800;margin:16px 0 9px;color:var(--ink,#111)}.vsh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:11px}'+
    '.vsh-card{border:1px solid var(--line,#ddd);border-radius:13px;padding:13px;text-align:center;display:flex;flex-direction:column;gap:6px}.vsh-card .ic{font-size:1.9rem}.vsh-card .nm{font-weight:800;font-size:.86rem}.vsh-card .ds{font-size:.7rem;color:var(--ink-3,#888);flex:1}'+
    '.vsh-card button{border:none;cursor:pointer;padding:8px;border-radius:9px;font-weight:800;font-size:.8rem;background:linear-gradient(135deg,#ffd76a,#f39c12);color:#3a2560}.vsh-card button:disabled{background:var(--surface-2,#eee);color:var(--ink-3,#999);cursor:default}'+
    '.vsh-sw{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.vsh-swatch{width:34px;height:34px;border-radius:9px;cursor:pointer;border:2px solid rgba(0,0,0,.15);position:relative}.vsh-swatch.sel{outline:3px solid var(--accent,#f39c12);outline-offset:2px}.vsh-swatch .o{position:absolute;top:-6px;right:-6px;font-size:.68rem;background:#1a9e5c;color:#fff;border-radius:50%;width:16px;height:16px;display:grid;place-items:center}';

  function ensureCss(){ if(!document.getElementById('vmGameShared')){ var st=document.createElement('style'); st.id='vmGameShared'; st.textContent=CSS; document.head.appendChild(st); } }

  window.vmRenderGameCard = function (el, d, opts) {
    if (!el) return; opts = opts || {}; ensureCss();
    var pct = 0, span = (d.xp_next - d.xp_floor); if (span>0) pct = Math.max(0, Math.min(100, Math.round((d.xp - d.xp_floor)/span*100)));
    var earned = {}; (d.badges||[]).forEach(function(b){ earned[b.code]=1; });
    var badges = VG_BADGES.map(function(b){ return '<div class="vg-badge'+(earned[b[0]]?'':' locked')+'" title="'+esc(b[2])+(earned[b[0]]?'':' (chưa mở)')+'">'+b[1]+'</div>'; }).join('');
    var P = d.pillars || {};
    function pl(ic,lb,v){ v=(v==null?0:v); return '<div class="vg-pl"><div class="vg-plhd"><span>'+ic+' '+lb+'</span><b>'+Math.round(v)+'</b></div><div class="vg-plbar"><div class="vg-plfill" data-w="'+Math.max(0,Math.min(100,v))+'"></div></div></div>'; }
    var coinsClick = opts.mode==='student' ? ' onclick="vmMoCuaHang(\'student\')" style="cursor:pointer"' : '';
    el.innerHTML = '<div class="vg-card">'+
      '<div class="vg-top">'+
        '<div class="vg-ava'+(d.avatar_fx?' fx-'+d.avatar_fx:'')+'">'+(d.tier_icon||'🌱')+'<span class="vg-lv">Lv.'+d.level+'</span></div>'+
        '<div class="vg-id"><div class="vg-tier">'+esc(d.tier||'Tân Binh')+'</div>'+
          '<div class="vg-name">'+esc(opts.name||d.full_name||'Học sinh')+' · '+d.xp+' XP · 🔥 '+(d.streak||0)+' ngày</div>'+
          '<div class="vg-xpbar"><div class="vg-xpfill" data-w="'+pct+'"></div></div>'+
          '<div class="vg-xptext"><span>Lv.'+d.level+'</span><span>'+(d.xp-d.xp_floor)+' / '+(d.xp_next-d.xp_floor)+' XP → Lv.'+(d.level+1)+'</span></div>'+
        '</div>'+
        '<div class="vg-coins"'+coinsClick+'><span style="font-size:1.3rem">🪙</span><span class="n">'+(d.coins||0)+'</span><span class="l">xu</span></div>'+
      '</div>'+
      '<div class="vg-score"><div class="vg-scoremain"><b>'+(d.diem_tong_quat!=null?d.diem_tong_quat:'—')+'</b><span>Điểm tổng quát /100</span></div>'+
        '<div class="vg-pillars">'+pl('📝','Kiểm tra',P.kiemtra)+pl('🏠','BTVN',P.btvn)+pl('📅','Chuyên cần',P.chuyencan)+pl('💚','Thái độ',P.thaido)+'</div>'+
      '</div>'+
      '<div class="vg-badges">'+badges+'</div>'+
      (opts.showShop?'<button class="vg-shopbtn" onclick="vmMoCuaHang(\'student\')">🛒 Cửa hàng phần thưởng</button>':'')+
    '</div>';
    setTimeout(function(){ el.querySelectorAll('.vg-xpfill,.vg-plfill').forEach(function(f){ f.style.width=(f.getAttribute('data-w')||0)+'%'; }); }, 120);
  };

  var _profile = null, _mode = 'student';
  window.vmMoCuaHang = async function (mode) {
    _mode = mode || 'student'; ensureCss();
    var m = document.getElementById('vmShopModal');
    if (!m) { m = document.createElement('div'); m.id='vmShopModal'; document.body.appendChild(m); m.addEventListener('click', function(e){ if(e.target===m) m.style.display='none'; }); }
    m.style.display='flex'; m.scrollTop=0;
    m.innerHTML = '<div class="vsh-box"><div style="text-align:center;padding:30px;color:var(--ink-3,#888)">Đang tải cửa hàng…</div></div>';
    if (_mode==='student') { try { var r = await client().rpc('hs_ho_so'); _profile = (r&&r.data)||{}; } catch(e){ _profile={}; } }
    else _profile = { coins:0, owned:[], magic:{}, theme_color: (function(){try{return localStorage.getItem('vm-theme-color')||''}catch(e){return ''}})(), avatar_fx:'' };
    await renderShop();
  };

  async function renderShop() {
    var m = document.getElementById('vmShopModal'); if(!m) return;
    var d = _profile || {};
    if (!_items) { try { var r = await client().from('shop_items').select('*').eq('active',true).order('sort'); _items = r.data||[]; } catch(e){ _items=[]; } }
    var owned={}; (d.owned||[]).forEach(function(o){ owned[o.item_code+'|'+o.variant]=1; });
    var magic=d.magic||{}; var preview=(_mode!=='student');
    var themeItem=_items.find(function(x){return x.code==='theme_color';})||{gia:80};
    var cur=(d.theme_color||'');
    var sw = VG_COLORS.map(function(c){ var o=owned['theme_color|'+c]; var sel=(cur.toLowerCase()===c.toLowerCase());
      return '<div class="vsh-swatch'+(sel?' sel':'')+'" style="background:'+c+'" title="'+c+'" onclick="vmShopColor(\''+c+'\','+(o?1:0)+')">'+(o?'<span class="o">✓</span>':'')+'</div>'; }).join('');
    var themeSec='<div class="vsh-title">🎨 Màu giao diện cá nhân <span style="font-weight:600;font-size:.7rem;color:var(--ink-3,#888)">('+themeItem.gia+' xu/màu'+(preview?' · xem thử':'')+')</span></div><div class="vsh-sw">'+sw+
      '<div class="vsh-swatch" style="background:repeating-linear-gradient(45deg,#ccc,#ccc 4px,#fff 4px,#fff 8px);display:grid;place-items:center;font-size:.58rem;color:#333" title="Mặc định" onclick="vmShopColor(\'\',1)">Tắt</div></div>';
    var fx=_items.filter(function(x){return x.loai==='avatar';}).map(function(it){ var f=(it.meta&&it.meta.fx)||''; var o=owned[it.code+'|']; var use=(d.avatar_fx===f);
      var btn = preview ? '<button onclick="vmShopAvatar(\''+f+'\')">Xem thử</button>' : (o?(use?'<button disabled>Đang dùng ✓</button>':'<button onclick="vmShopAvatar(\''+f+'\')">Sử dụng</button>'):'<button onclick="vmShopBuy(\''+it.code+'\',\'\')">Mua · '+it.gia+' 🪙</button>');
      return '<div class="vsh-card"><div class="ic">'+esc(it.ten.split(' ')[0])+'</div><div class="nm">'+esc(it.ten.replace(/^\S+\s/,''))+'</div><div class="ds">'+esc(it.mo_ta||'')+'</div>'+btn+'</div>'; }).join('');
    var fxSec='<div class="vsh-title">✨ Hiệu ứng ảnh đại diện</div><div class="vsh-grid">'+fx+'<div class="vsh-card"><div class="ic">🚫</div><div class="nm">Không hiệu ứng</div><div class="ds">Về ảnh thường.</div><button onclick="vmShopAvatar(\'\')">'+(preview?'Xem thử':'Sử dụng')+'</button></div></div>';
    var mg=_items.filter(function(x){return x.loai==='magic';}).map(function(it){ var have=magic[it.code]||0;
      return '<div class="vsh-card"><div class="ic">'+esc(it.ten.split(' ')[0])+'</div><div class="nm">'+esc(it.ten.replace(/^\S+\s/,''))+'</div><div class="ds">'+esc(it.mo_ta||'')+'</div>'+(have>0?'<div style="font-size:.7rem;font-weight:800;color:#1a9e5c">Đang có: '+have+'</div>':'')+(preview?'<button disabled>Chỉ HS mua</button>':'<button onclick="vmShopBuy(\''+it.code+'\',\'\')">Mua · '+it.gia+' 🪙</button>')+'</div>'; }).join('');
    var mgSec='<div class="vsh-title">🪄 Phép thuật</div><div class="vsh-grid">'+mg+'</div>';
    var bal = preview ? '<span style="font-weight:800;color:var(--accent,#f39c12)">Chế độ xem thử</span>' : '🪙 <b>'+(d.coins||0)+'</b> xu';
    m.innerHTML = '<div class="vsh-box"><button onclick="document.getElementById(\'vmShopModal\').style.display=\'none\'" style="position:absolute;top:12px;right:14px;font-size:1.6rem;background:none;border:none;cursor:pointer;color:var(--ink-3,#888)">×</button>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h2 style="margin:0;font-size:1.15rem">🛒 Cửa hàng phần thưởng</h2><div style="font-size:1.02rem">'+bal+'</div></div>'+
      '<p style="margin:8px 0 0;font-size:.8rem;color:var(--ink-2,#555)">'+(preview?'Bạn đang xem thử cửa hàng — có thể áp màu/hiệu ứng lên giao diện của mình để trải nghiệm. Học sinh dùng xu để mua.':'Kiếm xu bằng cách nộp BTVN và đạt điểm cao (≥8). Dùng xu đổi phần thưởng!')+'</p>'+
      themeSec+fxSec+mgSec+'</div>';
  }

  window.vmShopBuy = async function(code, variant){ if(_mode!=='student') return;
    var r = await client().rpc('hs_mua',{p_code:code,p_variant:variant||''}); var res=(r&&r.data)||{ok:false,msg:(r&&r.error?r.error.message:'Lỗi')};
    if(res.ok){ try{ var rr=await client().rpc('hs_ho_so'); _profile=(rr&&rr.data)||_profile; }catch(e){} if(window.vmOnGameUpdate)window.vmOnGameUpdate(_profile); await renderShop(); }
    else alert(res.msg||'Không mua được'); };
  window.vmShopColor = async function(color, isOwned){
    if(_mode!=='student'){ try{ if(color)localStorage.setItem('vm-theme-color',color); else localStorage.removeItem('vm-theme-color'); }catch(e){} if(window.vmApplyThemeColor)window.vmApplyThemeColor(color); _profile.theme_color=color; await renderShop(); return; }
    if(!isOwned && color){ await window.vmShopBuy('theme_color',color); }
    var r = await client().rpc('hs_doi_mau',{p_color:color}); var res=(r&&r.data)||{ok:false};
    if(res.ok){ try{ if(color)localStorage.setItem('vm-theme-color',color); else localStorage.removeItem('vm-theme-color'); }catch(e){} if(window.vmApplyThemeColor)window.vmApplyThemeColor(color);
      try{ var rr=await client().rpc('hs_ho_so'); _profile=(rr&&rr.data)||_profile; }catch(e){} if(window.vmOnGameUpdate)window.vmOnGameUpdate(_profile); await renderShop(); }
    else if(res.msg) alert(res.msg); };
  window.vmShopAvatar = async function(fx){
    if(_mode!=='student'){ try{ if(fx)localStorage.setItem('vm-avatar-fx',fx); else localStorage.removeItem('vm-avatar-fx'); }catch(e){} _profile.avatar_fx=fx; if(window.vmOnGameUpdate)window.vmOnGameUpdate(_profile); await renderShop(); return; }
    var r = await client().rpc('hs_doi_avatar',{p_fx:fx}); var res=(r&&r.data)||{ok:false};
    if(res.ok){ try{ var rr=await client().rpc('hs_ho_so'); _profile=(rr&&rr.data)||_profile; }catch(e){} if(window.vmOnGameUpdate)window.vmOnGameUpdate(_profile); await renderShop(); }
    else if(res.msg) alert(res.msg); };
})();

/* ---------- 0. CHUYỂN CẢNH MƯỢT GIỮA CÁC TRANG (fade-in + fade-out khi điều hướng) ---------- */
(function () {
  try {
    var giamHoatAnh = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (giamHoatAnh) return;
    // Chèn style hiệu ứng
    var st = document.createElement('style');
    st.id = 'vmPageTransition';
    st.textContent =
      // Không transform <body>: transform dù bằng ma trận đơn vị vẫn biến body thành
      // containing block, khiến mọi position:fixed bị neo theo chiều cao tài liệu.
      '@keyframes vmPageIn{from{opacity:0}to{opacity:1}}' +
      '@keyframes vmPageOut{from{opacity:1}to{opacity:0}}' +
      'body{animation:vmPageIn .36s cubic-bezier(.22,1,.36,1) both}' +
      'html.vm-leaving body{animation:vmPageOut .2s ease both}';
    (document.head || document.documentElement).appendChild(st);

    // Fade-out khi bấm sang trang khác cùng site (bubble phase để tôn trọng handler của phần tử)
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      if (a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('rel') === 'external') return;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(javascript:|mailto:|tel:)/i.test(href)) return;
      var url; try { url = new URL(a.href, location.href); } catch (_) { return; }
      if (url.origin !== location.origin) return;                 // link ngoài site
      if (url.pathname === location.pathname && url.search === location.search) return; // cùng trang (neo)
      e.preventDefault();
      document.documentElement.classList.add('vm-leaving');
      var dich = a.href;
      setTimeout(function () { location.href = dich; }, 190);
    }, false);

    // Quay lại/tiến (bfcache) -> đảm bảo trang hiện rõ, gỡ trạng thái đang rời
    window.addEventListener('pageshow', function (ev) {
      if (ev.persisted) document.documentElement.classList.remove('vm-leaving');
    });
  } catch (e) { /* im lặng, không chặn trang */ }
})();

/* ---------- 1. CHẾ ĐỘ SÁNG / TỐI & HỆ THỐNG GIAO DIỆN LIQUID GLASS ---------- */
function capNhatNutTheme() {
  var btn = document.getElementById('themeBtn');
  if (!btn) return;
  var theme = document.documentElement.getAttribute('data-theme') || 'dark';
  var svgMoon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" style="display:block"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
  var svgSun = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" style="display:block"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
  btn.innerHTML = (theme === 'dark') ? svgMoon : svgSun;
}

function toggleTheme() {
  var h = document.documentElement;
  var dark = h.getAttribute('data-theme') === 'dark';
  var newTheme = dark ? 'light' : 'dark';
  h.setAttribute('data-theme', newTheme);
  
  capNhatNutTheme();
  
  // Đồng bộ cả nút ở Control Center nếu đang mở
  var ccLight = document.getElementById('ccBtnLight');
  var ccDark = document.getElementById('ccBtnDark');
  if (ccLight && ccDark) {
    if (newTheme === 'dark') {
      ccDark.classList.add('active');
      ccLight.classList.remove('active');
    } else {
      ccLight.classList.add('active');
      ccDark.classList.remove('active');
    }
  }

  var activeColor = localStorage.getItem('vm-accent') || 'amber';
  apdungMauAccent(h, activeColor, newTheme === 'dark');
  
  try { localStorage.setItem('vm-theme', newTheme); } catch (e) {}
  try { window.dispatchEvent(new Event('theme-change')); } catch (e) {}
  
  // Lưu lên database nếu là admin
  if (window.VM_USER_ROLE === 'admin') {
    luuCaiDatHeThong('theme_theme', newTheme);
  } else if (daKetNoi()) {
    // Trường hợp vai trò chưa được tải xong khi bấm nút
    (async function() {
      try {
        var s = await sb.auth.getSession();
        if (s.data.session) {
          var rp = await sb.from('profiles').select('role').eq('id', s.data.session.user.id).single();
          if (rp.data && rp.data.role === 'admin') {
            window.VM_USER_ROLE = 'admin';
            luuCaiDatHeThong('theme_theme', newTheme);
          }
        }
      } catch (e) {}
    })();
  }
}

function apdungMauAccent(el, color, isDark) {
  var map = {
    light: {
      blue:   { accent: '#2563eb', grad: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', soft: 'rgba(37, 99, 235, 0.08)' },
      violet: { accent: '#8b5cf6', grad: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', soft: 'rgba(139, 92, 246, 0.08)' },
      coral:  { accent: '#ff5e62', grad: 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)', soft: 'rgba(255, 94, 98, 0.08)' },
      green:  { accent: '#10b981', grad: 'linear-gradient(135deg, #34d399 0%, #059669 100%)', soft: 'rgba(16, 185, 129, 0.08)' },
      amber:  { accent: '#DD9400', grad: 'linear-gradient(135deg, #FFD21A 0%, #F7A80C 50%, #DD9400 100%)', soft: 'rgba(221, 148, 0, 0.10)' }
    },
    dark: {
      blue:   { accent: '#2563eb', grad: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)', soft: 'rgba(37, 99, 235, 0.15)' },
      violet: { accent: '#c084fc', grad: 'linear-gradient(135deg, #e9d5ff 0%, #a855f7 100%)', soft: 'rgba(192, 132, 252, 0.12)' },
      coral:  { accent: '#ff5e62', grad: 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)', soft: 'rgba(255, 94, 98, 0.12)' },
      green:  { accent: '#34d399', grad: 'linear-gradient(135deg, #6ee7b7 0%, #10b981 100%)', soft: 'rgba(52, 211, 153, 0.12)' },
      amber:  { accent: '#d97706', grad: 'linear-gradient(135deg, #b45309 0%, #fbbf24 100%)', soft: 'rgba(217, 119, 6, 0.15)' }
    }
  };
  var themeSet = isDark ? map.dark : map.light;
  var target = themeSet[color] || themeSet.amber;
  el.style.setProperty('--accent', target.accent);
  el.style.setProperty('--accent-gradient', target.grad);
  el.style.setProperty('--accent-soft', target.soft);
}

(function () { // áp dụng cài đặt giao diện đã lưu ngay lập tức để tránh chớp giật (FOUC)
  try {
    var root = document.documentElement;
    
    // 1. Theme
    var savedTheme = localStorage.getItem('vm-theme') || 'dark'; // mặc định tối cho ngầu
    root.setAttribute('data-theme', savedTheme);
    
    // 2. Transparency & Blur
    var savedTrans = localStorage.getItem('vm-transparency');
    if (savedTrans !== null) {
      root.style.setProperty('--glass-opacity', savedTrans);
    } else {
      root.style.setProperty('--glass-opacity', savedTheme === 'dark' ? '0.3' : '0.2');
    }
    var savedBlur = localStorage.getItem('vm-blur');
    if (savedBlur !== null) {
      root.style.setProperty('--glass-blur-radius', savedBlur + 'px');
    } else {
      root.style.setProperty('--glass-blur-radius', '20px');
    }
    
    // Canvas Opacity (Background dynamic effects)
    var savedCanvasOpacity = localStorage.getItem('vm-canvas-opacity') || '0.25';
    root.style.setProperty('--canvas-opacity', savedCanvasOpacity);
    
    // 3. Accent Color
    var savedColor = localStorage.getItem('vm-accent') || 'amber';
    apdungMauAccent(root, savedColor, savedTheme === 'dark');
  } catch (e) {}
})();

/* ---------- 2. KẾT NỐI SUPABASE ---------- */
// "sb" là cánh cửa đến tủ hồ sơ. Nếu config.js chưa điền, sb = null
// và web chạy ở "chế độ xem thử" (không đăng nhập được thật).
var VM = window.VINHMATH_CONFIG || {};
var sb = null;

// Bộ nhớ phiên ĐĂNG NHẬP THEO TỪNG TAB (cho phép đăng nhập nhiều tài khoản ở các tab khác nhau):
// - Mỗi tab có storageKey RIÊNG (theo id tab) -> vừa cô lập bộ nhớ, vừa tách kênh đồng bộ
//   đa-tab của Supabase, nên tab admin không bị "nhảy" sang tài khoản HS khi tab khác đăng nhập.
// - Vẫn giữ đăng nhập bền: mỗi lần lưu phiên có mirror sang localStorage (khóa chung),
//   tab mới / mở lại trình duyệt sẽ tự đăng nhập bằng phiên gần nhất; phiên cũ được migrate.
function vmRefDuAn() { try { return (new URL(VM.SUPABASE_URL)).hostname.split('.')[0]; } catch (e) { return 'app'; } }
function vmTabId() {
  var id = null;
  try { id = window.sessionStorage.getItem('vm-tab-id'); } catch (e) {}
  if (!id) { id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); try { window.sessionStorage.setItem('vm-tab-id', id); } catch (e) {} }
  return id;
}
var VM_SHARED_KEY = 'vmauth-shared';
var VM_OLD_KEY = 'sb-' + vmRefDuAn() + '-auth-token';
function vmTaoBoNhoPhien() {
  var LS, SS;
  try { LS = window.localStorage; } catch (e) { LS = null; }
  try { SS = window.sessionStorage; } catch (e) { SS = null; }
  if (!SS) return LS || undefined; // trình duyệt chặn sessionStorage -> quay lại mặc định
  return {
    getItem: function (k) {
      try {
        var v = SS.getItem(k);
        if (v !== null && v !== undefined) return v;
        if (LS) {
          var lv = LS.getItem(VM_SHARED_KEY);
          if (lv === null || lv === undefined) lv = LS.getItem(VM_OLD_KEY); // migrate phiên đã đăng nhập từ trước
          if (lv !== null && lv !== undefined) { try { SS.setItem(k, lv); } catch (e) {} return lv; }
        }
        return null;
      } catch (e) { return null; }
    },
    setItem: function (k, val) {
      try { SS.setItem(k, val); } catch (e) {}
      try { if (LS) LS.setItem(VM_SHARED_KEY, val); } catch (e) {} // mirror để tab mới / mở lại trình duyệt vẫn đăng nhập
    },
    removeItem: function (k) {
      try { SS.removeItem(k); } catch (e) {}
      try { if (LS) { LS.removeItem(VM_SHARED_KEY); LS.removeItem(VM_OLD_KEY); } } catch (e) {}
    }
  };
}

if (VM.SUPABASE_URL && VM.SUPABASE_ANON_KEY && window.supabase) {
  sb = window.supabase.createClient(VM.SUPABASE_URL, VM.SUPABASE_ANON_KEY, {
    auth: {
      storage: vmTaoBoNhoPhien(),
      storageKey: 'vmauth-' + vmTabId(),
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true
    }
  });
}
function daKetNoi() { return sb !== null; }

/* Gọi Edge Function với FormData và giữ nguyên thông báo lỗi JSON từ máy chủ.
   supabase.functions.invoke() chỉ trả thông báo HTTP chung cho một số lỗi 4xx/5xx,
   khiến người dùng không biết Google Drive, phân loại bài hay phiên đăng nhập đang lỗi. */
async function vmGoiHamFormData(tenHam, formData, tuyChon) {
  tuyChon = tuyChon || {};
  if (!sb) throw new Error('Chưa kết nối được máy chủ VinhMath.');
  var phien = await sb.auth.getSession();
  var accessToken = phien && phien.data && phien.data.session && phien.data.session.access_token;
  if (!accessToken) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang và đăng nhập lại.');

  var controller = new AbortController();
  var timeoutMs = Number(tuyChon.timeoutMs) || 120000;
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  try {
    var response = await fetch(VM.SUPABASE_URL + '/functions/v1/' + encodeURIComponent(tenHam), {
      method: 'POST',
      headers: {
        apikey: VM.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + accessToken
      },
      body: formData,
      signal: controller.signal
    });
    var raw = await response.text();
    var data = null;
    try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = { error: raw }; }
    if (!response.ok || (data && data.error)) {
      var msg = data && data.error ? data.error : ('Máy chủ trả lỗi HTTP ' + response.status + '.');
      if (response.status === 503 || response.status === 504) msg = 'Máy chủ lưu bài xử lý quá lâu. Hãy thử lại với ít tệp hơn hoặc kiểm tra kết nối mạng.';
      throw new Error(msg);
    }
    return data || {};
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Quá thời gian chờ tải bài. Bài chưa được ghi nhận; vui lòng thử lại.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 3. ĐĂNG NHẬP / ĐĂNG XUẤT ---------- */
// HS dùng "tên đăng nhập" (vd DienVoTheVinh@ad.vinhmath). Supabase cần email,
// nên ta tự ghép đuôi cố định ngầm (.com) — HS không cần biết điều này.
async function dangNhap(username, password) {
  if (!daKetNoi()) return { error: 'Web đang ở chế độ xem thử — chưa kết nối Supabase.' };
  
  var u = username.trim().toLowerCase();
  
  // Tự động cắt bỏ đuôi .com nếu trình duyệt tự điền hoặc người dùng nhập theo thói quen cũ
  if (u.endsWith('.com')) {
    u = u.replace(/\.com$/, '');
  }
  
  var email = "";
  if (!u.includes('@')) {
    // Nếu học sinh chỉ nhập tên (vd: TranHaTuAnh), tự động ghép đuôi học sinh đầy đủ
    email = u + '@hs.vinhmath.com';
  } else {
    // Bất kỳ đuôi phân quyền .vinhmath nào (hs, ph, gv, tg, ad, admin...) đều tự thêm .com ngầm
    if (/@[a-z]+\.vinhmath$/.test(u)) {
      email = u + '.com';
    } else {
      email = u;
    }
  }
  
  var r = await sb.auth.signInWithPassword({ email: email, password: password });
  if (r.error) {
    var msg = r.error.message || '';
    if (msg.indexOf('Invalid login credentials') !== -1)
      return { error: 'Sai tên đăng nhập hoặc mật khẩu. Em kiểm tra lại nhé.' };
    return { error: 'Không đăng nhập được: ' + msg };
  }
  return { ok: true };
}

// Định dạng tên người nhận xét kèm nhãn đặc quyền cho Sáng lập
function formatAuthorName(name) {
  if (!name) return 'Thầy/Trợ giảng';
  var clean = name.trim();
  if (clean.indexOf('Điền Võ Thế Vinh') !== -1 || clean === 'Thầy Vinh (Admin)' || clean === 'Thầy Điền Võ Thế Vinh' || clean.indexOf('dienvothevinh') !== -1) {
    return '<span class="name-owner">Thầy Điền Võ Thế Vinh <span class="badge-owner">Sáng lập 👑</span></span>';
  }
  if (clean.indexOf('Trợ giảng') !== -1 || clean.indexOf('(TG)') !== -1) {
    return '<span style="color: var(--ink-2); font-weight: 500;">' + clean + '</span>';
  }
  return '<span style="color: var(--ink-1); font-weight: 600;">' + clean + '</span>';
}


async function dangXuat() {
  sessionStorage.removeItem('vm-guest-mode');
  if (daKetNoi()) await sb.auth.signOut();
  window.location.href = 'dang-nhap';
}

// Lấy hồ sơ (họ tên, vai trò, lớp) của người đang đăng nhập
async function layHoSo() {
  if (sessionStorage.getItem('vm-guest-mode') === 'true') {
    return {
      id: 'guest-id',
      role: 'student',
      username: 'khach',
      full_name: 'Khách Trải Nghiệm',
      class_id: 'guest-class',
      class_students: [
        {
          class_id: 'guest-class',
          classes: {
            id: 'guest-class',
            name: 'Lớp Trải Nghiệm VinhMath',
            mode: 'online',
            grade: 10,
            is_specialized: false,
            teacher_id: null,
            co_teacher_id: null
          }
        }
      ]
    };
  }
  if (!daKetNoi()) return null;
  var s = await sb.auth.getSession();
  if (!s.data.session) return null;
  var r = await sb.from('profiles')
    .select('id, role, username, full_name, class_id, class_students(class_id, classes(name, mode, grade, is_specialized, teacher_id, co_teacher_id))')
    .eq('id', s.data.session.user.id).single();
  
  if (r.error) {
    console.warn("Lỗi layHoSo với các cột co-teaching (có thể chưa chạy SQL migration):", r.error);
    console.log("Thử tự động tải hồ sơ phiên bản cũ (không có co-teaching)...");
    r = await sb.from('profiles')
      .select('id, role, username, full_name, class_id, class_students(class_id, classes(name, mode, grade, is_specialized))')
      .eq('id', s.data.session.user.id).single();
    if (r.error) {
      console.error("Lỗi layHoSo phiên bản cũ:", r.error);
    }
  }
  
  if (r.data) {
    r.data.class_students = r.data.class_students || [];
    if (r.data.class_students.length > 0) {
      r.data.class_id = r.data.class_students[0].class_id;
      r.data.classes = r.data.class_students[0].classes;
    } else {
      r.data.class_id = null;
      r.data.classes = null;
    }
    
    // Tự động khởi chạy poller điểm danh nếu là học sinh
    if (r.data.role === 'student' && !window.pollerDiemDanhInterval) {
      setTimeout(function () { khoiChayPollerDiemDanh(r.data); }, 1000);
    }
  }
  return r.data || null;
}

/* ---------- 4. CHẶN TRANG CẦN ĐĂNG NHẬP ---------- */
// Gọi ở đầu các trang như lop-hoc. Chưa đăng nhập → đưa về trang đăng nhập.
async function yeuCauDangNhap() {
  if (sessionStorage.getItem('vm-guest-mode') === 'true') {
    return layHoSo();
  }
  if (!daKetNoi()) return null; // chế độ xem thử: cho xem với dữ liệu mẫu
  var s = await sb.auth.getSession();
  if (!s.data.session) { window.location.href = 'dang-nhap'; return null; }
  return layHoSo();
}

/* ---------- TIỆN ÍCH NHỎ ---------- */
function $(id) { return document.getElementById(id); }
function chao() { // lời chào theo giờ trong ngày
  var h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/* ---------- 5. ĐIỂM DANH POP-UP TỰ ĐỘNG CHO HỌC SINH ---------- */
window.pollerDiemDanhInterval = null;
var studentActiveSession = null;
var studentActiveId = null;

async function khoiChayPollerDiemDanh(hoSo) {
  if (!hoSo || hoSo.role !== 'student') return;
  if (!hoSo.class_students || hoSo.class_students.length === 0) return;
  
  var classIds = hoSo.class_students.map(function (c) { return c.class_id; });
  var studentId = hoSo.id;
  
  kiemTraDiemDanhPoller(classIds, studentId);
  window.pollerDiemDanhInterval = setInterval(function () {
    kiemTraDiemDanhPoller(classIds, studentId);
  }, 10000);
}

async function kiemTraDiemDanhPoller(classIds, studentId) {
  if (!daKetNoi()) return;
  
  var nowIso = new Date().toISOString();
  var r = await sb.from('class_sessions')
    .select('id, title, qr_expires, class_id')
    .in('class_id', classIds)
    .eq('attendance_open', true)
    .gt('qr_expires', nowIso)
    .order('created_at', { ascending: false });
    
  if (r.error || !r.data || r.data.length === 0) {
    dongModalDiemDanhStudent();
    return;
  }
  
  var buoi = r.data[0];
  
  if (sessionStorage.getItem('vm-dismissed-session-' + buoi.id) === 'true') {
    return;
  }
  
  var att = await sb.from('attendance')
    .select('session_id')
    .eq('session_id', buoi.id)
    .eq('student_id', studentId)
    .maybeSingle();
    
  if (att.data) {
    dongModalDiemDanhStudent();
    return;
  }
  
  hienModalDiemDanhStudent(buoi, studentId);
}

function hienModalDiemDanhStudent(buoi, studentId) {
  studentActiveSession = buoi;
  studentActiveId = studentId;
  
  var modal = $('studentAttendanceModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'studentAttendanceModal';
    modal.className = 'student-attendance-modal';
    modal.innerHTML = 
      '<div class="sam-inner">' +
        '<button class="sam-close" onclick="huyModalDiemDanhStudent()">×</button>' +
        '<div class="sam-icon">🔔</div>' +
        '<h2>Điểm danh buổi học!</h2>' +
        '<p>Thầy đang mở điểm danh cho buổi học:</p>' +
        '<div class="sam-session-title" id="samSessionTitle"></div>' +
        '<div class="sam-input-wrapper">' +
          '<input type="text" id="samCodeInput" class="input" placeholder="Nhập mã 4 chữ số" maxlength="4" ' +
                 'style="text-align:center; font-size:1.8rem; letter-spacing:4px; font-weight:800; height:50px;">' +
        '</div>' +
        '<div id="samErrorMsg" style="color:var(--err); font-size:0.85rem; margin-top:8px; display:none"></div>' +
        '<button class="btn btn-primary" id="samSubmitBtn" onclick="xacNhanDiemDanhStudent()" style="width:100%; margin-top:16px">Xác nhận điểm danh</button>' +
      '</div>';
    document.body.appendChild(modal);
    
    $('samCodeInput').addEventListener('keyup', function(e) {
      if (e.key === 'Enter') {
        xacNhanDiemDanhStudent();
      }
    });
  }
  
  $('samSessionTitle').textContent = buoi.title;
  modal.style.display = 'flex';
}

function dongModalDiemDanhStudent() {
  var modal = $('studentAttendanceModal');
  if (modal) {
    modal.style.display = 'none';
  }
  studentActiveSession = null;
}

function huyModalDiemDanhStudent() {
  if (studentActiveSession) {
    sessionStorage.setItem('vm-dismissed-session-' + studentActiveSession.id, 'true');
  }
  dongModalDiemDanhStudent();
}

async function xacNhanDiemDanhStudent() {
  if (!studentActiveSession || !studentActiveId) return;
  
  var code = $('samCodeInput').value.trim();
  if (code.length === 0) {
    showSamError('Vui lòng nhập mã điểm danh.');
    return;
  }
  
  var btn = $('samSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Đang kiểm tra...';
  
  var r = await sb.from('class_sessions')
    .select('id, title')
    .eq('id', studentActiveSession.id)
    .eq('checkin_code', code)
    .eq('attendance_open', true)
    .maybeSingle();
    
  if (r.error || !r.data) {
    showSamError('Mã điểm danh không chính xác. Em kiểm tra lại nhé.');
    btn.disabled = false;
    btn.textContent = 'Xác nhận điểm danh';
    return;
  }
  
  var ins = await sb.from('attendance').insert({ 
    session_id: studentActiveSession.id, 
    student_id: studentActiveId 
  });
  
  if (ins.error) {
    if ((ins.error.code || '') === '23505' || /duplicate/i.test(ins.error.message)) {
      showSamSuccess('Em đã điểm danh buổi này rồi!');
    } else {
      showSamError('Lỗi điểm danh: ' + ins.error.message);
      btn.disabled = false;
      btn.textContent = 'Xác nhận điểm danh';
    }
    return;
  }
  
  showSamSuccess('🎉 Điểm danh thành công!');
}

function showSamError(msg) {
  var el = $('samErrorMsg');
  if (el) {
    el.textContent = msg;
    el.style.color = 'var(--err)';
    el.style.display = 'block';
  }
}

function showSamSuccess(msg) {
  var el = $('samErrorMsg');
  if (el) {
    el.textContent = msg;
    el.style.color = 'var(--ok)';
    el.style.display = 'block';
  }
  var input = $('samCodeInput');
  if (input) input.disabled = true;
  var btn = $('samSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đã điểm danh ✅';
  }
  
  setTimeout(function() {
    dongModalDiemDanhStudent();
  }, 2000);
}

/* ---------- 6. KHỞI TẠO TRUNG TÂM ĐIỀU KHIỂN (APPLE CONTROL CENTER) ---------- */
function khoiTaoControlCenter() {
  return; // Hủy theo yêu cầu: Bỏ các icon bổ sung trên thanh công cụ
  var nav = document.querySelector('.topbar .nav') || document.querySelector('.nav') || document.querySelector('.topbar');
  if (!nav) return;
  
  // Tránh khởi tạo nhiều lần
  if ($('controlCenterWrapper')) return;
  
  // 1. Tạo wrapper Control Center
  var ccWrapper = document.createElement('div');
  ccWrapper.className = 'control-center-wrapper';
  ccWrapper.id = 'controlCenterWrapper';
  
  // 2. Tạo nút bấm Control Center (Biểu tượng sliders)
  ccWrapper.innerHTML = 
    '<button class="control-center-btn" id="ccBtn" title="Điều chỉnh độ mờ trong suốt (Liquid Glass)">' +
      '<svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round;">' +
        '<line x1="4" y1="21" x2="4" y2="14"></line>' +
        '<line x1="4" y1="10" x2="4" y2="3"></line>' +
        '<line x1="12" y1="21" x2="12" y2="12"></line>' +
        '<line x1="12" y1="8" x2="12" y2="3"></line>' +
        '<line x1="20" y1="21" x2="20" y2="16"></line>' +
        '<line x1="20" y1="12" x2="20" y2="3"></line>' +
        '<line x1="2" y1="14" x2="6" y2="14"></line>' +
        '<line x1="10" y1="8" x2="14" y2="8"></line>' +
        '<line x1="18" y1="16" x2="22" y2="16"></line>' +
      '</svg>' +
    '</button>';
    
  // 3. Tạo Panel Control Center
  var panel = document.createElement('div');
  panel.className = 'control-center-panel';
  panel.id = 'ccPanel';
  
  var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  var isDark = currentTheme === 'dark';
  var currentTrans = localStorage.getItem('vm-transparency') || (isDark ? '0.3' : '0.2');
  var currentBlur = localStorage.getItem('vm-blur') || '20';
  var currentCanvasOpacity = localStorage.getItem('vm-canvas-opacity') || '0.25';
  var currentAccent = localStorage.getItem('vm-accent') || 'amber';
  
  panel.innerHTML = 
    '<!-- Shared theme customizations (Sliders for Opacity, Effect, Blur) -->' +
    '<div id="ccSharedControls" style="display:flex; flex-direction:column; gap:14px; padding-top:4px">' +
      // Opacity
      '<div class="cc-control-row">' +
        '<div class="cc-control-label">' +
          '<span>Độ đặc kính (Opacity)</span>' +
          '<span id="lblOpacity">' + Math.round(currentTrans * 100) + '%</span>' +
        '</div>' +
        '<div class="cc-slider-wrap">' +
          '<input type="range" min="0.1" max="1.0" step="0.05" value="' + currentTrans + '" class="cc-slider" id="sldOpacity">' +
        '</div>' +
      '</div>' +
      
      // Canvas
      '<div class="cc-control-row">' +
        '<div class="cc-control-label">' +
          '<span>Độ rõ hiệu ứng nền (Effect)</span>' +
          '<span id="lblCanvasOpacity">' + Math.round(currentCanvasOpacity * 100) + '%</span>' +
        '</div>' +
        '<div class="cc-slider-wrap">' +
          '<input type="range" min="0.05" max="0.8" step="0.05" value="' + currentCanvasOpacity + '" class="cc-slider" id="sldCanvasOpacity">' +
        '</div>' +
      '</div>' +
      
      // Blur
      '<div class="cc-control-row">' +
        '<div class="cc-control-label">' +
          '<span>Độ mờ gương (Blur)</span>' +
          '<span id="lblBlur">' + currentBlur + 'px</span>' +
        '</div>' +
        '<div class="cc-slider-wrap">' +
          '<input type="range" min="0" max="40" step="1" value="' + currentBlur + '" class="cc-slider" id="sldBlur">' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<!-- Locked settings message for non-admins -->' +
    '<div id="ccLockedMsg" style="text-align:center; padding:12px; font-size:0.85rem; color:var(--ink-3); border-top:1px dashed var(--line); margin-top:12px; display:block">' +
      '🎨 <i>Màu chủ đề & AI do Quản trị viên thiết lập.</i>' +
    '</div>' +
    
    '<!-- Admin theme color customizations -->' +
    '<div id="ccThemeColorControls" style="display:none; flex-direction:column; gap:14px; border-top:1px dashed var(--line); padding-top:12px; margin-top:12px">' +
      // Accent Color
      '<div class="cc-color-picker">' +
        '<div class="cc-color-label">Màu chủ đề</div>' +
        '<div class="cc-color-dots">' +
          '<div class="cc-color-dot ' + (currentAccent === 'blue' ? 'active' : '') + '" data-color="blue" style="background:#2563eb;" title="Xanh dương"></div>' +
          '<div class="cc-color-dot ' + (currentAccent === 'violet' ? 'active' : '') + '" data-color="violet" style="background:#8b5cf6;" title="Tím"></div>' +
          '<div class="cc-color-dot ' + (currentAccent === 'coral' ? 'active' : '') + '" data-color="coral" style="background:#ff5e62;" title="Đỏ son"></div>' +
          '<div class="cc-color-dot ' + (currentAccent === 'green' ? 'active' : '') + '" data-color="green" style="background:#10b981;" title="Xanh lá"></div>' +
          '<div class="cc-color-dot ' + (currentAccent === 'amber' ? 'active' : '') + '" data-color="amber" style="background:#E0A416;" title="Vàng kim"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
    
  ccWrapper.appendChild(panel);
  
  // Chèn vào đầu trang bên cạnh themeBtn để tránh bị đè hoặc ghi đè innerHTML
  var themeBtn = nav.querySelector('#themeBtn');
  if (themeBtn && themeBtn.parentNode) {
    themeBtn.parentNode.insertBefore(ccWrapper, themeBtn);
  } else {
    var navLinks = nav.querySelector('.navlinks') || nav;
    if (navLinks === nav) {
      nav.appendChild(ccWrapper);
    } else {
      navLinks.insertBefore(ccWrapper, navLinks.firstChild);
    }
  }
  
  // 4. Đăng ký các sự kiện tương tác
  var ccBtn = $('ccBtn');
  var ccPanel = $('ccPanel');
  
  // Toggle panel
  ccBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    ccPanel.classList.toggle('open');
  });
  
  // Click ngoài đóng panel
  document.addEventListener('click', function() {
    ccPanel.classList.remove('open');
  });
  ccPanel.addEventListener('click', function(e) {
    e.stopPropagation(); // chặn không đóng khi tương tác bên trong panel
  });
  
  // Thay đổi Theme (nếu phần tử tồn tại)
  var btnLight = $('ccBtnLight');
  var btnDark = $('ccBtnDark');
  
  function setCCTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vm-theme', theme);
    
    // Cập nhật nút trong CC
    if (theme === 'dark') {
      if (btnDark) btnDark.classList.add('active');
      if (btnLight) btnLight.classList.remove('active');
    } else {
      if (btnLight) btnLight.classList.add('active');
      if (btnDark) btnDark.classList.remove('active');
    }
    
    // Cập nhật nút cũ (nếu có trên trang)
    capNhatNutTheme();
    
    // Cập nhật màu accent theo theme
    var activeColor = localStorage.getItem('vm-accent') || 'amber';
    apdungMauAccent(document.documentElement, activeColor, theme === 'dark');
    try { window.dispatchEvent(new Event('theme-change')); } catch (e) {}
    
    // Chỉ lưu lên database nếu tài khoản là admin
    if (window.VM_USER_ROLE === 'admin') {
      luuCaiDatHeThong('theme_theme', theme);
    }
  }
  
  if (btnLight) btnLight.addEventListener('click', function() { setCCTheme('light'); });
  if (btnDark) btnDark.addEventListener('click', function() { setCCTheme('dark'); });
  
  // Slider Opacity
  var sldOpacity = $('sldOpacity');
  var lblOpacity = $('lblOpacity');
  sldOpacity.addEventListener('input', function() {
    var val = sldOpacity.value;
    lblOpacity.textContent = Math.round(val * 100) + '%';
    document.documentElement.style.setProperty('--glass-opacity', val);
    localStorage.setItem('vm-transparency', val);
  });
  sldOpacity.addEventListener('change', function() {
    if (window.VM_USER_ROLE === 'admin') {
      luuCaiDatHeThong('theme_transparency', sldOpacity.value);
    }
  });
  
  // Slider Canvas Opacity
  var sldCanvasOpacity = $('sldCanvasOpacity');
  var lblCanvasOpacity = $('lblCanvasOpacity');
  sldCanvasOpacity.addEventListener('input', function() {
    var val = sldCanvasOpacity.value;
    lblCanvasOpacity.textContent = Math.round(val * 100) + '%';
    document.documentElement.style.setProperty('--canvas-opacity', val);
    localStorage.setItem('vm-canvas-opacity', val);
  });
  sldCanvasOpacity.addEventListener('change', function() {
    if (window.VM_USER_ROLE === 'admin') {
      luuCaiDatHeThong('theme_canvas_opacity', sldCanvasOpacity.value);
    }
  });
  
  // Slider Blur
  var sldBlur = $('sldBlur');
  var lblBlur = $('lblBlur');
  sldBlur.addEventListener('input', function() {
    var val = sldBlur.value;
    lblBlur.textContent = val + 'px';
    document.documentElement.style.setProperty('--glass-blur-radius', val + 'px');
    localStorage.setItem('vm-blur', val);
  });
  sldBlur.addEventListener('change', function() {
    if (window.VM_USER_ROLE === 'admin') {
      luuCaiDatHeThong('theme_blur', sldBlur.value);
    }
  });
  
  // Color dots selection
  var dots = ccPanel.querySelectorAll('.cc-color-dot');
  dots.forEach(function(dot) {
    dot.addEventListener('click', function() {
      dots.forEach(function(d) { d.classList.remove('active'); });
      dot.classList.add('active');
      
      var color = dot.getAttribute('data-color');
      localStorage.setItem('vm-accent', color);
      
      var isD = document.documentElement.getAttribute('data-theme') === 'dark';
      apdungMauAccent(document.documentElement, color, isD);
      try { window.dispatchEvent(new Event('theme-change')); } catch (e) {}
      
      if (window.VM_USER_ROLE === 'admin') {
        luuCaiDatHeThong('theme_accent', color);
      }
    });
  });
}

/* ---------- 7. TRỢ LÝ AI HỌC TẬP (GEMINI) ---------- */
window.VM_AI_SETTINGS = {
  enabled: false,
  key: ''
};
window.VM_AI_SCREENSHOT = null;

// Tải động và cấu hình MathJax (đảm bảo dịch LaTeX trên mọi trang)
function damBaoMathJax(callback) {
  if (window.MathJax && window.MathJax.typesetPromise) {
    if (callback) callback();
    return;
  }
  
  if (!document.getElementById('MathJax-script')) {
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']]
      },
      options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
      }
    };

    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    script.id = 'MathJax-script';
    script.async = true;
    script.onload = function() {
      if (callback) callback();
    };
    document.head.appendChild(script);
  } else {
    // Nếu script đã được tạo nhưng chưa load xong, check định kỳ
    var timer = setInterval(function() {
      if (window.MathJax && window.MathJax.typesetPromise) {
        clearInterval(timer);
        if (callback) callback();
      }
    }, 100);
  }
}

// Tải động html2canvas để quét màn hình
function taiHtml2Canvas(callback) {
  if (window.html2canvas) {
    callback();
    return;
  }
  var script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  script.onload = callback;
  script.onerror = function() {
    console.error("Không thể tải thư viện html2canvas");
    alert("Có lỗi xảy ra khi chuẩn bị quét màn hình. Sếp hãy kiểm tra lại kết nối mạng nhé!");
  };
  document.head.appendChild(script);
}

// Tự động quét màn hình sử dụng html2canvas (tự động ẩn ô chat khi chụp và phục hồi lại)
async function layAnhChupManHinh() {
  return new Promise(function(resolve, reject) {
    taiHtml2Canvas(function() {
      var bubbleEl = document.getElementById('aiChatBubble');
      var boxEl = document.getElementById('aiChatBox');
      var ccEl = document.getElementById('controlCenterWrapper');
      
      // Lưu lại trạng thái hiển thị
      var oldBubbleDisplay = bubbleEl ? bubbleEl.style.display : '';
      var oldBoxDisplay = boxEl ? boxEl.style.display : '';
      
      // Ẩn lập tức các thành phần giao diện của chat để tránh lọt vào ảnh chụp
      if (bubbleEl) bubbleEl.style.setProperty('display', 'none', 'important');
      if (boxEl) boxEl.style.setProperty('display', 'none', 'important');
      if (ccEl) ccEl.style.setProperty('display', 'none', 'important');
      
      // Chờ một chút để trình duyệt cập nhật lại giao diện trước khi chụp
      setTimeout(function() {
        html2canvas(document.body, {
          scale: 0.8,
          logging: false,
          useCORS: true
        }).then(function(canvas) {
          // Phục hồi lại hiển thị ngay sau khi chụp xong
          if (bubbleEl) bubbleEl.style.display = oldBubbleDisplay;
          if (boxEl) boxEl.style.display = oldBoxDisplay;
          if (ccEl) ccEl.style.display = '';
          
          try {
            var imgData = canvas.toDataURL('image/jpeg', 0.75);
            resolve(imgData);
          } catch(e) {
            reject(e);
          }
        }).catch(function(err) {
          // Phục hồi lại hiển thị kể cả khi lỗi
          if (bubbleEl) bubbleEl.style.display = oldBubbleDisplay;
          if (boxEl) boxEl.style.display = oldBoxDisplay;
          if (ccEl) ccEl.style.display = '';
          reject(err);
        });
      }, 100);
    });
  });
}

async function tailaiCaiDatAI() {
  if (!daKetNoi()) return;
  try {
    var r = await sb.from('app_settings').select('key, value');
    if (r.data) {
      var en = r.data.find(function(x) { return x.key === 'ai_enabled'; });
      var ky = r.data.find(function(x) { return x.key === 'gemini_api_key'; });
      window.VM_AI_SETTINGS.enabled = en ? (en.value === 'true') : false;
      window.VM_AI_SETTINGS.key = ky ? ky.value : '';
      capNhatChatbotUI();
      if (window.VM_AI_SETTINGS.enabled) {
        damBaoMathJax();
      }
    }
  } catch (e) { console.error("Lỗi tailaiCaiDatAI:", e); }
}

function dangKyRealtimeAI() {
  if (!daKetNoi()) return;
  try {
    sb.channel('realtime-ai-settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, function(payload) {
        var row = payload.new;
        if (row.key === 'ai_enabled') {
          window.VM_AI_SETTINGS.enabled = row.value === 'true';
          capNhatChatbotUI();
          if (window.VM_AI_SETTINGS.enabled) {
            damBaoMathJax();
          }
          var sw = document.getElementById('ccSwitchAI');
          if (sw) sw.checked = window.VM_AI_SETTINGS.enabled;
        } else if (row.key === 'gemini_api_key') {
          window.VM_AI_SETTINGS.key = row.value;
          var inp = document.getElementById('ccInputGeminiKey');
          if (inp) inp.value = row.value;
          capNhatChatbotUI();
        }
      })
      .subscribe();
  } catch(e) { console.error("Lỗi dangKyRealtimeAI:", e); }
}

let aiChatWidgetCreated = false;
let aiChatHistory = [];

function capNhatChatbotUI() {
  var enabled = window.VM_AI_SETTINGS.enabled; // key giờ nằm phía máy chủ (Edge Function)
  var bubble = document.getElementById('aiChatBubble');
  var box = document.getElementById('aiChatBox');
  
  if (enabled) {
    if (!aiChatWidgetCreated) {
      taoChatbotWidget();
      // Lấy lại các element vừa tạo
      bubble = document.getElementById('aiChatBubble');
    }
    if (bubble) bubble.style.display = 'grid';
  } else {
    if (bubble) bubble.style.display = 'none';
    if (box) box.style.display = 'none';
  }
}

function taoChatbotWidget() {
  if (aiChatWidgetCreated) return;
  
  // 1. Tạo Bubble
  var bubble = document.createElement('div');
  bubble.className = 'ai-chat-bubble';
  bubble.id = 'aiChatBubble';
  bubble.title = 'Hỏi đáp với Trợ Lý AI';
  bubble.innerHTML = 
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>' +
    '</svg>';
  
  // 2. Tạo Chat Box
  var box = document.createElement('div');
  box.className = 'ai-chat-box';
  box.id = 'aiChatBox';
  box.style.display = 'none';
  box.innerHTML = 
    '<div class="acb-header">' +
      '<div class="acb-title">🤖 Trợ Lý VinhMath AI</div>' +
      '<button class="acb-close" id="aiChatClose">×</button>' +
    '</div>' +
    '<div class="acb-body" id="aiChatBody">' +
      '<div class="acb-msg ai">Xin chào! Em có thắc mắc gì về bài học hoặc cách dùng website không? Thầy Vinh AI sẵn sàng hỗ trợ nhé!</div>' +
    '</div>' +
    '<!-- Khu vực hiển thị preview ảnh chụp màn hình -->' +
    '<div id="aiScreenshotArea" style="display:none; padding:8px 12px; background:var(--surface-2); border-top:1px solid var(--line-2); align-items:center; gap:10px;">' +
      '<div style="position:relative; width:60px; height:45px; border-radius:4px; overflow:hidden; border:1px solid var(--line);">' +
        '<img id="aiScreenshotImg" style="width:100%; height:100%; object-fit:cover;">' +
        '<button id="aiScreenshotRemove" style="position:absolute; top:2px; right:2px; width:16px; height:16px; border-radius:50%; background:rgba(0,0,0,0.6); color:#fff; border:none; font-size:10px; cursor:pointer; display:grid; place-items:center; line-height:1;">×</button>' +
      '</div>' +
      '<span style="font-size:0.75rem; color:var(--ink-2)">Đã đính kèm ảnh chụp màn hình</span>' +
    '</div>' +
    '<div class="acb-footer" style="display:flex; align-items:center; gap:8px; padding:10px 12px; border-top:1px solid var(--line-2); background:var(--surface-solid);">' +
      '<button id="aiChatCapture" class="btn btn-secondary btn-sm" title="Quét màn hình hiện tại" style="padding: 8px; flex-shrink: 0; display: grid; place-items: center; border-radius: var(--r-sm); background: var(--surface-2); border: 1px solid var(--line-2); color: var(--ink-2); cursor: pointer; width: 38px; height: 38px;">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;">' +
          '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>' +
          '<circle cx="12" cy="13" r="4"></circle>' +
        '</svg>' +
      '</button>' +
      '<input type="text" id="aiChatInput" placeholder="Nhập câu hỏi của em..." style="flex-grow:1; border:1px solid var(--line-2); border-radius:8px; padding:8px 12px; background:var(--surface); color:var(--ink); outline:none; font-size:0.9rem;">' +
      '<button class="btn btn-primary btn-sm" id="aiChatSend" style="flex-shrink:0; padding:8px 16px; border-radius:8px; font-weight:600; font-size:0.9rem; cursor:pointer; background:var(--accent-gradient); color:#fff; border:none;">Gửi</button>' +
    '</div>';
    
  document.body.appendChild(bubble);
  document.body.appendChild(box);
  aiChatWidgetCreated = true;
  
  // Event listeners
  bubble.addEventListener('click', function(e) {
    e.stopPropagation();
    var show = box.style.display === 'none';
    box.style.display = show ? 'flex' : 'none';
    if (show) {
      document.getElementById('aiChatInput').focus();
      cuonXuongChat();
    }
  });
  
  document.getElementById('aiChatClose').addEventListener('click', function() {
    box.style.display = 'none';
  });
  
  box.addEventListener('click', function(e) {
    e.stopPropagation();
  });
  
  document.addEventListener('click', function() {
    box.style.display = 'none';
  });
  
  var inp = document.getElementById('aiChatInput');
  var btn = document.getElementById('aiChatSend');
  
  btn.addEventListener('click', guiTinNhanAI);
  inp.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') guiTinNhanAI();
  });

  // Event listener cho nút quét/chụp màn hình
  var btnCapture = document.getElementById('aiChatCapture');
  var scArea = document.getElementById('aiScreenshotArea');
  var scImg = document.getElementById('aiScreenshotImg');
  var scRemove = document.getElementById('aiScreenshotRemove');
  
  btnCapture.addEventListener('click', async function(e) {
    e.stopPropagation();
    
    btnCapture.disabled = true;
    var originalHTML = btnCapture.innerHTML;
    btnCapture.innerHTML = '⏳';
    
    try {
      var imgData = await layAnhChupManHinh();
      window.VM_AI_SCREENSHOT = imgData;
      
      // Hiển thị preview
      scImg.src = imgData;
      scArea.style.display = 'flex';
    } catch(err) {
      if (err.name === 'NotAllowedError') {
        console.log("Người dùng từ chối/hủy chia sẻ màn hình.");
      } else {
        console.error("Lỗi chụp màn hình:", err);
        alert("Lỗi khi chụp màn hình: " + err.message);
      }
    } finally {
      btnCapture.disabled = false;
      btnCapture.innerHTML = originalHTML;
    }
  });
  
  scRemove.addEventListener('click', function(e) {
    e.stopPropagation();
    window.VM_AI_SCREENSHOT = null;
    scArea.style.display = 'none';
    scImg.src = '';
  });
}

function cuonXuongChat() {
  var body = document.getElementById('aiChatBody');
  if (body) {
    body.scrollTop = body.scrollHeight;
  }
}

async function guiTinNhanAI() {
  var inp = document.getElementById('aiChatInput');
  var body = document.getElementById('aiChatBody');
  var text = inp.value.trim();
  if (!text && !window.VM_AI_SCREENSHOT) return;
  
  var userMsg = document.createElement('div');
  userMsg.className = 'acb-msg user';
  
  var userParts = [];
  
  // 1. Đính kèm ảnh chụp màn hình nếu có
  if (window.VM_AI_SCREENSHOT) {
    var img = document.createElement('img');
    img.src = window.VM_AI_SCREENSHOT;
    img.style.maxWidth = '100%';
    img.style.borderRadius = '6px';
    img.style.marginBottom = '6px';
    img.style.display = 'block';
    userMsg.appendChild(img);
    
    var base64Data = window.VM_AI_SCREENSHOT.split(',')[1];
    userParts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data
      }
    });
  }
  
  // 2. Đính kèm text câu hỏi
  if (text) {
    var textSpan = document.createElement('span');
    textSpan.textContent = text;
    userMsg.appendChild(textSpan);
    userParts.push({ text: text });
  } else {
    userParts.push({ text: "Hãy phân tích hình ảnh màn hình này và giải đáp các câu hỏi trong đó." });
  }
  
  body.appendChild(userMsg);
  inp.value = '';
  
  // Dọn dẹp preview ảnh chụp màn hình sau khi gửi
  window.VM_AI_SCREENSHOT = null;
  var scArea = document.getElementById('aiScreenshotArea');
  if (scArea) scArea.style.display = 'none';
  var scImg = document.getElementById('aiScreenshotImg');
  if (scImg) scImg.src = '';
  
  cuonXuongChat();
  
  var typing = document.createElement('div');
  typing.className = 'acb-typing';
  typing.id = 'aiChatTyping';
  typing.innerHTML = '<span></span><span></span><span></span>';
  body.appendChild(typing);
  cuonXuongChat();
  
  aiChatHistory.push({ role: 'user', parts: userParts });
  
  var lessonTitle = 'Bài giảng';
  var pageH1 = document.querySelector('.lh-header h1, h1');
  if (pageH1) lessonTitle = pageH1.textContent.trim();
  
  var systemPrompt = '';
  var pathname = window.location.pathname;
  if (pathname.indexOf('bai-hoc') !== -1) {
    systemPrompt = "Bạn là trợ lý AI hướng dẫn học tập tại Lớp Toán Thầy Vinh (VinhMath). Bạn đang hỗ trợ học sinh học trực tuyến chuyên đề: '" + lessonTitle + "'. Hãy trả lời ngắn gọn, có tính sư phạm cao, định hướng cách giải thay vì giải hộ hoàn toàn. Các công thức toán hãy viết theo định dạng LaTeX kẹp trong dấu $...$ (nếu cùng dòng) hoặc $$...$$ (nếu xuống dòng) để hiển thị chuyên nghiệp.";
  } else {
    systemPrompt = "Bạn là trợ lý AI hướng dẫn học tập tại Lớp Toán Thầy Vinh (VinhMath). Bạn đang ở trang chủ/trang giới thiệu để hỗ trợ học sinh sử dụng website vinhmath.com hiệu quả. Các mục chính của web gồm: Lớp học (học video bài giảng, lý thuyết), Luyện đề (làm đề tự chấm), Tài liệu (tải tài liệu học tập), Bảng vàng (xem thành tích của bạn học sinh). Hãy trả lời ngắn gọn, thân thiện, và định hướng học sinh.";
  }
  
  try {
    var tEl = document.getElementById('aiChatTyping');
    var isAdminUser = (window.VM_USER_ROLE === 'admin') || !!document.getElementById('ccAdminControls');

    var reply = '';
    var isHtml = false;
    var ok = false;

    // Gọi Gemini QUA Edge Function (key nằm phía máy chủ, không lộ ra trình duyệt)
    var resp = await sb.functions.invoke('gemini-chat', {
      body: { contents: aiChatHistory, systemPrompt: systemPrompt }
    });

    if (resp.error) {
      console.error("Edge function error:", resp.error);
      if (isAdminUser) {
        reply = '<strong>Lỗi gọi trợ lý AI (chỉ admin thấy):</strong> ' + (resp.error.message || String(resp.error)) + '<br><br>Sếp kiểm tra lại secret <code>GEMINI_API_KEY</code> và trạng thái bật AI nhé.';
        isHtml = true;
      } else {
        reply = 'Xin lỗi em, hiện chưa kết nối được trợ lý AI. Em thử lại sau nhé.';
      }
    } else if (resp.data && resp.data.reply) {
      reply = resp.data.reply;
      ok = true;
    } else if (resp.data && resp.data.error) {
      if (isAdminUser) { reply = '<strong>Trợ lý AI:</strong> ' + resp.data.error; isHtml = true; }
      else { reply = 'Trợ lý AI hiện chưa sẵn sàng. Em thử lại sau nhé.'; }
    } else {
      reply = 'Xin lỗi em, hiện chưa trả lời được. Em thử lại sau nhé.';
    }
    
    if (tEl) tEl.remove();
    
    var aiMsg = document.createElement('div');
    aiMsg.className = 'acb-msg ai';
    
    var html = '';
    if (isHtml) {
      html = reply;
    } else {
      html = String(reply)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }
    
    aiMsg.innerHTML = html;
    body.appendChild(aiMsg);
    cuonXuongChat();
    
    if (ok) {
      // Lưu lại hội thoại (chỉ lưu phần text để tránh phình to lịch sử chat turn sau)
      aiChatHistory.push({ role: 'model', parts: [{ text: reply }] });
    }
    
    // Đảm bảo MathJax biên dịch nóng câu trả lời của AI thành công thức toán học chuyên nghiệp
    damBaoMathJax(function() {
      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([aiMsg]).catch(function(e) { console.error("MathJax error:", e); });
      }
    });
  } catch(err) {
    console.error("Lỗi gọi Gemini:", err);
    var tEl = document.getElementById('aiChatTyping');
    if (tEl) tEl.remove();
    
    var errMsg = document.createElement('div');
    errMsg.className = 'acb-msg ai';
    errMsg.textContent = 'Lỗi kết nối với Trợ lý AI. Em hãy kiểm tra lại kết nối mạng nhé!';
    body.appendChild(errMsg);
    cuonXuongChat();
  }
}

function themAdminControlsVaoCC() {
  var ccPanel = document.getElementById('ccPanel');
  if (!ccPanel) return;
  
  var adminDiv = document.createElement('div');
  adminDiv.id = 'ccAdminControls';
  adminDiv.style.borderTop = '1px solid var(--line-2)';
  adminDiv.style.marginTop = '10px';
  adminDiv.style.paddingTop = '10px';
  adminDiv.style.display = 'flex';
  adminDiv.style.flexDirection = 'column';
  adminDiv.style.gap = '10px';
  
  var enabled = window.VM_AI_SETTINGS.enabled;
  var key = window.VM_AI_SETTINGS.key;
  
  adminDiv.innerHTML = 
    '<div class="cc-color-label">Cài đặt Quản trị AI</div>' +
    
    '<div class="cc-toggle-row">' +
      '<div class="cc-toggle-label">' +
        '<b>Trợ Lý AI Học Tập</b>' +
        '<span>Cho phép học sinh hỏi đáp</span>' +
      '</div>' +
      '<label class="cc-switch">' +
        '<input type="checkbox" id="ccSwitchAI" ' + (enabled ? 'checked' : '') + '>' +
        '<span class="cc-slider-switch"></span>' +
      '</label>' +
    '</div>' +
    
    '<div class="cc-input-row">' +
      '<div class="cc-input-label">Gemini API Key</div>' +
      '<div style="font-size:.8rem;color:var(--ink-3);line-height:1.5">🔒 Key được lưu an toàn phía máy chủ (Supabase Edge Function secret <code>GEMINI_API_KEY</code>). Không nhập key tại đây nữa để tránh lộ ra trình duyệt.</div>' +
    '</div>';
    
  ccPanel.appendChild(adminDiv);
  
  var sw = document.getElementById('ccSwitchAI');
  sw.addEventListener('change', async function() {
    var isChecked = sw.checked;
    sw.disabled = true;
    try {
      var r = await sb.from('app_settings').upsert({ key: 'ai_enabled', value: isChecked ? 'true' : 'false' });
      if (r.error) throw r.error;
    } catch (err) {
      alert("Lỗi cập nhật AI: " + err.message);
      sw.checked = !isChecked;
    } finally {
      sw.disabled = false;
    }
  });
}

// Khởi chạy các dịch vụ khi DOM sẵn sàng
// ---------- 8. QUẢN LÝ GIAO DIỆN HỆ THỐNG TOÀN CỤC ----------
async function luuCaiDatHeThong(key, value) {
  if (!daKetNoi()) return;
  try {
    var r = await sb.from('app_settings').upsert({ key: key, value: String(value) });
    if (r.error) throw r.error;
  } catch (err) {
    console.error("Lỗi lưu cài đặt hệ thống:", err);
  }
}

async function taiCaiDatHeThongGlobal() {
  if (!daKetNoi()) return;
  try {
    var r = await sb.from('app_settings').select('key, value');
    if (r.data) {
      var dbTheme = r.data.find(function(x) { return x.key === 'theme_theme'; });
      var dbTrans = r.data.find(function(x) { return x.key === 'theme_transparency'; });
      var dbBlur = r.data.find(function(x) { return x.key === 'theme_blur'; });
      var dbCanvas = r.data.find(function(x) { return x.key === 'theme_canvas_opacity'; });
      var dbAccent = r.data.find(function(x) { return x.key === 'theme_accent'; });
      
      var root = document.documentElement;
      
      var theme = dbTheme ? dbTheme.value : 'dark';
      var transparency = dbTrans ? dbTrans.value : (theme === 'dark' ? '0.3' : '0.2');
      var blur = dbBlur ? dbBlur.value : '20';
      var canvasOpacity = dbCanvas ? dbCanvas.value : '0.25';
      var accent = dbAccent ? dbAccent.value : 'amber';
      
      var isAdmin = (window.VM_USER_ROLE === 'admin');
      
      // Nếu là admin, đồng bộ giá trị từ DB. 
      // Nếu không phải admin, ưu tiên giá trị từ localStorage (nếu có).
      var finalTheme = localStorage.getItem('vm-theme') !== null ? localStorage.getItem('vm-theme') : theme;
      var finalTrans = localStorage.getItem('vm-transparency') !== null ? localStorage.getItem('vm-transparency') : transparency;
      var finalBlur = localStorage.getItem('vm-blur') !== null ? localStorage.getItem('vm-blur') : blur;
      var finalCanvasOpacity = localStorage.getItem('vm-canvas-opacity') !== null ? localStorage.getItem('vm-canvas-opacity') : canvasOpacity;
      var finalAccent = accent; // Màu accent luôn đồng bộ từ DB cho tất cả tài khoản
      
      // Áp dụng styles hệ thống
      root.setAttribute('data-theme', finalTheme);
      root.style.setProperty('--glass-opacity', finalTrans);
      root.style.setProperty('--glass-blur-radius', finalBlur + 'px');
      root.style.setProperty('--canvas-opacity', finalCanvasOpacity);
      apdungMauAccent(root, finalAccent, finalTheme === 'dark');
      
      // Đồng bộ vào localStorage để load nhanh cho lần sau
      localStorage.setItem('vm-theme', finalTheme);
      localStorage.setItem('vm-transparency', finalTrans);
      localStorage.setItem('vm-blur', finalBlur);
      localStorage.setItem('vm-canvas-opacity', finalCanvasOpacity);
      localStorage.setItem('vm-accent', finalAccent);
      
      // Đồng bộ các controls UI ở CC
      capNhatCCUI(finalTheme, finalTrans, finalBlur, finalCanvasOpacity, finalAccent);
    }
  } catch (e) {
    console.error("Lỗi taiCaiDatHeThongGlobal:", e);
  }
}

function capNhatCCUI(theme, transparency, blur, canvasOpacity, accent) {
  var ccLight = document.getElementById('ccBtnLight');
  var ccDark = document.getElementById('ccBtnDark');
  if (ccLight && ccDark) {
    if (theme === 'dark') {
      ccDark.classList.add('active');
      ccLight.classList.remove('active');
    } else {
      ccLight.classList.add('active');
      ccDark.classList.remove('active');
    }
  }
  
  var sldOpacity = document.getElementById('sldOpacity');
  var lblOpacity = document.getElementById('lblOpacity');
  if (sldOpacity) {
    sldOpacity.value = transparency;
    if (lblOpacity) lblOpacity.textContent = Math.round(transparency * 100) + '%';
  }
  
  var sldCanvasOpacity = document.getElementById('sldCanvasOpacity');
  var lblCanvasOpacity = document.getElementById('lblCanvasOpacity');
  if (sldCanvasOpacity) {
    sldCanvasOpacity.value = canvasOpacity;
    if (lblCanvasOpacity) lblCanvasOpacity.textContent = Math.round(canvasOpacity * 100) + '%';
  }
  
  var sldBlur = document.getElementById('sldBlur');
  var lblBlur = document.getElementById('lblBlur');
  if (sldBlur) {
    sldBlur.value = blur;
    if (lblBlur) lblBlur.textContent = blur + 'px';
  }
  
  var ccPanel = document.getElementById('ccPanel');
  if (ccPanel) {
    var dots = ccPanel.querySelectorAll('.cc-color-dot');
    dots.forEach(function(dot) {
      if (dot.getAttribute('data-color') === accent) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }
  
  capNhatNutTheme();
}

function dangKyRealtimeCaiDatHeThong() {
  if (!daKetNoi()) return;
  try {
    sb.channel('realtime-system-theme-settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, function(payload) {
        var row = payload.new;
        var root = document.documentElement;
        var theme = root.getAttribute('data-theme') || 'dark';
        var isAdmin = (window.VM_USER_ROLE === 'admin');
        
        if (row.key === 'theme_theme') {
          if (isAdmin || localStorage.getItem('vm-theme') === null) {
            theme = row.value;
            root.setAttribute('data-theme', theme);
            localStorage.setItem('vm-theme', theme);
            
            var activeColor = localStorage.getItem('vm-accent') || 'amber';
            apdungMauAccent(root, activeColor, theme === 'dark');
            
            var ccLight = document.getElementById('ccBtnLight');
            var ccDark = document.getElementById('ccBtnDark');
            if (ccLight && ccDark) {
              if (theme === 'dark') {
                ccDark.classList.add('active');
                ccLight.classList.remove('active');
              } else {
                ccLight.classList.add('active');
                ccDark.classList.remove('active');
              }
            }
            capNhatNutTheme();
            try { window.dispatchEvent(new Event('theme-change')); } catch (e) {}
          }
        } else if (row.key === 'theme_transparency') {
          if (isAdmin || localStorage.getItem('vm-transparency') === null) {
            var val = row.value;
            root.style.setProperty('--glass-opacity', val);
            localStorage.setItem('vm-transparency', val);
            
            var sldOpacity = document.getElementById('sldOpacity');
            var lblOpacity = document.getElementById('lblOpacity');
            if (sldOpacity) {
              sldOpacity.value = val;
              if (lblOpacity) lblOpacity.textContent = Math.round(val * 100) + '%';
            }
          }
        } else if (row.key === 'theme_canvas_opacity') {
          if (isAdmin || localStorage.getItem('vm-canvas-opacity') === null) {
            var val = row.value;
            root.style.setProperty('--canvas-opacity', val);
            localStorage.setItem('vm-canvas-opacity', val);
            
            var sldCanvasOpacity = document.getElementById('sldCanvasOpacity');
            var lblCanvasOpacity = document.getElementById('lblCanvasOpacity');
            if (sldCanvasOpacity) {
              sldCanvasOpacity.value = val;
              if (lblCanvasOpacity) lblCanvasOpacity.textContent = Math.round(val * 100) + '%';
            }
          }
        } else if (row.key === 'theme_blur') {
          if (isAdmin || localStorage.getItem('vm-blur') === null) {
            var val = row.value;
            root.style.setProperty('--glass-blur-radius', val + 'px');
            localStorage.setItem('vm-blur', val);
            
            var sldBlur = document.getElementById('sldBlur');
            var lblBlur = document.getElementById('lblBlur');
            if (sldBlur) {
              sldBlur.value = val;
              if (lblBlur) lblBlur.textContent = val + 'px';
            }
          }
        } else if (row.key === 'theme_accent') {
          var val = row.value;
          localStorage.setItem('vm-accent', val);
          apdungMauAccent(root, val, theme === 'dark');
          
          var ccPanel = document.getElementById('ccPanel');
          if (ccPanel) {
            var dots = ccPanel.querySelectorAll('.cc-color-dot');
            dots.forEach(function(dot) {
              if (dot.getAttribute('data-color') === val) {
                dot.classList.add('active');
              } else {
                dot.classList.remove('active');
              }
            });
          }
          try { window.dispatchEvent(new Event('theme-change')); } catch (e) {}
        }
      })
      .subscribe();
  } catch(e) { console.error("Lỗi dangKyRealtimeCaiDatHeThong:", e); }
}

function apDungQuyenThemeControlCenter(role) {
  var ccThemeColorControls = document.getElementById('ccThemeColorControls');
  var ccLockedMsg = document.getElementById('ccLockedMsg');
  if (role === 'admin') {
    if (ccThemeColorControls) ccThemeColorControls.style.display = 'flex';
    if (ccLockedMsg) ccLockedMsg.style.display = 'none';
  } else {
    if (ccThemeColorControls) ccThemeColorControls.style.display = 'none';
    if (ccLockedMsg) ccLockedMsg.style.display = 'block';
  }
}

async function khoiDongTrang() {
  // 1. Xác định vai trò người dùng trước tiên để phục vụ phân quyền và đồng bộ theme
  window.VM_USER_ROLE = 'guest';
  if (daKetNoi()) {
    try {
      var s = await sb.auth.getSession();
      if (s.data.session) {
        var rp = await sb.from('profiles').select('role').eq('id', s.data.session.user.id).single();
        if (rp.data) {
          window.VM_USER_ROLE = rp.data.role;
        }
      }
    } catch (e) {
      console.error("Lỗi check role ban đầu:", e);
    }
  }

  // 2. Khởi tạo Control Center cơ bản
  khoiTaoControlCenter();
  capNhatNutTheme();
  themNutChupManHinh();
  
  // 3. Tải cài đặt AI
  await tailaiCaiDatAI();
  dangKyRealtimeAI();
  
  // 4. Tải cài đặt giao diện hệ thống toàn cục và đăng ký realtime
  await taiCaiDatHeThongGlobal();
  dangKyRealtimeCaiDatHeThong();
  
  // 5. Áp dụng phân quyền UI
  apDungQuyenThemeControlCenter(window.VM_USER_ROLE);
  if (window.VM_USER_ROLE === 'admin') {
    themAdminControlsVaoCC();
  }
}

// Khởi chạy
if (document.readyState !== 'loading') {
  khoiDongTrang();
} else {
  document.addEventListener('DOMContentLoaded', function () {
    khoiDongTrang();
  });
}

/* ---------- HỆ THỐNG CHỤP ẢNH MÀN HÌNH TỰ ĐỘNG ---------- */
function loadHtml2Canvas(callback) {
  if (window.html2canvas) {
    callback();
    return;
  }
  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  script.onload = function() {
    callback();
  };
  document.head.appendChild(script);
}

async function chupManHinhToanBo() {
  // CÁCH 1 (ưu tiên): API chụp gốc của trình duyệt -> ảnh ĐÚNG 100% như đang thấy, không lệch chữ/icon
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.isSecureContext) {
    try {
      var stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' }, audio: false,
        preferCurrentTab: true, selfBrowserSurface: 'include'
      });
      var video = document.createElement('video');
      video.srcObject = stream; video.muted = true;
      await video.play();
      await new Promise(function (r) { setTimeout(r, 300); });
      var cap = document.createElement('canvas');
      cap.width = video.videoWidth; cap.height = video.videoHeight;
      cap.getContext('2d').drawImage(video, 0, 0);
      stream.getTracks().forEach(function (t) { t.stop(); });
      var a = document.createElement('a');
      a.download = 'vinhmath-' + (location.pathname.split('/').pop().split('.')[0] || 'trang') + '.png';
      a.href = cap.toDataURL('image/png'); a.click();
      return;
    } catch (e) { /* người dùng từ chối hoặc không hỗ trợ -> dùng cách dự phòng */ }
  }
  chupBangHtml2Canvas();
}

function chupBangHtml2Canvas() {
  var btn = document.getElementById('screenshotBtn');
  if (btn) btn.style.visibility = 'hidden';

  var loading = document.createElement('div');
  loading.style.position = 'fixed';
  loading.style.top = '20px';
  loading.style.left = '50%';
  loading.style.transform = 'translateX(-50%)';
  loading.style.background = 'var(--accent)';
  loading.style.color = '#fff';
  loading.style.padding = '8px 16px';
  loading.style.borderRadius = '20px';
  loading.style.fontSize = '0.85rem';
  loading.style.fontWeight = '700';
  loading.style.zIndex = '99999';
  loading.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  loading.textContent = '📸 Đang chuẩn bị phông chữ & chụp...';
  document.body.appendChild(loading);

  loadHtml2Canvas(function() {
    // Đảm bảo tất cả web fonts (Google Fonts, KaTeX fonts) đã tải xong
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(function() {
      // Đợi thêm 250ms để trình duyệt thực sự kết xuất phông chữ và tính toán lại layout
      setTimeout(function() {
        // Tạm thời ẩn các hiệu ứng động khi chụp để tránh nhòe hình
        var style = document.createElement('style');
        style.id = 'screenshot-temp-style';
        style.innerHTML = '* { animation: none !important; transition: none !important; }';
        document.head.appendChild(style);

        window.__prevSX = window.scrollX; window.__prevSY = window.scrollY;
        window.scrollTo(0, 0); // chụp từ đầu trang để tránh lệch toạ độ
        html2canvas(document.body, {
          useCORS: true,
          scale: Math.max(2, window.devicePixelRatio || 1),
          scrollX: 0,
          scrollY: 0,
          x: 0,
          y: 0,
          windowWidth: document.documentElement.scrollWidth,   // bố cục đúng toàn trang -> hết lệch chữ/icon
          windowHeight: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#0b0f19',
          logging: false,
          imageTimeout: 0,
          ignoreElements: function(element) {
            var id = element.id || '';
            return id === 'screenshotBtn' || element === loading ||
              id === 'vmStudyWidget' || id === 'aiChatBubble' || id === 'aiChatBox' || id === 'navBurger' ||
              (element.classList && element.classList.contains('vms-toast'));
          }
        }).then(function(canvas) {
          window.scrollTo(window.__prevSX || 0, window.__prevSY || 0);
          // Gỡ bỏ style tạm thời
          var tempSty = document.getElementById('screenshot-temp-style');
          if (tempSty) tempSty.parentNode.removeChild(tempSty);

        try {
          var link = document.createElement('a');
          var pageName = location.pathname.split('/').pop().split('.')[0] || 'trang-chu';
          link.download = 'vinhmath-' + pageName + '.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        } catch (e) {
          alert('Không thể lưu ảnh do lỗi bảo mật CORS. Hãy thử trên trình duyệt Safari hoặc Chrome!');
        } finally {
          if (btn) btn.style.visibility = 'visible';
          if (loading.parentNode) loading.parentNode.removeChild(loading);
        }
      }).catch(function(err) {
        window.scrollTo(window.__prevSX || 0, window.__prevSY || 0);
        var tempSty = document.getElementById('screenshot-temp-style');
        if (tempSty) tempSty.parentNode.removeChild(tempSty);

        alert('Lỗi chụp màn hình: ' + err);
        if (btn) btn.style.visibility = 'visible';
        if (loading.parentNode) loading.parentNode.removeChild(loading);
      });
      }, 250);
    });
  });
}

function themNutChupManHinh() {
  return; // Hủy theo yêu cầu: Bỏ các icon bổ sung trên thanh công cụ
  var themeBtn = document.getElementById('themeBtn');
  if (!themeBtn || document.getElementById('screenshotBtn')) return;

  var parent = themeBtn.parentNode;
  var btn = document.createElement('button');
  btn.id = 'screenshotBtn';
  btn.className = 'btn btn-ghost btn-sm';
  btn.title = 'Chụp ảnh màn hình';
  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" style="display:block"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>';

  btn.onclick = function() {
    chupManHinhToanBo();
  };

  parent.insertBefore(btn, themeBtn);
}


/* ============================================================
   BỘ NHẬN DIỆN CLB M.A.P — đổi logo/tên cả web + logo chìm
   Gọi vmApDungThuongHieuMAP(true/false) tuỳ lớp có theme 'map'.
   ============================================================ */
/* Áp thương hiệu theo theme của lớp: 'vinhmath' (mặc định) | 'map' | 'duyminh' */
function vmApDungThuongHieu(theme) {
  try {
    theme = theme || 'vinhmath';
    var isMap = theme === 'map';
    var isDM = theme === 'duyminh';
    document.body.classList.toggle('theme-map', isMap);
    document.body.classList.toggle('theme-duyminh', isDM);

    // Bỏ logo chìm nền (gây khó nhìn) — xoá nếu còn tồn tại từ phiên trước
    var wm = document.getElementById('mapWatermarkGlobal');
    if (wm) wm.remove();

    // Đổi logo + tên thương hiệu trên thanh điều hướng
    var logoEl = document.querySelector('.topbar .logo') || document.querySelector('.logo');
    if (logoEl) {
      var img = logoEl.querySelector('img');
      if (img) img.src = isMap ? 'logo/CLB-MAP-logo.png' : (isDM ? 'logo/duyminh-logo.png' : 'img/logo.png');

      var brandTextEl = logoEl.querySelector('.brand-container-el');
      if (!brandTextEl) {
        var oldSpan = logoEl.querySelector('span[style*="display: inline-flex"]') || logoEl.querySelector('span[style*="display:inline-flex"]');
        if (oldSpan) {
          oldSpan.classList.add('brand-container-el');
          brandTextEl = oldSpan;
        } else {
          brandTextEl = document.createElement('span');
          brandTextEl.className = 'brand-container-el';
          brandTextEl.style.cssText = 'display: inline-flex; align-items: center; gap: 0;';
          if (img) {
            img.after(brandTextEl);
          } else {
            logoEl.prepend(brandTextEl);
          }
        }
      }

      if (isMap) {
        brandTextEl.innerHTML = '<span class="brand-vinh" style="color: var(--accent) !important;">M.A.P</span>';
      } else if (isDM) {
        brandTextEl.innerHTML = '<span class="dm-mark"><span class="dm-duy">DUY</span><span class="dm-minh">MINH</span></span>';
      } else {
        brandTextEl.innerHTML = '<span class="brand-vinh" style="color: var(--accent) !important;">Vinh</span><span class="brand-math" style="color: var(--topbar-text, #ffffff) !important;">Math</span>';
      }
    }
  } catch (e) { /* im lặng */ }
}
/* Tương thích ngược: các trang cũ gọi vmApDungThuongHieuMAP(true/false) */
function vmApDungThuongHieuMAP(isMap) { vmApDungThuongHieu(isMap ? 'map' : 'vinhmath'); }
/* Wordmark Duy Minh dùng chung cho chip/badge (DUY đỏ · MINH trắng trên nền đỏ) */
function vmChipDuyMinh(size) {
  size = size || 16;
  return '<span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-soft);border:1px solid var(--accent);color:var(--accent);padding:3px 9px;border-radius:99px;font-size:.72rem;font-weight:800;line-height:1">' +
    '<img src="logo/duyminh-logo.png" style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:#fff;object-fit:contain;flex-shrink:0">' +
    '<span class="dm-mark" style="font-size:.72rem"><span class="dm-duy">DUY</span><span class="dm-minh">MINH</span></span></span>';
}

/* ===== Tiến độ mục con của bài giảng (dùng chung bai-hoc + lop-hoc) ===== */
function vmMucConBai(bh) {
  var items = [];
  var coVideo = !!(bh.youtube_url && String(bh.youtube_url).trim());
  var coLyThuyet = Array.isArray(bh.theory_sections) && bh.theory_sections.length > 0;
  var coTaiLieu = !!(bh.latex_content) || !!(bh.document_id) || !!(bh.documents && bh.documents.file_path);
  var coBang = Array.isArray(bh.images) && bh.images.length > 0;
  var coBTVN = !!(bh.homework_text) || (Array.isArray(bh.homework_images) && bh.homework_images.length > 0) || !!bh.homework_latex_content || !!bh.homework_document_id || !!(bh.bai_btvn && bh.bai_btvn.file_path);
  var coTest = !!(bh.test_document_id) || !!(bh.test_latex_content) || !!(bh.bai_test && bh.bai_test.file_path);
  if (coVideo) items.push({ key: 'video', tab: 'video', label: 'Video bài giảng', icon: '🎬', loai: 'view' });
  if (coLyThuyet) items.push({ key: 'lythuyet', tab: 'lythuyet', label: 'Lý thuyết', icon: '📖', loai: 'view' });
  if (coTaiLieu) items.push({ key: 'tailieu', tab: 'tailieu', label: 'Tài liệu', icon: '📄', loai: 'view' });
  if (coBang) items.push({ key: 'bang', tab: 'bang', label: 'Ảnh bảng', icon: '🖼', loai: 'view' });
  if (coBTVN) items.push({ key: 'btvn', tab: 'btvn', label: 'Bài tập về nhà', icon: '🏠', loai: 'action' });
  if (coTest) items.push({ key: 'test', tab: 'test', label: 'Bài kiểm tra', icon: '📝', loai: 'action' });
  return items;
}

function vmTinhTienDoBai(bh, viewedSet, doneActionSet) {
  var items = vmMucConBai(bh);
  var done = 0;
  items.forEach(function (it) {
    if (it.loai === 'view') it.done = !!(viewedSet && viewedSet.has(it.key));
    else it.done = !!(doneActionSet && doneActionSet.has(it.key));
    if (it.done) done++;
  });
  var total = items.length;
  return { items: items, done: done, total: total, percent: total ? Math.round(100 * done / total) : 0 };
}

function vmVongTienDo(percent, size, stroke) {
  size = size || 34; stroke = stroke || 4;
  var r = (size - stroke) / 2;
  var c = 2 * Math.PI * r;
  var off = c * (1 - (percent || 0) / 100);
  var mau = (percent >= 100) ? 'var(--ok, #28a745)' : 'var(--accent)';
  var half = size / 2;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="flex:none">' +
    '<circle cx="' + half + '" cy="' + half + '" r="' + r + '" fill="none" stroke="var(--line-2, #e5e5e5)" stroke-width="' + stroke + '"></circle>' +
    '<circle cx="' + half + '" cy="' + half + '" r="' + r + '" fill="none" stroke="' + mau + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 ' + half + ' ' + half + ')"></circle>' +
    '<text x="' + half + '" y="' + (half + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="' + (size * 0.3).toFixed(1) + '" font-weight="700" fill="var(--ink)">' + (percent || 0) + '</text>' +
    '</svg>';
}

// Đánh dấu 1 mục "xem" (video/tài liệu/lý thuyết/bảng) là đã hoàn thành cho HS hiện tại
async function vmDanhDauDaXem(lessonId, item) {
  try {
    if (!sb || !lessonId || !item) return;
    var u = await sb.auth.getUser();
    var uid = (u && u.data && u.data.user) ? u.data.user.id : null;
    if (!uid) return;
    await sb.from('lesson_item_progress').upsert(
      { student_id: uid, lesson_id: lessonId, item: item },
      { onConflict: 'student_id,lesson_id,item' });
  } catch (e) {}
}

/* ===== Popup XEM NHANH nội dung 1 mục của bài giảng (dùng chung admin + HS) ===== */
window.vmBaiMap = window.vmBaiMap || {};
function vmDangKyBai(list) { (list || []).forEach(function (b) { if (b && b.id) window.vmBaiMap[b.id] = b; }); }

function vmStorageUrl(bucket, path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return (VM.SUPABASE_URL || '') + '/storage/v1/object/public/' + bucket + '/' + path;
}
function vmEscQ(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function vmYtIdQ(u) { if (!u) return ''; var m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : ''; }
function vmDriveIdQ(u) { if (!u) return ''; var m = String(u).match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]+)/); return m ? m[1] : ''; }

function vmNoiDungXemNhanh(b, item) {
  var body = '', dl = '';
  var iframe = function (src) { return '<div style="position:relative;padding-top:56.25%;background:#000;border-radius:10px;overflow:hidden"><iframe src="' + src + '" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="autoplay;encrypted-media;fullscreen" allowfullscreen></iframe></div>'; };
  var pdfFrame = function (u) { return '<iframe src="' + u + '#toolbar=1" style="width:100%;height:68vh;border:1px solid var(--line);border-radius:10px;background:#fff"></iframe>'; };
  var anhList = function (arr) { return '<div style="display:flex;flex-direction:column;gap:10px">' + arr.map(function (p) { var u = vmStorageUrl('hinh-anh', p); return '<a href="' + u + '" target="_blank"><img src="' + u + '" style="width:100%;border-radius:10px;border:1px solid var(--line)" loading="lazy"></a>'; }).join('') + '</div>'; };

  if (item === 'video') {
    var yt = vmYtIdQ(b.youtube_url), dr = vmDriveIdQ(b.youtube_url);
    body = yt ? iframe('https://www.youtube.com/embed/' + yt + '?rel=0&modestbranding=1') : (dr ? iframe('https://drive.google.com/file/d/' + dr + '/preview') : '<p style="color:var(--ink-3)">Chưa có video.</p>');
  } else if (item === 'tailieu') {
    var fp = (b.documents && b.documents.file_path) || '';
    if (fp) { var u = vmStorageUrl('tai-lieu', fp); body = pdfFrame(u); dl = u; }
    else if (b.latex_content) body = '<p style="color:var(--ink-2)">Tài liệu dạng LaTeX sẽ được biên dịch khi vào học. Bấm <b>Vào học</b> để xem bản PDF đầy đủ.</p>';
    else body = '<p style="color:var(--ink-3)">Chưa có tài liệu.</p>';
  } else if (item === 'bang') {
    var imgs = Array.isArray(b.images) ? b.images : [];
    body = imgs.length ? anhList(imgs) : '<p style="color:var(--ink-3)">Chưa có ảnh bảng.</p>';
  } else if (item === 'btvn') {
    var t = b.homework_text || '', hi = Array.isArray(b.homework_images) ? b.homework_images : [];
    var hwfp = (b.bai_btvn && b.bai_btvn.file_path) || '';
    body = '';
    if (b.homework_due) {
      var _hd = new Date(b.homework_due);
      body += '<div style="display:inline-block;background:var(--accent-soft);border:1px solid var(--accent);color:var(--accent);font-weight:700;border-radius:10px;padding:7px 12px;margin-bottom:10px;font-size:.9rem">⏰ Hạn nộp: ' + _hd.toLocaleString('vi-VN') + '</div>';
    }
    if (t) body += '<div style="font-weight:800;color:var(--accent);font-size:.9rem;margin-bottom:4px">📝 Ghi chú / dặn dò cho học sinh</div>' +
      '<div style="white-space:pre-wrap;line-height:1.6;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px">' + vmEscQ(t) + '</div>';
    if (b.homework_latex_content) body += '<p style="color:var(--ink-2);margin-bottom:10px">📝 Đề LaTeX — bấm <b>Vào học</b> để xem bản biên dịch đầy đủ.</p>';
    if (hwfp) { var hu = vmStorageUrl('tai-lieu', hwfp); body += pdfFrame(hu); dl = hu; }
    if (hi.length) body += anhList(hi);
    if (!t && !hi.length && !hwfp && !b.homework_latex_content) body += '<p style="color:var(--ink-3)">Chưa có đề bài tập về nhà.</p>';
  } else if (item === 'test') {
    var tfp = (b.bai_test && b.bai_test.file_path) || '';
    if (tfp) { var tu = vmStorageUrl('tai-lieu', tfp); body = pdfFrame(tu); dl = tu; }
    else body = '<p style="color:var(--ink-2)">Đây là bài kiểm tra. Bấm <b>Vào học</b> để làm bài / xem chi tiết.</p>';
  } else if (item === 'lythuyet') {
    body = '<p style="color:var(--ink-2)">Lý thuyết tương tác — bấm <b>Vào học</b> để đọc và trả lời câu hỏi chặn.</p>';
  }
  return { body: body, download: dl };
}

function vmHienModalXN(titleHtml, bodyHtml, footerHtml) {
  var m = document.getElementById('vmQuickModal');
  if (!m) {
    m = document.createElement('div'); m.id = 'vmQuickModal';
    m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:12000;align-items:center;justify-content:center;padding:16px';
    m.innerHTML = '<div style="background:var(--bg);border:1px solid var(--line);border-radius:14px;max-width:860px;width:100%;max-height:92vh;overflow-y:auto;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.4)">' +
      '<button onclick="document.getElementById(\'vmQuickModal\').style.display=\'none\'" style="position:absolute;top:12px;right:14px;font-size:1.5rem;background:none;border:none;color:var(--ink-3);cursor:pointer;z-index:2">×</button>' +
      '<h3 id="vmQmTitle" style="margin:0;padding:15px 46px 12px 18px;border-bottom:1px solid var(--line);font-size:1.02rem;color:var(--ink)"></h3>' +
      '<div id="vmQmBody" style="padding:16px 18px"></div>' +
      '<div id="vmQmFooter" style="padding:12px 18px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) m.style.display = 'none'; });
  }
  document.getElementById('vmQmTitle').innerHTML = titleHtml;
  document.getElementById('vmQmBody').innerHTML = bodyHtml;
  document.getElementById('vmQmFooter').innerHTML = footerHtml;
  m.style.display = 'flex';
}

function checkGuestAction(e) {
  if (sessionStorage.getItem('vm-guest-mode') === 'true') {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    alert('🔒 Bạn đang ở chế độ Trải Nghiệm (Khách). Vui lòng đăng nhập tài khoản học sinh chính thức để vào học, xem bài giảng chi tiết và làm bài tập!');
    return false;
  }
  return true;
}

function vmMoXemNhanh(id, item) {
  if (sessionStorage.getItem('vm-guest-mode') === 'true') {
    checkGuestAction();
    return;
  }
  var b = window.vmBaiMap[id];
  if (!b) return;
  // Học sinh xem nhanh mục "xem" (video/lý thuyết/tài liệu/bảng) => tính đã hoàn thành
  if (typeof window.vmXemNhanhEdit !== 'function' && ['video', 'lythuyet', 'tailieu', 'bang'].indexOf(item) !== -1) {
    if (typeof vmDanhDauDaXem === 'function') vmDanhDauDaXem(id, item);
  }
  var nhan = { video: '🎬 Video', lythuyet: '📖 Lý thuyết', tailieu: '📄 Tài liệu', bang: '🖼 Ảnh bảng', btvn: '🏠 Bài tập về nhà', test: '📝 Bài kiểm tra' };
  var nd = vmNoiDungXemNhanh(b, item);
  var footer = '';
  if (nd.download) footer += '<a class="btn btn-secondary btn-sm" target="_blank" download href="' + nd.download + '">⬇ Tải về</a>';
  if (typeof window.vmXemNhanhEdit === 'function') footer += '<button class="btn btn-primary btn-sm" onclick="window.vmXemNhanhEdit(\'' + id + '\')">✏️ Chỉnh sửa bài</button>';
  var target = window.vmXemNhanhTarget || '';
  footer += '<a class="btn btn-sm" style="background:var(--accent);color:#fff;border-color:var(--accent)" href="bai-hoc?id=' + id + '&tab=' + item + '"' + target + '>▶ Vào học</a>';
  vmHienModalXN((nhan[item] || 'Nội dung') + ' · ' + vmEscQ(b.title), nd.body, footer);
}

function layEmojiGiaoVien(fullName) {
  var name = (fullName || '').toLowerCase().trim();
  var isFemale = name.includes('cô') || name.includes('co ') || name.startsWith('co') || name.includes('nữ');
  var emoji = isFemale ? '👩‍🏫' : '👨‍🏫';
  var bg = isFemale ? 'rgba(219, 39, 119, 0.12)' : 'rgba(37, 99, 235, 0.12)';
  var color = isFemale ? '#db2777' : '#2563eb';
  return '<span class="gv-avatar-badge" style="display:inline-flex;align-items:center;justify-content:center;width:1.45em;height:1.45em;border-radius:50%;background:' + bg + ';color:' + color + ';font-size:0.95em;vertical-align:-0.2em;margin-right:0.2em;border:1px solid ' + color + '33" title="' + (isFemale ? 'Cô' : 'Thầy') + '">' + emoji + '</span>';
}

/* =========================================================================
   SCROLL REVEAL — hiệu ứng hiện dần khi cuộn (phong cách Antigravity)
   Gắn class .reveal (tuỳ chọn .reveal-delay-1/2/3, .reveal-scale) cho phần tử.
   Tự bỏ qua nếu người dùng bật "giảm chuyển động".
   ========================================================================= */
(function () {
  function initReveal(root) {
    root = root || document;
    var els = root.querySelectorAll('.reveal:not(.is-visible)');
    if (!els.length) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }
  // Cho phép gọi lại sau khi render nội dung động
  window.vmInitReveal = initReveal;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initReveal(); });
  } else {
    initReveal();
  }
})();
