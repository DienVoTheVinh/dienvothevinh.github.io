// ============================================================
// VINHMATH — BỘ NÃO DÙNG CHUNG CỦA MỌI TRANG
// Lo 4 việc: (1) chế độ sáng/tối, (2) kết nối Supabase,
// (3) đăng nhập/đăng xuất, (4) chặn trang dành riêng cho người đã đăng nhập.
// File này là JS thuần — không cần build, mở file là chạy.
// ============================================================

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

  var activeColor = localStorage.getItem('vm-accent') || 'blue';
  apdungMauAccent(h, activeColor, newTheme === 'dark');
  
  try { localStorage.setItem('vm-theme', newTheme); } catch (e) {}
  try { window.dispatchEvent(new Event('theme-change')); } catch (e) {}
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
    
    // Canvas Opacity (Background dynamic effects)
    var savedCanvasOpacity = localStorage.getItem('vm-canvas-opacity') || '0.25';
    root.style.setProperty('--canvas-opacity', savedCanvasOpacity);
    
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
  var currentTrans = localStorage.getItem('vm-transparency') || (isDark ? '0.6' : '0.45');
  var currentBlur = localStorage.getItem('vm-blur') || '20';
  var currentCanvasOpacity = localStorage.getItem('vm-canvas-opacity') || '0.25';
  var currentAccent = localStorage.getItem('vm-accent') || 'blue';
  
  panel.innerHTML = 
    '<!-- Widgets Grid -->' +
    '<div class="cc-widgets-grid">' +
      '<div class="cc-widget">' +
        '<div class="cc-widget-icon" style="background:#3b82f6; display:grid; place-items:center;">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#fff"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3"></line></svg>' +
        '</div>' +
        '<div class="cc-widget-info">' +
          '<b>Mạng Wifi</b>' +
          '<span>VinhMath 5G</span>' +
        '</div>' +
      '</div>' +
      '<div class="cc-widget">' +
        '<div class="cc-widget-icon" style="background:#10b981; display:grid; place-items:center;">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#fff"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor"></polygon></svg>' +
        '</div>' +
        '<div class="cc-widget-info">' +
          '<b>Máy chủ</b>' +
          '<span>Đang chạy</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    
    '<!-- Theme switcher -->' +
    '<div class="cc-theme-switcher">' +
      '<button class="cc-theme-btn ' + (!isDark ? 'active' : '') + '" id="ccBtnLight">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:4px"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>' +
        'Sáng' +
      '</button>' +
      '<button class="cc-theme-btn ' + (isDark ? 'active' : '') + '" id="ccBtnDark">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:4px"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' +
        'Tối' +
      '</button>' +
    '</div>' +
    
    // Transparency (Opacity) slider
    '<div class="cc-control-row">' +
      '<div class="cc-control-label">' +
        '<span>Trong suốt (Liquid Glass)</span>' +
        '<span id="lblOpacity">' + Math.round(currentTrans * 100) + '%</span>' +
      '</div>' +
      '<div class="cc-slider-wrap">' +
        '<input type="range" min="0.1" max="0.9" step="0.05" value="' + currentTrans + '" class="cc-slider" id="sldOpacity">' +
      '</div>' +
    '</div>' +
    
    // Canvas Background Effect Opacity slider
    '<div class="cc-control-row">' +
      '<div class="cc-control-label">' +
        '<span>Độ rõ hiệu ứng nền (Effect)</span>' +
        '<span id="lblCanvasOpacity">' + Math.round(currentCanvasOpacity * 100) + '%</span>' +
      '</div>' +
      '<div class="cc-slider-wrap">' +
        '<input type="range" min="0.05" max="0.8" step="0.05" value="' + currentCanvasOpacity + '" class="cc-slider" id="sldCanvasOpacity">' +
      '</div>' +
    '</div>' +
    
    // Blur slider
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
    capNhatNutTheme();
    
    // Cập nhật màu accent theo theme
    var activeColor = localStorage.getItem('vm-accent') || 'blue';
    apdungMauAccent(document.documentElement, activeColor, theme === 'dark');
    try { window.dispatchEvent(new Event('theme-change')); } catch (e) {}
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
  
  // Slider Canvas Opacity
  var sldCanvasOpacity = $('sldCanvasOpacity');
  var lblCanvasOpacity = $('lblCanvasOpacity');
  sldCanvasOpacity.addEventListener('input', function() {
    var val = sldCanvasOpacity.value;
    lblCanvasOpacity.textContent = Math.round(val * 100) + '%';
    document.documentElement.style.setProperty('--canvas-opacity', val);
    localStorage.setItem('vm-canvas-opacity', val);
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
      try { window.dispatchEvent(new Event('theme-change')); } catch (e) {}
    });
  });
}

