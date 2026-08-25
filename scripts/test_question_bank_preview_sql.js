'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationDirectory = path.join(root, 'supabase', 'migrations');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260825170000_question_bank_secure_previews.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const hardening = fs.readFileSync(path.join(
  root,
  'supabase',
  'migrations',
  '20260825171000_question_bank_preview_search_hardening.sql'
), 'utf8');
const effectiveSql = fs.readdirSync(migrationDirectory)
  .filter((name) => /^\d+.*\.sql$/i.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationDirectory, name), 'utf8'))
  .join('\n');

function bodyFrom(sql, name) {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start >= 0, `missing function ${name}`);
  const bodyStart = sql.indexOf('as $function$', start);
  const end = sql.indexOf('$function$;', bodyStart + 13);
  assert.ok(bodyStart >= 0 && end > bodyStart, `unclosed function ${name}`);
  return sql.slice(start, end + '$function$;'.length);
}
function body(name) { return bodyFrom(migration, name); }
function lastBodyFrom(sql, name) {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().lastIndexOf(marker.toLowerCase());
  assert.ok(start >= 0, `missing effective function ${name}`);
  const bodyStart = sql.indexOf('as $function$', start);
  const end = sql.indexOf('$function$;', bodyStart + 13);
  assert.ok(bodyStart >= 0 && end > bodyStart, `unclosed effective function ${name}`);
  return sql.slice(start, end + '$function$;'.length);
}

const choiceSanitizer = body('private.vm_bank_preview_choices');
assert.match(choiceSanitizer, /p_question_type='short_answer'[\s\S]*'key','short','latex',''/,
  'short-answer preview must contain only a blank answer field');
