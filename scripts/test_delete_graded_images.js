const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const grading = fs.readFileSync(path.join(root, 'quan-tri-cham-bai.html'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'web', 'supabase', 'function-nop-bai.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/function chbGradedThumbs\(files, subId\)/.test(grading), 'Thiếu renderer ảnh chấm cũ có nút xóa.');
assert(/class="chb-existing-remove"/.test(grading) && /aria-label="Xóa ảnh chấm này"/.test(grading), 'Ảnh chấm cũ chưa có nút × truy cập được.');
assert(/var chamRemoved = \{\}/.test(grading) && /function chamXoaCu\(subId, fileId, button\)/.test(grading), 'Thiếu trạng thái đánh dấu ảnh cũ cần xóa.');
assert(/delete chamRemoved\[id\][\s\S]*is-pending-delete/.test(grading), 'Hủy chỉnh sửa chưa khôi phục ảnh đã đánh dấu xóa.');
assert(/fdXoa\.append\('kind', 'xoa_cham'\)/.test(grading) && /fdXoa\.append\('file_ids', JSON\.stringify\(removed\)\)/.test(grading), 'Lưu chỉnh sửa chưa gửi danh sách ảnh cần xóa.');

assert(/action !== "xoa_cham" && !files\.length/.test(edge), 'Edge Function vẫn bắt buộc upload tệp cho thao tác xóa.');
assert(/action !== "cham" && action !== "xoa_cham"/.test(edge), 'Edge Function chưa chấp nhận thao tác xóa ảnh chấm.');
assert(/coQuyenQuanLyLop[\s\S]*if \(action === "xoa_cham"\)/.test(edge), 'Xóa ảnh phải diễn ra sau kiểm tra quyền quản lý lớp.');
assert(/const allowedIds = new Set\(oldFiles/.test(edge), 'Edge Function chưa giới hạn xóa vào các tệp của đúng bài nộp.');
assert(/update\(\{ graded_files: remaining \}\)\.eq\("id", subId\)/.test(edge), 'Edge Function chưa cập nhật đúng submission.');
assert(/Promise\.all\(deleteIds\.map\(\(id\) => xoaFileDrive\(token, id\)\)\)/.test(edge), 'Tệp Drive chưa được dọn sau khi cập nhật dữ liệu.');

const inlineScripts = [...grading.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]).filter((code) => code.trim());
inlineScripts.forEach((code, index) => new vm.Script(code, { filename: `quan-tri-cham-bai.html#inline-${index + 1}` }));

console.log('OK: ảnh chấm cũ có thể đánh dấu xóa, hủy an toàn và chỉ xóa thật khi lưu với kiểm tra quyền lớp.');
