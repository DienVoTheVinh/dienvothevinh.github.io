'use strict';

const assert = require('assert');
const fs = require('fs');
const QuestionBank = require('../js/question-bank.js');

const migration = fs.readFileSync('supabase/migrations/20260828090000_question_bank_custom_id_systems.sql', 'utf8');
const legacyMigration = fs.readFileSync('supabase/migrations/20260827100000_legacy_id_schema_and_thpt_grade.sql', 'utf8');
const guide = fs.readFileSync('js/question-bank-id-guide.js', 'utf8');
const admin = fs.readFileSync('js/exam-admin.js', 'utf8');
const html = fs.readFileSync('quan-tri-de.html', 'utf8');

function functionBody(sql, name) {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start >= 0, `missing function ${name}`);
  const bodyStart = sql.indexOf('as $function$', start);
  const end = sql.indexOf('$function$;', bodyStart + 13);
  assert.ok(bodyStart >= 0 && end > bodyStart, `unclosed function ${name}`);
  return sql.slice(start, end + '$function$;'.length);
}

// The original author's compact contract stays byte-for-byte and retains a
// numeric local variant. A future curriculum never enters this branch.
const legacyPattern = "^([012])([A-Z])([0-9]+)([NBYHTVKGC])([0-9]+)-([0-9]+)$";
assert.ok(legacyMigration.includes(legacyPattern), 'baseline legacy-v1 regex changed');
assert.ok(migration.includes(legacyPattern), 'custom migration must preserve the exact legacy-v1 regex');
for (const code of ['0D8N2-1', '1H4V7-12', '2C10G3-0']) {
  const parsed = QuestionBank.parseQuestionId(code);
  assert.ok(parsed && parsed.id === code && parsed.schema_name === 'legacy-v1', `legacy round trip changed for ${code}`);
}
for (const code of ['2D1H3-HAM-SO', '6D1TH3-1', '3D1H3-1']) {
  assert.strictEqual(QuestionBank.parseQuestionId(code), null, `unnamespaced/nonlegacy code must remain invalid: ${code}`);
}
for (const code of ['thcs-v1:6D01TH3-1', 'thcs-v1:6D1TH03-1', 'thcs-v1:6D1TH3--NHAN', `thcs-v1:6D1TH3-${'A'.repeat(25)}`]) {
  assert.strictEqual(QuestionBank.parseQuestionId(code), null, `noncanonical namespaced code must remain invalid: ${code}`);
}

const thcs = QuestionBank.parseQuestionId('THCS-V1:6d1th3-1');
const specialized = QuestionBank.parseQuestionId('thcs-chuyen-v1:6D1TH3-1');
const zeroIndexedFamily = QuestionBank.parseQuestionId('thcs-v1:6D0NB0-TONG-HOP');
assert.ok(thcs && thcs.id === 'thcs-v1:6D1TH3-1' && thcs.taxonomy_key === 'thcs-v1:6D1?3-1');
assert.ok(specialized && specialized.id === 'thcs-chuyen-v1:6D1TH3-1' && specialized.taxonomy_key === 'thcs-chuyen-v1:6D1?3-1');
assert.ok(zeroIndexedFamily && zeroIndexedFamily.chapter === 0 && zeroIndexedFamily.skill === 0, 'custom systems must preserve server-valid zero-indexed chapter/skill families');
assert.notStrictEqual(thcs.taxonomy_key, specialized.taxonomy_key, 'standard and specialized THCS families must never collide');

const parserBody = functionBody(migration, 'private.vm_bank_id_parts');
assert.ok(parserBody.includes("'schema_name',lower(v_parts[1])"), 'database parser must canonicalize custom namespace to lowercase');
assert.ok(parserBody.includes("'canonical_code',lower(v_parts[1])||':'"), 'database canonical ID must use lowercase namespace and uppercase payload');
assert.ok(parserBody.includes("'schema_name','legacy-v1','canonical_code',v_code"), 'legacy canonical spelling must remain untouched');

const saveSystem = functionBody(migration, 'public.vm_bank_admin_save_id_system');
const saveFamily = functionBody(migration, 'public.vm_bank_admin_save_id_family');
const catalog = functionBody(migration, 'public.vm_bank_admin_taxonomy_catalog');
const schemas = functionBody(migration, 'public.vm_bank_admin_id_schemas');
for (const [name, body] of [['save system', saveSystem], ['save family', saveFamily], ['catalog', catalog], ['schemas', schemas]]) {
  assert.ok(/auth\.uid\(\) is null or not public\.is_admin\(\)/i.test(body), `${name} must be admin-only`);
}
assert.ok(saveSystem.includes("v_name='legacy-v1'") && saveFamily.includes("v_schema='legacy-v1'"), 'legacy-v1 must not be editable through custom-system RPCs');
assert.ok(saveSystem.includes("system_kind='taxonomy'") && saveFamily.includes("system_kind='taxonomy'"), 'custom families must belong to an authoritative taxonomy system');
assert.ok(saveSystem.includes("status=case when v_active then 'active' else 'archived' end"), 'disabling an ID system must also prevent its families from being assigned');
assert.ok(migration.includes('create trigger vm_bank_protect_taxonomy_system') && migration.includes('bank_taxonomy_system_format_locked'), 'projection-format RPCs must not mutate an authoritative taxonomy envelope');
assert.ok(migration.includes("current_setting('vm.bank_taxonomy_admin',true)") && saveSystem.includes("set_config('vm.bank_taxonomy_admin','on',true)"), 'legacy projection RPCs must not toggle a taxonomy system without synchronizing its families');
assert.ok(saveSystem.includes("'example',v_name||':'") && !saveSystem.includes("'example',upper(v_name)"), 'system examples must use the canonical lowercase namespace');
assert.ok(saveFamily.includes("v_schema||':'||v_grade") && !saveFamily.includes("upper(v_schema)||':'"), 'family codes must use the canonical lowercase namespace');

