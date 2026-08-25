// ============================================================
// VINHMATH — MENU CHUẨN DÙNG CHUNG (một nguồn duy nhất)
// Mọi trang chỉ cần nạp file này sau vinhmath.js — menu sẽ tự
// vẽ lại theo VAI TRÒ người đăng nhập, trang nào cũng giống nhau.
// Muốn thêm/bớt mục menu: sửa ĐÚNG MỘT chỗ là file này.
// ============================================================

function apDungMenu(role, portalContext) {
  var nav = document.querySelector('.navlinks');
  if (!nav) return;
  var trang = (location.pathname.split('/').pop() || 'index').split('?')[0];

  var muc;
  if (portalContext && portalContext.portal_only) {
    muc = [
      { type: 'link', path: 'thi?portal=' + encodeURIComponent(portalContext.portal.slug), label: 'Kỳ thi' },
      { type: 'link', path: 'thi?portal=' + encodeURIComponent(portalContext.portal.slug) + '#results', label: 'Kết quả' }
    ];
    if (portalContext.member_role === 'owner' || portalContext.member_role === 'manager') {
      muc.push({ type: 'link', path: 'thi?portal=' + encodeURIComponent(portalContext.portal.slug) + '#manage', label: 'Quản lý' });
      muc.push({ type: 'link', path: 'quan-tri-de?portal=' + encodeURIComponent(portalContext.portal.slug), label: 'Soạn đề' });
    }
  } else if (role === 'admin') {
    // Admin dùng khu điều hành riêng; thanh đầu chỉ giữ các nhiệm vụ hằng ngày.
    muc = [
      { type: 'link', path: 'trang-chu', label: 'Hôm nay' },
      { type: 'link', path: 'quan-tri-lop', label: 'Lớp học' },
      { type: 'link', path: 'quan-tri-cham-bai', label: 'Chấm bài' },
      { type: 'link', path: 'quan-tri-lich', label: 'Lịch' },
      { type: 'link', path: 'quan-tri-tai-lieu', label: 'Nội dung' },
      { type: 'link', path: 'vmtool', label: 'VMTool' },
      { type: 'link', path: 'quan-tri', label: 'Quản trị' }
    ];
  } else if (role === 'teacher') {
    muc = [
      { type: 'link', path: 'trang-chu', label: 'Hôm nay' },
      { type: 'link', path: 'quan-tri-lop', label: 'Lớp của tôi' },
      { type: 'link', path: 'quan-tri-cham-bai', label: 'Chấm bài' },
      { type: 'link', path: 'quan-tri-tai-lieu', label: 'Nội dung' },
      { type: 'link', path: 'vmtool', label: 'VMTool' },
      { type: 'link', path: 'quan-tri-lich', label: 'Lịch' },
      { type: 'link', path: 'ca-nhan', label: 'Cá nhân' }
    ];
  } else if (role === 'assistant') {
    muc = [
      { type: 'link', path: 'trang-chu', label: 'Hôm nay' },
      { type: 'link', path: 'quan-tri-lop', label: 'Lớp được giao' },
      { type: 'link', path: 'quan-tri-cham-bai', label: 'Chấm bài' },
      { type: 'link', path: 'quan-tri-hoc-sinh', label: 'Học sinh' },
      { type: 'link', path: 'vmtool', label: 'VMTool' },
      { type: 'link', path: 'ca-nhan', label: 'Cá nhân' }
    ];
  } else if (role === 'parent') {
    // ----- MENU CỦA PHỤ HUYNH -----
    muc = [
      { type: 'link', path: 'phu-huynh', label: 'Theo dõi con' },
      { type: 'link', path: 'goc-tu-hoc', label: 'Góc tự học' },
      { type: 'link', path: 'vmtool', label: 'VMTool' },
      { type: 'link', path: 'bang-vang', label: 'Bảng vàng' }
    ];
  } else {
    // ----- MENU CỦA HỌC SINH -----
    // Các điểm đến học sinh dùng thường xuyên được đặt trực tiếp trên thanh chính.
    muc = [
      { type: 'link', path: 'trang-chu', label: 'Hôm nay' },
      { type: 'link', path: 'lop-hoc', label: 'Bài học' },
      { type: 'link', path: 'luyen-de', label: 'Bài tập' },
      { type: 'link', path: 'ket-qua', label: 'Kết quả' },
      { type: 'link', path: 'bang-vang', label: 'BXH' },
      { type: 'link', path: 'vmtool', label: 'VMTool' },
      { type: 'link', path: 'ca-nhan', label: 'Cá nhân' }
    ];
  }

  nav.innerHTML = muc.map(function (m) {
    if (m.type === 'link') {
      var activeClass = '';
      var menuPage = m.path.split('?')[0].split('#')[0];
      if (menuPage === trang) {
        activeClass = ' class="active"';
      } else if (m.path === 'quan-tri' && trang === 'quan-tri-le-hoi') {
        activeClass = ' class="active"';
      } else if (m.path === 'lop-hoc' && trang === 'bai-hoc') {
        activeClass = ' class="active"';
      } else if (m.path === 'quan-tri-lop' && trang === 'quan-tri-bai-hoc') {
        activeClass = ' class="active"';
      } else if (m.path === 'quan-tri-tai-lieu' && trang === 'tai-lieu') {
        activeClass = ' class="active"';
      }
      return '<a href="' + m.path + '"' + activeClass + '>' + m.label + '</a>';
    } else if (m.type === 'dropdown') {
      var dropdownActive = false;
      var itemsHtml = m.items.map(function(sub) {
        var isSubActive = false;
        var subPage = sub.path.split('?')[0].split('#')[0];
        if (subPage === trang) {
          isSubActive = true;
        } else if (sub.path === 'quan-tri-lop' && trang === 'quan-tri-bai-hoc') {
          isSubActive = true;
        } else if (sub.path === 'quan-tri-tai-lieu' && trang === 'tai-lieu') {
          isSubActive = true;
        } else if (sub.path === 'lop-hoc' && trang === 'bai-hoc') {
          isSubActive = true;
        }
        
        var activeClass = '';
        if (isSubActive) {
          activeClass = ' class="active"';
          dropdownActive = true;
        }
        return '<a href="' + sub.path + '"' + activeClass + '>' + sub.label + '</a>';
      }).join('');
      
      var btnActive = dropdownActive ? ' active' : '';
      return '<div class="nav-dropdown">' +
             '  <button class="nav-dropdown-btn' + btnActive + '">' + m.label + '</button>' +
             '  <div class="nav-dropdown-content">' + itemsHtml + '</div>' +
             '</div>';
    }
    return '';
  }).join('');
  if (typeof window.vmCapNhatNutCaiDatPwa === 'function') window.vmCapNhatNutCaiDatPwa();
}

