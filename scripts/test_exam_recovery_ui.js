'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'luyen-de.html'), 'utf8');

assert.match(page, /id="vmRecoveryCard"/);
assert.match(page, /sb\.rpc\('vm_exam_recommendations',\s*\{\s*p_attempt_id:/);
assert.match(page, /sb\.rpc\('vm_exam_create_recovery',\s*\{/);
assert.match(page, /p_attempt_id:\s*currentAttempt\.id/);
assert.match(page, /p_limit:\s*8/);
assert.match(page, /currentAttempt\.is_practice/);
assert.match(page, /role === 'admin' \|\| role === 'teacher'/);
assert.match(page, /sb\.rpc\('vm_exam_catalog',\s*\{\s*p_exam_id:\s*examId\s*\}\)/);
assert.match(page, /var isAdminPreview = studentInfo\.role === 'admin'/);
assert.match(page, /wkSubmitBtn'\)\.style\.display = isAdminPreview \? 'inline-flex' : 'none'/,
  'teacher protected-bank preview must not offer a misleading local submit/grade flow');
assert.match(page, /XEM TRƯỚC AN TOÀN/);
assert.match(page, /actionBtnText = 'Đề đã đóng'/);
assert.match(page, /Đề thi đã đóng\. Em chỉ có thể xem lại nếu đã nộp bài trước đó/,
  'closed-exam UI must match the secure server time window');

const recoverySource = page.slice(page.indexOf('async function vmTaiGoiYOnTap'), page.indexOf('function kichHoatPopupDiem'));
assert.ok(recoverySource.length > 0, 'recovery functions must be present before the score popup logic');
assert.doesNotMatch(recoverySource, /\.from\(['"]questions['"]\)/, 'students must never browse the question bank table directly');
assert.doesNotMatch(recoverySource, /solution_latex|correct_choice|raw_tex|canonical_tex/, 'recommendation UI must not request answer or source fields');

console.log('PASS secure recovery-practice UI');
