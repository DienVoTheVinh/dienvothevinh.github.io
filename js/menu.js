// ============================================================
// VINHMATH — MENU CHUẨN DÙNG CHUNG (một nguồn duy nhất)
// Mọi trang chỉ cần nạp file này sau vinhmath.js — menu sẽ tự
// vẽ lại theo VAI TRÒ người đăng nhập, trang nào cũng giống nhau.
// Muốn thêm/bớt mục menu: sửa ĐÚNG MỘT chỗ là file này.
// ============================================================

function apDungMenu(role) {
  var nav = document.querySelector('.navlinks');
  if (!nav) return;
  var trang = (location.pathname.split('/').pop() || 'index').split('?')[0];

  var muc;
  if (['admin', 'teacher', 'assistant'].indexOf(role) !== -1) {
    // ----- MENU CỦA THẦY / TRỢ GIẢNG (Gom nhóm Quản trị) -----
    muc = [
      { type: 'link', path: 'trang-chu', label: 'Trang chủ' },
      { type: 'link', path: 'blog', label: 'Blog' },
      {
        type: 'dropdown',
        label: 'Quản trị ▾',
        items: [
          { path: 'quan-tri-lop', label: 'Lớp học' },
          (role === 'admin' || role === 'teacher' ? { path: 'quan-tri-tai-lieu', label: 'Soạn tài liệu' } : null),
          (role === 'admin' ? { path: 'viet-blog', label: '✍️ Viết blog' } : null),
          (role === 'admin' || role === 'teacher' ? { path: 'quan-tri-bai-hoc', label: 'Khóa bài giảng' } : null),
          (role === 'admin' || role === 'teacher' ? { path: 'quan-tri-hoc-sinh', label: 'Học sinh' } : null),
          { path: 'quan-tri-lich', label: 'Lịch học' },
          { path: 'quan-tri-de', label: 'Luyện đề' },
          { path: 'quan-tri-cham-bai', label: 'Chấm bài' },
          (role === 'admin' ? { path: 'quan-tri-truy-cap', label: 'Giám sát' } : null)
        ].filter(Boolean)
      },
      { type: 'link', path: 'bang-vang', label: 'Bảng vàng' },
      { type: 'link', path: 'goc-tu-hoc', label: '🌳 Góc tự học' },
      { type: 'link', path: 'ca-nhan', label: 'Cá nhân' }
    ].filter(Boolean);
  } else if (role === 'parent') {
    // ----- MENU CỦA PHỤ HUYNH -----
    muc = [
      { type: 'link', path: 'phu-huynh', label: 'Theo dõi con' },
      { type: 'link', path: 'goc-tu-hoc', label: '🌳 Góc tự học' },
      { type: 'link', path: 'bang-vang', label: 'Bảng vàng' }
    ];
  } else {
    // ----- MENU CỦA HỌC SINH -----
    muc = [
      { type: 'link', path: 'trang-chu', label: 'Trang chủ' },
      {
        type: 'dropdown',
        label: 'Học tập ▾',
        items: [
          { path: 'lop-hoc', label: 'Lớp học' },
          { path: 'luyen-de', label: 'Luyện đề' },
          { path: 'tai-lieu', label: 'Tài liệu' },
          { path: 'lich-hoc', label: 'Lịch học' },
          { path: 'goc-tu-hoc', label: '🌳 Góc tự học' }
        ]
      },
      { type: 'link', path: 'bang-vang', label: 'Bảng vàng' },
      { type: 'link', path: 'blog', label: 'Blog' },
      { type: 'link', path: 'ca-nhan', label: 'Cá nhân' }
    ];
  }

  nav.innerHTML = muc.map(function (m) {
    if (m.type === 'link') {
      var activeClass = '';
      if (m.path === trang) {
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
        if (sub.path === trang) {
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
  
  var roleLabel = 'Học sinh';
  var badgeClass = 'badge-student';
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
    if (typeof daKetNoi !== 'function' || !daKetNoi()) return;
    var s = await sb.auth.getSession();
    if (!s.data.session) return;
    var r = await sb.from('profiles').select('role').eq('id', s.data.session.user.id).single();
    if (r.data) {
      apDungMenu(r.data.role);
      apDungLogoBadge(r.data.role);
    }
    khoiDongChuong(s.data.session.user.id);
    napDongHoTuHoc();
  } catch (e) { /* giữ menu tĩnh sẵn có nếu lỗi */ }
})();

// Nạp engine đồng hồ tự học (ô trôi nổi sống sót qua mọi trang)
function napDongHoTuHoc() {
  if (window.__vmStudyLoaded || document.getElementById('vmStudyScript')) return;
  var sc = document.createElement('script');
  sc.id = 'vmStudyScript';
  sc.src = 'js/study-timer.js?v=2';
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

  document.getElementById('nutChuong').onclick = function (e) {
    e.stopPropagation();
    var p = document.getElementById('bangThongBao');
    var mo = p.style.display === 'none';
    p.style.display = mo ? 'block' : 'none';
    if (mo) veDanhSachThongBao();
  };
  document.getElementById('nutDocHet').onclick = async function (e) {
    e.stopPropagation();
    await sb.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', chuongUserId).is('read_at', null);
    demThongBao(); veDanhSachThongBao();
  };
  document.addEventListener('click', function (ev) {
    if (!wrap.contains(ev.target)) document.getElementById('bangThongBao').style.display = 'none';
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

async function demThongBao() {
  try {
    var r = await sb.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', chuongUserId).is('read_at', null);
    var n = r.count || 0;
    var b = document.getElementById('demChuong');
    if (!b) return;
    b.textContent = n > 9 ? '9+' : n;
    b.style.display = n > 0 ? 'grid' : 'none';
  } catch (e) {}
}

async function veDanhSachThongBao() {
  var khung = document.getElementById('dsThongBao');
  khung.innerHTML = '<div class="bell-item" style="color:var(--ink-3)">Đang tải…</div>';
  var r = await sb.from('notifications')
    .select('id, title, body, link, read_at, created_at')
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
    return '<div class="bell-item' + (t.read_at ? '' : ' unread') + '" data-id="' + t.id + '" data-link="' + (t.link || '') + '">' +
      '<b>' + t.title + '</b>' +
      (t.body ? '<span>' + t.body + '</span>' : '') +
      '<small>' + luc + '</small></div>';
  }).join('');
  khung.querySelectorAll('.bell-item[data-id]').forEach(function (el) {
    el.onclick = async function () {
      await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', el.getAttribute('data-id'));
      var l = el.getAttribute('data-link');
      if (l && l.indexOf('http') === 0) { window.open(l, '_blank'); demThongBao(); veDanhSachThongBao(); }
      else if (l) { window.location.href = l; }
      else { demThongBao(); veDanhSachThongBao(); }
    };
  });
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
