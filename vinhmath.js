// ============================================================
// VINHMATH — BỘ NÃO DÙNG CHUNG CỦA MỌI TRANG
// Lo 4 việc: (1) chế độ sáng/tối, (2) kết nối Supabase,
// (3) đăng nhập/đăng xuất, (4) chặn trang dành riêng cho người đã đăng nhập.
// File này là JS thuần — không cần build, mở file là chạy.
// ============================================================

/* ---------- 1. CHẾ ĐỘ SÁNG / TỐI & HỆ THỐNG GIAO DIỆN LIQUID GLASS ---------- */
function toggleTheme() {
  var h = document.documentElement;
  var dark = h.getAttribute('data-theme') === 'dark';
  var newTheme = dark ? 'light' : 'dark';
  h.setAttribute('data-theme', newTheme);
  
  var btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = dark ? '🌙' : '☀️';
  
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

  var activeColor = localStorage.getItem('vm-accent') || 'blue';
  apdungMauAccent(h, activeColor, newTheme === 'dark');
  
  try { localStorage.setItem('vm-theme', newTheme); } catch (e) {}
}

function apdungMauAccent(el, color, isDark) {
  var map = {
    light: {
      blue:   { accent: '#2563eb', grad: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', soft: 'rgba(37, 99, 235, 0.08)' },
      violet: { accent: '#8b5cf6', grad: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', soft: 'rgba(139, 92, 246, 0.08)' },
      coral:  { accent: '#ff5e62', grad: 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)', soft: 'rgba(255, 94, 98, 0.08)' },
      green:  { accent: '#10b981', grad: 'linear-gradient(135deg, #34d399 0%, #059669 100%)', soft: 'rgba(16, 185, 129, 0.08)' },
      amber:  { accent: '#f59e0b', grad: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)', soft: 'rgba(245, 158, 11, 0.08)' }
    },
    dark: {
      blue:   { accent: '#2563eb', grad: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)', soft: 'rgba(37, 99, 235, 0.15)' },
      violet: { accent: '#c084fc', grad: 'linear-gradient(135deg, #e9d5ff 0%, #a855f7 100%)', soft: 'rgba(192, 132, 252, 0.12)' },
      coral:  { accent: '#ff5e62', grad: 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)', soft: 'rgba(255, 94, 98, 0.12)' },
      green:  { accent: '#34d399', grad: 'linear-gradient(135deg, #6ee7b7 0%, #10b981 100%)', soft: 'rgba(52, 211, 153, 0.12)' },
      amber:  { accent: '#fbbf24', grad: 'linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%)', soft: 'rgba(251, 191, 36, 0.12)' }
    }
  };
  var themeSet = isDark ? map.dark : map.light;
  var target = themeSet[color] || themeSet.blue;
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
    }
    var savedBlur = localStorage.getItem('vm-blur');
    if (savedBlur !== null) {
      root.style.setProperty('--glass-blur-radius', savedBlur + 'px');
    }
    
    // 3. Accent Color
    var savedColor = localStorage.getItem('vm-accent') || 'blue';
    apdungMauAccent(root, savedColor, savedTheme === 'dark');
  } catch (e) {}
})();

/* ---------- 2. KẾT NỐI SUPABASE ---------- */
// "sb" là cánh cửa đến tủ hồ sơ. Nếu config.js chưa điền, sb = null
// và web chạy ở "chế độ xem thử" (không đăng nhập được thật).
var VM = window.VINHMATH_CONFIG || {};
var sb = null;
if (VM.SUPABASE_URL && VM.SUPABASE_ANON_KEY && window.supabase) {
  sb = window.supabase.createClient(VM.SUPABASE_URL, VM.SUPABASE_ANON_KEY);
}
function daKetNoi() { return sb !== null; }

