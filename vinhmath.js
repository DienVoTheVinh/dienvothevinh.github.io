// ============================================================
// VINHMATH — BỘ NÃO DÙNG CHUNG CỦA MỌI TRANG
// Lo 4 việc: (1) chế độ sáng/tối, (2) kết nối Supabase,
// (3) đăng nhập/đăng xuất, (4) chặn trang dành riêng cho người đã đăng nhập.
// File này là JS thuần — không cần build, mở file là chạy.
// ============================================================

/* ---------- 1. CHẾ ĐỘ SÁNG / TỐI ---------- */
function toggleTheme() {
  var h = document.documentElement;
  var dark = h.getAttribute('data-theme') === 'dark';
  h.setAttribute('data-theme', dark ? 'light' : 'dark');
  var btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = dark ? '🌙' : '☀️';
  try { localStorage.setItem('vm-theme', dark ? 'light' : 'dark'); } catch (e) {}
}
(function () { // áp dụng lựa chọn đã lưu ngay khi trang mở
  try {
    if (localStorage.getItem('vm-theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('themeBtn');
        if (btn) btn.textContent = '☀️';
      });
    }
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
