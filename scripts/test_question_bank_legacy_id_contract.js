'use strict';
const assert = require('assert');
const fs = require('fs');
const QuestionBank = require('../js/question-bank.js');

const map = JSON.parse(fs.readFileSync('NganHang/NganHangTHPT1.3/id_map.json','utf8'));
const keys = Object.keys(map);
assert.strictEqual(keys.length, 530);
assert.ok(keys.every((key) => /^([012])([A-Z])(\d+)\?(\d+)-(\d+)$/.test(key)), 'every original taxonomy family uses a numeric variant');
assert.deepStrictEqual(keys.reduce((counts,key) => { counts[Number(key[0])+10] += 1; return counts; }, {10:0,11:0,12:0}), {10:182,11:257,12:91});
for (const key of keys) {
  const id = key.replace('?', 'H');
  const parsed = QuestionBank.parseQuestionId(id);
  assert.ok(parsed && parsed.taxonomy_key === key, `round trip failed for ${key}`);
}
for (const invalid of ['2D1H3-HAM-SO','2D1D3-1','3D1H3-1','2D1H3-A']) assert.strictEqual(QuestionBank.parseQuestionId(invalid), null);

const migration = fs.readFileSync('supabase/migrations/20260827100000_legacy_id_schema_and_thpt_grade.sql','utf8');
const conversionMigration = fs.readFileSync('supabase/migrations/20260827113000_question_bank_id_conversion_engine.sql','utf8');
assert.ok(migration.includes("[NBYHTVKGC])([0-9]+)-([0-9]+)"), 'database parser must enforce the same numeric legacy contract');
assert.ok(migration.includes("'legacy-v1'") && migration.includes('is_locked=true'), 'legacy-v1 must remain immutable');
assert.ok(migration.includes('vm_bank_admin_save_id_schema') && migration.includes('vm_bank_admin_upsert_id_alias'), 'admin mapping RPCs must exist');
assert.ok(conversionMigration.includes('vm_bank_admin_convert_id'), 'deterministic old-to-new conversion RPC must exist');
assert.ok(conversionMigration.includes("'explicit_alias'"), 'explicit alias must override generated mapping');
assert.ok(conversionMigration.includes("'stable_uid_unchanged',true"), 'conversion must preserve stable question UID');
assert.ok(migration.includes("='thptqg'") && migration.includes("'grade',12"), 'THPTQG sources must be grade 12');

console.log('question-bank legacy ID contract: passed');
