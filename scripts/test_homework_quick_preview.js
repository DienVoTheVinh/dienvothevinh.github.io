const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('js/vinhmath.js', 'utf8');
const start = source.indexOf('function vmStoragePathHopLe');
const end = source.indexOf('function vmHienModalXN', start);
assert(start >= 0 && end > start, 'Không tìm thấy bộ dựng cửa sổ xem nhanh.');

const context = {
  VM: { SUPABASE_URL: 'https://example.supabase.co' },
  URL,
  encodeURIComponent,
  console
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

assert.strictEqual(
  context.vmStorageUrl('tai-lieu', 'lop 7/de bai.pdf'),
  'https://example.supabase.co/storage/v1/object/public/tai-lieu/lop%207/de%20bai.pdf'
);
assert.strictEqual(context.vmStorageUrl('tai-lieu', '\\begin{bt} Bài tập \\end{bt}'), '');
assert.strictEqual(context.vmStorageUrl('tai-lieu', '{"statusCode":400,"error":"InvalidKey"}'), '');

const latex = String.raw`\begin{bt} Cho các biểu thức sau: $$A(x) = 2x^4 - \dfrac{1}{2}x^3 + 3x - 1; \quad B(x) = \dfrac{2x^2 - 3x + 1}{x - 2}; \quad C(y) = -y^5 + 2y^2 - \sqrt{2}; \quad D(u) = 15 - 3u + 4u^3 - u^6.$$ \begin{enumerate}[a)] \item Biểu thức nào là đa thức một biến? \end{enumerate} \end{bt}`;
const preview = context.vmNoiDungXemNhanh({
  id: 'lesson-123',
  title: 'Biểu thức đại số',
  homework_latex_content: latex,
  // Simulate the malformed legacy relation that caused Supabase InvalidKey.
  bai_btvn: { file_path: latex }
}, 'btvn');

assert(!preview.body.includes('<iframe'), 'Mã LaTeX không được đưa vào iframe PDF.');
assert(!preview.body.includes('InvalidKey'), 'Không được lộ lỗi Storage thô cho học sinh.');
assert(preview.body.includes('bai-hoc?id=lesson-123&amp;tab=btvn') || preview.body.includes('bai-hoc?id=lesson-123&tab=btvn'), 'Phải có nút mở đề đầy đủ.');
assert.strictEqual(preview.download, '');

console.log('✓ Homework quick preview rejects invalid Storage keys and keeps the lesson accessible.');
