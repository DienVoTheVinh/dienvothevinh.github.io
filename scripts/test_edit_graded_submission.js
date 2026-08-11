const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const grading = fs.readFileSync(path.join(root, 'quan-tri-cham-bai.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/Sửa bài đã chấm/.test(grading),
  'Bài đã chấm chưa có nút chỉnh sửa rõ ràng.');
assert(/function batSuaCham\(id\)/.test(grading) && /function huySuaCham\(id\)/.test(grading),
  'Thiếu luồng mở hoặc hủy chỉnh sửa bài đã chấm.');
assert(/_chbOriginalGrades/.test(grading),
  'Chưa lưu trạng thái ban đầu để hủy chỉnh sửa an toàn.');
assert(/\.update\(\{[\s\S]*?status:\s*'graded'[\s\S]*?\}\)\.eq\('id', id\)\.select\('id,status,score,feedback,graded_at'\)\.single\(\)/.test(grading),
  'Chỉnh sửa phải cập nhật đúng bản ghi cũ và xác nhận hàng đã lưu.');
assert(/Lưu chỉnh sửa/.test(grading),
  'Nút lưu chưa phân biệt thao tác chấm lần đầu với chỉnh sửa.');
assert(/chamStaged\[id\][\s\S]*URL\.revokeObjectURL/.test(grading),
  'Hủy chỉnh sửa chưa dọn ảnh tạm và object URL.');
assert(/chamEsc\(s\.feedback \|\| ''\)/.test(grading),
  'Lời phê chưa được escape khi đưa lại vào biểu mẫu chỉnh sửa.');

const inlineScripts = [...grading.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]).filter((code) => code.trim());
inlineScripts.forEach((code, index) => {
  new vm.Script(code, { filename: `quan-tri-cham-bai.html#inline-${index + 1}` });
});

console.log('OK: bài đã chấm có thể mở sửa, hủy an toàn và cập nhật đúng submission cũ.');
