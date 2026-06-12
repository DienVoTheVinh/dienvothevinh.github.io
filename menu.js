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
      ['quan-tri-lop.html', 'Lớp học'],
      ['quan-tri-lich.html', 'Lịch học'],
      ['quan-tri-de.html', 'Luyện đề'],
      ['quan-tri-cham-bai.html', 'Chấm bài'],
      ['ca-nhan.html', 'Cá nhân']
    ];
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
  } catch (e) { /* giữ menu tĩnh sẵn có nếu lỗi */ }
})();
