// ============================================================
// VINHMATH — MENU CHUẨN DÙNG CHUNG (một nguồn duy nhất)
// Mọi trang chỉ cần nạp file này sau vinhmath.js — menu sẽ tự
// vẽ lại theo VAI TRÒ người đăng nhập, trang nào cũng giống nhau.
// Muốn thêm/bớt mục menu: sửa ĐÚNG MỘT chỗ là file này.
// ============================================================

function apDungMenu(role) {
  var nav = document.querySelector('.navlinks');
  if (!nav) return;
  var trang = (location.pathname.split('/').pop() || 'index.html').split('?')[0];

  var muc;
  if (['admin', 'teacher', 'assistant'].indexOf(role) !== -1) {
    // ----- MENU CỦA THẦY / TRỢ GIẢNG -----
    muc = [
      ['quan-tri-lop.html', 'Lớp học']
    ];
    if (role === 'admin' || role === 'teacher') {
      muc.push(['quan-tri-hoc-sinh.html', 'Học sinh']);
    }
    muc.push(
      ['quan-tri-lich.html', 'Lịch học'],
      ['quan-tri-de.html', 'Luyện đề'],
      ['quan-tri-cham-bai.html', 'Chấm bài'],
      ['ca-nhan.html', 'Cá nhân']
    );
    if (role === 'admin') {
      muc.push(['quan-tri-truy-cap.html', 'Giám sát']);
    }
  } else {
    // ----- MENU CỦA HỌC SINH -----
    muc = [
      ['lop-hoc.html', 'Lớp học'],
      ['lich-hoc.html', 'Lịch học'],
      ['luyen-de.html', 'Luyện đề'],
      ['ca-nhan.html', 'Cá nhân']
    ];
  }

  nav.innerHTML = muc.map(function (m) {
    // Để khớp active cho cả các trang chi tiết bài học...
    var activeClass = '';
    if (m[0] === trang) {
      activeClass = ' class="active"';
    } else if (m[0] === 'lop-hoc.html' && trang === 'bai-hoc.html') {
      activeClass = ' class="active"'; // bài học thuộc phân hệ Lớp học
    } else if (m[0] === 'quan-tri-lop.html' && trang === 'quan-tri-bai-hoc.html') {
      activeClass = ' class="active"'; // bài giảng thuộc phân hệ Lớp học của GV
    }
    return '<a href="' + m[0] + '"' + activeClass + '>' + m[1] + '</a>';
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
    if (r.data) apDungMenu(r.data.role);
    khoiDongChuong(s.data.session.user.id);
  } catch (e) { /* giữ menu tĩnh sẵn có nếu lỗi */ }
})();


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
    '<button class="nav-bell" id="nutChuong" aria-label="Thông báo">🔔<span class="bell-badge" id="demChuong" style="display:none">0</span></button>' +
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
