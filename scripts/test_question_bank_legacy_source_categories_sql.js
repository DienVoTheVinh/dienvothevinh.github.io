'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826110000_question_bank_legacy_source_categories.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const stableOrderSql = fs.readFileSync(path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826123000_question_bank_source_catalog_stable_order.sql'
), 'utf8');

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

has(/create\s+index\s+if\s+not\s+exists\s+vm_question_bank_item_sources_document_item_idx\s+on\s+private\.vm_question_bank_item_sources\s*\(\s*document_id\s*,\s*item_id\s*\)/i,
  'source catalogue needs a document-leading index before counting linked questions');

const category = functionBody('private.vm_bank_document_category');

has(/returns\s+text[\s\S]*language\s+sql[\s\S]*\bimmutable\b[\s\S]*parallel\s+safe[\s\S]*security\s+invoker/i,
  'classifier must remain an immutable, parallel-safe security-invoker SQL function', category);
has(/set\s+search_path\s*=\s*pg_catalog\s*,\s*pg_temp/i,
  'classifier must keep a pinned search_path', category);

has(/when\s+coalesce\(p_source_kind\s*,\s*''\)\s*=\s*'topic_pack'\s+then\s+'topic_pack'/i,
  'topic packs must remain topic packs', category);
has(/when\s+coalesce\(p_source_kind\s*,\s*''\)\s*<>\s*'mock_exam'\s+then\s+'other_content'/i,
  'non-exam documents must remain outside the source-exam catalogue', category);

const explicitThpt = category.match(
  /when\s+lower\(btrim\(coalesce\(p_exam_kind\s*,\s*''\)\)\)\s+in\s*\(([\s\S]*?)\)\s+then\s+'thptqg'/i
);
ok(explicitThpt, 'missing explicit THPTQG category branch');
for (const kind of ['thpt_official', 'thpt_reference', 'thpt_mock']) {
  ok(explicitThpt[1].includes(`'${kind}'`), `explicit THPTQG branch lost ${kind}`);
}

