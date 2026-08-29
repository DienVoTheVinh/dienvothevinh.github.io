const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (value, message) => { if (!value) throw new Error(message); };
const source = read('js/role-home.js');
const css = read('css/role-home.css');
const page = read('trang-chu.html');

new vm.Script(source, {filename:'js/role-home.js'});
expect(source.includes("sb.rpc('vm_list_accessible_classes', {p_scope:'mine', p_teacher_ids:[]})"), 'Tổng quan staff phải dùng phạm vi lớp được phân công');
expect(source.includes(".or(contentFilters.join(','))") && source.includes("sb.from('exams').select('id,title,class_id').in('class_id', ids)"), 'Bài chờ chấm phải được giới hạn ngay từ truy vấn theo nội dung của lớp phụ trách');
expect(source.includes('renderStaffPending(snapshot)') && source.includes('renderStaffSchedule(snapshot)'), 'Thiếu hàng đợi chấm bài hoặc lịch dạy sắp tới');
expect(source.includes("profile.role === 'admin'") && source.includes('vm-staff-admin-grid'), 'Admin phải có nhóm điều hành riêng');
for (const href of ['quan-tri-cham-bai', 'quan-tri-lop', 'quan-tri-hoc-sinh', 'quan-tri-de', 'quan-tri-tai-lieu', 'quan-tri-bao-cao-hoc-sinh']) {
  expect(source.includes(href), `Thiếu lối tắt staff: ${href}`);
}
for (const href of ['quan-tri-tai-khoan', 'quan-tri-khong-gian', 'quan-tri-le-hoi', 'quan-tri-quyen-tinh-nang']) {
  expect(source.includes(href), `Thiếu lối điều hành admin: ${href}`);
}
expect(css.includes('.vm-staff-home-grid') && css.includes('grid-template-columns:minmax(0,1.55fr)'), 'Bố cục tổng quan staff desktop chưa được định nghĩa');
expect(css.includes('@media(max-width:680px)') && css.includes('.vm-staff-metrics{grid-template-columns:repeat(2'), 'Bố cục staff trên điện thoại chưa được thu gọn');
expect(page.includes('css/role-home.css?v=11') && page.includes('js/role-home.js?v=12'), 'Trang chủ chưa đổi phiên bản cache cho tổng quan staff');

console.log('PASS staff home overview: scoped dashboard, priorities, schedule and admin controls');