// Nút ☰ cho màn hình hẹp: tự chèn vào thanh đầu trang (mọi trang dùng menu.js)
function damBaoNutMenuMobile() {
  var nav = document.querySelector('.topbar .nav');
  var links = document.querySelector('.navlinks');
  if (!nav || !links || document.getElementById('navBurger')) return;
  var nut = document.createElement('button');
  nut.id = 'navBurger';
  nut.className = 'nav-burger';
  nut.innerHTML = '☰';
  nut.setAttribute('aria-label', 'Mở menu');
  nut.onclick = function (e) { e.stopPropagation(); links.classList.toggle('open'); };
  nav.appendChild(nut);
  document.addEventListener('click', function (e) {
    if (!nav.contains(e.target)) links.classList.remove('open');
  });
  links.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') links.classList.remove('open');
  });
}

function apDungLogoBadge(role) {
  var logoEl = document.querySelector('.logo');
  if (!logoEl) return;
  var oldSmall = logoEl.querySelector('small');
  if (oldSmall) oldSmall.remove();
  var oldBadge = logoEl.querySelector('.role-badge');
  if (oldBadge) oldBadge.remove();

  // Học sinh đã có danh hiệu/cấp bậc ngay cạnh logo. Không lặp thêm
  // nhãn vai trò để thanh công cụ còn đủ chỗ cho các mục chính.
  if (!role || role === 'student') return;
  
  var roleLabel = '';
  var badgeClass = '';
  if (role === 'admin') { roleLabel = 'Quản trị'; badgeClass = 'badge-admin'; }
  else if (role === 'teacher') { roleLabel = 'Giáo viên'; badgeClass = 'badge-teacher'; }
  else if (role === 'assistant') { roleLabel = 'Trợ giảng'; badgeClass = 'badge-assistant'; }
  else if (role === 'parent') { roleLabel = 'Phụ huynh'; badgeClass = 'badge-parent'; }
  
  var span = document.createElement('span');
  span.id = 'lblLogoSub';
  span.className = 'role-badge ' + badgeClass;
  span.textContent = roleLabel;
  logoEl.appendChild(span);
}

