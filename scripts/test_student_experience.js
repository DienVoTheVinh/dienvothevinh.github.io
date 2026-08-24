const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (value, message) => { if (!value) throw new Error(message); };

const menu = read('js/menu-v5.js');
const shared = read('js/vinhmath.js');
const tokens = read('css/tokens.css');
const vinhCss = read('css/vinhmath.css');
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
  "path: 'lop-hoc', label: 'Bài học'",
  "path: 'luyen-de', label: 'Bài tập'",
  "path: 'ket-qua', label: 'Kết quả'",
  "path: 'ca-nhan', label: 'Cá nhân'"
]) expect(menu.includes(item), `Thiếu mục điều hướng học sinh: ${item}`);
expect(menu.includes("type: 'dropdown', label: 'Thêm'") && menu.includes("path: 'bang-vang', label: '🏆 Bảng xếp hạng'") && menu.includes("path: 'vmtool', label: '🧰 VMTool'"), 'Menu học sinh phải giữ BXH và VMTool trong nhóm Thêm gọn');
expect(menu.includes("sessionStorage.getItem('vm-guest-mode') === 'true'") && menu.includes("apDungMenu('student', null)"), 'Chế độ trải nghiệm phải hiển thị đủ menu học sinh mới');
expect(menu.includes("if (!role || role === 'student') return"), 'Thanh công cụ học sinh phải bỏ nhãn vai trò trùng lặp');

expect(shared.includes("tools.insertBefore(btn, themeBtn)"), 'Nút cài ứng dụng nội bộ phải nằm cạnh nút sáng/tối');
expect(shared.includes("var isCanonicalVinhMath = preset === 'vinhmath' && isCanonicalPreset") && shared.includes('if (isBrandRecord && !isCanonicalVinhMath) vmApDungBienThuongHieu(theme)'), 'Thương hiệu VinhMath gốc không được nhận màu tùy biến từ kho template');
expect(shared.includes("img.src = isCanonicalVinhMath ? 'img/logo.png' : vmUrlLogoThuongHieu(theme)"), 'Thương hiệu VinhMath gốc phải luôn dùng lại logo vàng–đen chuẩn');
expect(shared.includes("brandSlug === preset") && shared.includes("brandTextEl.innerHTML = '<span class=\"brand-vinh\"") && shared.includes('<span class="brand-math"'), 'Wordmark VinhMath gốc phải giữ hai phần vàng–đen, còn template khác vẫn tùy biến');
expect(shared.includes("attributeFilter: ['style', 'class', 'open']"), 'Đóng native dialog phải gỡ khóa cuộn của trang');
expect(shared.includes("m.target.tagName === 'DIALOG'") && shared.includes('boPopupMo(m.target)'), 'Native dialog đã đóng phải được loại khỏi danh sách popup đang mở');
expect(home.includes('hideInternalInstallPanel()') && homeCss.includes('#vmInstallHero'), 'Banner cài đặt lớn phải được ẩn sau đăng nhập');
expect(home.includes('Cập nhật học tập mới nhất') && home.includes('vmStudentLatest') && home.includes('vmStudentLiveSlot'), 'Trang Hôm nay chưa có dòng cập nhật học tập tập trung');
expect(home.includes("type:'lesson'") && home.includes("type:'homework'") && home.includes("type:'test'"), 'Dòng cập nhật phải hợp nhất bài giảng, bài tập và bài kiểm tra');
expect(!homePage.includes('selActiveLop') && !homePage.includes('LỚP ĐANG XEM'), 'Trang Hôm nay không được render lại bộ chọn lớp cũ');
expect(!home.includes('activeClass(profile)') && !home.includes('Lớp học của em'), 'Trang Hôm nay không được phụ thuộc bộ chọn một lớp');
expect(homePage.includes('css/role-home.css?v=9') && homePage.includes('js/role-home.js?v=10'), 'Trang Hôm nay phải nạp phiên bản học online, việc cần làm và cấp bậc mới nhất');
expect(homePage.includes('vmStudentClockTime') && home.includes("timeZone: 'Asia/Ho_Chi_Minh'") && home.includes("['khungMeetHoc', 'khungDiemDanhHoc']"), 'Trang Hôm nay phải có đồng hồ Việt Nam và đặt Google Meet trước điểm danh');
expect(homeCss.includes('grid-template-areas:"main live" "main side"') && homeCss.includes('.vm-meet-clock') && homeCss.includes('.vm-meet-session-context'), 'Desktop phải đặt việc cần làm bên trái, Google Meet bên phải và có lịch học rõ ràng');
expect(homePage.includes('<small>LỊCH HỌC</small><b>Buổi học sắp tới</b>') && !homePage.includes('GIỜ VIỆT NAM') && homePage.includes('vm-meet-schedule-panel'), 'Đồng hồ phải nằm gọn trong vùng lịch học và không còn nhãn giờ Việt Nam');
expect(homePage.includes('vm-meet-teacher') && homePage.includes('vm-meet-class') && homePage.includes('escMeet'), 'Mỗi buổi online phải nêu rõ lớp và giáo viên, đồng thời escape dữ liệu');
expect(homeCss.includes('@media(max-width:900px)') && homeCss.includes('.vm-student-side{display:contents}') && homeCss.includes('.vm-student-live-slot{order:-2}') && homeCss.includes('.vm-student-main-card{order:-1}'), 'Khi trang Hôm nay xếp dọc, Google Meet phải đứng trước dòng cập nhật học tập');
expect(rankSystem.includes('vm-rank-home-heading') && !rankSystem.includes('vm-rank-home-icon') && rankCss.includes('min-height:76px'), 'Dải cảnh giới phải gọn và không còn ô biểu tượng ngôi sao lớn');
expect(home.includes("sb.rpc('hs_ho_so')") && home.includes("sb.rpc('get_my_reminders')"), 'Dòng cập nhật phải dùng nguồn nhiệm vụ và nhắc nhở hiện có của học sinh');
expect(home.includes('buildStudentTodos(snapshot, profile)') && home.includes('data-feed-filter="todo"') && home.includes('vmStudentTodoCount'), 'Dòng cập nhật thiếu mục Cần làm gọn kèm số lượng');
expect(home.includes('renderStudentPriority()') && home.includes('NÊN LÀM TRƯỚC') && homeCss.includes('.vm-student-priority'), 'Trang Hôm nay phải nêu rõ một việc ưu tiên nhưng vẫn giữ dòng cập nhật đầy đủ');
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

