'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const originSql = fs.readFileSync(path.join(
  root, 'supabase', 'migrations',
  '20260826141000_question_bank_source_repository_origins.sql'
), 'utf8');
const generationSql = fs.readFileSync(path.join(
  root, 'supabase', 'migrations',
  '20260826160000_question_bank_generation_source_mix.sql'
), 'utf8');
const hotfixSql = fs.readFileSync(path.join(
  root, 'supabase', 'migrations',
  '20260826174000_question_bank_source_origin_ambiguity_hotfix.sql'
), 'utf8');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function functionBody(sql, name) {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  ok(start >= 0, `missing ${name}`);
  const bodyStart = sql.indexOf('as $function$', start);
  const end = sql.indexOf('$function$;', bodyStart + 13);
  ok(bodyStart >= 0 && end > bodyStart, `unclosed ${name}`);
  return sql.slice(start, end + '$function$;'.length);
}

ok(/add\s+column\s+if\s+not\s+exists\s+source_origin\s+text\s+generated\s+always/i.test(generationSql),
  'regression setup requires the generated document.source_origin column');

for (const [label, sql] of [['clean-install migration', originSql], ['forward hotfix', hotfixSql]]) {
  const body = functionBody(sql, 'public.vm_bank_source_exam_catalog');
  ok(/document\.\*[\s\S]*\)\s+catalog_source_origin\s*,/i.test(body),
    `${label} must give the computed origin a non-colliding alias`);
  ok(!/document\.\*[\s\S]*private\.vm_bank_document_source_origin\([\s\S]*\)\s+source_origin\s*,/i.test(body),
    `${label} reintroduces duplicate source_origin after document.* expansion`);
  ok(/catalog\.catalog_source_origin\s*=\s*v_source_origin/i.test(body),
    `${label} source-origin filter is not explicitly qualified`);
  const payloadUses = body.match(/'source_origin'\s*,\s*catalog_source_origin/gi) || [];
  ok(payloadUses.length === 2,
    `${label} must use the safe alias in both admin and teacher payloads`);
  ok(!/'source_origin'\s*,\s*source_origin/i.test(body),
    `${label} payload still references the ambiguous column name`);
}

ok(/revoke\s+all\s+on\s+function\s+public\.vm_bank_source_exam_catalog\([\s\S]*from\s+public\s*,\s*anon/i.test(hotfixSql),
  'hotfix must preserve anonymous revoke');
ok(/grant\s+execute\s+on\s+function\s+public\.vm_bank_source_exam_catalog\([\s\S]*to\s+authenticated\s*,\s*service_role/i.test(hotfixSql),
  'hotfix must preserve staff execution grant');

console.log('question-bank source_origin ambiguity regression checks passed');