assert.match(choiceSanitizer,
  /jsonb_build_object\([\s\S]*'key'[\s\S]*'latex'[\s\S]*replace\([\s\S]*E'\\\\True'/,
  'choice sanitizer must use a key/latex allow-list and remove stray \\True markers');
assert.doesNotMatch(choiceSanitizer, /return\s+p_choices|return\s+v_choices/i,
  'choice sanitizer must never return an unfiltered choice object');
assert.match(migration,
  /revoke all on function private\.vm_bank_preview_choices\(text,jsonb\)[\s\S]*from public, anon, authenticated, service_role/i,
  'preview choice sanitizer must remain private');

const contentSanitizer = body('private.vm_bank_preview_content');
assert.match(contentSanitizer, /public\.vm_strip_latex_solutions\(coalesce\(p_content,''\)\)/,
  'preview content sanitizer must strip embedded solution blocks');
assert.match(contentSanitizer, /regexp_replace\(v_content,E'%\\\\\[/,
  'preview content sanitizer must remove embedded corpus ID comments');
assert.ok(contentSanitizer.includes(String.raw`[^\\r\\n]*(\\r?\\n|$)`),
  'preview content sanitizer must remove the complete corpus-ID comment line');
assert.match(migration,
  /revoke all on function private\.vm_bank_preview_content\(text\)[\s\S]*from public, anon, authenticated, service_role/i,
  'preview content sanitizer must remain private');

const sourcePreview = body('public.vm_bank_source_exam_preview');
assert.match(sourcePreview, /auth\.uid\(\) is null or not public\.is_teacher\(\)/,
  'source preview must reject students and assistants');
assert.match(sourcePreview, /d\.source_kind='mock_exam'[\s\S]*d\.status='active'/,
  'source preview must only read active mock exams');
assert.match(sourcePreview,
  /join private\.vm_question_bank_items bank_item[\s\S]*bank_item\.status='active'/,
  'source preview must only contain active bank items');
assert.match(sourcePreview, /v_question_count>200[\s\S]*bank_source_exam_question_limit_exceeded/,
  'source preview must enforce the bounded 200-question payload');
assert.match(sourcePreview,
  /private\.vm_bank_preview_content\(bank_item\.content_latex\)/,
  'source preview must remove solution blocks and corpus IDs');
assert.match(sourcePreview,
  /private\.vm_bank_preview_choices\([\s\S]*bank_item\.public_choices/,
  'source preview must pass choices through the private sanitizer');

const examPreview = body('public.vm_bank_exam_preview');
assert.match(examPreview, /auth\.uid\(\) is null or not public\.is_teacher\(\)/,
  'generated-exam preview must reject students and assistants');
assert.match(examPreview, /private\.vm_bank_exam_is_protected\(/,
  'generated-exam preview must accept only protected bank-backed exams');
assert.match(examPreview,
  /not public\.is_admin\(\)[\s\S]*not private\.vm_bank_can_manage_exam\(p_exam_id\)[\s\S]*bank_exam_preview_access_denied/,
  'teacher preview must require exact class or portal management scope');
assert.match(examPreview,
  /from private\.vm_question_bank_exam_occurrences occurrence[\s\S]*join private\.vm_question_bank_items bank_item/,
  'exam preview must resolve canonical private items through protected occurrences');
assert.match(examPreview, /v_question_count>200[\s\S]*bank_exam_question_limit_exceeded/,
  'exam preview must enforce the bounded 200-question payload');
assert.match(examPreview,
  /private\.vm_bank_preview_content\(bank_item\.content_latex\)/,
  'exam preview must remove solution blocks and corpus IDs');

[sourcePreview, examPreview].forEach((previewBody, index) => {
  const label = index === 0 ? 'source' : 'exam';
  ['.answer_key', '.solution_latex', '.raw_tex', '.canonical_tex', '.taxonomy', '.stable_id', '.legacy_code']
    .forEach((secret) => {
      assert.ok(!previewBody.toLowerCase().includes(secret),
        `${label} preview reads private secret field ${secret}`);
    });
  ['title', 'question_count', 'questions', 'sort', 'question_type', 'content_latex', 'choices']
    .forEach((key) => {
      assert.match(previewBody, new RegExp(`'${key}'`, 'i'),
        `${label} preview is missing contract field ${key}`);
    });
});

assert.match(migration,
  /revoke all on function public\.vm_bank_source_exam_preview\(uuid\)[\s\S]*from public, anon[\s\S]*grant execute[\s\S]*to authenticated, service_role/i,
  'source preview execute grants are not locked to authenticated callers');
assert.match(migration,
  /revoke all on function public\.vm_bank_exam_preview\(uuid\)[\s\S]*from public, anon[\s\S]*grant execute[\s\S]*to authenticated, service_role/i,
  'exam preview execute grants are not locked to authenticated callers');

const hardenedContent = bodyFrom(hardening, 'private.vm_bank_preview_content');
assert.match(hardenedContent,
  /regexp_replace\([\s\S]*shortans[\s\S]*vm_remove_latex_group_command\(v_content,'shortans'\)/i,
  'teacher-safe previews must remove short-answer commands, including optional display arguments');
assert.match(hardenedContent, /replace\(v_content,E'\\\\True',''\)/,
  'teacher-safe previews must remove stray answer markers from legacy content');
const effectiveSolutionStripper = lastBodyFrom(effectiveSql, 'public.vm_strip_latex_solutions');
for (const environment of ['loigiai','giaibai','solution','answer','sol','onlysolution']) {
  assert.match(effectiveSolutionStripper, new RegExp(`vm_remove_latex_environment\\(v_out,\\s*'${environment}'\\)`, 'i'),
    `teacher-safe previews must strip legacy \\begin{${environment}} solution environments`);
}
for (const command of ['loigiai','giaibai','solution','answer','sol']) {
  assert.match(effectiveSolutionStripper, new RegExp(`vm_remove_latex_group_command\\(v_out,\\s*'${command}'\\)`, 'i'),
    `teacher-safe previews must strip legacy \\${command}{...} solution commands`);
}
const hardenedSearch = bodyFrom(hardening, 'public.vm_bank_search');
assert.match(hardenedSearch,
  /else[\s\S]*'content_latex',private\.vm_bank_preview_content\(i\.content_latex\)[\s\S]*'choices',private\.vm_bank_preview_choices\(i\.question_type,i\.public_choices\)/i,
  'teacher bank search results must use the same answer-free preview sanitizers');
const normalizedHardenedSearch = hardenedSearch.replace(/\r\n/g, '\n');
const teacherPayloadStart = normalizedHardenedSearch.lastIndexOf('\n      else\n        jsonb_build_object(');
const teacherPayloadEnd = normalizedHardenedSearch.indexOf('\n      end row_data', teacherPayloadStart);
assert.ok(teacherPayloadStart >= 0 && teacherPayloadEnd > teacherPayloadStart,
  'teacher bank search payload branch is missing');
const teacherPayload = normalizedHardenedSearch.slice(teacherPayloadStart, teacherPayloadEnd);
assert.doesNotMatch(teacherPayload,
  /'content_latex',i\.content_latex|'choices',i\.public_choices/i,
  'teacher bank search results must never return raw legacy preview fields');

const dollarMarkers = ((migration + hardening).match(/\$function\$/g) || []).length;
assert.strictEqual(dollarMarkers % 2, 0, 'unbalanced $function$ markers');

console.log('PASS secure question-bank HTML/PDF preview RPC contract');