/* ---------- 7. TRỢ LÝ AI HỌC TẬP (GEMINI) ---------- */
window.VM_AI_SETTINGS = {
  enabled: false,
  key: ''
};

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
  var enabled = window.VM_AI_SETTINGS.enabled && window.VM_AI_SETTINGS.key;
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
    '<div class="acb-footer">' +
      '<input type="text" id="aiChatInput" placeholder="Nhập câu hỏi của em...">' +
      '<button class="btn btn-primary btn-sm" id="aiChatSend">Gửi</button>' +
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
  if (!text) return;
  
  var userMsg = document.createElement('div');
  userMsg.className = 'acb-msg user';
  userMsg.textContent = text;
  body.appendChild(userMsg);
  inp.value = '';
  cuonXuongChat();
  
  var typing = document.createElement('div');
  typing.className = 'acb-typing';
  typing.id = 'aiChatTyping';
  typing.innerHTML = '<span></span><span></span><span></span>';
  body.appendChild(typing);
  cuonXuongChat();
  
  aiChatHistory.push({ role: 'user', parts: [{ text: text }] });
  
  var lessonTitle = 'Bài giảng';
  var pageH1 = document.querySelector('.lh-header h1, h1');
  if (pageH1) lessonTitle = pageH1.textContent.trim();
  
  var systemPrompt = '';
  var pathname = window.location.pathname;
  if (pathname.indexOf('bai-hoc.html') !== -1) {
    systemPrompt = "Bạn là trợ lý AI hướng dẫn học tập tại Lớp Toán Thầy Vinh (VinhMath). Bạn đang hỗ trợ học sinh học trực tuyến chuyên đề: '" + lessonTitle + "'. Hãy trả lời ngắn gọn, có tính sư phạm cao, định hướng cách giải thay vì giải hộ hoàn toàn. Các công thức toán hãy viết theo định dạng LaTeX kẹp trong dấu $...$ (nếu cùng dòng) hoặc $$...$$ (nếu xuống dòng) để hiển thị chuyên nghiệp.";
  } else {
    systemPrompt = "Bạn là trợ lý AI hướng dẫn học tập tại Lớp Toán Thầy Vinh (VinhMath). Bạn đang ở trang chủ/trang giới thiệu để hỗ trợ học sinh sử dụng website vinhmath.com hiệu quả. Các mục chính của web gồm: Lớp học (học video bài giảng, lý thuyết), Luyện đề (làm đề tự chấm), Tài liệu (tải tài liệu học tập), Bảng vàng (xem thành tích của bạn học sinh). Hãy trả lời ngắn gọn, thân thiện, và định hướng học sinh.";
  }
  
  try {
    var apiKey = window.VM_AI_SETTINGS.key ? window.VM_AI_SETTINGS.key.trim() : '';
    var isPlaceholder = (apiKey === 'NHAP_GEMINI_KEY_TAI_DAY' || apiKey === '');
    
    var tEl = document.getElementById('aiChatTyping');
    
    if (isPlaceholder) {
      if (tEl) tEl.remove();
      var aiMsg = document.createElement('div');
      aiMsg.className = 'acb-msg ai';
      var isAdminUser = !!document.getElementById('ccAdminControls');
      if (isAdminUser) {
        aiMsg.innerHTML = '<strong>Sếp ơi!</strong> Gemini API Key hiện tại chưa được cấu hình (vẫn là placeholder <code>NHAP_GEMINI_KEY_TAI_DAY</code>). Sếp vui lòng mở <strong>Trung tâm điều khiển (Control Center)</strong> ở góc trên thanh menu (biểu tượng thanh gạt 🎛️), nhập API Key thực tế và nhấn <strong>Lưu</strong> nhé!';
      } else {
        aiMsg.textContent = 'Hệ thống Trợ lý AI đang được bảo trì để nâng cấp. Em vui lòng quay lại hỏi đáp sau nhé!';
      }
      body.appendChild(aiMsg);
      cuonXuongChat();
      return;
    }

    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
    
    var response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: aiChatHistory,
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        }
      })
    });
    
    var data = await response.json();
    var reply = '';
    var isHtml = false;
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
      reply = data.candidates[0].content.parts[0].text;
    } else {
      console.error("Gemini API error response:", data);
      var isAdminUser = !!document.getElementById('ccAdminControls');
      if (data.error) {
        if (isAdminUser) {
          reply = '<strong>Lỗi Gemini API (Chỉ hiển thị với Admin):</strong> ' + (data.error.message || JSON.stringify(data.error)) + '<br><br>Sếp vui lòng kiểm tra lại tính chính xác của Gemini API Key trong Trung tâm điều khiển (Control Center) nhé!';
          isHtml = true;
        } else {
          reply = 'Xin lỗi em, có lỗi xảy ra khi kết nối với máy chủ AI. Em vui lòng thử lại sau nhé.';
        }
      } else {
        reply = 'Xin lỗi em, có lỗi xảy ra khi kết nối với máy chủ AI. Em vui lòng thử lại sau nhé.';
      }
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
    
    if (data.candidates && data.candidates[0]) {
      aiChatHistory.push({ role: 'model', parts: [{ text: reply }] });
    }
    
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([aiMsg]).catch(function(e) { console.error("MathJax error:", e); });
    }
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
      '<div class="cc-input-group">' +
        '<input type="password" id="ccInputGeminiKey" value="' + key + '" placeholder="Nhập API Key...">' +
        '<button class="btn btn-primary btn-sm" id="ccBtnSaveAIKey">Lưu</button>' +
      '</div>' +
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
  
  var btnSave = document.getElementById('ccBtnSaveAIKey');
  btnSave.addEventListener('click', async function() {
    var inp = document.getElementById('ccInputGeminiKey');
    var val = inp.value.trim();
    btnSave.disabled = true;
    var oldText = btnSave.textContent;
    btnSave.textContent = '⏳';
    try {
      var r = await sb.from('app_settings').upsert({ key: 'gemini_api_key', value: val });
      if (r.error) throw r.error;
      alert("Đã lưu Gemini API Key thành công!");
    } catch (err) {
      alert("Lỗi lưu API Key: " + err.message);
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = oldText;
    }
  });
}

