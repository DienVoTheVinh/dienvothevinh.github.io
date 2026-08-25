const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260825183000_question_bank_route_matrix.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const searchMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260825171000_question_bank_preview_search_hardening.sql'
);
const searchSql = fs.readFileSync(searchMigrationPath, 'utf8');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function has(pattern, message, source = sql) {
  ok(pattern.test(source), message);
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

function bodyFrom(source, name) {
  const marker = `create or replace function ${name}`;
  const start = source.toLowerCase().indexOf(marker.toLowerCase());
  ok(start >= 0, `missing function ${name}`);
  const bodyStart = source.indexOf('as $function$', start);
  const end = source.indexOf('$function$;', bodyStart + 13);
  ok(bodyStart >= 0 && end > bodyStart, `unclosed function ${name}`);
  return source.slice(start, end + '$function$;'.length);
}

function teacherPayload(body) {
  const match = body.match(/else\s+jsonb_build_object\(([\s\S]*?)\)\s+end\s+item/i);
  ok(match, 'teacher response branch is missing');
  return match[1];
}

function assertTeacherSafe(payload, label) {
  [
    'stable_id',
    'legacy_code',
    'taxonomy_key',
    'taxonomy_codes',
    'raw_tex',
    'canonical_tex',
    'answer_key',
    'solution_latex',
    'original_filename'
  ].forEach((secret) => {
    ok(!new RegExp(`'${secret}'`, 'i').test(payload), `${label} leaks ${secret}`);
  });
}

has(/create or replace view private\.vm_question_bank_routes\s+with \(security_invoker\s*=\s*true\)/i,
  'private semantic route view must use security_invoker');
has(/revoke all on table private\.vm_question_bank_routes\s+from public, anon, authenticated, service_role/i,
  'private semantic route view must be unavailable through client roles');
has(/vm_qb_items_route_filter_idx[\s\S]*status,grade,similarity_key,question_type,difficulty/i,
  'route filter index is missing');
has(/taxonomy->'vi'->>'chap_name'[\s\S]*taxonomy->'vi'->>'lesson_name'/i,
  'route labels must prefer trusted item taxonomy Vietnamese labels');

const matcherBody = functionBody('private.vm_bank_item_matches');
['area', 'areas', 'chapter', 'chapters', 'skill', 'skills'].forEach((filter) => {
  ok(new RegExp(`p_filters->'${filter}'|p_filters->>'${filter}'`, 'i').test(matcherBody),
    `semantic matcher is missing ${filter}`);
});
has(/revoke all on function private\.vm_bank_item_matches\(private\.vm_question_bank_items,jsonb\)\s+from public, anon, authenticated, service_role/i,
  'private matcher must not be executable by client roles');

const searchBody = bodyFrom(searchSql, 'public.vm_bank_search');
ok(/v_effective_filters\s*:=\s*v_effective_filters\s*-\s*'legacy_prefix'\s*-\s*'taxonomy_codes'\s*-\s*'source_kinds'\s*-\s*'tags'\s*-\s*'status'/i.test(searchBody),
  'teacher search must remove only structural bank filters');
['area', 'chapter', 'skill'].forEach((filter) => {
  ok(!new RegExp(`-\\s*'${filter}'`, 'i').test(searchBody),
    `teacher search sanitizer must preserve ${filter}`);
});
ok(/private\.vm_bank_item_matches\(i,v_effective_filters\)/i.test(searchBody),
  'teacher search must pass preserved semantic filters to the server matcher');
ok(/auth\.uid\(\) is null or not public\.is_teacher\(\)/i.test(searchBody),
  'bank search must reject students and anonymous users');
ok(/set search_path = public, private, auth, pg_temp/i.test(searchBody),
  'bank search security-definer search_path is not pinned');
has(/revoke all on function public\.vm_bank_search\(jsonb,integer,integer\)\s+from public, anon/i,
  'bank search anonymous revoke is missing', searchSql);

const facetsBody = functionBody('public.vm_bank_taxonomy_facets');
ok(/auth\.uid\(\) is null or not public\.is_teacher\(\)/i.test(facetsBody),
  'taxonomy facets must reject students and anonymous users');
['grade', 'area', 'chapter', 'skill', 'area_label', 'chapter_label', 'skill_label', 'count'].forEach((field) => {
  ok(new RegExp(`'${field}'`, 'i').test(facetsBody), `taxonomy facets field ${field} is missing`);
});
ok(/mode\(\) within group \(order by route\.chapter_label\)/i.test(facetsBody)
    && /mode\(\) within group \(order by route\.skill_label\)/i.test(facetsBody),
  'facets must use the majority canonical label rather than lexicographic min');
ok(/jsonb_agg\(item order by grade,chapter,area,skill\)/i.test(facetsBody),
  'facets must order chapter number before area');
ok(/case when v_is_admin then[\s\S]*'structure'[\s\S]*sample_stable_ids[\s\S]*sample_legacy_ids/i.test(facetsBody),
  'admin taxonomy facets need bounded structural identifiers');
assertTeacherSafe(teacherPayload(facetsBody), 'teacher taxonomy facets');

const matrixBody = functionBody('public.vm_bank_matrix');
ok(/auth\.uid\(\) is null or not public\.is_teacher\(\)/i.test(matrixBody),
  'matrix must reject students and anonymous users');
['question_type', 'difficulty', 'count'].forEach((field) => {
  ok(new RegExp(`'${field}'`, 'i').test(matrixBody), `matrix field ${field} is missing`);
});
ok(/mode\(\) within group \(order by route\.chapter_label\)/i.test(matrixBody)
    && /mode\(\) within group \(order by route\.skill_label\)/i.test(matrixBody),
  'matrix must use the majority canonical label rather than lexicographic min');
ok(/jsonb_agg\(item order by grade,chapter,area,skill,question_type,difficulty\)/i.test(matrixBody),
  'matrix must order chapter number before area');
ok(/case when v_is_admin then[\s\S]*'structure'/i.test(matrixBody),
  'admin matrix must retain private structure in its admin-only branch');
assertTeacherSafe(teacherPayload(matrixBody), 'teacher matrix');

const inventoryBody = functionBody('public.vm_bank_inventory');
ok(/auth\.uid\(\) is null or not public\.is_teacher\(\)/i.test(inventoryBody),
  'inventory must reject students and anonymous users');
['topic_pack', 'thptqg', 'semester', 'other_exam'].forEach((category) => {
  ok(new RegExp(`'${category}'`, 'i').test(inventoryBody), `inventory category ${category} is missing`);
});
ok(/when v_is_admin and p_filters->>'status' in \('active','quarantined','archived'\)/i.test(inventoryBody),
  'inventory status selection must remain admin-only');
['full_exams', 'topic_packs', 'active', 'quarantined'].forEach((field) => {
  ok(new RegExp(`'${field}'`, 'i').test(inventoryBody), `inventory summary ${field} is missing`);
});
ok(/category in \('thptqg','semester','other_exam'\)/i.test(inventoryBody),
  'full-exam inventory count must cover every complete-exam category');
ok(/active_questions between 1 and 200[\s\S]*assignable_documents/i.test(inventoryBody),
  'inventory must count only reviewed active exams within the assignment limit');
assertTeacherSafe(teacherPayload(inventoryBody), 'teacher inventory');

const categoryBody = functionBody('private.vm_bank_document_category');
ok(/dethamkhao|dechinhthuc|deminhhoa/i.test(categoryBody),
  'THPTQG classifier must recognize imported official/reference file names');
ok(/hk\[12\]|ghk\[12\]/i.test(categoryBody),
  'semester classifier must recognize HK/GHK sources');

const catalogBody = functionBody('public.vm_bank_source_exam_catalog');
ok(/auth\.uid\(\) is null or not public\.is_teacher\(\)/i.test(catalogBody),
  'source catalog must reject students and anonymous users');
ok(/p_filters->>'bank_category'[\s\S]*p_filters->>'category'/i.test(catalogBody),
  'source catalog category filter is missing');
ok(/p_filters->>'bank_variant'[\s\S]*p_filters->>'variant'/i.test(catalogBody),
  'source catalog variant filter is missing');
ok(/'assignable',\(counts\.active_count between 1 and 200\)/i.test(catalogBody),
  'source catalog must flag exams that exceed the 200-question assignment limit');
assertTeacherSafe(teacherPayload(catalogBody), 'teacher source catalog');

const generatorBody = functionBody('public.vm_bank_generate_exam');
['area', 'areas', 'chapter', 'chapters', 'skill', 'skills'].forEach((filter) => {
  const matches = generatorBody.match(new RegExp(`'${filter}'`, 'gi')) || [];
  ok(matches.length >= 2, `teacher generator must allow ${filter} in base and segment filters`);
});
ok(/private\.vm_bank_item_matches\(i,v_filters\)/i.test(generatorBody),
  'generation must apply the semantic matcher server-side');
ok(/'matrix',v_matrix/i.test(generatorBody),
  'generation response must include a server-side matrix for selected questions');
ok(/route\.item_id=any\(v_selected\)/i.test(generatorBody),
  'generation matrix must be computed from the selected items, not a preview page');
ok(/'scope',jsonb_strip_nulls\(jsonb_build_object\([\s\S]*'chapter',v_filters->'chapter'[\s\S]*'skill',v_filters->'skill'/i.test(generatorBody),
  'partial-selection warnings must return only the safe semantic scope');
ok(!/fallback|relax|broaden/i.test(generatorBody),
  'strict chapter/topic generation must not silently broaden the requested scope');

[
  'public.vm_bank_taxonomy_facets(jsonb)',
  'public.vm_bank_matrix(jsonb)',
  'public.vm_bank_inventory(jsonb)',
  'public.vm_bank_source_exam_catalog(jsonb,integer,integer)',
  'public.vm_bank_generate_exam(jsonb)'
].forEach((signature) => {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  has(new RegExp(`revoke all on function ${escaped}\\s+from public, anon`, 'i'),
    `${signature} anonymous revoke is missing`);
  has(new RegExp(`grant execute on function ${escaped}\\s+to authenticated, service_role`, 'i'),
    `${signature} authenticated execution grant is missing`);
});

[
  facetsBody,
  matrixBody,
  inventoryBody,
  catalogBody,
  generatorBody
].forEach((body) => {
  ok(/security definer/i.test(body), 'public bank RPC must be security definer');
  ok(/set search_path = public, private, auth, pg_temp/i.test(body),
    'public bank RPC security-definer search_path must be pinned');
});

ok(!/grant\s+(select|insert|update|delete|all)[\s\S]{0,120}private\.vm_question_bank/i.test(sql),
  'migration must not directly grant private bank tables or views');

const starts = (sql.match(/as \$function\$/g) || []).length;
const ends = (sql.match(/\$function\$;/g) || []).length;
ok(starts === ends, `unbalanced function bodies: ${starts} starts, ${ends} ends`);

console.log('question-bank route/matrix SQL checks passed');
