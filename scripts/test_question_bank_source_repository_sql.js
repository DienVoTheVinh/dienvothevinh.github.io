'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826141000_question_bank_source_repository_origins.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function has(pattern, message, source = sql) {
  ok(pattern.test(source), message);
}

function functionBody(name) {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  ok(start >= 0, `missing ${name}`);
  const bodyStart = sql.indexOf('as $function$', start);
  const end = sql.indexOf('$function$;', bodyStart + 13);
  ok(bodyStart >= 0 && end > bodyStart, `unclosed ${name}`);
  return sql.slice(start, end + '$function$;'.length);
}

const origin = functionBody('private.vm_bank_document_source_origin');
has(/returns\s+text[\s\S]*language\s+sql[\s\S]*\bimmutable\b[\s\S]*parallel\s+safe[\s\S]*security\s+invoker/i,
  'source-origin classifier must remain immutable and security-invoker', origin);
has(/set\s+search_path\s*=\s*pg_catalog\s*,\s*pg_temp/i,
  'source-origin classifier needs a pinned catalog-only search path', origin);
for (const value of ['authored', 'province_exam', 'topic_pack', 'other']) {
  ok(origin.includes(`'${value}'`), `source-origin classifier lost ${value}`);
}
has(/dethamkhao\[0-9\]\{1,2\}/i,
  'legacy Dethamkhao1..99 naming must map to authored sources', origin);
