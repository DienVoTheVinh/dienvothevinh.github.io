const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '20260825113000_secure_question_bank_generation.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const hardeningPath = path.join(root, 'supabase', 'migrations', '20260825162000_question_bank_staff_review_hardening.sql');
const hardeningSql = fs.readFileSync(hardeningPath, 'utf8');
const migrationDirectory = path.join(root, 'supabase', 'migrations');
const effectiveSql = fs.readdirSync(migrationDirectory)
  .filter((name) => /^\d+.*\.sql$/i.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationDirectory, name), 'utf8'))
  .join('\n');

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

function hardeningFunctionBody(name) {
  const marker = `create or replace function ${name}`;
  const start = hardeningSql.toLowerCase().indexOf(marker.toLowerCase());
  ok(start >= 0, `missing hardening function ${name}`);
  const bodyStart = hardeningSql.indexOf('as $function$', start);
  const end = hardeningSql.indexOf('$function$;', bodyStart + 13);
  ok(bodyStart >= 0 && end > bodyStart, `unclosed hardening function ${name}`);
  return hardeningSql.slice(start, end + '$function$;'.length);
}

function effectiveFunctionBody(name) {
  const marker = `create or replace function ${name}`;
  const start = effectiveSql.toLowerCase().lastIndexOf(marker.toLowerCase());
  ok(start >= 0, `missing effective function ${name}`);
  const bodyStart = effectiveSql.indexOf('as $function$', start);
  const end = effectiveSql.indexOf('$function$;', bodyStart + 13);
  ok(bodyStart >= 0 && end > bodyStart, `unclosed effective function ${name}`);
  return effectiveSql.slice(start, end + '$function$;'.length);
}

[
  'private.vm_question_bank_documents',
  'private.vm_question_bank_items',
  'private.vm_question_bank_taxonomy',
  'private.vm_question_bank_item_sources',
  'private.vm_question_bank_recommendations',
  'private.vm_question_bank_exam_specs',
  'private.vm_question_bank_exam_occurrences'
].forEach((table) => {
  has(new RegExp(`create table if not exists ${table.replace('.', '\\.')}`, 'i'), `missing ${table}`);
  has(new RegExp(`alter table ${table.replace('.', '\\.')} enable row level security`, 'i'), `RLS missing for ${table}`);
});

has(/revoke all on table[\s\S]*vm_question_bank_documents[\s\S]*from public, anon, authenticated, service_role/i,
  'private bank tables must be revoked from every client role');
has(/legacy_code text,/i, 'legacy taxonomy code must not be unique');
ok(!/legacy_code text[^\n]*unique/i.test(sql), 'legacy taxonomy code cannot be unique');
has(/canonical_hash text not null unique/i, 'canonical identity hash missing');
has(/create extension if not exists pgcrypto with schema extensions/i,
  'pgcrypto must use the namespace referenced by security-definer functions');
has(/create extension if not exists pg_trgm with schema extensions/i,
  'large-bank substring search needs pg_trgm');
has(/alter extension %I set schema extensions/i,
  'drifted extension namespaces must be repaired before qualified use');
has(/vm_qb_items_active_content_trgm_idx[\s\S]*gin \(lower\(content_latex\) extensions\.gin_trgm_ops\)[\s\S]*where status='active'/i,
  'active question content trigram index missing');
has(/vm_qb_items_active_catalog_idx[\s\S]*legacy_code nulls last,created_at,id[\s\S]*where status='active'/i,
  'active bank catalogue ordering index missing');
has(/vm_qb_items_tags_idx[\s\S]*using gin\(tags\)/i, 'question tag GIN index missing');
has(/vm_qb_items_skill_family_idx[\s\S]*coalesce\(taxonomy->>'skill_family',split_part\(similarity_key,'-',1\)\)[\s\S]*where status='active'/i,
  'source-structure fallback needs an active skill-family index');
has(/vm_qb_documents_catalog_idx[\s\S]*source_kind,status,exam_year,created_at desc/i,
  'source catalog composite index missing');
has(/vm_qb_documents_tags_idx[\s\S]*using gin\(tags\)/i, 'source document tag GIN index missing');
has(/source_ordinal integer not null/i, 'ordered source-exam composition missing');
has(/sort integer not null check \(sort >= 0\)/i, 'exam occurrence sort invariant missing');
has(/source_ordinal integer check \(source_ordinal is null or source_ordinal >= 0\)/i,
  'exam occurrence source ordinal invariant missing');
