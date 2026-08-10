const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const lesson = fs.readFileSync(path.join(root, 'bai-hoc.html'), 'utf8');
const grading = fs.readFileSync(path.join(root, 'quan-tri-cham-bai.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/#boChuyen\s*\{[^}]*display\s*:\s*none\s*!important/i.test(lesson),
  'Thanh chuyển nội dung trùng lặp chưa được ẩn khỏi header.');
assert(/class="lesson-header-actions"/i.test(lesson) && /#themeBtn\s*\{[^}]*margin-left\s*:\s*auto/i.test(lesson),
  'Theme toggle must stay anchored at the far right of the lesson header.');
assert(/homework_latex_content, homework_document_id/.test(lesson),
  'Mục lục bài học chưa lấy BTVN dạng LaTeX/PDF.');
assert(/homework2_latex_content, homework2_document_id/.test(lesson),
  'Mục lục bài học chưa lấy bài thưởng dạng LaTeX/PDF.');
assert(/bai_btvn:documents!lessons_homework_document_id_fkey/.test(lesson),
  'Mục lục bài học chưa nối tài liệu PDF BTVN.');

assert(/function chbHomeworkPrompt\(/.test(grading),
  'Giao diện chấm bài chưa có khối hiển thị đề đã giao.');
assert(/homework_text, homework_images, homework_latex_content, homework_document_id/.test(grading),
  'Truy vấn chấm bài chưa lấy đủ ba nguồn BTVN.');
assert(/latexTaiLieuRaHTML\(latex/.test(grading),
  'Đề LaTeX chưa được dựng trực tiếp trong giao diện chấm bài.');
assert(/function chbLbZoom\(/.test(grading) && /id="chbLbZoom"/.test(grading),
  'Lightbox chưa có điều khiển thu phóng.');
assert(/function chbLbToggleFullscreen\(/.test(grading) && /is-fullscreen/.test(grading),
  'Lightbox chưa có chế độ toàn màn hình.');
assert(/&sz=w2400/.test(grading),
  'Lightbox chưa yêu cầu ảnh Drive đủ nét để phóng to.');

console.log('OK: BTVN hiển thị đủ nguồn và lightbox chấm bài có zoom/toàn màn hình.');
