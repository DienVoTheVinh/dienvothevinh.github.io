'use strict';

const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(
  __dirname, '..', 'supabase', 'migrations',
  '20260827181253_upgrade_toan_thay_truong_full_site.sql'
), 'utf8');
const finalizeSql = fs.readFileSync(path.join(
  __dirname, '..', 'supabase', 'migrations',
  '20260827184500_finalize_toan_thay_truong_full_site.sql'
), 'utf8');

function expect(pattern, message) {
  if (!pattern.test(sql)) throw new Error(message);
}

expect(/where slug = 'toan-thay-truong'[\s\S]*for update/i,
  'The exact legacy portal must be locked before conversion.');
expect(/lower\(username\) = 'thaytruong'[\s\S]*lower\(username\) = 'hocsinhdemo'/i,
  'Only the requested teacher and student may be selected.');
expect(/thaytruong@gvtt\.vinhmath\.com[\s\S]*hocsinhdemo@hstt\.vinhmath\.com/i,
  'Both existing Auth suffixes must be verified before public data changes.');
expect(/v_roster_count <> 1/i,
  'The migration must stop if the audited one-student class scope changes.');
expect(/update public\.profiles[\s\S]*set role = 'teacher'[\s\S]*role = 'student'/i,
  'The legacy restricted manager must be promoted to an ordinary teacher profile.');
expect(/experience_mode = 'full_site'[\s\S]*home_path = 'khong-gian\?tenant=toan-thay-truong'[\s\S]*is_active = false/i,
  'The presentation must be staged as an inactive full-site tenant before account cutover.');
for (const key of ['home', 'classes', 'grading', 'authoring', 'question_bank', 'schedule', 'vmtool', 'profile']) {
  expect(new RegExp(`\\('teacher', '${key}', \\d+\\)`, 'i'), `Missing teacher feature ${key}`);
}
for (const key of ['home', 'lessons', 'practice', 'results', 'leaderboard', 'vmtool', 'profile']) {
  expect(new RegExp(`\\('student', '${key}', \\d+\\)`, 'i'), `Missing student feature ${key}`);
}
expect(/on conflict \(portal_id, role_scope, feature_key\) do update/i,
  'Feature setup must be idempotent.');
if (/update\s+auth\.users/i.test(sql)) throw new Error('Auth identities must only be changed through the Edge Function.');
if (/insert into public\.exam_portal_members|update public\.exam_portal_members/i.test(sql)) {
  throw new Error('Primary memberships must only be finalized by the transactional service-role RPC.');
}

function expectFinalize(pattern, message) {
  if (!pattern.test(finalizeSql)) throw new Error(message);
}

expectFinalize(/lower\(profile\.username\) = 'thaytruong'/i,
  'Finalizer must lock the exact teacher username.');
expectFinalize(/lower\(profile\.username\) = 'hocsinhdemo'/i,
  'Finalizer must lock the exact student username.');
expectFinalize(/lower\(auth_user\.email\) = 'thaytruong@gvtt\.vinhmath\.com'/i,
  'Finalizer must verify the teacher login suffix.');
expectFinalize(/lower\(auth_user\.email\) = 'hocsinhdemo@hstt\.vinhmath\.com'/i,
  'Finalizer must verify the student login suffix.');
expectFinalize(/v_roster_count <> 1/i,
  'Finalizer must stop if the audited class roster changes.');
expectFinalize(/jsonb_build_object\('vinhmath_role', 'teacher'\)/i,
  'Finalizer must repair the teacher Auth role claim.');
expectFinalize(/jsonb_build_object\('vinhmath_role', 'student'\)/i,
  'Finalizer must repair the student Auth role claim.');
expectFinalize(/vm_admin_finalize_full_site_tenant_migration/i,
  'Finalizer must reuse the central atomic membership cutover.');
expectFinalize(/membership_count'\)::integer, 0\) <> 2/i,
  'Finalizer must verify both primary memberships.');

console.log('PASS Toán Thầy Trường full-site upgrade staging contract');