// Khởi chạy các dịch vụ khi DOM sẵn sàng
if (document.readyState !== 'loading') {
  khoiTaoControlCenter();
  capNhatNutTheme();
  tailaiCaiDatAI().then(dangKyRealtimeAI);
  
  // Tự động kiểm tra vai trò admin để vẽ thêm cài đặt AI
  (async function() {
    if (!daKetNoi()) return;
    try {
      var s = await sb.auth.getSession();
      if (!s.data.session) return;
      var rp = await sb.from('profiles').select('role').eq('id', s.data.session.user.id).single();
      if (rp.data && rp.data.role === 'admin') {
        themAdminControlsVaoCC();
      }
    } catch (e) { console.error("Lỗi CC Admin check:", e); }
  })();
} else {
  document.addEventListener('DOMContentLoaded', function () {
    khoiTaoControlCenter();
    capNhatNutTheme();
    tailaiCaiDatAI().then(dangKyRealtimeAI);
    
    (async function() {
      if (!daKetNoi()) return;
      try {
        var s = await sb.auth.getSession();
        if (!s.data.session) return;
        var rp = await sb.from('profiles').select('role').eq('id', s.data.session.user.id).single();
        if (rp.data && rp.data.role === 'admin') {
          themAdminControlsVaoCC();
        }
      } catch (e) { console.error("Lỗi CC Admin check:", e); }
    })();
  });
}

