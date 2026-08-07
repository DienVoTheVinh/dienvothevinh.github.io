const fs = require('fs');

const source = fs.readFileSync('quan-tri-lop.html', 'utf8');

function expect(pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

expect(/\.in\('role', \['assistant', 'teacher'\]\)/,
  'Assistant picker must load both assistant and teacher accounts');
expect(/Nhập tên hoặc username GV \/ Trợ giảng/,
  'Picker must explain that names and usernames are accepted');
expect(/role="combobox"[\s\S]*aria-controls="tgGoiY"/,
  'Picker must expose accessible combobox semantics');
expect(/tgChonUngVien\(this\.dataset\.id\)/,
  'Suggestions must select an existing account by id');
expect(/Hãy chọn đúng một tài khoản trong danh sách gợi ý/,
  'Ambiguous free text must not be inserted as an assistant');
expect(/\['assistant', 'teacher'\]\.indexOf\(prof\.role\)/,
  'Only assistant and teacher roles may be assigned');
expect(/hệ thống không thay đổi vai trò tài khoản/,
  'UI must state that the account role is preserved');

if (/profiles'\)\.update\(\{ role: 'assistant' \}/.test(source)) {
  throw new Error('Adding a class assistant must not silently change account roles');
}

const inlineScripts = [];
for (const match of source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (match[1].trim()) inlineScripts.push(match[1]);
}
inlineScripts.forEach((code, index) => {
  try {
    new Function(code);
  } catch (error) {
    throw new Error(`Inline script ${index + 1} has invalid syntax: ${error.message}`);
  }
});

console.log('PASS teacher/assistant picker, validation, accessibility and inline syntax');