// Tự chạy: lấy vai trò người đang đăng nhập rồi vẽ menu
(async function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', damBaoNutMenuMobile);
  } else {
    damBaoNutMenuMobile();
  }
  try {
    if (sessionStorage.getItem('vm-guest-mode') === 'true') {
      document.body.classList.add('vm-authenticated', 'vm-role-student');
      apDungMenu('student', null);
      apDungLogoBadge('student');
      napHeThongCapBac();
      napDongHoTuHoc();
      return;
    }
    if (typeof daKetNoi !== 'function' || !daKetNoi()) return;
    var s = await sb.auth.getSession();
    if (!s.data.session) return;
    var r = await sb.from('profiles').select('role').eq('id', s.data.session.user.id).single();
    if (r.data) {
      document.body.classList.add('vm-authenticated');
      document.body.classList.add('vm-role-' + (r.data.role || 'student'));
      var portalContext = null;
      try {
        var pm = await sb.from('exam_portal_members')
          .select('member_role, portal_only, portal:exam_portals(id,slug,name,short_name,is_active)')
          .eq('user_id', s.data.session.user.id)
          .eq('portal_only', true)
          .limit(1)
          .maybeSingle();
        if (pm.data && pm.data.portal && pm.data.portal.is_active) portalContext = pm.data;
      } catch (portalError) { /* migration chưa có: giữ điều hướng cũ */ }
      window.VM_PORTAL_CONTEXT = portalContext;
      if (portalContext) {
        var currentPage = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
        var allowed = ['thi', 'luyen-de', 'dang-nhap'];
        if (portalContext.member_role === 'owner' || portalContext.member_role === 'manager') allowed.push('quan-tri-de');
        if (allowed.indexOf(currentPage) === -1) {
          location.replace('thi?portal=' + encodeURIComponent(portalContext.portal.slug));
          return;
        }
      }
      apDungMenu(r.data.role, portalContext);
      apDungLogoBadge(r.data.role);
      if (r.data.role === 'student' && !portalContext) napHeThongCapBac();
    }
    khoiDongChuong(s.data.session.user.id);
    napDongHoTuHoc();
  } catch (e) { /* giữ menu tĩnh sẵn có nếu lỗi */ }
})();

function napHeThongCapBac() {
  if (window.VMRank) { window.VMRank.init(); return; }
  if (document.getElementById('vmRankSystemScript')) return;
  var sc = document.createElement('script');
  sc.id = 'vmRankSystemScript';
  sc.src = 'js/rank-system.js?v=7';
  sc.onload = function () { if (window.VMRank) window.VMRank.init(); };
  document.body.appendChild(sc);
}