for (const field of ['key','grade','grade_code','area','chapter','topic_code','skill','skill_family','variant','label','area_label','chapter_label','skill_label','variant_label','vi','slug','status']) {
  assert.ok(catalog.includes(`'${field}'`), `taxonomy catalog lost compatibility field ${field}`);
}
for (const field of ['schema_name','schema_label','local_key','sample_code']) {
  assert.ok(catalog.includes(`'${field}'`), `taxonomy catalog missing custom-system field ${field}`);
}
assert.ok(catalog.includes("else t.schema_name||':'"), 'catalog samples must retain lowercase namespaces');

for (const signature of [
  'public.vm_bank_admin_save_id_system(jsonb)',
  'public.vm_bank_admin_save_id_family(jsonb)',
  'public.vm_bank_admin_id_schemas()',
  'public.vm_bank_admin_taxonomy_catalog(text,integer,integer)'
]) {
  assert.ok(migration.includes(`revoke all on function ${signature} from public, anon`), `${signature} must revoke anonymous/public execute`);
  assert.ok(migration.includes(`grant execute on function ${signature} to authenticated`), `${signature} must be callable only after authenticated admin validation`);
}
assert.ok(legacyMigration.includes('alter table private.vm_question_bank_id_schemas enable row level security') && legacyMigration.includes('revoke all on private.vm_question_bank_id_schemas from public, anon, authenticated'), 'private ID registry must retain RLS and direct-table revokes');
assert.ok(!/grant\s+(?:select|insert|update|delete|all)\s+on\s+(?:table\s+)?private\.vm_question_bank_(?:id_schemas|taxonomy)/i.test(migration), 'custom migration must not expose private ID tables');

assert.ok(migration.includes('create trigger vm_bank_00_resolve_item_classification') && migration.includes("new.legacy_code:=v_parts->>'canonical_code'") && migration.includes('taxonomy,canonical_tex'), 'all item writes must canonicalize IDs and embedded canonical TeX metadata before activation');
assert.ok(migration.includes('where taxonomy_key=v_key and status=\'active\''), 'custom IDs must resolve against an active trusted family');
assert.ok(!migration.includes('new.source_legacy_code:='), 'source provenance metadata must not be rewritten by a generic trigger');

for (const preset of ['thcs-v1','thcs-chuyen-v1']) {
  assert.ok(guide.includes(`schema_name:'${preset}'`) && html.includes(preset+':6D1TH3-1'), `missing integrated preset/example ${preset}`);
}
for (const rpc of ['vm_bank_admin_save_id_system','vm_bank_admin_save_id_family']) {
  assert.ok(guide.includes(`rpc('${rpc}'`), `ID guide must call ${rpc}`);
}
for (const id of ['bankIdSystemPreset','bankIdSystemName','bankIdSystemLevel','bankIdSystemSave','bankIdFamilySchema','bankIdFamilyGrade','bankIdFamilySave','bankTaxSchema','bankTaxonomyGradeTabs']) {
  assert.ok(html.includes(`id="${id}"`), `integrated question-bank UI is missing ${id}`);
}
for (let grade=1;grade<=12;grade+=1) {
  assert.ok(html.includes(`name="bankIdSystemGrade" value="${grade}"`), `custom ID system cannot select Grade ${grade}`);
}
assert.ok(admin.includes("bankTaxonomyFiltered({schema_name:schema,grade_code:grade") && admin.includes("schemaName+':'+gradeCode"), 'classification cascade and manual code builder must honor the selected namespaced system');
assert.ok(guide.includes("schema.system_kind==='taxonomy'&&!schema.is_locked&&schema.is_active"), 'family builder must not offer an inactive taxonomy system');
assert.ok(admin.includes("var skill = /^\\d+$/.test(skillToken) ? Number(skillToken) : -1;") && admin.includes('skill < 0'), 'manual namespaced code builder must support the server-valid skill 0 without accepting an empty skill');

console.log('question-bank custom ID systems: legacy isolation, namespaces, admin security and UI contract passed');
