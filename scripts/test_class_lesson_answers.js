const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'quan-tri-cham-bai.html'), 'utf8');
const lesson = fs.readFileSync(path.join(root, 'bai-hoc.html'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'web', 'supabase', 'function-nop-bai.ts'), 'utf8');
const shared = fs.readFileSync(path.join(root, 'js', 'vinhmath.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260819100914_class_lesson_answer_release.sql'), 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(/create table public\.class_lesson_answers/.test(migration), 'Thiếu bảng đáp án chung.');
expect(/lesson_id uuid not null unique references public\.lessons/.test(migration), 'Đáp án chưa được khóa duy nhất theo bài giảng.');
expect(/enable row level security/.test(migration) && /force row level security/.test(migration), 'Bảng đáp án phải bật và ép RLS.');
expect(/revoke all on table public\.class_lesson_answers from public, anon, authenticated/.test(migration), 'Client không được truy cập trực tiếp bảng đáp án.');
expect(/grant select, insert, update, delete on table public\.class_lesson_answers to service_role/.test(migration), 'Edge Function cần quyền server-side tối thiểu.');
expect(/class_lesson_answers_has_content/.test(migration) && /octet_length\(coalesce\(tex_content/.test(migration), 'Migration thiếu giới hạn nội dung.');

expect(/async function coQuyenXemDapAn/.test(edge), 'Thiếu cổng kiểm tra quyền xem đáp án.');
expect(/\.eq\("student_id", userId\)[\s\S]*\.eq\("status", "graded"\)/.test(edge), 'Học sinh chưa được khóa theo đúng bài nộp đã chấm.');
expect(/if \(!duocXem\) throw loi\("Đáp án chỉ mở sau khi bài của em đã được giáo viên chấm\."/.test(edge), 'Metadata/tệp chưa cùng dùng cổng quyền server-side.');
expect(/taiNhieuFile\(token, files, answerRoot,[\s\S]*false\)/.test(edge), 'Tệp đáp án phải tải lên Drive ở chế độ riêng tư.');
expect(/congKhai \? \{ link: uploaded\.webViewLink \} : \{\}/.test(edge), 'Metadata riêng tư không được chứa public Drive link.');
expect(/const selected = answerFiles\.find[\s\S]*Tệp không thuộc đáp án của bài giảng này/.test(edge), 'Tải tệp chưa giới hạn vào đúng đáp án.');
expect(/X-Content-Type-Options[\s\S]{0,40}nosniff/.test(edge), 'Tệp riêng tư phải chặn MIME sniffing.');
expect(/function mimeDapAnAnToan/.test(edge), 'Server phải chuẩn hóa MIME ảnh/PDF.');
expect(/allowedOldIds[\s\S]*keepRequested/.test(edge), 'Danh sách giữ/xóa tệp phải được giao với ID server đã biết.');
expect(/\.eq\("lesson_id", lessonId\)[\s\S]*\.eq\("status", "graded"\)[\s\S]*class_answer_ready/.test(edge), 'Thông báo chỉ được gửi tới học sinh đã được chấm.');

expect(admin.includes('Đáp án chung cho lớp và bài giảng'), 'Màn hình chấm bài chưa có trình quản lý đáp án chung.');
expect(admin.includes('js/vinhmath.js?v=9.3') && lesson.includes('js/vinhmath.js?v=9.3'), 'Hai màn hình phải tải cùng phiên bản helper Blob hiện hành.');
expect(/accept="image\/\*,application\/pdf" multiple/.test(admin), 'Giáo viên chưa thể gửi nhiều ảnh/PDF.');
expect(/document\.addEventListener\('paste'/.test(admin), 'Thiếu dán ảnh từ clipboard.');
expect(/accept="\.tex,text\/x-tex,text\/plain"/.test(admin), 'Thiếu nạp tệp TeX.');
expect(/keep_file_ids/.test(admin), 'Chỉnh sửa đáp án chưa bảo toàn tệp được chọn.');

expect(/if \(sub\.status === 'graded'\)[\s\S]*await vmLayDapAnChung\(\)/.test(lesson), 'Đáp án phải chỉ được yêu cầu trong nhánh bài đã chấm.');
expect(/class_answer_file/.test(lesson) && /vmGoiHamFormDataBlob/.test(lesson), 'Học sinh chưa tải tệp riêng tư qua JWT.');
expect(/data-class-answer-ready="true"/.test(lesson), 'Thiếu khu vực đáp án đã mở cho học sinh.');
expect(/params\.get\('action'\) === 'class-answer'/.test(lesson), 'Thông báo chưa mở đúng kết quả có đáp án.');
expect(/async function vmGoiHamFormDataBlob/.test(shared), 'Thiếu helper tải Blob có xác thực.');

for (const [name, html] of [['quan-tri-cham-bai.html', admin], ['bai-hoc.html', lesson]]) {
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]).filter((code) => code.trim());
  inlineScripts.forEach((code, index) => new vm.Script(code, { filename: `${name}#inline-${index + 1}` }));
}
new vm.Script(shared, { filename: 'js/vinhmath.js' });

console.log('PASS class lesson answer security and UI checks');