// Nạp engine đồng hồ tự học (ô trôi nổi sống sót qua mọi trang)
function napDongHoTuHoc() {
  if (window.__vmStudyLoaded || document.getElementById('vmStudyScript')) return;
  var sc = document.createElement('script');
  sc.id = 'vmStudyScript';
  sc.src = 'js/study-timer.js?v=3';
  document.body.appendChild(sc);
}


// ============================================================
// CHUÔNG THÔNG BÁO DÙNG CHUNG (mọi trang nạp menu.js đều có)
// ============================================================
var chuongUserId = null;

function khoiDongChuong(uid) {
  if (document.getElementById('nutChuong')) return;
  var nav = document.querySelector('.topbar .nav');
  if (!nav) return;
  chuongUserId = uid;
  var wrap = document.createElement('div');
  wrap.className = 'bell-wrap';
  wrap.innerHTML =
    '<button class="nav-bell" id="nutChuong" aria-label="Thông báo">' +
      '<svg viewBox="0 0 24 24" class="bell-svg" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill="none"></path>' +
        '<path d="M13.73 21a2 2 0 0 1-3.46 0" fill="currentColor"></path>' +
      '</svg>' +
      '<span class="bell-badge" id="demChuong" style="display:none">0</span>' +
    '</button>' +
    '<div class="bell-panel" id="bangThongBao" style="display:none">' +
      '<div class="bell-head"><b style="font-size:.9rem">Thông báo</b><button class="bell-readall" id="nutDocHet">✓ Đọc hết</button></div>' +
      '<div class="bell-list" id="dsThongBao"></div>' +
    '</div>';
  var burger = document.getElementById('navBurger');
  if (burger) nav.insertBefore(wrap, burger); else nav.appendChild(wrap);

  function vmDatBangThongBaoTheoManHinh(p) {
    if (window.innerWidth <= 768) {
      /* backdrop-filter tren topbar tao containing block cho position:fixed.
         Dua panel ra body de no bam dung viewport thay vi co lai theo header. */
      if (p.parentNode !== document.body) document.body.appendChild(p);
      var topbar = document.querySelector('.topbar');
      var topbarBottom = topbar ? Math.ceil(topbar.getBoundingClientRect().bottom) : 64;
      p.style.setProperty('--vm-bell-panel-top', Math.max(8, topbarBottom + 6) + 'px');
    } else if (p.parentNode !== wrap) {
      wrap.appendChild(p);
      p.style.removeProperty('--vm-bell-panel-top');
    }
  }

  document.getElementById('nutChuong').onclick = function (e) {
    e.stopPropagation();
    var p = document.getElementById('bangThongBao');
    var mo = p.style.display === 'none';
    if (mo) vmDatBangThongBaoTheoManHinh(p);
    p.style.display = mo ? 'flex' : 'none';
    if (mo) veDanhSachThongBao();
  };
  document.getElementById('nutDocHet').onclick = async function (e) {
    e.stopPropagation();
    await sb.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', chuongUserId).is('read_at', null);
    demThongBao(); veDanhSachThongBao();
  };
  document.addEventListener('click', function (ev) {
    var p = document.getElementById('bangThongBao');
    if (p && !wrap.contains(ev.target) && !p.contains(ev.target)) p.style.display = 'none';
  });
  window.addEventListener('resize', function () {
    var p = document.getElementById('bangThongBao');
    if (p && p.style.display !== 'none') vmDatBangThongBaoTheoManHinh(p);
  });

  demThongBao();
  setInterval(demThongBao, 60000); // dự phòng: 60 giây đếm lại 1 lần
  try { // thời gian thực: có thông báo mới là chuông nhảy số ngay
    sb.channel('noti-' + uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid },
        function () { demThongBao(); })
      .subscribe();
  } catch (e) { /* không có realtime thì dùng vòng đếm 60s */ }
}

