const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260826153000_question_bank_teacher_issue_reports.sql');
const hardeningPath = path.join(root, 'supabase/migrations/20260826163000_question_bank_issue_locator_hardening.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const hardening = fs.readFileSync(hardeningPath, 'utf8');
const effectiveMigrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'))
  .join('\n');
const classroomUis = [
  'quan-tri-lop.html',
  'web/trang-web/quan-tri-lop.html'
].map((relativePath) => ({
  relativePath,
  source:fs.readFileSync(path.join(root, relativePath), 'utf8')
}));
const notificationMenus = [
  'js/menu-v5.js',
  'web/trang-web/js/menu-v5.js'
].map((relativePath) => ({
  relativePath,
  source:fs.readFileSync(path.join(root, relativePath), 'utf8')
}));

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function functionBody(name) {
  const marker = `create or replace function public.${name}`;
  const start = migration.indexOf(marker);
  expect(start >= 0, `Missing RPC ${name}`);
  const end = migration.indexOf('$function$;', start);
  expect(end >= 0, `Unterminated RPC ${name}`);
  return migration.slice(start, end + '$function$;'.length);
}

function functionBodyFrom(source, name) {
  const marker = `create or replace function public.${name}`;
  const start = source.indexOf(marker);
  expect(start >= 0, `Missing RPC ${name}`);
  const end = source.indexOf('$function$;', start);
  expect(end >= 0, `Unterminated RPC ${name}`);
  return source.slice(start, end + '$function$;'.length);
}

expect(
  /create table if not exists private\.vm_question_bank_issue_reports/.test(migration),
  'Issue reports must stay in the private schema.'
);
expect(
  /target_type text not null[\s\S]*source_document[\s\S]*exam[\s\S]*question/.test(migration),
  'Issue reports need the three supported target types.'
);
for (const column of ['target_id', 'document_id', 'item_id', 'exam_id', 'issue_type', 'description', 'reported_by', 'status', 'created_at', 'updated_at']) {
  expect(new RegExp(`\\b${column}\\b`).test(migration), `Missing issue-report column ${column}.`);
}
expect(/enable row level security/.test(migration), 'Private issue reports need defense-in-depth RLS.');
expect(
  /revoke all on table private\.vm_question_bank_issue_reports[\s\S]*public, anon, authenticated, service_role/.test(migration),
  'No client role may read the private report table directly.'
);
expect(
  /create unique index[\s\S]*vm_qb_issue_reports_open_dedupe_idx[\s\S]*where status in \('open','in_review'\)/.test(migration),
  'Unresolved reports need a partial dedupe index.'
);
expect(
  /vm_qb_issue_reports_reporter_rate_idx/.test(migration),
  'Rate-limit lookups need a reporter/time index.'
);

const sourcePreview = functionBody('vm_bank_source_exam_preview');
const examPreview = functionBody('vm_bank_exam_preview');
for (const preview of [sourcePreview, examPreview]) {
  expect(!/'item_id'/.test(preview), 'Sanitized teacher previews must not expose private item IDs.');
  expect(/vm_bank_preview_content/.test(preview), 'Preview statements must pass through the solution stripper.');
  expect(/vm_bank_preview_choices/.test(preview), 'Preview choices must use the strict public allow-list.');
  for (const forbidden of ["'raw_tex'", "'answer_key'", "'solution_latex'", "'canonical_tex'", "'provenance'"]) {
    expect(!preview.includes(forbidden), `Preview leaks forbidden field ${forbidden}.`);
  }
}
expect(/private\.vm_bank_can_manage_exam\(p_exam_id\)/.test(examPreview), 'Exam preview must enforce exact managed scope.');

const report = functionBody('vm_bank_report_issue');
const reportWrapper = functionBodyFrom(hardening, 'vm_bank_report_issue');
expect(/v_reporter is null or not public\.is_teacher\(\)/.test(report), 'Only authenticated teachers/admins may report.');
expect(
  /document\.source_kind='mock_exam' and document\.status='active'/.test(report),
  'Teacher source reports must match the sanitized source-preview scope.'
);
expect(
  /private\.vm_bank_exam_is_protected[\s\S]*private\.vm_bank_can_manage_exam/.test(report),
  'Teacher exam reports must match the protected managed-exam preview scope.'
);
expect(
  /source_item\.source_ordinal=v_source_ordinal/.test(report),
  'A source-question report must resolve the private item from the visible document position.'
);
expect(
  /occurrence\.sort=v_exam_sort/.test(report),
  'An exam-question report must resolve the private item from the visible exam position.'
);
expect(
  /not public\.is_admin\(\)[\s\S]*v_target \? 'item_id'[\s\S]*v_target_type='question' and v_target \? 'target_id'[\s\S]*bank_issue_locator_invalid/.test(reportWrapper),
  'Teachers must not be able to probe private bank UUIDs through an item_id locator.'
);
expect(
  /alter function public\.vm_bank_report_issue\(text,jsonb,text,text\)[\s\S]*rename to vm_bank_report_issue_internal/.test(hardening),
  'The already-deployed report implementation must be preserved behind an internal function.'
);
expect(
  /revoke all on function public\.vm_bank_report_issue_internal\(text,jsonb,text,text\)[\s\S]*from public, anon, authenticated, service_role/.test(hardening),
  'No client role, including authenticated teachers, may execute the internal report implementation.'
);
expect(
  !/grant execute on function public\.vm_bank_report_issue_internal\(text,jsonb,text,text\)/i.test(effectiveMigrations),
  'A later migration must not re-grant direct access to the internal issue-report implementation.'
);
expect(
  /security definer/.test(reportWrapper) &&
    /auth\.uid\(\) is null or not public\.is_teacher\(\)/.test(reportWrapper) &&
    /return public\.vm_bank_report_issue_internal\(/.test(reportWrapper),
  'The public wrapper must authenticate teachers, reject private locators, then delegate internally.'
);
expect(
  /revoke all on function public\.vm_bank_report_issue\(text,jsonb,text,text\)[\s\S]*from public, anon[\s\S]*grant execute[\s\S]*to authenticated/.test(hardening),
  'Only authenticated users may execute the hardened public issue-report wrapper.'
);
expect(/pg_advisory_xact_lock/.test(report), 'Double-click/rate-limit decisions must be serialized per reporter.');
expect(/interval '1 hour'[\s\S]*>=20/.test(report), 'Non-admin reporters need a bounded hourly rate limit.');
expect(/'duplicate',true/.test(report), 'Duplicate unresolved reports must return the existing report.');
expect(
  /insert into public\.notifications[\s\S]*where profile\.role='admin'/.test(report),
  'New issue reports must notify admin recipients only.'
);
expect(
  /bank_report='\|\|v_report_id::text\|\|'#bank-repository'/.test(report),
  'Admin notifications need a report-ID deep link to the repository workspace.'
);
for (const forbidden of ["'raw_tex'", "'answer_key'", "'solution_latex'", "'canonical_tex'", "'provenance'"]) {
  expect(!report.includes(forbidden), `Create-report RPC leaks forbidden field ${forbidden}.`);
}

expect(
  /drop policy if exists noti_sel[\s\S]*using \(\(select auth\.uid\(\)\)=user_id\)/.test(migration),
  'Notifications must be readable only by their recipient.'
);
const notificationPolicy = migration.slice(
  migration.indexOf('drop policy if exists noti_sel'),
  migration.indexOf('create or replace function public.vm_bank_source_exam_preview')
);
expect(!/is_staff\(\)/.test(notificationPolicy), 'Teachers must not inherit access to admin notifications.');
expect(
  /drop policy if exists noti_ins/i.test(notificationPolicy),
  'The legacy direct notification insert policy must be removed before issue-report alerts are introduced.'
);
const replacementInsertPolicy = notificationPolicy.match(/create policy noti_ins[\s\S]*?(?=create or replace function|$)/i);
expect(!replacementInsertPolicy, 'No client notification INSERT policy may be recreated; notifications must use vetted RPCs or triggers.');
expect(
  /revoke insert on table public\.notifications from authenticated, anon/i.test(notificationPolicy) &&
    /revoke delete on table public\.notifications from authenticated, anon/i.test(notificationPolicy) &&
    /revoke update on table public\.notifications from authenticated[\s\S]*grant update\(read_at\) on table public\.notifications to authenticated/i.test(notificationPolicy),
  'Notification clients must be limited to updating their own read_at field.'
);

const classStart = functionBody('vm_notify_class_start');
expect(/security definer/.test(classStart), 'Class-start notification delivery must run through a security-definer RPC.');
expect(/not public\.is_teacher\(\)[\s\S]*not coalesce\(public\.can_manage_class\(p_class_id\),false\)/.test(classStart),
  'Class-start notifications need teacher role and exact class-management scope.');
expect(/v_link !~\* '\^https:\/\//.test(classStart), 'Class-start links must be HTTPS and whitespace-free.');
expect(/pg_advisory_xact_lock[\s\S]*interval '20 minutes'/.test(classStart),
  'Class-start notification delivery needs serialized 20-minute deduplication.');
expect(/from public\.class_students membership[\s\S]*membership\.class_id=p_class_id/.test(classStart),
  'Class-start notifications may address only students enrolled in the managed class.');
expect(/revoke all on function public\.vm_notify_class_start\(uuid,text\)[\s\S]*from public, anon[\s\S]*grant execute[\s\S]*to authenticated/.test(migration),
  'Class-start notification RPC grants must be authenticated-only.');
for (const classroomUi of classroomUis) {
  expect(/sb\.rpc\('vm_notify_class_start'/.test(classroomUi.source),
    `${classroomUi.relativePath} must use the scoped class-start RPC.`);
  expect(!/sb\.from\(['"]notifications['"]\)\.(?:insert|select)/.test(classroomUi.source),
    `${classroomUi.relativePath} must not insert notifications directly or enumerate recipients through notifications.`);
}

for (const menu of notificationMenus) {
  const renderStart = menu.source.indexOf('async function veDanhSachThongBao()');
  const routerStart = menu.source.indexOf('function vmDichDenThongBao(', renderStart);
  expect(renderStart >= 0 && routerStart > renderStart, `${menu.relativePath} is missing the notification renderer/router.`);
  const render = menu.source.slice(renderStart, routerStart);
  const routerEnd = menu.source.indexOf('// Đóng mở dropdown', routerStart);
  const router = menu.source.slice(routerStart, routerEnd > routerStart ? routerEnd : undefined);

  expect(/khung\.replaceChildren\(\)/.test(render), `${menu.relativePath} must clear notification rows through DOM APIs.`);
  expect(
    /createElement\('b'\)[\s\S]*title\.textContent = String\(t\.title \|\| 'Thông báo'\)/.test(render) &&
      /createElement\('span'\)[\s\S]*body\.textContent = String\(t\.body\)/.test(render) &&
      /createElement\('small'\)[\s\S]*time\.textContent = luc/.test(render),
    `${menu.relativePath} must render all database-controlled notification text with textContent.`
  );
  expect(
    !/(?:innerHTML|insertAdjacentHTML)[^\n]*(?:t\.title|t\.body|t\.link)/.test(render),
    `${menu.relativePath} must not interpolate notification database fields into HTML.`
  );
  expect(
    /new URL\((?:String\()?link\)?, window\.location\.origin\)/.test(router) &&
      /url\.protocol !== 'https:' && url\.protocol !== 'http:'/.test(router) &&
      /catch \(e\) \{ return ''; \}/.test(router),
    `${menu.relativePath} must parse links against the site origin and allow only HTTP(S).`
  );
  expect(!/return\s+(?:String\()?link\)?\s*;/.test(router), `${menu.relativePath} must not fall back to an unvalidated raw link.`);
}

expect(
  /v_target_label:='Câu '\|\|\(v_exam_sort\+1\)::text\|\|' · '\|\|v_target_label/.test(report),
  'A generated exam uses zero-based sort locators but must label sort 0 as Câu 1.'
);
expect(
  /v_context_key:='exam:'\|\|v_exam_id::text\|\|':sort:'\|\|v_exam_sort::text/.test(report),
  'The stored generated-exam locator must retain its original zero-based sort value.'
);

for (const rpcName of [
  'vm_bank_admin_issue_reports',
  'vm_bank_admin_issue_report',
  'vm_bank_admin_resolve_issue'
]) {
  const body = functionBody(rpcName);
  expect(
    /(auth\.uid\(\)|v_actor) is null or not public\.is_admin\(\)/.test(body),
    `${rpcName} must be admin-only.`
  );
}

expect(
  /revoke all on function public\.vm_bank_report_issue\(text,jsonb,text,text\)[\s\S]*from public, anon[\s\S]*grant execute[\s\S]*to authenticated/.test(migration),
  'Create-report RPC execute privileges are not locked down.'
);
for (const signature of [
  'vm_bank_admin_issue_reports\\(jsonb,integer,integer\\)',
  'vm_bank_admin_issue_report\\(uuid\\)',
  'vm_bank_admin_resolve_issue\\(uuid,text,text\\)'
]) {
  expect(
    new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*from public, anon[\\s\\S]*grant execute[\\s\\S]*to authenticated`).test(migration),
    `Admin RPC privilege contract is incomplete for ${signature}.`
  );
}

console.log('PASS question-bank teacher issue-reporting SQL contract');