const explicitOther = category.match(
  /when\s+lower\(btrim\(coalesce\(p_exam_kind\s*,\s*''\)\)\)\s+in\s*\(([\s\S]*?)\)\s*then\s+'other_exam'/i
);
ok(explicitOther, 'missing explicit chapter/other category branch');
for (const kind of ['chapter', 'other']) {
  ok(explicitOther[1].includes(`'${kind}'`), `explicit other-exam branch lost ${kind}`);
}
ok(!/(^|[^a-z_])['"]mock['"]([^a-z_]|$)/i.test(explicitOther[1]),
  'legacy exam_kind=mock must reach title/filename classification before the fallback');

const legacyPatternIndex = category.search(/dethamkhao\|deminhhoa\|dechinhthuc/i);
const fallbackIndex = category.search(/else\s+'other_exam'/i);
ok(legacyPatternIndex >= 0, 'legacy THPT source-name classifier is missing');
ok(fallbackIndex > legacyPatternIndex,
  'legacy THPT source-name classifier must run before the generic other-exam fallback');
for (const token of ['thptqg', 'dethamkhao', 'deminhhoa', 'dechinhthuc']) {
  ok(category.toLowerCase().includes(token), `legacy THPT classifier lost ${token}`);
}
has(/when\s+lower\(concat_ws\([\s\S]*?\)\)\s*~\s*'\([^']*dethamkhao[^']*\)'\s+then\s+'thptqg'/i,
  'legacy graduation/reference filenames must map to thptqg', category);
const legacySemesterIndex = category.search(/hk\[12\]\|ghk\[12\]\?/i);
ok(legacySemesterIndex >= 0 && legacySemesterIndex < fallbackIndex,
  'legacy HK/GHK source names must run before the generic other-exam fallback');
has(/when\s+lower\(concat_ws\([\s\S]*?\)\)\s*~\s*'\([^']*hk\[12\][^']*\)'\s+then\s+'semester'/i,
  'legacy HK/GHK filenames must map to semester', category);

has(/revoke\s+all\s+on\s+function\s+private\.vm_bank_document_category\(\s*text\s*,\s*text\s*,\s*text\s*,\s*text\s*,\s*text\[\]\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
  'private classifier execution must remain revoked from client and API roles');

const variant = functionBody('private.vm_bank_document_variant');
has(/returns\s+text[\s\S]*language\s+sql[\s\S]*\bimmutable\b[\s\S]*parallel\s+safe[\s\S]*security\s+invoker/i,
  'variant classifier must remain immutable, parallel-safe and security-invoker', variant);
has(/set\s+search_path\s*=\s*pg_catalog\s*,\s*pg_temp/i,
  'variant classifier must keep a pinned search_path', variant);
for (const [kind, expected] of [
  ['thpt_official', 'official'],
  ['thpt_reference', 'reference'],
  ['thpt_mock', 'mock'],
]) {
  has(new RegExp(`p_exam_kind[\\s\\S]*?='${kind}'[\\s\\S]*?then\\s+'${expected}'`, 'i'),
    `variant classifier lost ${kind} -> ${expected}`, variant);
}
const legacyFallback = variant.search(/when\s+coalesce\(p_source_kind\s*,\s*''\)\s*=\s*'mock_exam'\s+then\s+'mock'/i);
ok(legacyFallback >= 0, 'generic legacy mock fallback is missing');
for (const [pattern, expected] of [
  ['dechinhthuc', 'official'],
  ['dethamkhao|deminhhoa', 'reference'],
  ['ghk[12]?', 'midterm'],
  ['cuối kỳ|cuoi ky', 'final'],
  ['hk1', 'semester_1'],
  ['hk2', 'semester_2'],
]) {
  const patternIndex = variant.toLowerCase().indexOf(pattern.toLowerCase());
  ok(patternIndex >= 0 && patternIndex < legacyFallback,
    `legacy ${pattern} classification must run before generic mock fallback`);
  has(new RegExp(`when[\\s\\S]*?${pattern.replace(/[\\[\\]?]/g, '\\$&')}[\\s\\S]*?then\\s+'${expected}'`, 'i'),
    `legacy ${pattern} must map to ${expected}`, variant);
}
has(/revoke\s+all\s+on\s+function\s+private\.vm_bank_document_variant\(\s*text\s*,\s*text\s*,\s*text\s*,\s*text\s*,\s*text\[\]\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
  'private variant execution must remain revoked from client and API roles');

const catalog = functionBody('public.vm_bank_source_exam_catalog');
has(/stable[\s\S]*security\s+definer[\s\S]*set\s+search_path\s*=\s*public\s*,\s*private\s*,\s*auth\s*,\s*pg_temp/i,
  'source catalogue must retain its stable, pinned security-definer boundary', catalog);
has(/auth\.uid\(\)\s+is\s+null\s+or\s+not\s+public\.is_teacher\(\)/i,
  'source catalogue must still reject students and anonymous users', catalog);
has(/private\.vm_bank_document_grade\(document\.metadata\)\s+document_grade/i,
  'catalog must use explicit document grade metadata', catalog);
ok(!/then\s+12::smallint/i.test(catalog),
  'mixed-grade legacy THPT sources must not be silently labelled grade 12');
has(/p_filters->>'bank_variant'[\s\S]*p_filters->>'variant'/i,
  'source catalogue must accept semantic variant filters', catalog);
has(/v_variant\s+is\s+null[\s\S]*bank_variant\s*=\s*v_variant/i,
  'source catalogue must filter by the computed semantic variant', catalog);
for (const term of ['semester_1', 'semester_2']) {
  ok(catalog.includes(`v_variant='${term}'`) && catalog.includes(`'${term}'`),
    `source catalogue lost ${term} metadata compatibility`);
}
has(/revoke\s+all\s+on\s+function\s+public\.vm_bank_source_exam_catalog\([\s\S]*jsonb\s*,\s*integer\s*,\s*integer[\s\S]*from\s+public\s*,\s*anon/i,
  'source catalogue must remain unavailable to anonymous callers');
has(/grant\s+execute\s+on\s+function\s+public\.vm_bank_source_exam_catalog\([\s\S]*jsonb\s*,\s*integer\s*,\s*integer[\s\S]*to\s+authenticated\s*,\s*service_role/i,
  'source catalogue must remain available to authenticated staff through its internal role check');
for (const source of [catalog, stableOrderSql]) {
  has(/order\s+by\s+created_at\s+desc\s*,\s*id\s+desc\s+limit\s+v_limit\s+offset\s+v_offset/i,
    'source catalogue pages need a deterministic id tie-breaker', source);
  has(/jsonb_agg\(payload\.item\s+order\s+by\s+payload\.created_at\s+desc\s*,\s*payload\.id\s+desc\)/i,
    'source catalogue payload order must match the page order', source);
}

const summary = functionBody('public.vm_bank_category_summary');
has(/stable[\s\S]*security\s+definer[\s\S]*set\s+search_path\s*=\s*public\s*,\s*private\s*,\s*auth\s*,\s*pg_temp/i,
  'category summary must retain its stable, pinned security-definer boundary', summary);
has(/auth\.uid\(\)\s+is\s+null\s+or\s+not\s+public\.is_teacher\(\)/i,
  'category summary must reject students and anonymous users', summary);
has(/count\(distinct\s+item_id\)\s+filter\s*\([\s\S]*document_status\s*=\s*'active'\s+and\s+item_status\s*=\s*'active'/i,
  'category summary must count distinct canonical active questions instead of source occurrences', summary);
has(/with\s+bank_documents\s+as\s+materialized\s*\([\s\S]*vm_bank_document_category[\s\S]*from\s+private\.vm_question_bank_documents[\s\S]*\)\s*,\s*links\s+as/i,
  'category summary must classify each document once before joining question occurrences', summary);
has(/'quarantined_documents'\s*,\s*case\s+when\s+public\.is_admin\(\)[\s\S]*then\s+quarantined_documents\s+else\s+0\s+end/i,
  'category summary must hide document review counts from teachers', summary);
has(/'quarantined_questions'\s*,\s*case\s+when\s+public\.is_admin\(\)[\s\S]*then\s+quarantined_questions\s+else\s+0\s+end/i,
  'category summary must hide question review counts from teachers', summary);
has(/revoke\s+all\s+on\s+function\s+public\.vm_bank_category_summary\(\)\s+from\s+public\s*,\s*anon/i,
  'category summary must remain unavailable to anonymous callers');
has(/grant\s+execute\s+on\s+function\s+public\.vm_bank_category_summary\(\)\s+to\s+authenticated\s*,\s*service_role/i,
  'category summary must remain callable by authenticated staff through its internal role check');

const starts = (sql.match(/as \$function\$/g) || []).length;
const ends = (sql.match(/\$function\$;/g) || []).length;
ok(starts === ends, `unbalanced function bodies: ${starts} starts, ${ends} ends`);

console.log('question-bank legacy source-category SQL checks passed');