const authoredIndex = origin.search(/dethamkhao\[0-9\]\{1,2\}[\s\S]*then\s+'authored'/i);
const provinceIndex = origin.search(/nullif\(btrim\(coalesce\(p_province[\s\S]*then\s+'province_exam'/i);
ok(authoredIndex >= 0 && provinceIndex > authoredIndex,
  'legacy authored naming must win before the province fallback');
ok(!/dethamkhao\[0-9\]\+/i.test(origin),
  'unbounded digits would misclassify official DeThamKhao2025 as authored');
has(/revoke\s+all\s+on\s+function\s+private\.vm_bank_document_source_origin\([\s\S]*jsonb\s*,\s*jsonb[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
  'private source-origin helper must not be executable by API roles');

const safePath = functionBody('private.vm_bank_safe_relative_path');
has(/replace\(v_path\s*,\s*E'\\\\'\s*,\s*'\/'\)/i,
  'safe path helper must normalize Windows separators', safePath);
for (const guard of ['^[a-zA-Z]:/', '(^|/)\\.\\.(/|$)', '://']) {
  ok(safePath.includes(guard), `safe path helper lost guard ${guard}`);
}
has(/revoke\s+all\s+on\s+function\s+private\.vm_bank_safe_relative_path\(jsonb\s*,\s*jsonb\)[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
  'private relative-path sanitizer must not be exposed');

const repository = functionBody('public.vm_bank_admin_document_catalog');
has(/\bstable\b[\s\S]*security\s+definer[\s\S]*set\s+search_path\s*=\s*public\s*,\s*private\s*,\s*auth\s*,\s*pg_temp/i,
  'repository catalog must be stable with a pinned security-definer boundary', repository);
has(/auth\.uid\(\)\s+is\s+null\s+or\s+not\s+public\.is_admin\(\)/i,
  'only administrators may list the private source repository', repository);
has(/from\s+private\.vm_question_bank_documents\s+document/i,
  'repository catalog must cover the private document repository', repository);
ok(!/where\s+document\.source_kind\s*=\s*'mock_exam'/i.test(repository),
  'repository catalog must not be limited to complete exams');
for (const filter of [
  'repository_status', 'status', 'source_kind', 'source_origin', 'grade', 'query'
]) {
  ok(repository.includes(`p_filters->>'${filter}'`),
    `repository catalog lost ${filter} filtering`);
}
for (const field of [
  'id', 'stable_id', 'title', 'original_filename', 'relative_path',
  'source_kind', 'source_origin', 'status', 'repository_status', 'province', 'grade',
  'exam_year', 'exam_kind', 'tags', 'bank_category', 'bank_variant',
  'assignable', 'question_count', 'total_question_count', 'active_count',
  'total_count', 'quarantined_count', 'error_count', 'import_state',
  'expected_count', 'raw_size', 'created_at', 'updated_at'
]) {
  ok(repository.includes(`'${field}'`), `repository payload lost ${field}`);
}
has(/pg_catalog\.octet_length\(document\.raw_tex\)\s+raw_size/i,
  'repository may expose byte size without exposing source content', repository);
for (const state of ['ready', 'review', 'staging', 'error', 'archived']) {
  ok(repository.includes(`'${state}'`),
    `repository status classifier lost ${state}`);
}
has(/v_document_status\s+is\s+null[\s\S]*document_status\s*=\s*v_document_status/i,
  'raw document-status filter must remain independent', repository);
has(/v_repository_status\s+is\s+null[\s\S]*repository_status\s*=\s*v_repository_status/i,
  'workflow-status filter must use the derived repository status', repository);
const payloadStart = repository.indexOf('jsonb_build_object(', repository.indexOf('payload as'));
const payloadEnd = repository.indexOf(') item', payloadStart);
ok(payloadStart >= 0 && payloadEnd > payloadStart, 'repository payload not found');
const payload = repository.slice(payloadStart, payloadEnd);
for (const secret of [
  "'raw_tex'", "'provenance'", "'content_hash'", "'answer_key'",
  "'solution_latex'", "'canonical_tex'"
]) {
  ok(!payload.includes(secret), `repository payload leaks ${secret}`);
}
has(/order\s+by\s+updated_at\s+desc\s*,\s*id\s+desc[\s\S]*limit\s+v_limit\s+offset\s+v_offset/i,
  'repository page order must be deterministic', repository);
has(/jsonb_agg\(payload\.item\s+order\s+by\s+payload\.updated_at\s+desc\s*,\s*payload\.id\s+desc\)/i,
  'repository aggregate order must match page order', repository);
has(/least\(greatest\(coalesce\(p_limit\s*,\s*40\)\s*,\s*1\)\s*,\s*100\)/i,
  'repository page size must be bounded', repository);
has(/revoke\s+all\s+on\s+function\s+public\.vm_bank_admin_document_catalog\([\s\S]*jsonb\s*,\s*integer\s*,\s*integer[\s\S]*from\s+public\s*,\s*anon/i,
  'anonymous users must not execute the repository catalog');
has(/grant\s+execute\s+on\s+function\s+public\.vm_bank_admin_document_catalog\([\s\S]*jsonb\s*,\s*integer\s*,\s*integer[\s\S]*to\s+authenticated\s*,\s*service_role/i,
  'staff calls must reach the repository catalog internal admin check');

const catalog = functionBody('public.vm_bank_source_exam_catalog');
has(/v_source_origin\s+text\s*:=\s*nullif\(p_filters->>'source_origin'\s*,\s*''\)/i,
  'source-exam catalog must accept a source-origin filter', catalog);
has(/v_source_origin\s+is\s+null[\s\S]*catalog\.catalog_source_origin\s*=\s*v_source_origin/i,
  'source-exam catalog must apply its source-origin filter', catalog);
has(/'source_origin'\s*,\s*catalog_source_origin/i,
  'source-exam catalog must return source_origin', catalog);
has(/order\s+by\s+created_at\s+desc\s*,\s*id\s+desc[\s\S]*limit\s+v_limit\s+offset\s+v_offset/i,
  'source-exam pagination must retain a deterministic tie-breaker', catalog);
for (const boundary of [
  /auth\.uid\(\)\s+is\s+null\s+or\s+not\s+public\.is_teacher\(\)/i,
  /security\s+definer[\s\S]*set\s+search_path\s*=\s*public\s*,\s*private\s*,\s*auth\s*,\s*pg_temp/i
]) {
  has(boundary, 'source-exam catalog security boundary regressed', catalog);
}

const summary = functionBody('public.vm_bank_category_summary');
has(/private\.vm_bank_document_source_origin\([\s\S]*\)\s+source_origin/i,
  'category summary must classify document provenance once', summary);
has(/origin_grouped\s+as\s*\([\s\S]*group\s+by\s+source_origin/i,
  'category summary must aggregate a separate provenance shelf', summary);
has(/'origins'\s*,\s*v_origins/i,
  'category summary must return origin counts beside categories', summary);
has(/count\(distinct\s+item_id\)\s+filter\s*\([\s\S]*document_status='active'\s+and\s+item_status='active'/i,
  'origin/category counts must retain canonical-question semantics', summary);
has(/'quarantined_documents'\s*,\s*case\s+when\s+public\.is_admin\(\)/i,
  'review counts must remain hidden from teachers', summary);

ok(!/create\s+or\s+replace\s+function\s+private\.vm_bank_document_category/i.test(sql),
  'source origin must stay orthogonal to pedagogical category');

const starts = (sql.match(/as \$function\$/g) || []).length;
const ends = (sql.match(/\$function\$;/g) || []).length;
ok(starts === ends, `unbalanced function bodies: ${starts} starts, ${ends} ends`);

console.log('question-bank source repository/origin SQL checks passed');
