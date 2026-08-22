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
const rankSystem = read('js/rank-system.js');
const rankCss = read('css/rank-system.css');
const rankMigration = read('supabase/migrations/20260822204228_student_rank_progression.sql');
const lessonPage = read('bai-hoc.html');
const practicePage = read('luyen-de.html');
const gradingPage = read('quan-tri-cham-bai.html');
const leaderboardPage = read('bang-vang.html');
const assessmentMigration = read('supabase/migrations/20260822192813_add_submission_assessment_level.sql');

for (const file of ['js/menu-v5.js', 'js/vinhmath.js', 'js/role-home.js', 'js/student-results.js', 'js/student-achievement-map.js', 'js/rank-system.js']) {
  new vm.Script(read(file), {filename:file});
}

const todoInstrumented = home.replace(/\}\)\(\);\s*$/, 'window.__vmTodoTest={buildStudentTodos:buildStudentTodos,todoDue:todoDue};})();');
const todoSandbox = {window:{}, document:{readyState:'loading', addEventListener(){}}, console};
new vm.Script(todoInstrumented, {filename:'js/role-home.todo-test.js'}).runInNewContext(todoSandbox);
const dateKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
const today = new Date();
const todoOrder = todoSandbox.window.__vmTodoTest.buildStudentTodos({lessons:[], tasks:[
  {kind:'lesson',lesson_id:'lesson',title:'Bài giảng',class_name:'Lớp 9'},
  {kind:'btvn',lesson_id:'homework',title:'Bài tập',class_name:'Lớp 9'},
  {kind:'test',lesson_id:'test',title:'Kiểm tra',class_name:'Lớp 9'},
  {kind:'review',lesson_id:'review',title:'Bài đã chấm',class_name:'Lớp 9'}
], reminders:[
  {id:'today',content:'Việc hôm nay',due_date:dateKey(today),done:false},
  {id:'late',content:'Việc quá hạn',due_date:dateKey(yesterday),done:false}
]}, {class_students:[]}).map((item) => item.id);
expect(todoOrder[0] === 'todo-reminder-late' && todoOrder[1] === 'todo-reminder-today' && todoOrder[2] === 'todo-task-review-review', 'Thứ tự Cần làm phải ưu tiên quá hạn, hôm nay rồi bài đã chấm cần xem lại');

