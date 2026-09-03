const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('quan-tri-cham-bai.html', 'utf8');
const expect = (value, message) => { if (!value) throw new Error(message); };

[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim())
  .forEach((source, index) => new vm.Script(source, { filename: `quan-tri-cham-bai.html#${index + 1}` }));

expect(['selKhoi', 'selLop', 'selChuyenDe', 'selBai'].every((id, index, ids) => index === 0 || html.indexOf(`id="${ids[index - 1]}"`) < html.indexOf(`id="${id}"`)), 'Bộ lọc phải theo thứ tự khối → lớp → chuyên đề → bài');
expect(html.includes("select('id, name, grade, is_specialized, teacher_id, co_teacher_id')"), 'Truy vấn lớp phải lấy cột grade');
expect(html.includes("topics(id, name, color, sort)") && html.includes('topic_id, created_at'), 'Truy vấn bài giảng phải lấy chuyên đề và dữ liệu sắp xếp');
expect(html.includes('function capNhatChuyenDeTheoPhamVi()') && html.includes('function capNhatBaiTheoChuyenDe()'), 'Dropdown chuyên đề và bài chưa liên kết');
expect(html.includes('function sapXepBaiTrongChuyenDe') && html.includes('return da - db;'), 'Bài giảng chưa dùng cùng thứ tự cũ → mới như trang lớp');
expect(html.includes("var selectedTopic = $('selChuyenDe').value") && html.includes('giaTriChuyenDe(bai) === selectedTopic'), 'Danh sách bài nộp chưa lọc thật theo chuyên đề');
expect(html.includes('.chb-filter-selects { width:100%;') && html.includes('width:100% !important'), 'Bộ lọc chưa tối ưu cho điện thoại');
expect(html.includes("l.teacher_id === hoSo.id || l.co_teacher_id === hoSo.id || myAssistantIds.indexOf(l.id) !== -1"), 'Bộ lọc không được nới phạm vi lớp của giáo viên/trợ giảng');

console.log('PASS grading grade -> class -> topic -> lesson filter and mobile layout');