has(/create unique index[^;]*vm_qb_exam_occurrences_source_ordinal[^;]*exam_id,source_document_id,source_ordinal[^;]*where source_document_id is not null and source_ordinal is not null/is,
  'source-exam occurrence ordinal uniqueness missing');
ok(!/unique \(document_id, item_id, source_ordinal\)/i.test(sql),
  'source composition must allow a canonical item at multiple ordinals');
has(/province text[\s\S]*exam_year integer[\s\S]*exam_kind text[\s\S]*tags text\[\]/i,
  'source-exam metadata missing');
has(/taxonomy_key text primary key[\s\S]*grade smallint[\s\S]*area text[\s\S]*chapter integer[\s\S]*skill integer[\s\S]*variant text[\s\S]*vi_label jsonb[\s\S]*slug_label jsonb/i,
  'private operational taxonomy catalog missing');
has(/alter column vi_label type jsonb using[\s\S]*jsonb_build_object\('type_name'/i,
  'older scalar taxonomy labels need a compatible JSONB migration');
has(/drop policy if exists s_eq on public\.exam_questions/i,
  'legacy student direct composition policy must be removed');
has(/drop policy if exists t_eq_read on public\.exam_questions/i,
  'legacy direct exam-question policy must be removed');
has(/create policy exam_questions_staff_read[\s\S]*for select to authenticated[\s\S]*public\.is_staff/i,
  'direct exam composition must be staff-only');
has(/create policy questions_bank_direct_scope[\s\S]*as restrictive[\s\S]*vm_bank_direct_question_allowed/i,
  'bank question snapshots need a restrictive direct-table policy');
has(/create policy exams_bank_direct_scope[\s\S]*as restrictive[\s\S]*vm_bank_direct_exam_allowed/i,
  'bank exam rows need a restrictive direct-table policy');
has(/create policy exam_questions_bank_direct_scope[\s\S]*as restrictive[\s\S]*vm_bank_direct_exam_question_allowed/i,
  'bank exam composition needs a restrictive direct-table policy');

const effectiveExamQuestionBoundary = effectiveFunctionBody('private.vm_bank_direct_exam_question_allowed');
ok(/when private\.vm_bank_exam_is_protected\([\s\S]*?\) then public\.is_admin\(\)/i.test(effectiveExamQuestionBoundary),
  'protected bank exam composition must be directly visible and mutable only to admins');
const protectedBranch = (effectiveExamQuestionBoundary.match(/when private\.vm_bank_exam_is_protected\([\s\S]*?\) then ([\s\S]*?)when not private\.vm_bank_direct_question_allowed/i) || [])[1] || '';
ok(protectedBranch && !/vm_bank_target_is_manageable|vm_bank_can_manage_exam/i.test(protectedBranch),
  'a managing teacher must not receive protected exam question UUIDs or direct composition CRUD');
ok(/when not private\.vm_bank_direct_question_allowed\(p_question_id\)\s+then public\.is_admin\(\)[\s\S]*else true/i.test(effectiveExamQuestionBoundary),
  'legacy normal exam composition must remain compatible while bank snapshots stay admin-only');

const safeExamCatalog = effectiveFunctionBody('public.vm_bank_exam_catalog');
ok(/auth\.uid\(\) is null or not public\.is_teacher\(\)/i.test(safeExamCatalog)
    && /private\.vm_bank_can_manage_exam\(exam\.id\)/i.test(safeExamCatalog),
  'safe generated-exam catalogue must require teacher role and exact managed scope');
ok(/select count\(\*\)::integer[\s\S]*from public\.exam_questions composition[\s\S]*composition\.exam_id=exam\.id/i.test(safeExamCatalog),
  'safe generated-exam catalogue may expose only a server-computed question count');
for (const secret of ["'question_id'", "'item_id'", "'raw_tex'", "'canonical_tex'", "'answer_key'", "'solution_latex'", "'legacy_code'"]) {
  ok(!safeExamCatalog.toLowerCase().includes(secret), `safe generated-exam catalogue leaks ${secret}`);
}
ok(/revoke all on function public\.vm_bank_exam_catalog\(integer\)[\s\S]*from public, anon[\s\S]*grant execute[\s\S]*to authenticated/i.test(effectiveSql),
  'safe generated-exam catalogue grants must be authenticated-only');

const targetBody = functionBody('private.vm_bank_target_is_manageable');
ok(/public\.is_teacher\(\)/i.test(targetBody), 'assistants must not manage bank targets');
ok(/c\.portal_id is null and p_portal_id is null[\s\S]*can_manage_class/i.test(targetBody),
  'non-portal class must reject a portal id');
ok(/c\.portal_id is not null and p_portal_id=c\.portal_id[\s\S]*can_manage_exam_portal/i.test(targetBody),
  'portal class and portal id must belong to the same tenant');

const importBody = functionBody('public.vm_bank_admin_import');
ok(/not public\.is_admin\(\)/i.test(importBody), 'import must be admin-only');
ok(/extensions\.digest\(convert_to\(v_identity_text,'UTF8'\),'sha256'\)/i.test(importBody), 'server-side canonical SHA-256 identity missing');
ok(/extensions\.gen_random_bytes\(12\)/i.test(functionBody('public.vm_bank_generate_exam')),
  'seed generation must use the schema-qualified pgcrypto function');
ok(/v_client_hash !~ '\^\[0-9a-f\]\{16\}/i.test(importBody), 'client hash validation and diagnostic metadata support missing');
ok(/regexp_replace\(v_canonical,E'%/i.test(importBody), 'canonical hash must strip editable legacy metadata');
ok(!/v_hash := v_client_hash/i.test(importBody), 'short client hashes must never become database identity');
ok(/\[Nội dung ngân hàng được bảo vệ\]/i.test(importBody), 'public snapshot must be opaque');
ok(!/values\(v_stable,null,v_difficulty,v_content,v_public_choices/i.test(importBody),
  'bank content/answers must never be copied into public.questions');
ok(/solution_latex = null/i.test(importBody), 'public snapshot solution must stay null');
ok(/bank_duplicate_source_ordinal/i.test(importBody),
  'one import payload must reject duplicate source ordinals');
ok(/on conflict \(document_id,source_ordinal\) do update/i.test(importBody),
  'intentional chunk re-import must retain ordinal upsert semantics');
ok(/vm_bank_taxonomy_key_from_legacy\(v_legacy_code\)[\s\S]*vm_bank_difficulty_from_legacy\(v_legacy_code\)/i.test(importBody),
  'server import must derive taxonomy and difficulty from the canonical ID');
ok(/v_taxonomy_entry\.taxonomy_key[\s\S]*ID phân loại chưa có trong danh mục/i.test(importBody),
  'unknown taxonomy IDs must be quarantined by the server');
ok(/'taxonomy_key',v_taxonomy_entry\.taxonomy_key[\s\S]*'skill_family',v_taxonomy_entry\.skill_family/i.test(importBody),
  'trusted taxonomy labels and families must be merged during import');

const taxonomyKeyBody = functionBody('private.vm_bank_taxonomy_key_from_legacy');
ok(/\(\[NBYHTVKGC\]\)/i.test(taxonomyKeyBody), 'canonical ID difficulty aliases are incomplete');
ok(/return v_parts\[1\]\|\|v_parts\[2\]\|\|v_parts\[3\]\|\|'\?'\|\|v_parts\[5\]\|\|'-'\|\|v_parts\[6\]/i.test(taxonomyKeyBody),
  'canonical ID must derive its difficulty-independent taxonomy key');
const taxonomyDifficultyBody = functionBody('private.vm_bank_difficulty_from_legacy');
['NB', 'TH', 'VD', 'VDC'].forEach((difficulty) => {
  ok(taxonomyDifficultyBody.includes(`'${difficulty}'`), `canonical ID mapping misses ${difficulty}`);
});
has(/revoke all on function private\.vm_bank_taxonomy_key_from_legacy\(text\) from public, anon, authenticated, service_role/i,
  'taxonomy ID parser must remain private');

const rawBody = functionBody('public.vm_bank_admin_document');
ok(/not public\.is_admin\(\)/i.test(rawBody), 'raw TeX reader must be admin-only');
has(/revoke all on function public\.vm_bank_admin_document\(uuid\) from public, anon/i,
  'raw reader anonymous revoke missing');

const taxonomyImportBody = functionBody('public.vm_bank_admin_import_taxonomy');
ok(/not public\.is_admin\(\)/i.test(taxonomyImportBody), 'taxonomy import must be admin-only');
ok(/vm_question_bank_taxonomy/i.test(taxonomyImportBody) && /on conflict \(taxonomy_key\) do update/i.test(taxonomyImportBody),
  'taxonomy import upsert missing');
ok(/jsonb_typeof\(v_entry->'vi'\)='object'[\s\S]*v_entry->'vi'/i.test(taxonomyImportBody),
  'nested Vietnamese taxonomy labels must stay structured JSON');
const taxonomyCatalogBody = functionBody('public.vm_bank_admin_taxonomy_catalog');
ok(/not public\.is_admin\(\)/i.test(taxonomyCatalogBody), 'taxonomy catalog must be admin-only');
['label', 'area_label', 'chapter_label', 'skill_label', 'variant_label', 'vi', 'slug'].forEach((field) => {
  ok(new RegExp(`'${field}'`, 'i').test(taxonomyCatalogBody), `taxonomy catalog field ${field} missing`);
});
ok(/least\(greatest\(coalesce\(p_limit,600\),1\),1000\)/i.test(taxonomyCatalogBody),
  'taxonomy catalog must page the complete 530-key archive without truncation');

const patchBody = functionBody('public.vm_bank_admin_patch_item');
ok(/bank_item_id_invalid/i.test(patchBody) && /bank_item_taxonomy_unknown/i.test(patchBody),
  'manual classification must enforce the same canonical ID and taxonomy catalogue');
ok(/similarity_key=coalesce\(v_taxonomy_key/i.test(patchBody)
    && /difficulty=coalesce\(v_code_difficulty/i.test(patchBody),
  'manual classification must derive similarity and difficulty on the server');
const activeGuardBody = hardeningFunctionBody('private.vm_bank_enforce_active_item');
ok(/new\.status <> 'active'[\s\S]*bank_item_id_required[\s\S]*bank_item_taxonomy_unknown/i.test(activeGuardBody),
  'every active item write must revalidate its canonical ID and taxonomy');
ok(/question_type='multiple_choice'[\s\S]*jsonb_array_length\(new\.public_choices\)<>4[\s\S]*jsonb_array_length\(new\.answer_key->'correct_indexes'\)<>1/i.test(activeGuardBody),
  'multiple-choice activation must require four choices and exactly one answer');
ok(/question_type='true_false'[\s\S]*jsonb_array_length\(new\.public_choices\)<>4[\s\S]*count\(\*\)<>count\(distinct x\.value\)/i.test(activeGuardBody),
  'true/false activation must validate four statements and unique answer indexes');
ok(/question_type='short_answer'[\s\S]*nullif\(btrim\(new\.answer_key->>'value'\),''\) is null/i.test(activeGuardBody),
  'short-answer activation must require a stored answer');
ok(/create trigger vm_bank_active_item_guard[\s\S]*before insert or update of[\s\S]*answer_key[\s\S]*execute function private\.vm_bank_enforce_active_item\(\)/i.test(hardeningSql),
  'central active-item guard must cover import, patch and future write paths');

const searchBody = functionBody('public.vm_bank_search');
ok(/not public\.is_teacher\(\)/i.test(searchBody), 'bank search must require teacher/admin');
ok(/case when v_is_admin then[\s\S]*'legacy_code'[\s\S]*else[\s\S]*'choices',i\.public_choices/i.test(searchBody),
  'teacher search must use a reduced response shape');
ok(/v_effective_filters[\s\S]*- 'legacy_prefix' - 'taxonomy_codes' - 'source_kinds' - 'tags' - 'status'/i.test(searchBody),
  'teacher search must ignore structural bank filters');
['raw_tex', 'canonical_tex', 'answer_key', 'solution_latex', 'source_location'].forEach((secret) => {
  ok(!new RegExp(`'${secret}'`, 'i').test(searchBody), `teacher search leaks ${secret}`);
});

const catalogBody = functionBody('public.vm_bank_source_exam_catalog');
ok(/source_kind='mock_exam'/i.test(catalogBody), 'source exam catalog must only list source exams');
ok(/case when v_is_admin then[\s\S]*'quarantined_count'[\s\S]*else[\s\S]*'question_count'/i.test(catalogBody),
  'teacher source catalog must hide structural/quarantine metadata');
['raw_tex', 'canonical_tex', 'answer_key', 'solution_latex', 'original_filename'].forEach((secret) => {
  ok(!new RegExp(`'${secret}'`, 'i').test(catalogBody), `source catalog leaks ${secret}`);
});
ok(/v_question_count_filter[\s\S]*v_min_questions[\s\S]*v_max_questions/i.test(catalogBody),
  'source catalog question-count filters missing');
ok(/province_or_unit/i.test(catalogBody) && /exam_type/i.test(catalogBody),
  'source catalog must accept import metadata aliases');

const generatorBody = functionBody('public.vm_bank_generate_exam');
ok(/vm_bank_assert_exam_target/i.test(generatorBody), 'generated exam target authorization missing');
ok(/md5\(v_seed/i.test(generatorBody), 'seeded deterministic selection missing');
ok(/private\.vm_bank_item_matches\(i,v_filters\)/i.test(generatorBody), 'blueprint filters missing');
ok(/v_requested_total[\s\S]*bank_blueprint_question_limit_exceeded/i.test(generatorBody),
  'total blueprint request must be capped at 200 questions');
ok(/v_default_count>200[\s\S]*bank_blueprint_question_limit_exceeded/i.test(generatorBody)
    && /v_default_count>100[\s\S]*jsonb_build_object\('count',100\)[\s\S]*v_default_count-100/i.test(generatorBody),
  'default generation count must reject over 200 and split bounded queries up to 200');
ok(/v_needed<0 or v_needed>100[\s\S]*bank_blueprint_count_invalid/i.test(generatorBody),
  'segment counts must be validated rather than silently clamped');
ok(/vm_question_bank_exam_specs/i.test(generatorBody), 'detailed generation spec must stay private');
ok(!/generation_spec[^\n]*p_spec/i.test(generatorBody), 'public exam metadata must not store full generation spec');
ok(/if not v_is_admin then[\s\S]*'grade'[\s\S]*'difficulty'[\s\S]*'question_type'/i.test(generatorBody),
  'teacher generation filters need an explicit pedagogical allowlist');
ok(/v_is_admin and jsonb_typeof\(p_spec->'exclude_question_ids'\)='array'/i.test(generatorBody),
  'explicit bank item exclusion must be admin-only');
ok(/case when v_is_admin then jsonb_build_object\('filters',v_filters\) else '\{\}'::jsonb end/i.test(generatorBody),
  'teacher generation warnings must not echo structural filters');

const cloneBody = functionBody('public.vm_bank_clone_source_structure');
ok(/vm_bank_assert_exam_target\(v_class_id,v_portal_id\)/i.test(cloneBody),
  'source-structure clone needs exact class/portal authorization');
ok(/source_kind='mock_exam' and status='active'/i.test(cloneBody),
  'source-structure clone must use an active source exam');
ok(/v_source_count>200[\s\S]*bank_source_exam_question_limit_exceeded/i.test(cloneBody),
  'source-structure clone must enforce the 200-question bound');
ok(/c\.status='active'[\s\S]*c\.question_type=v_source\.question_type/i.test(cloneBody),
  'source-structure clone must preserve question type using active items');
ok(/original\.document_id=p_document_id and original\.item_id=c\.id/i.test(cloneBody),
  'source-structure clone must not recycle source-exam questions');
ok(/candidate_rank\.value between greatest\(v_source\.difficulty_rank-1,1\)[\s\S]*v_source\.difficulty_rank/i.test(cloneBody),
  'source-structure fallback must stay at the same or one-lower difficulty');
ok(/c\.similarity_key=v_source\.taxonomy_key[\s\S]*skill_family/i.test(cloneBody),
  'source-structure clone needs exact taxonomy then skill-family fallback');
ok(/md5\(v_seed\|\|':'\|\|v_source\.source_ordinal::text\|\|':'\|\|c\.stable_id\)/i.test(cloneBody),
  'source-structure clone must be deterministic for a fixed seed');
ok(/jsonb_build_object\('mode','clone_source','question_count',v_count\)/i.test(cloneBody),
  'public exam metadata must contain only a sanitized clone summary');
const cloneReturn = cloneBody.slice(cloneBody.lastIndexOf('return jsonb_build_object'));
['taxonomy', 'raw_tex', 'answer_key', 'solution_latex', 'legacy_code'].forEach((secret) => {
  ok(!new RegExp(`'${secret}'`, 'i').test(cloneReturn), `source clone response leaks ${secret}`);
});
has(/revoke all on function public\.vm_bank_clone_source_structure\(uuid,jsonb\) from public, anon/i,
  'anonymous source-structure clone access must be revoked');

const assignBody = functionBody('public.vm_bank_assign_source_exam');
ok(/source_ordinal/i.test(assignBody), 'source exam assignment must preserve source order');
ok(/vm_bank_assert_exam_target/i.test(assignBody), 'source exam assignment target authorization missing');
ok(/QBO-[\s\S]*vm_question_bank_exam_occurrences/i.test(assignBody),
  'duplicate source occurrences need opaque per-exam snapshots');
ok(!/distinct on \(i\.id\)/i.test(assignBody), 'source exam assignment must not deduplicate repeated items');

const normalizeBody = functionBody('private.vm_bank_normalize_short_answer');
ok(/immutable/i.test(normalizeBody), 'short-answer normalization must be immutable');
['−', "replace(v_value,',','.')", "replace(replace(replace(v_value,'$',''),'{',''),'}','')", "'[.;:!?]+$'"].forEach((part) => {
  ok(normalizeBody.includes(part), `short-answer normalizer missing ${part}`);
});
has(/revoke all on function private\.vm_bank_normalize_short_answer\(text\) from public, anon, authenticated, service_role/i,
  'short-answer normalizer must not be client-callable');

const loadBody = functionBody('public.vm_exam_load');
ok(/private\.vm_question_bank_items/i.test(loadBody)
    && /coalesce\(bank_item\.content_latex,q\.content_latex\)/i.test(loadBody),
  'sanctioned exam load must overlay private bank content');
ok(/private\.vm_bank_reveal_choices/i.test(loadBody), 'answer reveal must use private mapping');
ok(/when v_reveal/i.test(loadBody), 'answers cannot reveal before the allowed state');
const revealExpression = ((loadBody.match(/v_reveal\s*:=([\s\S]*?);\s*if not v_reveal/i) || [])[1] || '');
ok(revealExpression && !/v_protected and private\.vm_bank_can_manage_exam/i.test(revealExpression),
  'managing teachers must not receive protected bank answers or solutions');
ok(/v_reveal\s*:=\s*public\.is_admin\(\)/i.test(loadBody),
  'protected bank answer reveal must remain available to administrators');
ok(/v_staff_preview\s*:=\s*public\.is_admin\(\)[\s\S]*v_protected and private\.vm_bank_can_manage_exam/i.test(loadBody)
    && /if not v_reveal and not v_staff_preview/i.test(loadBody),
  'an exact-scope teacher must retain a sanitized preview outside the student time window');
ok(/not v_protected and public\.is_staff\(\)/i.test(loadBody),
  'legacy staff answer reveal compatibility missing');
ok(/not public\.is_staff\(\)[\s\S]*a\.student_id=auth\.uid\(\)[\s\S]*submitted_at is not null/i.test(loadBody),
  'student answer reveal must be owner-only and post-submit');
ok(!/vm_bank_is_assistant\(\)/i.test(loadBody), 'assistant must never receive bank answer reveal');
ok(/jsonb_array_length\(q\.choices\)=1[\s\S]*key',''\)\)='short'[\s\S]*jsonb_build_object\('latex',''\)/i.test(loadBody),
  'legacy short-answer key must be blanked before submission');
ok(/vm_bank_normalize_short_answer\(v_item\.answer_key->>'value'\)/i.test(functionBody('private.vm_bank_reveal_choices')),
  'revealed short answer must use normalized form');

const accessBody = functionBody('private.vm_can_access_exam');
ok(/owner_student_id=auth\.uid\(\)/i.test(accessBody), 'owner-only adaptive exam access missing');
ok(/e\.owner_student_id is null/i.test(accessBody), 'adaptive exam must not fall through global exam access');
ok(/vm_bank_exam_is_protected[\s\S]*vm_bank_can_manage_exam/i.test(accessBody),
  'protected exam access must require exact management scope');
ok(/not private\.vm_bank_exam_is_protected[\s\S]*public\.is_staff\(\)/i.test(accessBody),
  'legacy staff exam access compatibility missing');
ok(/not public\.is_staff\(\)[\s\S]*e\.published/i.test(accessBody),
  'staff accounts must not fall through the student bank path');
ok(!/vm_bank_is_assistant\(\)/i.test(accessBody), 'assistant must not get a protected bank exception');

const answerProtectionBody = functionBody('private.vm_bank_attempt_answer_is_protected');
ok(/vm_bank_exam_is_protected/i.test(answerProtectionBody)
    && /vm_question_bank_items[\s\S]*snapshot_question_id=p_question_id/i.test(answerProtectionBody)
    && /vm_question_bank_exam_occurrences[\s\S]*question_id=p_question_id/i.test(answerProtectionBody),
  'attempt-answer protection must cover generated exams, shared snapshots and duplicate clones');
const answerReadBody = functionBody('private.vm_attempt_answer_result_read_allowed');
ok(/a\.submitted_at is not null/i.test(answerReadBody),
  'direct attempt-answer reads must never reveal correctness before submission');
has(/create policy attempt_answers_bank_direct_scope[\s\S]*as restrictive for all to authenticated[\s\S]*vm_bank_attempt_answer_is_protected\(attempt_id,question_id\)/i,
  'protected bank attempt answers must be RPC-only for non-admin users');
has(/create policy attempt_answers_result_read_scope[\s\S]*as restrictive for select to authenticated[\s\S]*vm_attempt_answer_result_read_allowed\(attempt_id\)/i,
  'legacy permissive policies must be neutralized by a post-submit restrictive policy');
has(/revoke all on function private\.vm_bank_attempt_answer_is_protected\(uuid,uuid\)[\s\S]*from public, anon, authenticated, service_role/i,
  'attempt-answer protection internals must not expose bank classification');

const gradeBody = functionBody('private.vm_exam_grade_answer');
ok(/vm_question_bank_exam_occurrences[\s\S]*o\.question_id=p_question_id/i.test(gradeBody),
  'grader must resolve duplicate occurrence clones to the canonical item');
ok((gradeBody.match(/vm_bank_normalize_short_answer/g) || []).length >= 4,
  'bank and legacy short answers must share immutable normalization');

const buildRecBody = functionBody('private.vm_bank_build_recommendations');
ok(/vm_bank_question_item_id\(eq\.exam_id,eq\.question_id\)/i.test(buildRecBody),
  'recommendations must resolve duplicate occurrence clones');
ok(/taxonomy->>'skill_family'[\s\S]*taxonomy->>'topic_code'/i.test(buildRecBody),
  'recommendations must use the imported taxonomy family/topic fields');
ok(/old_occurrence\.item_id=c\.id/i.test(buildRecBody)
    && !/vm_bank_question_item_id\(old_attempt\.exam_id,old_answer\.question_id\)=c\.id/i.test(buildRecBody),
  'recommendation history exclusion must use indexed occurrence joins');

const recBody = functionBody('public.vm_exam_recommendations');
['answer_key', 'solution_latex', 'raw_tex', 'canonical_tex', 'content_latex', 'public_choices', 'legacy_code', 'taxonomy'].forEach((secret) => {
  ok(!new RegExp(`'${secret}'`, 'i').test(recBody), `student recommendation leaks ${secret}`);
});
ok(/v_attempt\.student_id=auth\.uid\(\) and not public\.is_staff\(\)/i.test(recBody),
  'student recommendations must be true-student owner scoped');
ok(/private\.vm_bank_can_manage_exam\(v_attempt\.exam_id\)/i.test(recBody),
  'teacher recommendations must be limited to managed exams');
ok(!/and not public\.is_staff\(\)\) then/i.test(recBody),
  'a global staff override would leak recommendations to assistants');

const recoveryBody = functionBody('public.vm_exam_create_recovery');
ok(/owner_student_id[\s\S]*source_attempt_id/i.test(recoveryBody), 'recovery exam ownership/provenance missing');
ok(/v_attempt\.student_id<>auth\.uid\(\)/i.test(recoveryBody), 'recovery creation must be attempt-owner scoped');
ok(/or public\.is_staff\(\) then/i.test(recoveryBody), 'staff accounts must not create student recovery exams');

const submitBody = functionBody('public.vm_exam_submit');
ok(/private\.vm_bank_build_recommendations/i.test(submitBody), 'submit must build similar-question recommendations');

const dollarMarkers = (sql.match(/\$function\$/g) || []).length;
ok(dollarMarkers % 2 === 0, 'unbalanced $function$ markers');

console.log('question bank SQL security contract OK');
