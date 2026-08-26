const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826100359_recover_embedded_question_ids.sql'
), 'utf8');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function has(pattern, message) {
  ok(pattern.test(sql), message);
}

has(/split_part\(item\.raw_tex,E'\\n',1\)/i,
  'recovery must inspect only the opening environment line');
has(/regexp_matches\([\s\S]*substring\([\s\S]*from position\('%' in split_part\(item\.raw_tex,E'\\n',1\)\) \+ 1/i,
  'recovery must scan only the metadata comment after the opening-line percent marker');
has(/unique_tokens as \([\s\S]*having count\(distinct candidate\)=1[\s\S]*valid_candidates as \([\s\S]*from unique_tokens token/i,
  'recovery must reject every multi-ID header before taxonomy lookup');
has(/join private\.vm_question_bank_taxonomy taxonomy[\s\S]*taxonomy\.status='active'/i,
  'recovery must require a known active taxonomy entry');
has(/vm_bank_difficulty_from_legacy\(token\.candidate\) is not null/i,
  'recovery must reject unsupported legacy difficulty codes');
has(/status='quarantined'[\s\S]*legacy_code[\s\S]*is null/i,
  'recovery must never overwrite a classified or active item');
has(/source_legacy_code=recovery\.candidate[\s\S]*unique_opening_comment_token/i,
  'recovered ID and its provenance must be preserved on source links');
has(/item\.question_type='multiple_choice'[\s\S]*item\.question_type='true_false'[\s\S]*item\.question_type='short_answer'/i,
  'activation must retain all student-facing answer guards');
ok(!/item\.question_type='essay'[\s\S]*set status='active'/i.test(sql),
  'essay questions must not be promoted automatically');
ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(sql),
  'data recovery must not hardcode generated row IDs');
has(/canonical_tex=case[\s\S]*%\['\|\|recovery\.candidate\|\|'\]'/i,
  'canonical TeX must receive the recovered classification ID');

console.log('question-bank embedded ID recovery SQL checks passed');
