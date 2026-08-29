// ============================================================
// VINHMATH — MENU CHUẨN DÙNG CHUNG (một nguồn duy nhất)
// Mọi trang chỉ cần nạp file này sau vinhmath.js — menu sẽ tự
// vẽ lại theo VAI TRÒ người đăng nhập, trang nào cũng giống nhau.
// Muốn thêm/bớt mục menu: sửa ĐÚNG MỘT chỗ là file này.
// ============================================================

function vmMenuEsc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char];
  });
}

function vmMenuFeatureMap(access) {
  var map = Object.create(null);
  var items = access && Array.isArray(access.items) ? access.items : [];
  items.forEach(function (item) {
    if (!item || !item.feature_key) return;
    map[item.feature_key] = item.state === 'hidden' || item.state === 'locked' ? item.state : 'shown';
  });
  return map;
}

function vmMenuTenantExamFocus(context) {
  if (!context || !context.full_site || !Array.isArray(context.features)) return false;
  return context.features.some(function (item) {
    return item && (item.feature_key || item.key) === 'exam_focus' &&
      String(item.state || item.status || '').toLowerCase() === 'shown';
  });
}

function apDungMenu(role, portalContext, tenantContext, featureAccess) {
  var nav = document.querySelector('.navlinks');
  if (!nav) return;
  var trang = (location.pathname.split('/').pop() || 'index').split('?')[0];

  var muc;
  if (portalContext && portalContext.portal_only) {
    muc = [
      { type: 'link', path: 'thi?portal=' + encodeURIComponent(portalContext.portal.slug), label: 'Kỳ thi', featureKey: 'exams' },
      { type: 'link', path: 'thi?portal=' + encodeURIComponent(portalContext.portal.slug) + '#results', label: 'Kết quả', featureKey: 'results' }
    ];
    if (portalContext.member_role === 'owner' || portalContext.member_role === 'manager') {
      muc.push({ type: 'link', path: 'thi?portal=' + encodeURIComponent(portalContext.portal.slug) + '#manage', label: 'Quản lý', featureKey: 'manage' });
      muc.push({ type: 'link', path: 'quan-tri-de?portal=' + encodeURIComponent(portalContext.portal.slug), label: 'Soạn đề', featureKey: 'authoring' });
    }
  } else if (role === 'admin') {
    // Admin dùng khu điều hành riêng; thanh đầu chỉ giữ các nhiệm vụ hằng ngày.
    muc = [
      { type: 'link', path: 'trang-chu', label: 'Hôm nay', featureKey: 'home' },
      { type: 'link', path: 'quan-tri-lop', label: 'Lớp học', featureKey: 'classes' },
      { type: 'link', path: 'quan-tri-cham-bai', label: 'Chấm bài', featureKey: 'grading' },
      { type: 'link', path: 'quan-tri-lich', label: 'Lịch', featureKey: 'schedule' },
      { type: 'link', path: 'quan-tri-de?tab=compose&template=worksheet-mixed', label: 'Soạn thảo', featureKey: 'authoring' },
      { type: 'link', path: 'vmtool', label: 'VMTool', featureKey: 'vmtool' },
      { type: 'link', path: 'quan-tri', label: 'Quản trị', featureKey: 'admin' }
    ];
  } else if (role === 'teacher') {
    muc = [
      { type: 'link', path: 'trang-chu', label: 'Hôm nay', featureKey: 'home' },
      { type: 'link', path: 'quan-tri-lop', label: 'Lớp của tôi', featureKey: 'classes' },
      { type: 'link', path: 'quan-tri-cham-bai', label: 'Chấm bài', featureKey: 'grading' },
      { type: 'link', path: 'quan-tri-de?tab=compose&template=worksheet-mixed', label: 'Soạn thảo', featureKey: 'authoring' },
      { type: 'link', path: 'vmtool', label: 'VMTool', featureKey: 'vmtool' },
      { type: 'link', path: 'quan-tri-lich', label: 'Lịch', featureKey: 'schedule' },
      { type: 'link', path: 'ca-nhan', label: 'Cá nhân', featureKey: 'profile' }
    ];
  } else if (role === 'assistant') {
    muc = [
      { type: 'link', path: 'trang-chu', label: 'Hôm nay', featureKey: 'home' },
      { type: 'link', path: 'quan-tri-lop', label: 'Lớp được giao', featureKey: 'classes' },
      { type: 'link', path: 'quan-tri-cham-bai', label: 'Chấm bài', featureKey: 'grading' },
      { type: 'link', path: 'quan-tri-hoc-sinh', label: 'Học sinh', featureKey: 'classes' },
      { type: 'link', path: 'vmtool', label: 'VMTool', featureKey: 'vmtool' },
      { type: 'link', path: 'ca-nhan', label: 'Cá nhân', featureKey: 'profile' }
    ];
  } else if (role === 'parent') {
    // ----- MENU CỦA PHỤ HUYNH -----
    muc = [
      { type: 'link', path: 'phu-huynh', label: 'Theo dõi con', featureKey: 'parental' },
      { type: 'link', path: 'goc-tu-hoc', label: 'Góc tự học', featureKey: 'self_study' },
      { type: 'link', path: 'vmtool', label: 'VMTool', featureKey: 'vmtool' },
      { type: 'link', path: 'bang-vang', label: 'Bảng vàng', featureKey: 'leaderboard' }
    ];
  } else {
    // ----- MENU CỦA HỌC SINH -----
    // Các điểm đến học sinh dùng thường xuyên được đặt trực tiếp trên thanh chính.
    muc = [
      { type: 'link', path: 'trang-chu', label: 'Hôm nay', featureKey: 'home' },
      { type: 'link', path: 'lop-hoc', label: 'Bài học', featureKey: 'lessons' },
      { type: 'link', path: 'luyen-de', label: 'Bài tập', featureKey: 'practice' },
      { type: 'link', path: 'ket-qua', label: 'Kết quả', featureKey: 'results' },
      { type: 'link', path: 'bang-vang', label: 'BXH', featureKey: 'leaderboard' },
      { type: 'link', path: 'vmtool', label: 'VMTool', featureKey: 'vmtool' },
      { type: 'link', path: 'ca-nhan', label: 'Cá nhân', featureKey: 'profile' }
    ];
  }

  var fullSiteTenant = tenantContext && tenantContext.full_site ? tenantContext : null;
  if (fullSiteTenant && role !== 'admin' && typeof vmTenantFeatureState === 'function') {
    muc = muc.map(function (item, index) {
      var config = typeof vmTenantFeatureConfig === 'function'
        ? vmTenantFeatureConfig(fullSiteTenant, item.featureKey, role)
        : { state: vmTenantFeatureState(fullSiteTenant, item.featureKey, role), sort_order: null, label_override: '' };
      item.featureState = config.state;
      item.featureOrder = config.sort_order == null ? index * 10 : config.sort_order;
      item.featureIndex = index;
      if (config.label_override) item.label = config.label_override;
      return item;
    }).filter(function (item) {
      return item.featureState !== 'hidden';
    }).sort(function (a, b) { return a.featureOrder - b.featureOrder || a.featureIndex - b.featureIndex; });
  }

  // Chính sách toàn hệ thống là lớp quyền thật; cấu hình tenant chỉ có thể
  // hạn chế thêm, tuyệt đối không được nâng một quyền đã khóa/ẩn.
  var globalFeatures = vmMenuFeatureMap(featureAccess);
  muc = muc.map(function (item) {
    var globalState = globalFeatures[item.featureKey] || 'shown';
    if (globalState === 'hidden' || item.featureState === 'hidden') item.featureState = 'hidden';
    else if (globalState === 'locked' || item.featureState === 'locked') item.featureState = 'locked';
    else item.featureState = 'shown';
    return item;
  }).filter(function (item) { return item.featureState !== 'hidden'; });

  // Cổng thi tập trung là một trạng thái trình bày của full-site tenant, không
  // đổi experience_mode và không can thiệp RLS. Học sinh chỉ còn lối vào thi,
  // kết quả và hồ sơ trong giai đoạn này.
  if (fullSiteTenant && role === 'student' && vmMenuTenantExamFocus(fullSiteTenant)) {
    muc = muc.filter(function (item) {
      return item.featureKey === 'practice' || item.featureKey === 'results' || item.featureKey === 'profile';
    });
  }

  nav.innerHTML = muc.map(function (m) {
    if (m.type === 'link') {
      if (m.featureState === 'locked') {
        return '<a href="#" class="vm-feature-locked" data-vm-feature="' + vmMenuEsc(m.featureKey) + '" aria-disabled="true" title="Chức năng đang tạm khóa">' + vmMenuEsc(m.label) + ' <span aria-hidden="true">🔒</span></a>';
      }
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
      } else if (menuPage === 'quan-tri-de' && trang === 'quan-tri-tai-lieu') {
        activeClass = ' class="active"';
      }
      return '<a href="' + m.path + '"' + activeClass + '>' + vmMenuEsc(m.label) + '</a>';
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
        return '<a href="' + sub.path + '"' + activeClass + '>' + vmMenuEsc(sub.label) + '</a>';
      }).join('');
      
      var btnActive = dropdownActive ? ' active' : '';
      return '<div class="nav-dropdown">' +
             '  <button class="nav-dropdown-btn' + btnActive + '">' + vmMenuEsc(m.label) + '</button>' +
             '  <div class="nav-dropdown-content">' + itemsHtml + '</div>' +
             '</div>';
    }
    return '';
  }).join('');
  if ((fullSiteTenant && role !== 'admin') || Object.keys(globalFeatures).length) {
    nav.querySelectorAll('.vm-feature-locked').forEach(function (link) {
      link.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); });
    });
    if (!document.getElementById('vmTenantMenuStyle')) {
      var style = document.createElement('style');
      style.id = 'vmTenantMenuStyle';
      style.textContent = '.navlinks .vm-feature-locked{opacity:.58;cursor:not-allowed;pointer-events:auto}.navlinks .vm-feature-locked:hover{color:inherit;background:transparent}';
      document.head.appendChild(style);
    }
  }
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
      apDungMenu('student', null, null, null);
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
      var tenantContext = typeof vmLoadTenantContext === 'function' ? await vmLoadTenantContext() : null;
      var portalContext = tenantContext && tenantContext.portal_only && !tenantContext.full_site ? tenantContext : null;
      // Tương thích với bản cơ sở dữ liệu cũ chưa có RPC tenant dùng chung.
      if (!tenantContext && typeof vmLoadTenantContext !== 'function') {
        try {
          var pm = await sb.from('exam_portal_members')
            .select('member_role, portal_only, portal:exam_portals!inner(id,slug,name,short_name,is_active,experience_mode)')
            .eq('user_id', s.data.session.user.id)
            .eq('portal_only', true)
            .eq('portal.experience_mode', 'exam_only')
            .limit(1)
            .maybeSingle();
          if (pm.data && pm.data.portal && pm.data.portal.is_active) portalContext = pm.data;
        } catch (portalError) { /* migration chưa có: giữ điều hướng cũ */ }
      }
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
      var featureAccess = null;
      try {
        var accessResponse = await sb.rpc('vm_my_feature_access', {
          p_portal_id: tenantContext && tenantContext.full_site ? tenantContext.id : null
        });
        if (!accessResponse.error) featureAccess = accessResponse.data;
      } catch (featureError) { /* migration cũ: giữ menu hiện hành */ }
      if (featureAccess && !portalContext) {
        var pageFeature = typeof vmTenantFeatureForPath === 'function'
          ? vmTenantFeatureForPath(null, r.data.role) : '';
        var pageState = vmMenuFeatureMap(featureAccess)[pageFeature] || 'shown';
        if (pageFeature && pageState !== 'shown') {
          try { sessionStorage.setItem('vm-global-feature-notice', pageState + ':' + pageFeature); } catch (_) {}
          var safeTarget = r.data.role === 'student' ? 'trang-chu' : 'trang-chu';
          var currentPage = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
          if (currentPage !== safeTarget) { location.replace(safeTarget + '?feature=' + encodeURIComponent(pageState)); return; }
        }
      }
      if (tenantContext && tenantContext.full_site && typeof vmGuardTenantRoute === 'function' && vmGuardTenantRoute(tenantContext, r.data.role)) return;
      apDungMenu(r.data.role, portalContext, tenantContext, featureAccess);
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
  sc.src = 'js/rank-system.js?v=8';
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
  khung.replaceChildren();
  ds.forEach(function (t) {
    var luc = new Date(t.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' });
    var item = document.createElement('div');
    item.className = 'bell-item' + (t.read_at ? '' : ' unread');
    item.dataset.id = String(t.id || '');
    item.dataset.link = String(t.link || '');
    item.dataset.kind = String(t.kind || '');
    item.dataset.body = String(t.body || '');
    var title = document.createElement('b');
    title.textContent = String(t.title || 'Thông báo');
    item.appendChild(title);
    if (t.body) {
      var body = document.createElement('span');
      body.textContent = String(t.body);
      item.appendChild(body);
    }
    var time = document.createElement('small');
    time.textContent = luc;
    item.appendChild(time);
    khung.appendChild(item);
  });
  khung.querySelectorAll('.bell-item[data-id]').forEach(function (el) {
    el.onclick = async function () {
      await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', el.getAttribute('data-id'));
      var l = vmDichDenThongBao(el.dataset.link, el.dataset.kind, el.dataset.body);
      if (l && /^https?:\/\//i.test(l)) { window.open(l, '_blank', 'noopener'); demThongBao(); veDanhSachThongBao(); }
      else if (l) { window.location.href = l; }
      else { demThongBao(); veDanhSachThongBao(); }
    };
  });
}

function vmDichDenThongBao(link, kind, body) {
  if (!link) return '';
  try {
    var url = new URL(link, window.location.origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (url.origin === window.location.origin && kind === 'graded' && /\/bai-hoc(?:\.html)?$/.test(url.pathname)) {
      url.searchParams.set('action', 'graded');
      if (!url.searchParams.has('kind')) {
        var text = String(body || '').toLowerCase();
        url.searchParams.set('kind', text.indexOf('thưởng') !== -1 ? 'homework_bonus' : (text.indexOf('kiểm tra') !== -1 ? 'test' : 'homework'));
      }
    }
    return url.origin === window.location.origin ? (url.pathname + url.search + url.hash) : url.href;
  } catch (e) { return ''; }
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
