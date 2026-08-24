const fs = require('fs');
const vm = require('vm');

const pages = [
  'quan-tri-tai-khoan.html',
  'web/trang-web/quan-tri-tai-khoan.html',
];
const edge = fs.readFileSync('supabase/functions/tao-tai-khoan/index.ts', 'utf8');

function expect(value, message) {
  if (!value) throw new Error(message);
}

for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim())
    .forEach((source, index) => new vm.Script(source, { filename: `${page}#${index + 1}` }));

  expect(html.includes('placeholder="Ví dụ: Nguyễn Văn A"'), `${page}: account-name placeholder is stale`);
  expect(html.includes("TT_MAT_KHAU_MAC_DINH = 'VinhMath2026#'"), `${page}: requested default password is missing`);
  expect(html.includes('id="ttPhamVi"') && html.includes("from('exam_portals')"), `${page}: active portal selector is missing`);
  expect(html.includes("value: 'portal_hs'") && html.includes("value: 'portal_gv'"), `${page}: partner account types are missing`);
  expect(html.includes('portal.teacher_login_suffix') && html.includes('portal.login_suffix'), `${page}: partner suffix preview is incomplete`);
  expect(html.includes('requestBody.portalId = portal.id'), `${page}: portal id is not sent to the Edge Function`);
  expect(html.includes("data.type === 'portal_hs' || data.type === 'portal_gv'"), `${page}: partner account result is not handled`);
  expect(html.includes('mk.length < 8') && !html.includes('mk.length < 6'), `${page}: create-account password validation is inconsistent with the backend`);
}

expect(edge.includes('type === "portal_hs" || type === "portal_gv"'), 'Edge Function does not support partner accounts');
expect(edge.includes('member_role: isManager ? "manager" : "student"') && edge.includes('portal_only: true'), 'Partner accounts are not portal-scoped');
expect(edge.includes('role: "student"') && edge.includes('preventing broad teacher'), 'Partner managers could accidentally receive broad VinhMath teacher access');
expect(!edge.includes('console.log(password)') && !edge.includes('console.log(body)'), 'Credentials must not be logged');

console.log('PASS account scope selector, @hs/@gv partner suffixes and portal-only authorization');
