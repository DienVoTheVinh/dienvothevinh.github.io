const fs = require('fs');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function expect(value, message) { if (!value) throw new Error(message); }

const lesson = read('bai-hoc.html');
const admin = read('quan-tri-lop.html');
const shared = read('js/vinhmath.js');

const detailSelect = lesson.match(/async function taiChiTietBaiHoc\(\)[\s\S]*?\.select\('([^']+)'\)/);
expect(detailSelect && detailSelect[1].includes('test_latex_content'), 'Lesson detail query must fetch the saved TeX test.');
expect(lesson.includes('function vmTrangThaiMoTest()'), 'Student test view must distinguish hidden, open and ended states.');
expect(lesson.includes("updates.test_deadline = new Date(now.getTime() + duration * 60000).toISOString()"), 'Timed activation must derive its deadline from the countdown.');
expect(lesson.includes("updates.test_late_policy = 'lock'"), 'Timed activation must close submissions when the countdown ends.');
expect(admin.includes('<option value="timed">Ca kiểm tra có đếm ngược</option>'), 'Teacher activation must offer a clear timed mode.');
expect(admin.includes('<option value="deadline">Mở tự do đến hạn đã chọn</option>'), 'Teacher activation must offer a separate deadline mode.');
expect(/var updates = \{ test_active: true \}/.test(admin), 'Teacher activation must actually grant student access.');
expect(/test_active: false,[\s\S]*test_started_at: null/.test(admin), 'Closing a test must revoke access and stop its timer.');

expect(shared.includes('window.pollerDiemDanhDangKhoiDong = true'), 'Profile loading must guard attendance poller startup.');
expect(shared.includes('if (window.pollerDiemDanhDangChay) return;'), 'Attendance polling must not overlap requests.');
expect(lesson.includes("'IntersectionObserver' in window"), 'Long PDFs must render lazily near the viewport.');
expect(lesson.includes('Math.min(1.75, window.devicePixelRatio || 1)'), 'PDF canvases must cap pixel density.');
expect(lesson.includes("fallbackToIframe('Tài liệu tải lâu hơn dự kiến')"), 'PDF loading must have a browser-viewer fallback.');

console.log('PASS lesson test delivery, timing modes and loading performance guards');