/* ---------- 3. ĐĂNG NHẬP / ĐĂNG XUẤT ---------- */
// HS dùng "tên đăng nhập" (vd DienVoTheVinh@ad.vinhmath). Supabase cần email,
// nên ta tự ghép đuôi cố định ngầm (.com) — HS không cần biết điều này.
async function dangNhap(username, password) {
  if (!daKetNoi()) return { error: 'Web đang ở chế độ xem thử — chưa kết nối Supabase.' };
  
  var u = username.trim().toLowerCase();
  var email = "";
  if (!u.includes('@')) {
    // Nếu học sinh chỉ nhập tên (vd: TranHaTuAnh), tự động ghép đuôi học sinh đầy đủ
    email = u + '@hs.vinhmath.com';
  } else {
    // Nếu nhập có đuôi phân quyền, tự động thêm đuôi .com ngầm
    if (u.endsWith('@hs.vinhmath')) email = u + '.com';
    else if (u.endsWith('@tg.vinhmath')) email = u + '.com';
    else if (u.endsWith('@gv.vinhmath')) email = u + '.com';
    else if (u.endsWith('@ad.vinhmath')) email = u + '.com';
    else email = u;
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
  if (clean.indexOf('Điền Võ Thế Vinh') !== -1 || clean === 'Thầy Vinh (Admin)' || clean === 'Thầy Vinh' || clean.indexOf('dienvothevinh') !== -1) {
    return '<span class="name-owner">Thầy Điền Võ Thế Vinh <span class="badge-owner">Sáng lập 👑</span></span>';
  }
  if (clean.indexOf('Trợ giảng') !== -1 || clean.indexOf('(TG)') !== -1) {
    return '<span style="color: var(--ink-2); font-weight: 500;">' + clean + '</span>';
  }
  return '<span style="color: var(--ink-1); font-weight: 600;">' + clean + '</span>';
}


async function dangXuat() {
  if (daKetNoi()) await sb.auth.signOut();
  window.location.href = 'dang-nhap.html';
}

// Lấy hồ sơ (họ tên, vai trò, lớp) của người đang đăng nhập
async function layHoSo() {
  if (!daKetNoi()) return null;
  var s = await sb.auth.getSession();
  if (!s.data.session) return null;
  var r = await sb.from('profiles')
    .select('id, role, username, full_name, class_id, class_students(class_id, classes(name, mode))')
    .eq('id', s.data.session.user.id).single();
  
  if (r.error) {
    console.error("Lỗi layHoSo:", r.error);
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
// Gọi ở đầu các trang như lop-hoc.html. Chưa đăng nhập → đưa về trang đăng nhập.
async function yeuCauDangNhap() {
  if (!daKetNoi()) return null; // chế độ xem thử: cho xem với dữ liệu mẫu
  var s = await sb.auth.getSession();
  if (!s.data.session) { window.location.href = 'dang-nhap.html'; return null; }
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
    '<button class="control-center-btn" id="ccBtn" title="Trung tâm điều khiển giao diện">' +
      '<svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:currentColor;">' +
        '<path d="M3 17h18v2H3v-2zm0-6h18v2H3v-2zm0-6h18v2H3V5z"/>' +
      '</svg>' +
    '</button>';
    
  // 3. Tạo Panel Control Center
  var panel = document.createElement('div');
  panel.className = 'control-center-panel';
  panel.id = 'ccPanel';
  
  var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  var isDark = currentTheme === 'dark';
  var currentTrans = localStorage.getItem('vm-transparency') || (isDark ? '0.6' : '0.45');
  var currentBlur = localStorage.getItem('vm-blur') || '20';
  var currentAccent = localStorage.getItem('vm-accent') || 'blue';
  
  panel.innerHTML = 
    '<!-- Widgets Grid -->' +
    '<div class="cc-widgets-grid">' +
      '<div class="cc-widget">' +
        '<div class="cc-widget-icon" style="background:#3b82f6;">🌐</div>' +
        '<div class="cc-widget-info">' +
          '<b>Mạng Wifi</b>' +
          '<span>VinhMath 5G</span>' +
        '</div>' +
      '</div>' +
      '<div class="cc-widget">' +
        '<div class="cc-widget-icon" style="background:#10b981;">⚡</div>' +
        '<div class="cc-widget-info">' +
          '<b>Máy chủ</b>' +
          '<span>Đang chạy</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    
    '<!-- Theme switcher -->' +
    '<div class="cc-theme-switcher">' +
      '<button class="cc-theme-btn ' + (!isDark ? 'active' : '') + '" id="ccBtnLight">☀️ Sáng</button>' +
      '<button class="cc-theme-btn ' + (isDark ? 'active' : '') + '" id="ccBtnDark">🌙 Tối</button>' +
    '</div>' +
    
    '<!-- Transparency (Opacity) slider -->' +
    '<div class="cc-control-row">' +
      '<div class="cc-control-label">' +
        '<span>Trong suốt (Liquid Glass)</span>' +
        '<span id="lblOpacity">' + Math.round(currentTrans * 100) + '%</span>' +
      '</div>' +
      '<div class="cc-slider-wrap">' +
        '<input type="range" min="0.1" max="0.9" step="0.05" value="' + currentTrans + '" class="cc-slider" id="sldOpacity">' +
      '</div>' +
    '</div>' +
    
    '<!-- Blur slider -->' +
    '<div class="cc-control-row">' +
      '<div class="cc-control-label">' +
        '<span>Độ mờ gương (Blur)</span>' +
        '<span id="lblBlur">' + currentBlur + 'px</span>' +
      '</div>' +
      '<div class="cc-slider-wrap">' +
        '<input type="range" min="0" max="40" step="1" value="' + currentBlur + '" class="cc-slider" id="sldBlur">' +
      '</div>' +
    '</div>' +
    
    '<!-- Accent Color picker -->' +
    '<div class="cc-color-picker">' +
      '<div class="cc-color-label">Màu chủ đề</div>' +
      '<div class="cc-color-dots">' +
        '<div class="cc-color-dot ' + (currentAccent === 'blue' ? 'active' : '') + '" style="background:#2563eb;" data-color="blue" title="Xanh dương"></div>' +
        '<div class="cc-color-dot ' + (currentAccent === 'violet' ? 'active' : '') + '" style="background:#8b5cf6;" data-color="violet" title="Tím"></div>' +
        '<div class="cc-color-dot ' + (currentAccent === 'coral' ? 'active' : '') + '" style="background:#ff5e62;" data-color="coral" title="Đỏ son"></div>' +
        '<div class="cc-color-dot ' + (currentAccent === 'green' ? 'active' : '') + '" style="background:#10b981;" data-color="green" title="Xanh lá"></div>' +
        '<div class="cc-color-dot ' + (currentAccent === 'amber' ? 'active' : '') + '" style="background:#f59e0b;" data-color="amber" title="Hổ phách"></div>' +
      '</div>' +
    '</div>';
    
  ccWrapper.appendChild(panel);
  
  // Chèn vào đầu trang bên cạnh nút đăng xuất hoặc cuối navlinks
  var navLinks = nav.querySelector('.navlinks') || nav;
  if (navLinks === nav) {
    nav.appendChild(ccWrapper);
  } else {
    // Chèn trước con đầu tiên của navlinks để hiển thị đẹp đẽ cạnh các nút khác
    navLinks.insertBefore(ccWrapper, navLinks.firstChild);
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
  
  // Thay đổi Theme
  var btnLight = $('ccBtnLight');
  var btnDark = $('ccBtnDark');
  
  function setCCTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vm-theme', theme);
    
    // Cập nhật nút trong CC
    if (theme === 'dark') {
      btnDark.classList.add('active');
      btnLight.classList.remove('active');
    } else {
      btnLight.classList.add('active');
      btnDark.classList.remove('active');
    }
    
    // Cập nhật nút cũ (nếu có trên trang)
    var oldBtn = $('themeBtn');
    if (oldBtn) oldBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    
    // Cập nhật màu accent theo theme
    var activeColor = localStorage.getItem('vm-accent') || 'blue';
    apdungMauAccent(document.documentElement, activeColor, theme === 'dark');
  }
  
  btnLight.addEventListener('click', function() { setCCTheme('light'); });
  btnDark.addEventListener('click', function() { setCCTheme('dark'); });
  
  // Slider Opacity
  var sldOpacity = $('sldOpacity');
  var lblOpacity = $('lblOpacity');
  sldOpacity.addEventListener('input', function() {
    var val = sldOpacity.value;
    lblOpacity.textContent = Math.round(val * 100) + '%';
    document.documentElement.style.setProperty('--glass-opacity', val);
    localStorage.setItem('vm-transparency', val);
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
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  khoiTaoControlCenter();
});
