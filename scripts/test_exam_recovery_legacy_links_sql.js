'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(
  root,
  'supabase',
  'migrations',
  '20260828113000_exam_recovery_exact_legacy_links.sql'
), 'utf8');

function functionBody(name) {
  const marker = `create or replace function ${name}`;
  const start = migration.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start >= 0, `missing ${name}`);
  const bodyStart = migration.indexOf('as $function$', start);
  const end = migration.indexOf('$function$;', bodyStart + 13);
  assert.ok(bodyStart >= 0 && end > bodyStart, `unclosed ${name}`);
  return migration.slice(start, end + '$function$;'.length);
}

const resolver = functionBody('private.vm_bank_recommendation_source_item_id');
assert.match(resolver, /security definer[\s\S]*set search_path\s*=\s*''/i,
  'private exact-match resolver must not trust writable schemas through search_path');
assert.match(resolver, /private\.vm_bank_question_item_id\(p_exam_id,p_question_id\)/i,
  'authoritative bank occurrence/snapshot links must remain first choice');
assert.match(resolver, /btrim\(item\.content_latex\)\s*=\s*[\s\S]*btrim\(question\.content_latex\)/i,
  'legacy fallback must require exact trimmed TeX equality');
assert.match(resolver, /vm_bank_recovery_choice_signature\(item\.public_choices\)\s*=\s*[\s\S]*vm_bank_recovery_choice_signature\(question\.choices\)/i,
  'a generic prompt must not link unless the displayed choices also match exactly');
const choiceSignature = functionBody('private.vm_bank_recovery_choice_signature');
assert.match(choiceSignature, /choice\.value->>'key'[\s\S]*choice\.value->>'latex'[\s\S]*choice\.value->>'text'/i,
  'choice matching must normalize public key/text without reading answer flags');
assert.doesNotMatch(choiceSignature, /correct|answer_key|solution/i,
  'the safe identity signature must not depend on an answer exposed to clients');
assert.match(resolver, /if v_match_count=1 then return v_match/i,
  'ambiguous exact prompts, including alternate option sets, must be rejected');
assert.doesNotMatch(resolver, /source_id|legacy_code|\bilike\b|word_similarity|similarity\s*\(|levenshtein/i,
  'legacy identity resolution must not trust source/classification IDs or fuzzy text');
assert.match(migration, /vm_qb_items_active_recovery_content_idx[\s\S]*md5\(pg_catalog\.btrim\(content_latex\)\)[\s\S]*where status='active'/i,
  'exact legacy matching needs a bounded active-content fingerprint index');
assert.match(migration, /revoke all on function private\.vm_bank_recommendation_source_item_id\(uuid,uuid\)[\s\S]*from public, anon, authenticated, service_role/i,
  'the private resolver must not be callable by client roles');

const builder = functionBody('private.vm_bank_build_recommendations');
assert.match(builder, /security definer[\s\S]*set search_path\s*=\s*''/i,
  'private recommendation builder must use an empty search_path');
assert.match(builder, /vm_bank_recommendation_source_item_id\(\s*eq\.exam_id,eq\.question_id/i,
  'wrong questions from legacy exams must use the exact-unique resolver');
assert.match(builder, /v_current_items uuid\[\]/i);
assert.match(builder, /v_history_items uuid\[\]/i);
assert.match(builder, /not \(candidate\.id=any\(v_current_items\)\)/i,
  'the current exam must be excluded even when it was not bank-generated');
assert.match(builder, /not \(candidate\.id=any\(v_history_items\)\)/i,
  'previously attempted legacy questions must be excluded after safe resolution');
assert.doesNotMatch(builder, /else 50|Cùng khối và loại câu hỏi/i,
  'same-grade/type alone is not a pedagogically safe similarity rule');
assert.match(builder, /candidate\.similarity_key=v_source\.similarity_key[\s\S]*candidate\.legacy_code=v_source\.legacy_code[\s\S]*skill_family[\s\S]*topic_code/i,
  'recommendations must require an exact pedagogical family/topic match');

const rpc = functionBody('public.vm_exam_recommendations');
assert.match(rpc, /language plpgsql[\s\S]*volatile[\s\S]*security definer/i,
  'legacy attempts need authorized lazy recommendation building');
assert.match(rpc, /security definer[\s\S]*set search_path\s*=\s*''/i,
  'public recommendation RPC must use an empty search_path');
assert.match(rpc, /v_attempt\.student_id=auth\.uid\(\)[\s\S]*not public\.is_staff\(\)/i,
  'only the owning student (or explicitly authorized staff) may inspect coverage');
assert.match(rpc, /perform private\.vm_bank_build_recommendations\(p_attempt_id\)/i,
  'old submitted attempts must build recommendations on first authorized view');
assert.match(rpc, /'wrong_count',v_wrong_count[\s\S]*'matched_wrong_count',v_matched_wrong_count[\s\S]*'unmatched_wrong_count'/i,
  'the UI needs explicit safe-match coverage instead of an empty ambiguous result');
assert.doesNotMatch(rpc, /answer_key|solution_latex|raw_tex|canonical_tex|content_latex|recommended_item_id'/i,
  'recommendation RPC must not return answers, TeX source or private item IDs');
assert.match(migration, /revoke all on function public\.vm_exam_recommendations\(uuid\) from public, anon/i);
assert.match(migration, /grant execute on function public\.vm_exam_recommendations\(uuid\)[\s\S]*to authenticated, service_role/i);

console.log('PASS exact-unique legacy exam recovery SQL');
