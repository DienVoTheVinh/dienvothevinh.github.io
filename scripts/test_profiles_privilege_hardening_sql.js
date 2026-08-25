const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260826170000_profiles_privilege_hardening.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const studentProfileUis = [
  'quan-tri-hoc-sinh.html',
  path.join('web', 'trang-web', 'quan-tri-hoc-sinh.html')
].map((relativePath) => ({
  relativePath,
  source: fs.readFileSync(path.join(root, relativePath), 'utf8')
}));
const nestedClassroomUi = fs.readFileSync(path.join(root, 'web', 'trang-web', 'quan-tri-lop.html'), 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function policyBlock(name) {
  const marker = `create policy ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  expect(start >= 0, `Missing policy ${name}`);
  const end = sql.indexOf(';', start);
  expect(end > start, `Unterminated policy ${name}`);
  return sql.slice(start, end + 1);
}

const selfUpdate = policyBlock('s_profile_self_upd');
expect(/for update\s+to authenticated/i.test(selfUpdate), 'Self policy must be UPDATE-only and authenticated-only.');
expect(/using \(id = \(select auth\.uid\(\)\)\)/i.test(selfUpdate), 'Self UPDATE must target only the caller row.');
expect(/with check \(id = \(select auth\.uid\(\)\)\)/i.test(selfUpdate), 'Self UPDATE must keep the caller row identity.');

const adminWrite = policyBlock('t_profiles_write');
expect(/for all\s+to authenticated/i.test(adminWrite), 'Admin account management must remain authenticated table CRUD.');
expect(/public\.is_admin\(\)/i.test(adminWrite), 'Broad profile writes must be admin-only.');
expect(!/is_teacher|role\s*=\s*'teacher'/i.test(adminWrite), 'Teachers must never receive broad profile writes.');

expect(/create or replace function private\.vm_guard_profile_privileged_update\(\)[\s\S]*security definer[\s\S]*set search_path=''/i.test(sql),
  'Privileged-column guard must be a private, pinned SECURITY DEFINER trigger function.');
expect(/before update on public\.profiles[\s\S]*execute function private\.vm_guard_profile_privileged_update\(\)/i.test(sql),
  'Profiles need the privileged-column BEFORE UPDATE trigger.');
expect(/revoke all on function private\.vm_guard_profile_privileged_update\(\)[\s\S]*public, anon, authenticated, service_role/i.test(sql),
  'Clients must not execute the trigger function directly.');

const safeFieldsMatch = sql.match(/array\[([^\]]+)\]::text\[\]/i);
expect(safeFieldsMatch, 'Missing default-deny safe profile field list.');
const safeFields = Array.from(safeFieldsMatch[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort();
expect(
  JSON.stringify(safeFields) === JSON.stringify([
    'avatar_url',
    'email',
    'full_name',
    'gender',
    'objective',
    'phone',
    'school'
  ]),
  'Only harmless contact/presentation fields may be self-edited.'
);

for (const privileged of ['id', 'role', 'username', 'class_id', 'parent_id', 'teacher_comment', 'created_at']) {
  expect(!safeFields.includes(privileged), `${privileged} must stay security-owned.`);
}
expect(/to_jsonb\(new\)[\s\S]*is distinct from[\s\S]*to_jsonb\(old\)/i.test(sql),
  'The guard must compare every non-safe current and future profile column.');
expect(/raise exception 'profile_privileged_update_forbidden'[\s\S]*errcode='42501'/i.test(sql),
  'Rejected privileged writes need a stable authorization error.');
expect(/revoke truncate on table public\.profiles from anon, authenticated/i.test(sql),
  'Client roles must not retain the RLS-bypassing TRUNCATE privilege.');

expect(/create or replace function private\.vm_profile_actor_can_manage_student\(\s*p_actor_id uuid,\s*p_student_id uuid\s*\)[\s\S]*security definer/i.test(sql),
  'Teacher profile changes need one private class-scope helper.');
expect(/class_students[\s\S]*classes[\s\S]*teacher_id=p_actor_id[\s\S]*co_teacher_id=p_actor_id[\s\S]*class_assistants[\s\S]*assistant_id=p_actor_id/i.test(sql),
  'Teacher/assistant scope must be derived from the student class assignment.');
expect(/actor\.role in \('teacher','assistant'\)/i.test(sql),
  'Only teacher and assistant roles may use the non-admin class scope.');
expect(/revoke all on function private\.vm_profile_actor_can_manage_student\(uuid,uuid\)[\s\S]*public, anon, authenticated, service_role/i.test(sql),
  'Clients must not invoke the private scope helper.');

expect(/create or replace function public\.vm_update_student_parent_note\([\s\S]*security definer[\s\S]*set search_path=''/i.test(sql),
  'Student parent/note updates need a pinned SECURITY DEFINER RPC.');
expect(/student\.id=p_student_id and student\.role='student'/i.test(sql),
  'The scoped RPC must target only student profiles.');
expect(/parent_profile\.id=p_parent_id and parent_profile\.role='parent'/i.test(sql),
  'The scoped RPC must accept only a real parent profile.');
expect(/not public\.is_admin\(\)[\s\S]*not private\.vm_profile_actor_can_manage_student\(v_actor,p_student_id\)/i.test(sql),
  'Non-admin callers must pass the exact class-scope check.');
expect(/char_length\(coalesce\(p_teacher_comment,''\)\) > 4000/i.test(sql),
  'Teacher comments need a bounded payload.');
const rpcUpdate = (sql.match(/create or replace function public\.vm_update_student_parent_note[\s\S]*?\$function\$;/i) || [''])[0];
expect(/update public\.profiles\s+set parent_id=p_parent_id,\s*teacher_comment=/i.test(rpcUpdate),
  'The scoped RPC may update only parent_id and teacher_comment.');
const rpcSetClause = (rpcUpdate.match(/update public\.profiles\s+set([\s\S]*?)\s+where/i) || [,''])[1];
for (const forbidden of ['role=', 'username=', 'class_id=']) {
  expect(!rpcSetClause.includes(forbidden), `Scoped teacher RPC must not write ${forbidden.slice(0, -1)}.`);
}
expect(/revoke all on function public\.vm_update_student_parent_note\(uuid,uuid,text\)[\s\S]*from public, anon[\s\S]*grant execute[\s\S]*to authenticated/i.test(sql),
  'The scoped RPC must be authenticated-only.');

for (const ui of studentProfileUis) {
  expect(/sb\.rpc\('vm_update_student_parent_note'/.test(ui.source),
    `${ui.relativePath} must use the scoped parent/note RPC.`);
  expect(!/from\('profiles'\)\.update\(\{\s*parent_id[\s\S]{0,160}teacher_comment/.test(ui.source),
    `${ui.relativePath} must not directly update privileged profile fields.`);
}
expect(!/from\('profiles'\)\.update\(\{\s*role:\s*'assistant'/.test(nestedClassroomUi),
  'The nested classroom artifact must not promote accounts directly.');

console.log('Profile privilege hardening SQL tests passed.');
