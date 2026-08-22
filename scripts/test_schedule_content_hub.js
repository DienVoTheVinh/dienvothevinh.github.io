const fs = require('fs');
const vm = require('vm');

const read = (file) => fs.readFileSync(file, 'utf8');
const expect = (value, message) => { if (!value) throw new Error(message); };
const compileInline = (file) => {
  const html = read(file);
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]).filter((source) => source.trim())
    .forEach((source, index) => new vm.Script(source, { filename: `${file}#${index + 1}` }));
  return html;
};

const schedule = compileInline('quan-tri-lich.html');
const content = compileInline('quan-tri-tai-lieu.html');
const home = read('trang-chu.html');
const homeRoleCss = read('css/role-home.css');
const menu = read('js/menu-v5.js');
const examAdmin = read('js/exam-admin.js');
new vm.Script(menu, { filename: 'js/menu-v5.js' });
new vm.Script(examAdmin, { filename: 'js/exam-admin.js' });

expect(menu.includes("path: 'quan-tri-lich', label: 'Lịch'"), 'Admin navigation must expose schedule directly');
expect(home.includes('id="staffHomeContainer"') && home.includes('id="weekCal"'), 'Staff home schedule views are missing');
expect(homeRoleCss.includes('.vm-home-staff .dashboard-grid{display:grid!important') && homeRoleCss.includes('.vm-home-staff .dashboard-grid .left-panel{display:none!important'), 'Staff weekly schedule must be visible without the old dashboard clutter');

for (const fragment of ['schedule-main-grid', 'meetSettingsPanel', 'meetClassFilter', 'Thứ tự dùng link:', 'function capNhatHinhThucSchedule', 'function laLinkMeetHopLe', 'meetLinkMap[classId]']) {
  expect(schedule.includes(fragment), `Schedule setup is missing ${fragment}`);
}
expect(schedule.includes("u.hostname.toLowerCase() === 'meet.google.com'"), 'Meet inputs must validate the Google Meet host');
expect(schedule.includes("meetInput = layLinkMeetHopLe('schMeet')"), 'Per-session Meet input must be validated before saving');
expect(schedule.includes("sb.from('class_links')") && schedule.includes("sb.from('app_settings')"), 'Class and global Meet fallbacks must remain available');
expect(schedule.includes("khungThu.style.display = 'none'") && schedule.includes("$('khungSchMeet').hidden = !online"), 'Schedule form must progressively hide irrelevant controls');

for (const fragment of ['Trung tâm nội dung', 'Xưởng biên soạn', '1. Tạo nội dung mới', '2. Quản lý & xuất bản', '3. Thiết lập & môi trường', 'Bài giảng & bài học', 'Tài liệu LaTeX / PDF', 'Đề thi chuẩn THPTQG', 'THPTQG có lời giải', 'Môi trường TeX', 'Cấu hình biên soạn toàn hệ thống', 'contentEnvStatus', 'metricLessons', 'metricDocuments', 'metricExams', 'metricThpt', 'metricBlog']) {
  expect(content.includes(fragment), `Content studio is missing ${fragment}`);
}
expect(content.includes('quan-tri-de?tab=compose&template=thpt-standard') && content.includes('quan-tri-de?tab=compose&template=thpt-practice'), 'Both THPTQG templates need direct content-studio shortcuts');
for (const setting of ['latex_preamble_default', 'latex_engine_default', 'latex_raw_mode_default']) expect(content.includes(setting), `System authoring setting is missing: ${setting}`);
expect(content.includes("sb.from('app_settings').upsert(rows") && content.includes("contentProfile.role !== 'admin'"), 'Only admin may save system-wide authoring settings through RLS-backed app_settings');
expect(examAdmin.includes("var queryParams=new URLSearchParams(location.search)") && examAdmin.includes('applyTemplate(requestedTemplate)') && examAdmin.includes("switchTab(requestedTab)"), 'Exam editor must honor direct template and library links');
expect(examAdmin.includes("engine:state.pdfEngine||'pdflatex'") && examAdmin.includes("eq('key','latex_engine_default')"), 'Exam PDF compilation must use the system authoring engine');

console.log('PASS schedule restoration + compact Meet setup + complete content studio');
