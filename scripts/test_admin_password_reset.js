const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('quan-tri-tai-khoan.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/tao-tai-khoan/index.ts', 'utf8');

[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]).filter((source) => source.trim())
  .forEach((source, index) => new vm.Script(source, { filename: `quan-tri-tai-khoan.html#${index + 1}` }));

function expect(value, message) { if (!value) throw new Error(message); }

expect(html.includes("type:'reset_password'") && html.includes('ttDatLaiMatKhau'), 'Admin reset-password UI is missing');
expect(html.includes('autocomplete="new-password"') && html.includes("crypto.getRandomValues"), 'Passwords must be generated securely and never reused by default');
const retiredSharedDefault = ['VinhMath', '2026', '#'].join('');
expect(!html.includes(`value="${retiredSharedDefault}"`) && !html.includes('TT_MK_MAC_DINH'), 'A shared default password must not remain in browser source');
expect(edge.includes('type === "reset_password"') && edge.includes('prof.role !== "admin"'), 'Reset operation must be admin-only');
expect(edge.includes('updateUserById(targetUserId, { password })'), 'Reset operation must use the Auth admin API');
expect(edge.includes('targetUserId === user.id') && edge.includes('password.length < 8'), 'Reset operation must prevent self-lockout and weak passwords');
expect(!edge.includes('console.log(password)') && !edge.includes('console.log(body)'), 'Password must never be logged');

console.log('PASS admin-only password reset and removal of shared default password');
