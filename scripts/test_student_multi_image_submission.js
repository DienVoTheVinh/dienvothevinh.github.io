const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const lesson = fs.readFileSync(path.join(root, 'bai-hoc.html'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'web', 'supabase', 'function-nop-bai.ts'), 'utf8');
const expect = (value, message) => { if (!value) throw new Error(message); };

expect(lesson.includes('multiple onchange="vmThemFileDaChon(\'nbFiles\',\'nbFileList\')"'), 'Ô nộp bài chưa dùng bộ chọn nhiều tệp tích lũy.');
expect(lesson.includes('Nếu điện thoại chỉ cho chọn từng ảnh') && lesson.includes('những ảnh đã chọn trước đó vẫn được giữ'), 'Thiếu hướng dẫn nộp nhiều ảnh trên điện thoại.');
expect(lesson.includes('var vmFileSelections = Object.create(null)') && lesson.includes('keys.add(key); daChon.push(file)'), 'Ảnh chọn ở nhiều lượt chưa được cộng dồn.');
expect(lesson.includes('class="vm-submit-file-check"') && lesson.includes('aria-label="Bỏ chọn '), 'Ảnh đã chọn thiếu dấu tick hoặc nút bỏ chọn rõ ràng.');
expect(lesson.includes('VM_MAX_SUBMISSION_FILES = 12') && edge.includes('const MAX_FILES = 12'), 'Giới hạn tệp phía giao diện và máy chủ không đồng bộ.');
expect(lesson.includes("fd.append('files', fs[i])") && edge.includes('await xacNhanHocSinhTrongLop'), 'Luồng gửi tệp hoặc kiểm tra quyền học sinh đã bị thay đổi.');
expect(!/service_role|SUPABASE_SERVICE_ROLE_KEY|postgres(?:ql)?:\/\//i.test(lesson), 'Giao diện nộp bài chứa chỉ báo credential đặc quyền.');

console.log('PASS student multi-image submission structure and security checks');
