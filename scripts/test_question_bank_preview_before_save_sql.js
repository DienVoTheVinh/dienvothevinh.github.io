'use strict';

const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826200000_question_bank_preview_before_save.sql'
), 'utf8');

function must(pattern, message) {
  if (!pattern.test(sql)) throw new Error(message);
}

function mustNot(pattern, message) {
  if (pattern.test(sql)) throw new Error(message);
}

must(/create\s+or\s+replace\s+function\s+public\.vm_bank_preview_exam_draft\s*\(p_spec\s+jsonb\)/i,
  'missing read-only draft preview RPC');
must(/vm_bank_preview_exam_draft[\s\S]*?security\s+definer[\s\S]*?set\s+search_path\s*=\s*public\s*,\s*private\s*,\s*auth\s*,\s*pg_temp/i,
  'preview RPC needs a pinned SECURITY DEFINER search path');
must(/v_generated\s*:=\s*public\.vm_bank_generate_exam\s*\(v_spec\)[\s\S]*?v_preview\s*:=\s*public\.vm_bank_exam_preview\s*\(v_exam_id\)/i,
  'preview must use the exact generation and sanitized preview contracts');
must(/raise\s+exception\s+using[\s\S]*?errcode\s*=\s*'P0004'[\s\S]*?vm_bank_preview_rollback[\s\S]*?exception\s+when\s+sqlstate\s+'P0004'/i,
  'preview writes must be deliberately rolled back in a subtransaction');
must(/-'class_id'[\s\S]*?-'published'[\s\S]*?'published'\s*,\s*false/i,
  'preview must discard assignment and publication fields');
must(/revoke\s+all\s+on\s+function\s+public\.vm_bank_preview_exam_draft\s*\(jsonb\)[\s\S]*?from\s+public\s*,\s*anon/i,
  'preview RPC must not be anonymous');

must(/create\s+or\s+replace\s+function\s+public\.vm_bank_save_exam_draft\s*\(p_spec\s+jsonb\)/i,
  'missing explicit token-enforcing save RPC');
must(/vm_bank_save_exam_draft[\s\S]*?expected_selection_token[\s\S]*?preview_draft_id[\s\S]*?bank_preview_required_before_save[\s\S]*?vm_bank_generate_exam\s*\(p_spec-'preview_draft_id'\)/i,
  'save RPC must reject a request that was not previewed');
must(/revoke\s+all\s+on\s+function\s+public\.vm_bank_generate_exam\s*\(jsonb\)[\s\S]*?authenticated[\s\S]*?grant\s+execute[\s\S]*?to\s+service_role/i,
  'browser clients must not bypass preview through the low-level writer');
must(/grant\s+execute\s+on\s+function\s+public\.vm_bank_save_exam_draft\s*\(jsonb\)[\s\S]*?authenticated\s*,\s*service_role/i,
  'authenticated teachers need only the reviewed-draft save entry point');

must(/expected_selection_token[\s\S]*?\^\[0-9a-f\]\{32\}\$/i,
  'save token must be a bounded canonical hash');
must(/stable_id\s*\|\|\s*':'\s*\|\|\s*bank_item\.canonical_hash[\s\S]*?snapshot_question_id/i,
  'selection token must cover identity and reviewed content');
must(/v_expected_selection_token\s+is\s+distinct\s+from\s+v_selection_token[\s\S]*?bank_generation_preview_stale/i,
  'a stale preview must abort the final save');
must(/v_preview_draft_id\s+uuid\s*:=\s*gen_random_uuid\(\)[\s\S]*?'preview_draft_id'\s*,\s*v_preview_draft_id/i,
  'preview must return a unique draft id for idempotent final save');
must(/pg_advisory_xact_lock[\s\S]*?preview_draft_id[\s\S]*?v_existing_exam_id[\s\S]*?'duplicate'\s*,\s*true/i,
  'save retries must lock and return the already-created exam');
must(/v_existing_selection_token\s+is\s+distinct\s+from\s+v_selection_token[\s\S]*?bank_generation_preview_stale/i,
  'a reused draft id must still match the exact preview token');
must(/create\s+unique\s+index[\s\S]*?vm_qb_exam_specs_actor_draft_uidx[\s\S]*?created_by[\s\S]*?spec->>'preview_draft_id'/i,
  'saved preview ids need a database uniqueness guard');

mustNot(/update\s+private\.vm_question_bank_item_sources\s+[\s\S]*?set\s+source_legacy_code\s*=\s*bank_item\.legacy_code/i,
  'canonical classification must never rewrite source provenance');
mustNot(/set\s+legacy_code\s*=\s*(?:candidate|source|substring|concat)/i,
  'migration must not invent or auto-promote semantic question IDs');
must(/update\s+private\.vm_question_bank_items[\s\S]*?status\s*=\s*'quarantined'[\s\S]*?not\s+exists\s*\([\s\S]*?vm_question_bank_taxonomy[\s\S]*?taxonomy\.status\s*=\s*'active'/i,
  'active rows with missing, invalid, or unknown IDs must be quarantined');
must(/constraint\s+vm_qb_active_classification_id_required[\s\S]*?status\s*<>\s*'active'[\s\S]*?legacy_code\s+is\s+not\s+null/i,
  'active ID syntax must also be protected by a validated constraint');
must(/function\s+private\.vm_bank_guard_taxonomy_in_use\(\)[\s\S]*?bank_taxonomy_in_use[\s\S]*?before\s+update\s+of\s+taxonomy_key\s*,\s*status\s+or\s+delete/i,
  'active classifications must remain valid when taxonomy entries change');
must(/create\s+or\s+replace\s+function\s+public\.vm_bank_admin_stats[\s\S]*?'missing_id'[\s\S]*?'invalid_id'[\s\S]*?'unknown_taxonomy'/i,
  'admin stats must explain the separate ID review queues');

console.log('question-bank preview-before-save SQL checks passed');