expect(resultsPage.includes('Kết quả & lời giải') && resultsPage.includes('data-filter="corrected"'), 'Trang Kết quả thiếu danh sách lời giải hoặc lọc file sửa');
expect(results.includes(".eq('student_id', profile.id)") && results.includes(".not('submitted_at', 'is', null)"), 'Truy vấn kết quả phải khóa vào học sinh hiện tại và chỉ lấy bài đã nộp');
expect(results.includes("from('lesson_latex_sources')") && results.includes(".eq('has_solution', true)") && results.includes('showSolutions:true'), 'Trang Kết quả phải tải lời giải LaTeX đã được RLS mở quyền');
expect(results.includes("item.status === 'graded' || hasUnlockedSolution(item)"), 'Kết quả phải hiện bài đã chấm hoặc bài đã nộp có lời giải');
expect(results.includes("sessionStorage.getItem('vm-guest-mode') === 'true'"), 'Chế độ trải nghiệm phải có kết quả minh họa mà không đọc dữ liệu thật');
expect(!results.includes('&action=graded&kind=') && results.includes('Toàn bộ điểm, nhận xét, file sửa và lời giải đã mở được xem ngay tại đây'), 'Trang Kết quả phải xem đầy đủ tại chỗ, không dẫn ngược sang bài giảng');
expect(resultsPage.includes('studentResultClassFilter') && resultsPage.includes('studentResultGradeFilter') && results.includes('populateScopes()'), 'Trang Kết quả thiếu lọc theo lớp và khối');
expect(results.includes('assessment_level') && results.includes("needs_improvement") && results.includes("meets") && results.includes("good"), 'Trang Kết quả thiếu ba mức đánh giá');
expect(results.includes('student-result-pdf') && results.includes('<iframe'), 'PDF bài sửa phải xem được ngay trong Kết quả');
expect(results.includes("url.protocol === 'https:' || url.protocol === 'http:'"), 'Tệp bài sửa phải chặn giao thức URL không an toàn');
expect(results.includes("replace(/[&<>\"']/g"), 'Dữ liệu kết quả phải được escape trước khi render');
expect(experienceCss.includes('width:min(1180px,calc(100% - 40px))') && experienceCss.includes('margin-inline:auto!important'), 'Trang Kết quả phải căn giữa trên màn hình rộng');
expect(experienceCss.includes('.student-result-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto!important'), 'Hộp chi tiết kết quả phải nằm giữa viewport');
expect(achievementsPage.includes('Bản đồ cảnh giới VinhMath') && achievementsPage.includes('aria-label="Bản đồ 11 cảnh giới và 44 huy chương"'), 'Thiếu Bản đồ cảnh giới 44 huy chương');
expect(achievements.includes('VMRank.majors.map') && achievements.includes('VMRank.medals.map') && achievements.includes('companionSanctuary'), 'Bản đồ phải dựng đủ 11 cảnh giới, 4 huy chương và khu linh thú');
expect(achievements.includes('realm-landmark') && achievements.includes('renderRealmDetail') && achievements.includes('realm-route-progress'), 'Bản đồ phải là một địa hình liền mạch với địa danh và bảng chi tiết riêng');
expect(achievementsPage.includes('realm-map-layout') && achievementsPage.includes('id="realmDetail"') && achievementsPage.includes('css/rank-map.css?v=3') && achievementsPage.includes('js/student-achievement-map.js?v=4'), 'Trang cảnh giới phải nạp bố cục bản đồ mới và tài nguyên đã đổi phiên bản');
expect(achievementsPage.includes('Nhật ký hồ sơ học tập') && achievements.includes("from('rank_breakthrough_attempts')") && achievements.includes("from('submissions')") && achievements.includes("from('attempts')"), 'Hồ sơ hành trình phải dùng điểm, huy hiệu và lịch sử đột phá thật');
expect(rankSystem.includes("sb.rpc('student_rank_snapshot')") && rankSystem.includes("sb.rpc('companion_snapshot')"), 'Hệ cấp bậc phải tải ảnh chụp riêng theo người dùng');
expect(rankSystem.indexOf("sb.rpc('hs_ho_so')") < rankSystem.indexOf("sb.rpc('student_rank_snapshot')"), 'XP phải được làm mới trước khi tính cấp bậc');
expect(rankSystem.includes("{name:'Tân Thủ'") && rankSystem.includes("{name:'Kim Cương',icon:'💎'") && rankSystem.includes('vm-rank-medal-label'), 'Thanh công cụ phải dùng danh hiệu Tân Thủ và huy chương Kim Cương dạng biểu tượng');
expect(rankCss.includes('.vm-rank-pill.compact .vm-rank-medal-label{display:none}') && rankCss.includes('.vm-role-student .topbar .logo>.role-badge{display:none!important}'), 'CSS thanh công cụ chưa ẩn chữ huy chương hoặc nhãn Học sinh');
expect(rankSystem.includes("data.id==='guest'") && rankSystem.includes("sb.rpc('choose_companion_egg'"), 'Chọn trứng phải chỉ hoạt động với học sinh đã xác thực');
expect(rankCss.includes('prefers-reduced-motion:reduce') && rankCss.includes('.vm-companion-dock'), 'Hiệu ứng linh thú phải tôn trọng chế độ giảm chuyển động');
expect(rankMigration.includes('rank_level_from_xp') && rankMigration.includes("score >= 8") && rankMigration.includes('student_companion_state'), 'Migration thiếu ánh xạ 44 cấp, ngưỡng đột phá hoặc trạng thái linh thú');
expect(lessonPage.includes('[data-reader-key]:fullscreen') && lessonPage.includes('[data-reader-key]:-webkit-full-screen'), 'Tài liệu toàn màn hình phải thoát khỏi kích thước cột chia đôi');
expect(lessonPage.includes('Dùng toàn màn hình CSS riêng trong từng cửa sổ') && !/if \(!mobile && shell\.requestFullscreen\)/.test(lessonPage), 'Trình đọc phải tách toàn màn hình web và PWA, không dùng native fullscreen');
expect(lessonPage.includes('.vm-tex-kind-document .vm-tex-reader,.vm-tex-kind-test .vm-tex-reader { width:100%; max-width:none; }'), 'Tài liệu và bài kiểm tra LaTeX phải dùng hết bề ngang PC');
expect(lessonPage.includes('.theory-reading-container { width:100%; max-width:1520px;') && lessonPage.includes('.theory-reading-container > .vm-tex-reader { width:100%; max-width:none; }'), 'Phần đọc lý thuyết phải tận dụng bề ngang màn hình PC');
expect(lessonPage.includes('id="vmLessonJourney"') && lessonPage.includes('function vmCapNhatHanhTrinhBaiHoc()') && lessonPage.includes("vmChonBuocHanhTrinh(nextStep.key)"), 'Bài giảng phải có hành trình tuyến tính bổ sung trên các nút nội dung cũ');
expect(tokens.includes('--font-reading: "Be Vietnam Pro"') && vinhCss.includes('button,input,select,textarea,option{font-family:var(--font-sans)}'), 'Font giao diện và trình đọc phải hỗ trợ đầy đủ tiếng Việt');
expect(practicePage.includes('Bài tập & kiểm tra trong bài giảng') && practicePage.includes('Đề thi & thi thử') && practicePage.includes('Tất cả các lớp'), 'Luyện tập phải hợp nhất bài tập, kiểm tra, đề thi và có phạm vi mọi lớp');
expect(practicePage.includes('practice-shell has-class-filter') || (practicePage.includes("classList.add('has-class-filter')") && practicePage.includes('practice-class-filter')), 'Bộ lọc lớp trên PC phải nằm ở thanh bên trái');
expect(practicePage.includes('practice-specialized-tag') && !practicePage.includes('color:#B8860B;background:rgba(194,125,0,.16)'), 'Nhãn Chuyên phải có màu tương phản riêng');
expect(practicePage.includes("vmPracticeFilter = 'all'") && practicePage.includes("kind:'homework'") && practicePage.includes("kind:'test'"), 'Luyện tập thiếu phân loại bài tập và bài kiểm tra');
expect(gradingPage.includes('assessment_level') && gradingPage.includes('Cần cố gắng') && gradingPage.includes('Không dùng mức'), 'Màn chấm bài thiếu chế độ đánh giá ba mức có thể bỏ chọn');
expect(gradingPage.includes("sb.rpc('staff_rank_breakthrough_queue')") && gradingPage.includes("sb.rpc('review_rank_breakthrough'") && gradingPage.includes('Từ 8/10 hệ thống tự mở cảnh giới mới'), 'Màn chấm bài thiếu hàng đợi và phê duyệt kiểm tra đột phá');
expect(leaderboardPage.includes("sb.rpc('get_ranked_leaderboard'") && leaderboardPage.includes('VMRank.rankPill'), 'Bảng xếp hạng chưa dùng cấp bậc và hào quang mới');
expect(assessmentMigration.includes('add column if not exists assessment_level text') && assessmentMigration.includes('submissions_assessment_level_check') && assessmentMigration.includes("'needs_improvement', 'meets', 'good'"), 'Migration đánh giá mức phải cộng thêm, idempotent và có CHECK constraint');
expect(!/service_role|SUPABASE_SERVICE_ROLE_KEY|postgres(?:ql)?:\/\//i.test([menu, shared, home, classPage, personal, resultsPage, results].join('\n')), 'Mã giao diện không được chứa credential đặc quyền');

console.log('PASS student experience: compact PWA, focused home/class, personal hub and private graded results');