for (const item of [
  "path: 'trang-chu', label: 'Hôm nay'",
  "path: 'lop-hoc', label: 'Lớp học'",
  "path: 'luyen-de', label: 'Luyện tập'",
  "path: 'ket-qua', label: 'Kết quả'",
  "path: 'bang-vang', label: 'Bảng xếp hạng'",
  "path: 'ca-nhan', label: 'Cá nhân'"
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
expect(homePage.includes('css/role-home.css?v=6') && homePage.includes('js/role-home.js?v=7'), 'Trang Hôm nay phải nạp phiên bản việc cần làm và cấp bậc mới nhất');
expect(homeCss.includes('@media(max-width:900px)') && homeCss.includes('.vm-student-side{display:contents}') && homeCss.includes('.vm-student-live-slot{order:-2}') && homeCss.includes('.vm-student-main-card{order:-1}'), 'Khi trang Hôm nay xếp dọc, Google Meet phải đứng trước dòng cập nhật học tập');
expect(home.includes("sb.rpc('hs_ho_so')") && home.includes("sb.rpc('get_my_reminders')"), 'Dòng cập nhật phải dùng nguồn nhiệm vụ và nhắc nhở hiện có của học sinh');
expect(home.includes('buildStudentTodos(snapshot, profile)') && home.includes('data-feed-filter="todo"') && home.includes('vmStudentTodoCount'), 'Dòng cập nhật thiếu mục Cần làm gọn kèm số lượng');
expect(home.includes("var vmStudentFeedFilter = 'todo'") && !home.includes('data-feed-filter="all"'), 'Dòng cập nhật phải mặc định Cần làm và không còn tab Tất cả');
expect(home.includes("priority:0, label:'Quá hạn") && home.includes("priority:1, label:'Hôm nay'") && home.includes("priority:2, label:'Ngày mai'"), 'Việc cần làm chưa được sắp theo hạn ưu tiên');
expect(homePage.includes('if (window._nvData && !window._nvData.error) r = { data: window._nvData }'), 'Trang Hôm nay không được gọi lặp RPC hồ sơ khi đã có dữ liệu nhiệm vụ');
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
expect(!results.includes('&action=graded&kind=') && results.includes('Toàn bộ điểm, nhận xét và file sửa được xem ngay tại đây'), 'Trang Kết quả phải xem đầy đủ tại chỗ, không dẫn ngược sang bài giảng');
expect(resultsPage.includes('studentResultClassFilter') && resultsPage.includes('studentResultGradeFilter') && results.includes('populateScopes()'), 'Trang Kết quả thiếu lọc theo lớp và khối');
expect(results.includes('assessment_level') && results.includes("needs_improvement") && results.includes("meets") && results.includes("good"), 'Trang Kết quả thiếu ba mức đánh giá');
expect(results.includes('student-result-pdf') && results.includes('<iframe'), 'PDF bài sửa phải xem được ngay trong Kết quả');
expect(results.includes("url.protocol === 'https:' || url.protocol === 'http:'"), 'Tệp bài sửa phải chặn giao thức URL không an toàn');
expect(results.includes("replace(/[&<>\"']/g"), 'Dữ liệu kết quả phải được escape trước khi render');
expect(experienceCss.includes('width:min(1180px,calc(100% - 40px))') && experienceCss.includes('margin-inline:auto!important'), 'Trang Kết quả phải căn giữa trên màn hình rộng');
expect(experienceCss.includes('.student-result-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto!important'), 'Hộp chi tiết kết quả phải nằm giữa viewport');
expect(achievementsPage.includes('Bản đồ cấp bậc VinhMath') && achievementsPage.includes('aria-label="Bản đồ 44 cấp bậc"'), 'Thiếu bản đồ 44 cấp bậc');
expect(achievements.includes('VMRank.majors.map') && achievements.includes('VMRank.medals.map') && achievements.includes('companionSanctuary'), 'Bản đồ phải dựng đủ 11 đại cấp, 4 huy chương và khu linh thú');
expect(rankSystem.includes("sb.rpc('student_rank_snapshot')") && rankSystem.includes("sb.rpc('companion_snapshot')"), 'Hệ cấp bậc phải tải ảnh chụp riêng theo người dùng');
expect(rankSystem.indexOf("sb.rpc('hs_ho_so')") < rankSystem.indexOf("sb.rpc('student_rank_snapshot')"), 'XP phải được làm mới trước khi tính cấp bậc');
expect(rankSystem.includes("data.id==='guest'") && rankSystem.includes("sb.rpc('choose_companion_egg'"), 'Chọn trứng phải chỉ hoạt động với học sinh đã xác thực');
expect(rankCss.includes('prefers-reduced-motion:reduce') && rankCss.includes('.vm-companion-dock'), 'Hiệu ứng linh thú phải tôn trọng chế độ giảm chuyển động');
expect(rankMigration.includes('rank_level_from_xp') && rankMigration.includes("score >= 8") && rankMigration.includes('student_companion_state'), 'Migration thiếu ánh xạ 44 cấp, ngưỡng đột phá hoặc trạng thái linh thú');
expect(lessonPage.includes('[data-reader-key]:fullscreen') && lessonPage.includes('[data-reader-key]:-webkit-full-screen'), 'Tài liệu toàn màn hình phải thoát khỏi kích thước cột chia đôi');
expect(practicePage.includes('Bài tập & kiểm tra trong bài giảng') && practicePage.includes('Đề thi & thi thử') && practicePage.includes('Tất cả các lớp'), 'Luyện tập phải hợp nhất bài tập, kiểm tra, đề thi và có phạm vi mọi lớp');
expect(practicePage.includes("vmPracticeFilter = 'all'") && practicePage.includes("kind:'homework'") && practicePage.includes("kind:'test'"), 'Luyện tập thiếu phân loại bài tập và bài kiểm tra');
expect(gradingPage.includes('assessment_level') && gradingPage.includes('Cần cố gắng') && gradingPage.includes('Không dùng mức'), 'Màn chấm bài thiếu chế độ đánh giá ba mức có thể bỏ chọn');
expect(gradingPage.includes("sb.rpc('staff_rank_breakthrough_queue')") && gradingPage.includes("sb.rpc('review_rank_breakthrough'") && gradingPage.includes('Từ 8/10 hệ thống tự mở đại cấp mới'), 'Màn chấm bài thiếu hàng đợi và phê duyệt kiểm tra đột phá');
expect(leaderboardPage.includes("sb.rpc('get_ranked_leaderboard'") && leaderboardPage.includes('VMRank.rankPill'), 'Bảng xếp hạng chưa dùng cấp bậc và hào quang mới');
expect(assessmentMigration.includes('add column if not exists assessment_level text') && assessmentMigration.includes('submissions_assessment_level_check') && assessmentMigration.includes("'needs_improvement', 'meets', 'good'"), 'Migration đánh giá mức phải cộng thêm, idempotent và có CHECK constraint');
expect(!/service_role|SUPABASE_SERVICE_ROLE_KEY|postgres(?:ql)?:\/\//i.test([menu, shared, home, classPage, personal, resultsPage, results].join('\n')), 'Mã giao diện không được chứa credential đặc quyền');

console.log('PASS student experience: compact PWA, focused home/class, personal hub and private graded results');
