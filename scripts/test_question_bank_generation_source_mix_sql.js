'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826160000_question_bank_generation_source_mix.sql'
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

const sourceMatcher = functionBody('private.vm_bank_item_has_source_origin');
has(/alter\s+table\s+private\.vm_question_bank_documents[\s\S]*add\s+column\s+if\s+not\s+exists\s+source_origin\s+text\s+generated\s+always\s+as\s*\([\s\S]*private\.vm_bank_document_source_origin\([\s\S]*\)\s*\)\s*stored/i,
  'document origin must be stored from the canonical immutable classifier');
has(/create\s+index\s+if\s+not\s+exists\s+vm_qb_documents_origin_status_idx[\s\S]*\(source_origin\s*,\s*status\s*,\s*id\)/i,
  'source-balanced generation needs an indexed document origin');
has(/from\s+private\.vm_question_bank_item_sources\s+source[\s\S]*join\s+private\.vm_question_bank_documents\s+document/i,
  'source matcher must derive provenance through a bank document');
has(/document\.status\s*=\s*'active'/i,
  'archived or quarantined source documents must not feed generation', sourceMatcher);
has(/document\.source_origin\s*=\s*p_source_origin/i,
  'source matcher must use the indexed canonical origin', sourceMatcher);
has(/security\s+invoker[\s\S]*set\s+search_path\s*=\s*private\s*,\s*public\s*,\s*pg_temp/i,
  'private source matcher needs a pinned invoker boundary', sourceMatcher);
