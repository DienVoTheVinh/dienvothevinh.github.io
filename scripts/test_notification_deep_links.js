const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function expect(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const sw = read('sw.js');
const menu = read('js/menu-v5.js');
const lesson = read('bai-hoc.html');
const grading = read('quan-tri-cham-bai.html');
const migration = read('supabase/migrations/20260811110000_notification_deep_links.sql');

expect(sw, /kind === 'graded'.*searchParams\.set\('action', 'graded'\)/s, 'Service worker must upgrade old graded links.');
expect(sw, /windows\[i\]\.navigate\(target\)\.then/, 'Service worker must navigate the focused app window before focusing it.');
expect(sw, /if \(!sameOrigin\) return clients\.openWindow/, 'External destinations must open directly.');
expect(menu, /select\('id, title, body, link, kind, read_at, created_at'\)/, 'Notification list must load kind.');
expect(menu, /vmDichDenThongBao/, 'Notification list must normalize legacy links.');
expect(lesson, /await vmMoDichDenThongBao\(params\)/, 'Lesson bootstrap must consume deep links.');
expect(lesson, /xemKetQua\(lid, kind, submissionId\)/, 'Graded result view must accept an exact submission.');
expect(lesson, /truyVan = truyVan\.eq\('id', submissionId\)/, 'Exact submission must be filtered under RLS.');
expect(grading, /vmFocusSubmission\(_submission\)/, 'Teacher notification must focus the submitted work.');
expect(grading, /vmFocusAttempt\(_attempt\)/, 'Teacher notification must focus the exact test attempt.');
expect(grading, /id="attempt-' \+ s\.id/, 'Attempt cards must expose stable deep-link targets.');
expect(migration, /action=graded&kind=' \|\| new\.kind \|\| '&submission=' \|\| new\.id/, 'New graded notifications must contain an exact deep link.');
expect(migration, /&submission=' \|\| new\.id::text/, 'New submission notifications must contain the submission id.');
expect(migration, /loc=test&lop=.*&attempt=' \|\| new\.id::text/, 'Lesson attempts must link to the exact result.');
expect(migration, /loc=luyende&lop=.*&attempt=' \|\| new\.id::text/, 'Exam attempts must link to the exact result.');

console.log('notification deep-link regression checks passed');
