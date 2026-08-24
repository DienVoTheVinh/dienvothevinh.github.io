const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('quan-tri-tai-khoan.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/tao-tai-khoan/index.ts', 'utf8');

function expect(value, message) {
  if (!value) throw new Error(message);
}

[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim())
  .forEach((source, index) => new vm.Script(source, { filename: `quan-tri-tai-khoan.html#${index + 1}` }));

expect(html.includes('id="ttModeBulk"') && html.includes('id="ttBulkNames"'), 'Bulk account mode and paste area are missing');
expect(html.includes("split(/\\r?\\n/)") && html.includes("raw.split('\\t')"), 'Bulk input must support line lists and pasted spreadsheet rows');
expect(html.includes('slice(0, 60)') && html.includes('Mỗi lượt tối đa 60 học sinh'), 'Bulk creation needs a bounded batch size');
expect(html.includes("for (var index = 0; index < names.length; index += 1)"), 'Accounts must be created sequentially to avoid duplicate-name races');
expect(!html.includes('Promise.all(names.map'), 'Bulk creation must not create duplicate names concurrently');
expect(html.includes("type = portal ? 'portal_hs' : 'hs_ph'"), 'Bulk mode must preserve VinhMath and portal student scopes');
expect(html.includes("sb.functions.invoke('tao-tai-khoan'"), 'Bulk mode must use the authenticated server-side account function');
expect(html.includes('ttBulkResultsData') && html.includes('ttBulkSaoChep') && html.includes('ttBulkTaiCsv'), 'Per-student results, copy and CSV export are incomplete');
expect(html.includes("new Blob(['\\ufeff' + csv]"), 'CSV export needs a UTF-8 BOM for Vietnamese names');
expect(!html.includes('localStorage.setItem(\'ttBulk') && !html.includes('sessionStorage.setItem(\'ttBulk'), 'Bulk credentials must not be persisted in browser storage');
expect(edge.includes('prof.role !== "admin"') && edge.includes('svc.auth.admin.createUser'), 'Account creation must remain server-side and admin-authorized');
expect(!edge.includes('console.log(password)') && !edge.includes('console.log(body)'), 'Credentials must never be logged');

console.log('PASS bulk student account creation, sequential safety, scoped accounts and private export');