has(/revoke\s+all\s+on\s+function\s+private\.vm_bank_item_has_source_origin\(uuid\s*,\s*text\)[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
  'client roles must not call the private origin matcher');

const generator = functionBody('public.vm_bank_generate_exam');
for (const kind of ['practice_topic', 'semester_exam', 'thptqg_exam']) {
  ok(generator.includes(`'${kind}'`), `output kind ${kind} is missing`);
}
has(/v_output_kind\s+not\s+in\s*\(\s*'practice_topic'\s*,\s*'semester_exam'\s*,\s*'thptqg_exam'\s*\)/i,
  'output_kind must be server-whitelisted', generator);
has(/raise\s+exception\s+'bank_output_kind_invalid'/i,
  'invalid output_kind needs an explicit API error', generator);

for (const origin of ['province_exam', 'authored', 'topic_pack']) {
  ok(generator.includes(`'${origin}'`), `source origin ${origin} is missing`);
}
has(/jsonb_typeof\(p_spec->'source_origins'\)\s+is\s+distinct\s+from\s+'array'[\s\S]*jsonb_array_length\(p_spec->'source_origins'\)\s*=\s*0/i,
  'source_origins must be a non-empty JSON array when supplied', generator);
has(/entry\.value#>>'\{\}'\s+not\s+in\s*\(\s*'province_exam'\s*,\s*'authored'\s*,\s*'topic_pack'\s*\)/i,
  'source_origins must reject values outside the public provenance whitelist', generator);
has(/cardinality\(v_source_origins\)\s*<>\s*v_origin_count[\s\S]*bank_source_origins_duplicate/i,
  'duplicate source shelves must be rejected rather than distorting quotas', generator);

for (const filter of [
  'grade', 'grades', 'area', 'areas', 'chapter', 'chapters', 'skill', 'skills',
  'difficulty', 'difficulties', 'question_type', 'question_types'
]) {
  const matches = generator.match(new RegExp(`'${filter}'`, 'gi')) || [];
  ok(matches.length >= 2, `teacher-safe generation lost ${filter}`);
}
has(/v_segment_filters\s*:=\s*case[\s\S]*-'source_origins'-'output_kind'/i,
  'blueprint segments must not override the top-level source/output contract', generator);
has(/from\s+private\.vm_question_bank_routes\s+route/i,
  'generation must select through the canonical semantic route view', generator);
for (const routeFilter of [
  ['grade', /route\.grade\s*=\s*\(v_filters->>'grade'\)::smallint/i],
  ['area', /route\.area\s*=\s*upper\(v_filters->>'area'\)/i],
  ['chapter', /route\.chapter\s*=\s*\(v_filters->>'chapter'\)::integer/i],
  ['skill', /route\.skill\s*=\s*\(v_filters->>'skill'\)::integer/i],
  ['difficulty', /route\.difficulty\s*=\s*upper\(v_filters->>'difficulty'\)/i],
  ['question_type', /route\.question_type\s*=\s*v_filters->>'question_type'/i]
]) {
  ok(routeFilter[1].test(generator),
    `${routeFilter[0]} must be enforced directly in the server selection query`);
}
has(/join\s+private\.vm_question_bank_item_sources\s+source\s+on\s+source\.item_id=item\.id[\s\S]*join\s+private\.vm_question_bank_documents\s+document[\s\S]*requested\.source_origin=document\.source_origin/i,
  'selection must join only the explicitly selected source shelves', generator);
has(/row_number\(\)\s+over\s*\([\s\S]*partition\s+by\s+assigned\.source_origin[\s\S]*\)\s+source_rank[\s\S]*source_rank\s*<=\s*\(v_needed\/v_origin_count\)/i,
  'the database must allocate a balanced deterministic per-origin quota in one scan', generator);
has(/md5\(v_seed\|\|[\s\S]*item\.stable_id/i,
  'selection must be deterministic for the same seed and stable question IDs', generator);
has(/order\s+by\s+md5\([\s\S]*assigned\.id/i,
  'deterministic selection needs an ID tie-breaker', generator);
has(/with\s+origin_candidates\s+as\s*\([\s\S]*join\s+unnest\(v_source_origins\)[\s\S]*item_origin_rank=1[\s\S]*limit\s+v_remaining/i,
  'short quotas may rebalance only inside the explicitly selected shelves', generator);
ok(!/v_source_origins\s*:=\s*array\['province_exam','authored','topic_pack'\][\s\S]*v_remaining[\s\S]*\bother\b/i.test(generator),
  'rebalance must not silently broaden into the other shelf');

has(/v_output_kind\s*=\s*'thptqg_exam'[\s\S]*bank_thptqg_requires_grade_12/i,
  'THPTQG output must reject contradictory non-grade-12 filters', generator);
for (const pair of [
  ["'question_type','multiple_choice','count',12", '12-question multiple-choice section'],
  ["'question_type','true_false','count',4", '4-question true/false section'],
  ["'question_type','short_answer','count',6", '6-question short-answer section']
]) {
  ok(generator.includes(pair[0]), `THPTQG default lost its ${pair[1]}`);
}

for (const responseField of [
  'output_kind', 'requested_count', 'source_origins', 'source_mix',
  'warnings', 'matrix', 'seed'
]) {
  ok(generator.includes(`'${responseField}'`), `generation response lost ${responseField}`);
}
has(/'kind'\s*,\s*'source_origin_shortage'/i,
  'per-source quota shortage warning is missing', generator);
has(/'kind'\s*,\s*'segment_shortage'/i,
  'final strict-filter shortage warning is missing', generator);
has(/'scope'\s*,\s*jsonb_strip_nulls\(jsonb_build_object\([\s\S]*'chapter'[\s\S]*'skill'/i,
  'teacher warnings must contain only pedagogical scope', generator);
has(/v_normalized_spec\s*:=\s*p_spec\|\|jsonb_build_object\([\s\S]*'output_kind'[\s\S]*'source_origins'[\s\S]*'blueprint'/i,
  'private generation audit must persist the normalized server contract', generator);
has(/generation_spec[\s\S]*'output_kind'[\s\S]*'source_mix'/i,
  'the exam must retain a safe output/source summary', generator);

for (const secret of ['raw_tex', 'answer_key', 'solution_latex', 'canonical_tex']) {
  ok(!new RegExp(`'${secret}'`, 'i').test(generator),
    `teacher generation response or warning must not expose ${secret}`);
}
has(/security\s+definer[\s\S]*set\s+search_path\s*=\s*public\s*,\s*private\s*,\s*auth\s*,\s*pg_temp/i,
  'public generation RPC needs a pinned security-definer boundary', generator);
has(/revoke\s+all\s+on\s+function\s+public\.vm_bank_generate_exam\(jsonb\)\s+from\s+public\s*,\s*anon/i,
  'anonymous roles must not execute the generation RPC');
has(/grant\s+execute\s+on\s+function\s+public\.vm_bank_generate_exam\(jsonb\)[\s\S]*to\s+authenticated\s*,\s*service_role/i,
  'authenticated staff need the generation RPC grant');

ok(!/grant\s+(select|insert|update|delete|all)[\s\S]{0,120}private\.vm_question_bank/i.test(sql),
  'migration must not expose private bank tables');
const starts = (sql.match(/as \$function\$/g) || []).length;
const ends = (sql.match(/\$function\$;/g) || []).length;
ok(starts === ends, `unbalanced function bodies: ${starts} starts, ${ends} ends`);

console.log('question-bank output/source-mix SQL checks passed');
