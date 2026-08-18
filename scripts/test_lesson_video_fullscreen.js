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
  /stage\.requestFullscreen \|\| stage\.webkitRequestFullscreen/.test(lesson),
  'Khung toàn màn hình độc lập phải ưu tiên Fullscreen API và có nhánh WebKit/Safari.'
);
assert(
  /vm-video-fullscreen-stage/.test(lesson) && /body\.vm-video-locked/.test(lesson),
  'Phải có lớp toàn màn hình độc lập dự phòng cho iPhone/WebView.'
);
assert(
  /stage\.appendChild\(v\)/.test(lesson) && /insertBefore\(state\.pane, state\.placeholder\)/.test(lesson),
  'Video phải được tách khỏi bố cục hai cột khi phóng lớn và trả về đúng vị trí khi thoát.'
);
assert(
  /await vmDongVideoFullscreenNeuCan\(\);[\s\S]{0,160}var toolbar = thanhCongCu\('🏠 Bài tập về nhà'/.test(lesson),
  'Mở BTVN phải đóng fullscreen video sạch sẽ trước khi thay nội dung.'
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
  /js\/vinhmath\.js\?v=8\.1/.test(lesson),
  'Trang bài học phải nhận bản vá dùng chung mới thay vì cache 8.0.'
);

console.log('PASS lesson video uses native fullscreen with Safari/WebView fallback');
