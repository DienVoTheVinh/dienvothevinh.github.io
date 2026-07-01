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
  if (daKetNoi()) await sb.auth.signOut();
  window.location.href = 'dang-nhap';
}

// Lấy hồ sơ (họ tên, vai trò, lớp) của người đang đăng nhập
async function layHoSo() {
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
      .select('id, role, username, full_name, class_id, class_students(class_id, classes(name, mode))')
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
function vmApDungThuongHieuMAP(isMap) {
  try {
    document.body.classList.toggle('theme-map', !!isMap);

    // Logo chìm toàn cục
    var wm = document.getElementById('mapWatermarkGlobal');
    if (!wm) {
      wm = document.createElement('img');
      wm.id = 'mapWatermarkGlobal';
      wm.src = 'logo/CLB-MAP-logo.png';
      wm.alt = '';
      document.body.appendChild(wm);
    }

    // Đổi logo + tên thương hiệu trên thanh điều hướng
    var logoEl = document.querySelector('.topbar .logo') || document.querySelector('.logo');
    if (logoEl) {
      var img = logoEl.querySelector('img');
      if (img) img.src = isMap ? 'logo/CLB-MAP-logo.png' : 'img/logo.png';
      // tìm text node chứa tên thương hiệu (VinhMath) và đổi
      for (var i = 0; i < logoEl.childNodes.length; i++) {
        var n = logoEl.childNodes[i];
        if (n.nodeType === 3 && n.textContent && n.textContent.trim()) {
          n.textContent = isMap ? ' CLB M.A.P ' : ' VinhMath ';
          break;
        }
      }
    }
  } catch (e) { /* im lặng */ }
}
