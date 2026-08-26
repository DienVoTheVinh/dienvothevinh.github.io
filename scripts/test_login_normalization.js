const fs = require('fs');
const vm = require('vm');

const core = fs.readFileSync('js/vinhmath.js', 'utf8');

function expect(value, message) {
  if (!value) throw new Error(message);
}

const start = core.indexOf('function vmChuanHoaTenDangNhap');
const end = core.indexOf('// HS dùng "tên đăng nhập"', start);
expect(start >= 0 && end > start, 'Login normalization helpers are missing');

const context = {};
vm.runInNewContext(core.slice(start, end), context, { filename: 'login-normalization.js' });

expect(context.vmEmailDangNhap('NguyenVanA') === 'nguyenvana@hs.vinhmath.com', 'Plain student username must resolve');
const publicStudent = context.vmEmailDangNhap(' NguyenVanA@hs.vinhmath ');
expect(publicStudent === 'nguyenvana@hs.vinhmath.com', 'Public student suffix must resolve, got: ' + publicStudent);
expect(context.vmEmailDangNhap('NguyenVanA@hs.vinhmath.com') === 'nguyenvana@hs.vinhmath.com', 'Full current Auth email must resolve');
expect(context.vmEmailDangNhap('NguyenVanA@hs.vinhmath.app') === 'nguyenvana@hs.vinhmath.com', 'Legacy .app login must resolve');
expect(context.vmEmailDangNhap('NguyenVanA＠hs．vinhmath') === 'nguyenvana@hs.vinhmath.com', 'Mobile full-width punctuation must resolve');
expect(context.vmEmailDangNhap('mailto:NguyenVanA@hs.vinhmath.com') === 'nguyenvana@hs.vinhmath.com', 'Pasted mailto login must resolve');
expect(context.vmEmailDangNhap('NguyenVanA@hstt') === 'nguyenvana@hstt.vinhmath.com', 'Portal student suffix must remain supported');
expect(context.vmEmailDangNhap('NguyenVanA@hsum') === 'nguyenvana@hsum.vinhmath.com', 'UYENMATH student suffix must resolve');
expect(context.vmEmailDangNhap('CoUyen@gvum') === 'couyen@gvum.vinhmath.com', 'UYENMATH teacher suffix must resolve');
expect(context.vmEmailDangNhap('NguyenVanA@hs.thay-truong.vinhmath.com') === 'nguyenvana@hs.thay-truong.vinhmath.com', 'Full legacy portal email must resolve');

const exact = context.vmUngVienMatKhauDangNhap('Mat khau co khoang trang');
expect(exact.length === 1 && exact[0] === 'Mat khau co khoang trang', 'Valid internal password spaces must be preserved');
const pasted = context.vmUngVienMatKhauDangNhap('\u200BMatKhau\u00A0');
expect(pasted.length === 2 && pasted[0] !== pasted[1] && pasted[1] === 'MatKhau', 'Invisible paste characters need a safe retry candidate');

expect(!/console\.(?:log|info|warn|error)\([^\n]*(?:password|candidates)/i.test(core), 'Login code must not log password candidates');
expect(fs.readFileSync('dang-nhap.html', 'utf8').includes('js/vinhmath.js?v=9.3'), 'Login page cache version must be bumped');

console.log('PASS resilient student login normalization and safe password retry');
