'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260825162000_question_bank_staff_review_hardening.sql'), 'utf8');
const grading = fs.readFileSync(path.join(root, 'quan-tri-cham-bai.html'), 'utf8');
const examAdmin = fs.readFileSync(path.join(root, 'js', 'exam-admin.js'), 'utf8');

function body(name) {
  const start = migration.toLowerCase().indexOf(`create or replace function ${name}`.toLowerCase());
  assert.ok(start >= 0, `missing function ${name}`);
  const bodyStart = migration.indexOf('as $function$', start);
  const end = migration.indexOf('$function$;', bodyStart + 13);
  assert.ok(bodyStart >= 0 && end > bodyStart, `unclosed function ${name}`);
  return migration.slice(start, end + 11);
}

const review = body('public.vm_exam_attempt_review');
assert.match(review, /not v_is_admin and not public\.is_staff\(\)/, 'attempt review must be staff-only');
assert.match(review, /submitted_at is null and not v_is_admin/, 'teacher review must be post-submission only');
assert.match(review, /v_protected and not v_is_admin[\s\S]*private\.vm_bank_can_manage_exam\(v_attempt\.exam_id\)/,
  'protected attempt review must require exact exam management scope');
assert.match(review, /when bank_item\.id is not null and not v_is_admin then null/,
  'teacher review must suppress protected bank solutions');
assert.match(review, /when bank_item\.id is not null then coalesce\([\s\S]*choice_value-array\['correct','is_correct','answer','solution'\]/,
  'teacher review choices must be stripped of answer flags');
assert.match(migration, /revoke all on function public\.vm_exam_attempt_review\(uuid\) from public, anon/,
  'attempt-review RPC anonymous execute revoke missing');

const analytics = body('public.vm_bank_staff_exam_analytics');
assert.match(analytics, /not v_is_admin and not public\.is_teacher\(\)/,
  'bank analytics must reject assistant/student roles');
assert.match(analytics, /private\.vm_bank_can_manage_exam\(p_exam_id\)[\s\S]*private\.vm_bank_target_is_manageable\(p_class_id,v_class\.portal_id\)/,
  'bank analytics must enforce exact exam and class/portal scope');
assert.match(analytics, /'content_latex',bank_item\.content_latex/,
  'bank analytics must overlay private content instead of public placeholders');
assert.doesNotMatch(analytics, /'correct_value'|'answer'|'solution_latex'|'raw_tex'|'canonical_tex'/,
  'teacher analytics response must not include bank answers, solutions or raw source');
assert.match(analytics, /private\.vm_bank_safe_json_object\(aa\.chosen_key\)/,
  'malformed true/false answer JSON must not abort protected analytics');
const safeJson = body('private.vm_bank_safe_json_object');
assert.match(safeJson, /exception when others then[\s\S]*return '\{\}'::jsonb/,
  'safe answer decoder must quarantine malformed JSON as an empty object');
assert.match(migration, /revoke all on function public\.vm_bank_staff_exam_analytics\(uuid,uuid\)[\s\S]*from public, anon/,
  'bank analytics anonymous execute revoke missing');

const detailStart = grading.indexOf('async function xemChiTietTest');
const detailEnd = grading.indexOf('\n</script>', detailStart);
const detail = grading.slice(detailStart, detailEnd);
assert.ok(detailStart >= 0 && detailEnd > detailStart, 'grading detail function missing');
assert.match(detail, /sb\.rpc\('vm_exam_attempt_review',\s*\{\s*p_attempt_id:/,
  'grading detail must use the protected review RPC');
assert.doesNotMatch(detail, /\.from\(['"]attempts['"]\)|questions\(content_latex/,
  'grading detail must not read attempts/questions directly');
assert.match(detail, /data\.answers_visible \? '<span>Đáp án đúng:/,
  'teacher UI must hide the answer label for protected bank attempts');
assert.match(detail, /data\.protected_bank && !data\.answers_visible/,
  'protected bank review needs a clear privacy notice');

assert.match(examAdmin, /sb\.rpc\('vm_bank_staff_exam_analytics',\{p_class_id:classId,p_exam_id:examId\}\)/,
  'analytics UI must request the sanitized bank overlay');
assert.match(examAdmin, /bankOverlay\.data\.protected_bank[\s\S]*selected_exam\.questions=bankOverlay\.data\.questions/,
  'analytics UI must replace placeholder question rows with the safe overlay');

console.log('PASS secure question-bank staff review and analytics');
