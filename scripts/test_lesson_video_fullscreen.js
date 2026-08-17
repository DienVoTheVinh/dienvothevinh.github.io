const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const lesson = fs.readFileSync(path.join(root, 'bai-hoc.html'), 'utf8');

assert(
  /<button[^>]+aria-label="Xem video toàn màn hình"[^>]+id="btnMaxVideo"/.test(lesson),
  'Nút video phải mô tả rõ thao tác toàn màn hình.'
);
assert(
  /v\.requestFullscreen \|\| v\.webkitRequestFullscreen/.test(lesson),
  'Video phải ưu tiên Fullscreen API và có nhánh WebKit/Safari.'
);
assert(
  /vm-video-fullscreen-active/.test(lesson) && /body\.vm-video-locked/.test(lesson),
  'Phải có chế độ toàn màn hình dự phòng cho iPhone/WebView.'
);
assert(
  /document\.addEventListener\('fullscreenchange', vmDongBoVideoFullscreen\)/.test(lesson),
  'Trạng thái nút phải đồng bộ khi người dùng thoát fullscreen bằng Esc.'
);
assert(
  !/v\.style\.width = '100%';[\s\S]{0,180}c\.style\.display = 'none'/.test(lesson),
  'Không được quay lại cơ chế cũ chỉ kéo rộng một nửa workspace.'
);
assert(
  /js\/vinhmath\.js\?v=8\.0/.test(lesson),
  'Trang bài học phải nhận bản vá dùng chung mới thay vì cache 7.9.'
);

console.log('PASS lesson video uses native fullscreen with Safari/WebView fallback');
