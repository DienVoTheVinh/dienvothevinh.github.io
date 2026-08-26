'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826095241_compact_question_bank_matrix.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function has(pattern, message) {
  ok(pattern.test(sql), message);
}

has(/create or replace function public\.vm_bank_matrix\(\s*p_filters jsonb default '\{\}'::jsonb\s*\)/i,
  'compact vm_bank_matrix signature is missing');
has(/auth\.uid\(\) is null or not public\.is_teacher\(\)/i,
  'matrix RPC must reject students and anonymous users');
has(/security definer[\s\S]*set search_path = public, private, auth, pg_temp/i,
  'matrix RPC must pin its security-definer search_path');
has(/when v_is_admin and p_filters->>'status' in \('active','quarantined','archived'\)[\s\S]*else 'active'/i,
  'non-admin callers must remain constrained to active questions');

const fastPath = sql.match(/if v_status='active' and \(v_filters-'status'\)='\{\}'::jsonb then([\s\S]*?)return jsonb_build_object\(([\s\S]*?)\);\s*end if;/i);
ok(fastPath, 'unfiltered active fast path is missing');
ok(/from private\.vm_question_bank_items item[\s\S]*where item\.status='active'/i.test(fastPath[1]),
  'fast path must aggregate directly from the indexed item table');
ok(/group by item\.question_type,item\.difficulty/i.test(fastPath[1]),
  'fast path must group only by the 4 x 4 matrix dimensions');
ok(!/vm_question_bank_routes|legacy_code|stable_id|taxonomy|sample_/i.test(fastPath[1]),
  'fast path must not rebuild routes or return private taxonomy/identifier samples');

has(/from private\.vm_question_bank_routes route[\s\S]*route\.route_valid[\s\S]*route\.item_status=v_status/i,
  'filtered path must keep semantic-route validity and status checks');
['grade', 'grades', 'area', 'areas', 'chapter', 'chapters', 'skill', 'skills',
  'difficulty', 'difficulties', 'question_type', 'question_types', 'legacy_prefix',
  'taxonomy_codes', 'source_kinds', 'tags'].forEach((filter) => {
  ok(new RegExp(`v_filters->>?['"]${filter}['"]`, 'i').test(sql),
    `filtered matrix path is missing ${filter}`);
});

const outputKeys = Array.from(sql.matchAll(/jsonb_build_object\(\s*'question_type',[\s\S]*?'count',item_count\s*\)/gi));
ok(outputKeys.length === 2, 'both fast and filtered paths must return compact matrix cells');
['stable_id', 'legacy_code', 'taxonomy_key', 'raw_tex', 'canonical_tex', 'answer_key', 'solution_latex', 'sample_stable_ids', 'sample_legacy_ids']
  .forEach((secret) => ok(!new RegExp(`'${secret}'`, 'i').test(sql), `compact matrix response leaks ${secret}`));

has(/revoke all on function public\.vm_bank_matrix\(jsonb\)\s+from public, anon/i,
  'anonymous/public execution revoke is missing');
has(/grant execute on function public\.vm_bank_matrix\(jsonb\)\s+to authenticated, service_role/i,
  'authenticated/service execution grant is missing');

const starts = (sql.match(/as \$function\$/g) || []).length;
const ends = (sql.match(/\$function\$;/g) || []).length;
ok(starts === 1 && starts === ends, `unbalanced function body: ${starts} starts, ${ends} ends`);

console.log('PASS compact question-bank matrix SQL contract');
