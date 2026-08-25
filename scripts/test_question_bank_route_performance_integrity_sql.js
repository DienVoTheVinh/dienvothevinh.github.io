const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260825193000_question_bank_route_performance_integrity.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function body(name) {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  ok(start >= 0, `missing ${name}`);
  const bodyStart = sql.indexOf('as $function$', start);
  const end = sql.indexOf('$function$;', bodyStart + 13);
  ok(bodyStart >= 0 && end > bodyStart, `unclosed ${name}`);
  return sql.slice(start, end + '$function$;'.length);
}

function has(pattern, message, source = sql) {
  ok(pattern.test(source), message);
}

const facets = body('public.vm_bank_taxonomy_facets');
const matrix = body('public.vm_bank_matrix');
for (const [name, source] of [['facets', facets], ['matrix', matrix]]) {
  ok(!/private\.vm_bank_item_matches\s*\(/i.test(source),
    `${name} reintroduced the per-item matcher`);
  ok(!/join\s+private\.vm_question_bank_items/i.test(source),
    `${name} reintroduced the duplicate item-table join`);
  has(/from private\.vm_question_bank_routes route/i,
    `${name} must scan the semantic route projection once`, source);
  for (const filter of [
    'grade', 'grades', 'area', 'areas', 'chapter', 'chapters', 'skill', 'skills',
    'difficulty', 'difficulties', 'question_type', 'question_types',
    'legacy_prefix', 'taxonomy_codes', 'source_kinds', 'tags'
  ]) {
    ok(source.includes(`'${filter}'`), `${name} lost filter ${filter}`);
  }
  has(/auth\.uid\(\) is null or not public\.is_teacher\(\)/i,
    `${name} must reject students and anonymous users`, source);
  has(/security definer[\s\S]*set search_path = public, private, auth, pg_temp/i,
    `${name} must retain its pinned security-definer boundary`, source);
}

has(/create or replace view private\.vm_question_bank_routes[\s\S]*i\.similarity_key,[\s\S]*i\.tags/i,
  'route projection must carry admin structural filter fields');
has(/revoke all on table private\.vm_question_bank_routes\s+from public, anon, authenticated, service_role/i,
  'private route projection must remain unavailable to client roles');

const category = body('private.vm_bank_document_category');
for (const kind of [
  'thpt_official', 'thpt_reference', 'thpt_mock', 'midterm', 'final',
  'semester_1', 'semester_2', 'chapter', 'mock', 'other'
]) {
  ok(category.includes(`'${kind}'`), `classifier lost canonical exam kind ${kind}`);
}
has(/dethamkhao\|deminhhoa\|dechinhthuc/i,
  'classifier must retain legacy THPT source names', category);
const legacyThptRegex = category.match(/~ '\(([^']*dethamkhao[^']*)\)'/i);
ok(legacyThptRegex, 'explicit legacy THPT classifier regex is missing');
ok(!/thi thử|thi thu|chính thức|chinh thuc/i.test(legacyThptRegex[1]),
  'generic thi-thu/chinh-thuc wording must not imply THPTQG');

const ready = body('private.vm_bank_document_is_ready');
has(/import_state[\s\S]*complete[\s\S]*expected_count[\s\S]*p_linked_count/i,
  'new imports must be complete and match expected_count', ready);
has(/p_active_count[\s\S]*p_linked_count[\s\S]*p_quarantined_count[\s\S]*=0/i,
  'ready documents must contain only active linked occurrences', ready);

const inventory = body('public.vm_bank_inventory');
has(/private\.vm_bank_document_is_ready/i,
  'inventory assignable count must use readiness guard', inventory);
const catalog = body('public.vm_bank_source_exam_catalog');
has(/private\.vm_bank_document_grade\(document\.metadata\)/i,
  'source catalog must derive grade from document metadata', catalog);
has(/v_grade_filter[\s\S]*document_grade=v_grade_filter/i,
  'source catalog must support complete-exam grade filtering', catalog);
has(/'grade',document_grade/i,
  'source catalog must return the complete-exam grade', catalog);
has(/'assignable',source_ready/i,
  'source catalog must never infer assignability from one active chunk', catalog);

const finalize = body('public.vm_bank_admin_finalize_document');
has(/public\.is_admin\(\)[\s\S]*bank_import_incomplete/i,
  'only admin may finalize a fully linked import', finalize);
has(/v_active<>v_linked[\s\S]*v_quarantined<>0[\s\S]*bank_import_has_quarantined/i,
  'finalizer must refuse to complete a source containing quarantined rows', finalize);
has(/'import_state','complete'[\s\S]*'expected_count',v_expected/i,
  'finalizer must record the complete expected-count contract', finalize);

has(/create trigger vm_bank_guard_source_exam_ready[\s\S]*private\.vm_question_bank_exam_specs/i,
  'source assignment/clone must be guarded at the exam-spec write boundary');
const sourceGuard = body('private.vm_bank_guard_source_exam_ready');
has(/new\.mode not in \('source_exam','clone_source'\)/i,
  'source readiness trigger must cover assign and clone modes', sourceGuard);
has(/bank_source_exam_not_ready/i,
  'unready sources must fail closed', sourceGuard);

has(/alter function public\.vm_bank_admin_import\(jsonb,jsonb\) set schema private/i,
  'the proven import core must be hidden behind the guarded wrapper');
const preserve = body('private.vm_bank_preserve_active_reimport');
has(/old\.status='active'[\s\S]*new\.status='quarantined'[\s\S]*old\.canonical_hash=new\.canonical_hash/i,
  're-import guard must target active canonical duplicates', preserve);
for (const field of [
  'legacy_code', 'content_latex', 'public_choices', 'answer_key',
  'solution_latex', 'raw_tex', 'canonical_tex', 'status'
]) {
  ok(new RegExp(`new\\.${field}\\s*:=\\s*old\\.${field}`, 'i').test(preserve)
      || (field === 'content_latex' && /new\.content_latex:=case[\s\S]*old\.content_latex/i.test(preserve)),
    `re-import guard does not preserve ${field}`);
}
const importWrapper = body('public.vm_bank_admin_import');
has(/content_hash=v_document_hash[\s\S]*bank_document_kind_conflict/i,
  're-uploading identical TeX must not silently change topic-pack/source-exam mode', importWrapper);
has(/private\.vm_bank_admin_import_core\(p_document,p_items\)/i,
  'public import wrapper must still link every source through the proven core', importWrapper);
has(/'protected_active',v_preserved/i,
  'import response must report protected active duplicates', importWrapper);

for (const signature of [
  'public.vm_bank_taxonomy_facets(jsonb)',
  'public.vm_bank_matrix(jsonb)',
  'public.vm_bank_inventory(jsonb)',
  'public.vm_bank_source_exam_catalog(jsonb,integer,integer)',
  'public.vm_bank_admin_finalize_document(uuid,integer)',
  'public.vm_bank_admin_import(jsonb,jsonb)'
]) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  has(new RegExp(`revoke all on function ${escaped}\\s+from public, anon`, 'i'),
    `${signature} must revoke anonymous execution`);
  has(new RegExp(`grant execute on function ${escaped}\\s+to authenticated, service_role`, 'i'),
    `${signature} must preserve authenticated execution`);
}

const starts = (sql.match(/as \$function\$/g) || []).length;
const ends = (sql.match(/\$function\$;/g) || []).length;
ok(starts === ends, `unbalanced function bodies: ${starts} starts, ${ends} ends`);

console.log('question-bank route performance/integrity SQL checks passed');
