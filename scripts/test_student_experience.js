const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (value, message) => { if (!value) throw new Error(message); };

const menu = read('js/menu-v5.js');
const shared = read('js/vinhmath.js');
const homePage = read('trang-chu.html');
const home = read('js/role-home.js');
const homeCss = read('css/role-home.css');
const classPage = read('lop-hoc.html');
const experienceCss = read('css/student-experience.css');
const personal = read('ca-nhan.html');
const resultsPage = read('ket-qua.html');
const results = read('js/student-results.js');
const achievementsPage = read('thanh-tuu.html');
const achievements = read('js/student-achievement-map.js');
const lessonPage = read('bai-hoc.html');

for (const file of ['js/menu-v5.js', 'js/vinhmath.js', 'js/role-home.js', 'js/student-results.js', 'js/student-achievement-map.js']) {
  new vm.Script(read(file), {filename:file});
}

for (const item of [
  "path: 'trang-chu', label: 'Hôm nay'",
  "path: 'lop-hoc', label: 'Lớp học'",
  "path: 'luyen-de', label: 'Luyện tập'",
  "path: 'ket-qua', label: 'Kết quả'",
  "path: 'ca-nhan', label: 'Trang cá nhân'"
]) expect(menu.includes(item), `Thiếu mục điều hướng học sinh: ${item}`);
expect(!/MENU CỦA HỌC SINH[\s\S]{0,900}type:\s*'dropdown'/.test(menu), 'Menu học sinh không được giấu công cụ trong dropdown dài');
expect(menu.includes("sessionStorage.getItem('vm-guest-mode') === 'true'") && menu.includes("apDungMenu('student', null)"), 'Chế độ trải nghiệm phải hiển thị đủ menu học sinh mới');

expect(shared.includes("tools.insertBefore(btn, themeBtn)"), 'Nút cài ứng dụng nội bộ phải nằm cạnh nút sáng/tối');
expect(shared.includes("attributeFilter: ['style', 'class', 'open']"), 'Đóng native dialog phải gỡ khóa cuộn của trang');
expect(shared.includes("m.target.tagName === 'DIALOG'") && shared.includes('boPopupMo(m.target)'), 'Native dialog đã đóng phải được loại khỏi danh sách popup đang mở');
expect(home.includes('hideInternalInstallPanel()') && homeCss.includes('#vmInstallHero'), 'Banner cài đặt lớn phải được ẩn sau đăng nhập');
expect(home.includes('Cập nhật học tập mới nhất') && home.includes('vmStudentLatest') && home.includes('vmStudentLiveSlot'), 'Trang Hôm nay chưa có dòng cập nhật học tập tập trung');
expect(home.includes("type:'lesson'") && home.includes("type:'homework'") && home.includes("type:'test'"), 'Dòng cập nhật phải hợp nhất bài giảng, bài tập và bài kiểm tra');
expect(!homePage.includes('selActiveLop') && !homePage.includes('LỚP ĐANG XEM'), 'Trang Hôm nay không được render lại bộ chọn lớp cũ');
expect(!home.includes('activeClass(profile)') && !home.includes('Lớp học của em'), 'Trang Hôm nay không được phụ thuộc bộ chọn một lớp');
expect(homePage.includes('css/role-home.css?v=5'), 'Trang Hôm nay phải nạp phiên bản responsive mới nhất');
expect(homeCss.includes('@media(max-width:900px)') && homeCss.includes('.vm-student-side{display:contents}') && homeCss.includes('.vm-student-live-slot{order:-2}') && homeCss.includes('.vm-student-main-card{order:-1}'), 'Khi trang Hôm nay xếp dọc, Google Meet phải đứng trước dòng cập nhật học tập');
expect(home.includes(".eq('student_id', profile.id).eq('status', 'graded')"), 'Số bài đã chấm phải chỉ đếm của học sinh hiện tại');
for (const oldBlock of ['#khungVaoHocNgay', '#khungNhiemVu', '#khungThongKeHocSinh']) {
  expect(homeCss.includes(oldBlock), `Khối trang chủ trùng lặp chưa được thu gọn: ${oldBlock}`);
}

