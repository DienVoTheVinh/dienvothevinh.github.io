'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260826210000_full_site_tenant_overlay.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const indexSql = fs.readFileSync(path.join(
  root,
  'supabase',
  'migrations',
  '20260826210001_full_site_tenant_overlay_indexes.sql'
), 'utf8');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function has(pattern, message) {
  ok(pattern.test(sql), message);
}

function functionBody(name) {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  ok(start >= 0, `missing function ${name}`);
  const bodyStart = sql.indexOf('as $function$', start);
  const end = sql.indexOf('$function$;', bodyStart + 13);
  ok(bodyStart >= 0 && end > bodyStart, `unclosed function ${name}`);
  return sql.slice(start, end + '$function$;'.length);
}

function policyBlock(name) {
  const marker = `create policy ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  ok(start >= 0, `missing policy ${name}`);
  const end = sql.indexOf(';', start);
  ok(end > start, `unclosed policy ${name}`);
  return sql.slice(start, end + 1);
}

has(/add column experience_mode text not null default 'exam_only'/i,
  'tenant experience mode must be backward compatible');
has(/experience_mode in \('exam_only', 'full_site'\)/i,
  'tenant experience mode constraint missing');
has(/add column home_path text not null default 'thi'/i,
  'existing exam portals must retain their current home');
for (const column of ['home_title', 'home_subtitle', 'home_image_path']) {
  has(new RegExp(`add column ${column} text`, 'i'), `missing ${column}`);
}
has(/add column is_primary boolean not null default false/i,
  'primary tenant membership must be opt-in');
has(/create unique index exam_portal_members_one_primary_tenant_idx[\s\S]*on public\.exam_portal_members \(user_id\)[\s\S]*where is_primary/i,
  'one user must not have ambiguous primary tenants');

has(/create table public\.exam_portal_feature_rules[\s\S]*role_scope text not null default '\*'[\s\S]*feature_key text not null[\s\S]*state text not null default 'shown'/i,
  'normalized tenant feature rule contract missing');
has(/state in \('shown', 'locked', 'hidden'\)/i,
  'feature state vocabulary must match the UI');
has(/alter table public\.exam_portal_feature_rules enable row level security/i,
  'feature rules need RLS');
const featureRead = policyBlock('exam_portal_feature_rules_member_read');
ok(/public\.is_admin\(\)[\s\S]*exam_portal_members[\s\S]*membership\.user_id = \(select auth\.uid\(\)\)/i.test(featureRead),
  'only an admin or exact tenant member may read feature rules');
for (const policy of ['admin_insert', 'admin_update', 'admin_delete']) {
  ok(/public\.is_admin\(\)/i.test(policyBlock(`exam_portal_feature_rules_${policy}`)),
    `${policy} must remain admin-only`);
}
has(/revoke all on table public\.exam_portal_feature_rules from anon, authenticated/i,
  'feature table broad default grants must be revoked');

const currentContext = functionBody('public.vm_current_tenant_context');
ok(/security definer[\s\S]*set search_path = ''/i.test(currentContext),
  'authenticated tenant context must pin an empty search path');
ok(/membership\.is_primary[\s\S]*not membership\.portal_only[\s\S]*portal\.is_active[\s\S]*portal\.experience_mode = 'full_site'/i.test(currentContext),
  'current context must select only the active primary full-site membership');
for (const key of ['tenant_id', 'slug', 'login_suffix', 'teacher_login_suffix', 'home_path', 'member_role', 'portal_only', 'brand', 'features']) {
  ok(currentContext.includes(`'${key}'`), `current context misses ${key}`);
}
ok(/'audience', effective\.role_scope[\s\S]*'state', effective\.state/i.test(currentContext),
  'effective feature response shape does not match the frontend contract');

const publicContext = functionBody('public.vm_public_tenant_context');
ok(/security definer[\s\S]*set search_path = ''/i.test(publicContext),
  'public tenant descriptor must pin an empty search path');
ok(/portal\.slug = p_slug[\s\S]*portal\.is_active[\s\S]*portal\.experience_mode = 'full_site'/i.test(publicContext),
  'public descriptor must expose only an explicitly requested active full-site tenant');
for (const key of ['login_suffix', 'teacher_login_suffix']) {
  ok(publicContext.includes(`'${key}'`), `public descriptor misses ${key}`);
}
for (const secret of ['email', 'username', 'user_id', 'raw_app_meta_data', 'raw_user_meta_data']) {
  ok(!new RegExp(secret, 'i').test(publicContext), `public tenant descriptor leaks ${secret}`);
}
has(/revoke all on function public\.vm_public_tenant_context\(text\) from public, anon, authenticated[\s\S]*grant execute[\s\S]*to anon, authenticated/i,
  'public descriptor needs a narrow explicit execute grant');
has(/revoke all on function public\.vm_current_tenant_context\(\) from public, anon[\s\S]*grant execute[\s\S]*to authenticated/i,
  'current context must be authenticated-only');

const finalizer = functionBody('public.vm_admin_finalize_full_site_tenant_migration');
ok(/coalesce\(\(select auth\.role\(\)\), ''\) <> 'service_role'/i.test(finalizer),
  'tenant cutover must be service-role-only at runtime');
ok(/profile\.id = p_teacher_id and profile\.role = 'teacher'/i.test(finalizer),
  'tenant cutover must preserve and validate the teacher role');
ok(/profile\.id = any\(v_student_ids\)[\s\S]*profile\.role = 'student'/i.test(finalizer),
  'tenant cutover must preserve and validate student roles');
ok(/set is_primary = false[\s\S]*membership\.user_id = p_teacher_id[\s\S]*membership\.user_id = any\(v_student_ids\)/i.test(finalizer),
  'tenant cutover must clear only the selected cohort primary mappings');
ok(/values \(p_portal_id, p_teacher_id, 'manager', false, true\)/i.test(finalizer),
  'teacher membership must retain full VinhMath access');
ok(/select p_portal_id, students\.student_id, 'student', false, true/i.test(finalizer),
  'student memberships must retain full VinhMath access');
ok(/set is_active = true/i.test(finalizer),
  'tenant must activate only inside the atomic finalizer');
ok(!/update public\.profiles|update auth\.users/i.test(finalizer),
  'database cutover must never rewrite roles or Auth identities');
has(/revoke all on function public\.vm_admin_finalize_full_site_tenant_migration\(uuid, uuid, uuid\[\]\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i,
  'tenant finalizer grant must be service-role-only');

for (const policyName of ['exam_portal_exams_manager_insert', 'exam_portal_exams_manager_update']) {
  const policy = policyBlock(policyName);
  ok(/class_row\.portal_id = exam_portal_exams\.portal_id/i.test(policy),
    `${policyName} must correlate the class to the outer assignment portal`);
  ok(/exam_row\.portal_id = exam_portal_exams\.portal_id/i.test(policy),
    `${policyName} must correlate the exam to the outer assignment portal`);
  ok(!/class_row\.portal_id\s*=\s*class_row\.portal_id/i.test(policy),
    `${policyName} reintroduces class tenant shadowing`);
  ok(!/exam_row\.portal_id\s*=\s*exam_row\.portal_id/i.test(policy),
    `${policyName} reintroduces exam tenant shadowing`);
}

for (const table of ['exam_portals', 'exam_portal_members', 'exam_portal_exams']) {
  has(new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'),
    `${table} broad grants must be removed`);
  has(new RegExp(`grant select, insert, update, delete on table public\\.${table} to authenticated`, 'i'),
    `${table} normal authenticated flow grants must remain`);
}

has(/'uyenmath'[\s\S]*'hsum'[\s\S]*'gvum'[\s\S]*'full_site'[\s\S]*'uyenmath'[\s\S]*false[\s\S]*from public\.brand_templates brand[\s\S]*brand\.slug = 'lop-toan-co-uyen'[\s\S]*on conflict \(slug\) do nothing/i,
  'UYENMATH must be staged inactive against the existing brand without overwriting data');
ok(!/insert into public\.exam_portal_members[\s\S]*select[\s\S]*from public\.profiles/i.test(sql),
  'schema migration must not enroll existing accounts automatically');
ok(!/update public\.classes|update auth\.users|update public\.profiles/i.test(sql),
  'schema migration must not alter classes, Auth identities or profile roles');

const featureRules = [
  ['teacher', 'home'], ['teacher', 'classes'], ['teacher', 'grading'],
  ['teacher', 'authoring'], ['teacher', 'question_bank'], ['teacher', 'schedule'],
  ['teacher', 'vmtool'], ['teacher', 'profile'],
  ['student', 'home'], ['student', 'lessons'], ['student', 'practice'],
  ['student', 'results'], ['student', 'leaderboard'], ['student', 'vmtool'],
  ['student', 'profile']
];
for (const [roleScope, featureKey] of featureRules) {
  ok(new RegExp(`\\('${roleScope}', '${featureKey}', \\d+\\)`, 'i').test(sql),
    `missing default shown rule for ${roleScope}:${featureKey}`);
}

const dollarMarkers = (sql.match(/\$function\$/g) || []).length;
ok(dollarMarkers % 2 === 0, 'unbalanced $function$ markers');
ok(/create index if not exists exam_portal_feature_rules_updated_by_idx[\s\S]*on public\.exam_portal_feature_rules \(updated_by\)/i.test(indexSql),
  'feature-rule updated_by foreign key needs a covering index');

console.log('full-site tenant SQL contract passed');
