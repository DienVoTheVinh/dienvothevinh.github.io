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
assert(/test_latex_content, test_document_id, bai_test:documents!lessons_test_document_id_fkey/.test(grading),
  'Truy vấn chấm bài chưa lấy đủ đề kiểm tra LaTeX/PDF.');
assert(/securedLessons[\s\S]*vmSecureLessonAssets\(submission\.lessons\)/.test(grading),
  'Ảnh và PDF đề riêng tư chưa được ký URL trước khi dựng khung xem nhanh.');
assert(/latexTaiLieuRaHTML\(latex/.test(grading),
  'Đề LaTeX chưa được dựng trực tiếp trong giao diện chấm bài.');
assert(/class="chb-assignment-resizer"/.test(grading) && /function chbInitAssignmentResizers\(/.test(grading),
  'Khung đề nhanh chưa có tay kéo thay đổi chiều cao.');
assert(/id="chbDrawPrompt"/.test(grading) && /function chamVeTaiDe\(/.test(grading) && /function chamVeToggleDe\(/.test(grading),
  'Chế độ chấm toàn màn hình chưa có khung đề tham chiếu bên trái.');
assert(/id="chbDrawPromptResizer"/.test(grading) && /function chamVeGanResizeDe\(/.test(grading),
  'Khung đề tham chiếu toàn màn hình chưa thể kéo đổi độ rộng.');
assert(/function chbLbZoom\(/.test(grading) && /id="chbLbZoom"/.test(grading),
  'Lightbox chưa có điều khiển thu phóng.');
assert(/function chbLbToggleFullscreen\(/.test(grading) && /is-fullscreen/.test(grading),
  'Lightbox chưa có chế độ toàn màn hình.');
assert(/&sz=w2400/.test(grading),
  'Lightbox chưa yêu cầu ảnh Drive đủ nét để phóng to.');

console.log('OK: đề BTVN/kiểm tra được ký URL, xem nhanh, kéo giãn và dùng trong chấm toàn màn hình.');