expect(classPage.includes('student-meet-strip'), 'Google Meet chưa được thu gọn ở đầu trang lớp');
expect(classPage.includes('student-class-layout') && classPage.includes('student-lesson-main') && classPage.includes('student-class-rail'), 'Trang lớp thiếu bố cục bài giảng trung tâm và rail phụ');
expect(classPage.includes('<div hidden aria-hidden="true"><span id="tkDiem">'), 'Thống kê cũ phải ẩn nhưng vẫn giữ tương thích mã tải dữ liệu');
expect(experienceCss.includes('.student-lesson-main{order:1') && experienceCss.includes('.student-class-rail{order:2'), 'Trên di động bài giảng phải xuất hiện trước thông tin phụ');

for (const href of ['lich-hoc', 'tai-lieu', 'goc-tu-hoc', 'bang-vang', 'blog', 'ket-qua']) {
  expect(personal.includes(`href="${href}"`), `Trang cá nhân thiếu công cụ: ${href}`);
}
expect(personal.includes('href="thanh-tuu"'), 'Trang cá nhân thiếu lối vào Bản đồ thành tựu');
expect(personal.includes("profileData.role === 'student'") && personal.includes('personalHub.hidden = false'), 'Hub cá nhân chỉ được mở đúng cho học sinh');

expect(resultsPage.includes('Bài giáo viên đã chấm') && resultsPage.includes('data-filter="corrected"'), 'Trang Kết quả thiếu danh sách hoặc lọc file sửa');
expect(results.includes(".eq('student_id', profile.id)") && results.includes(".eq('status', 'graded')"), 'Truy vấn kết quả phải khóa vào học sinh hiện tại và trạng thái đã chấm');
expect(results.includes("sessionStorage.getItem('vm-guest-mode') === 'true'"), 'Chế độ trải nghiệm phải có kết quả minh họa mà không đọc dữ liệu thật');
expect(results.includes("item.lesson_id") && results.includes("&action=graded&kind=") && results.includes("&submission="), 'Trang Kết quả thiếu deep link chính xác vào bài đã chấm');
expect(results.includes("url.protocol === 'https:' || url.protocol === 'http:'"), 'Tệp bài sửa phải chặn giao thức URL không an toàn');
expect(results.includes("replace(/[&<>\"']/g"), 'Dữ liệu kết quả phải được escape trước khi render');
expect(experienceCss.includes('width:min(1180px,calc(100% - 40px))') && experienceCss.includes('margin-inline:auto!important'), 'Trang Kết quả phải căn giữa trên màn hình rộng');
expect(experienceCss.includes('.student-result-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto!important'), 'Hộp chi tiết kết quả phải nằm giữa viewport');
expect(achievementsPage.includes('Bản đồ thành tựu') && achievementsPage.includes('achievementMap'), 'Thiếu trang Bản đồ thành tựu');
expect(achievements.includes("sb.rpc('hs_ho_so')") && achievements.includes('for (var offset = 0; offset < 6; offset++)'), 'Bản đồ phải dùng level hiện có và dựng đủ các cột mốc');
expect(lessonPage.includes('[data-reader-key]:fullscreen') && lessonPage.includes('[data-reader-key]:-webkit-full-screen'), 'Tài liệu toàn màn hình phải thoát khỏi kích thước cột chia đôi');
expect(!/service_role|SUPABASE_SERVICE_ROLE_KEY|postgres(?:ql)?:\/\//i.test([menu, shared, home, classPage, personal, resultsPage, results].join('\n')), 'Mã giao diện không được chứa credential đặc quyền');

console.log('PASS student experience: compact PWA, focused home/class, personal hub and private graded results');
