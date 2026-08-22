const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('quan-tri-cham-bai.html', 'utf8');
const expect = (value, message) => { if (!value) throw new Error(message); };

[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim())
  .forEach((source, index) => new vm.Script(source, { filename: `quan-tri-cham-bai.html#${index + 1}` }));

expect(html.includes('id="selKhoi"') && html.indexOf('id="selKhoi"') < html.indexOf('id="selLop"'), 'Bộ lọc khối phải đứng trước lớp');
expect(html.includes("select('id, name, grade, is_specialized, teacher_id, co_teacher_id')"), 'Truy vấn lớp phải lấy cột grade');
expect(html.includes('function capNhatDropdownKhoi()') && html.includes('function capNhatLopTheoKhoi()'), 'Dropdown khối và lớp chưa liên kết');
expect(html.includes("var selectedKhoi = $('selKhoi').value") && html.includes('giaTriKhoi(lop) === selectedKhoi'), 'Danh sách bài nộp chưa lọc thật theo khối');
expect(html.includes('.chb-filter-selects { width:100%;') && html.includes('width:100% !important'), 'Bộ lọc chưa tối ưu cho điện thoại');
expect(html.includes("l.teacher_id === hoSo.id || l.co_teacher_id === hoSo.id || myAssistantIds.indexOf(l.id) !== -1"), 'Bộ lọc không được nới phạm vi lớp của giáo viên/trợ giảng');

console.log('PASS grading grade -> class -> lesson filter and mobile layout');