function vmTaiWebPushChoThietBi(uid) {
  if (!uid || document.getElementById('vmPushClientScript')) {
    if (window.vmKhoiDongWebPush) window.vmKhoiDongWebPush(uid);
    return;
  }
  var script = document.createElement('script');
  script.id = 'vmPushClientScript';
  script.src = 'js/push-notifications.js?v=3';
  script.defer = true;
  script.onload = function () {
    if (window.vmKhoiDongWebPush) window.vmKhoiDongWebPush(uid);
  };
  document.head.appendChild(script);
}

async function demThongBao() {
  vmTaiWebPushChoThietBi(chuongUserId);
  try {
    var r = await sb.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', chuongUserId).is('read_at', null);
    var n = r.count || 0;
    var b = document.getElementById('demChuong');
    if (!b) return;
    b.textContent = n > 9 ? '9+' : n;
    b.style.display = n > 0 ? 'grid' : 'none';
    try {
      if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n);
      else if (!n && navigator.clearAppBadge) navigator.clearAppBadge();
    } catch (e) {}
  } catch (e) {}
}

async function veDanhSachThongBao() {
  var khung = document.getElementById('dsThongBao');
  khung.innerHTML = '<div class="bell-item" style="color:var(--ink-3)">Đang tải…</div>';
  var r = await sb.from('notifications')
    .select('id, title, body, link, kind, read_at, created_at')
    .eq('user_id', chuongUserId)
    .order('created_at', { ascending: false })
    .limit(12);
  var ds = r.data || [];
  if (!ds.length) {
    khung.innerHTML = '<div class="bell-item" style="color:var(--ink-3); cursor:default">Chưa có thông báo nào.</div>';
    return;
  }
  khung.innerHTML = ds.map(function (t) {
    var luc = new Date(t.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' });
    return '<div class="bell-item' + (t.read_at ? '' : ' unread') + '" data-id="' + t.id + '" data-link="' + (t.link || '') + '" data-kind="' + (t.kind || '') + '" data-body="' + encodeURIComponent(t.body || '') + '">' +
      '<b>' + t.title + '</b>' +
      (t.body ? '<span>' + t.body + '</span>' : '') +
      '<small>' + luc + '</small></div>';
  }).join('');
  khung.querySelectorAll('.bell-item[data-id]').forEach(function (el) {
    el.onclick = async function () {
      await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', el.getAttribute('data-id'));
      var l = vmDichDenThongBao(el.getAttribute('data-link'), el.getAttribute('data-kind'), decodeURIComponent(el.getAttribute('data-body') || ''));
      if (l && l.indexOf('http') === 0) { window.open(l, '_blank'); demThongBao(); veDanhSachThongBao(); }
      else if (l) { window.location.href = l; }
      else { demThongBao(); veDanhSachThongBao(); }
    };
  });
}

function vmDichDenThongBao(link, kind, body) {
  if (!link) return '';
  try {
    var url = new URL(link, window.location.origin);
    if (url.origin === window.location.origin && kind === 'graded' && /\/bai-hoc(?:\.html)?$/.test(url.pathname)) {
      url.searchParams.set('action', 'graded');
      if (!url.searchParams.has('kind')) {
        var text = String(body || '').toLowerCase();
        url.searchParams.set('kind', text.indexOf('thưởng') !== -1 ? 'homework_bonus' : (text.indexOf('kiểm tra') !== -1 ? 'test' : 'homework'));
      }
    }
    return url.origin === window.location.origin ? (url.pathname + url.search + url.hash) : url.href;
  } catch (e) { return link; }
}

// Đóng mở dropdown khi click (dành cho mobile và đóng khi click ngoài)
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('nav-dropdown-btn')) {
    e.stopPropagation();
    var dropdown = e.target.closest('.nav-dropdown');
    if (dropdown) {
      document.querySelectorAll('.nav-dropdown').forEach(function(d) {
        if (d !== dropdown) d.classList.remove('open');
      });
      dropdown.classList.toggle('open');
    }
  } else {
    document.querySelectorAll('.nav-dropdown').forEach(function(d) {
      d.classList.remove('open');
    });
  }
});
