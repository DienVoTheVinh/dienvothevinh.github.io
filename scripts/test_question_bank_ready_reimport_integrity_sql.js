const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826093000_question_bank_ready_reimport_integrity.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function has(pattern, message, source = sql) {
  ok(pattern.test(source), message);
}

function body(name) {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  ok(start >= 0, `missing ${name}`);
  const bodyStart = sql.indexOf('as $function$', start);
  const end = sql.indexOf('$function$;', bodyStart + 13);
  ok(bodyStart >= 0 && end > bodyStart, `unclosed ${name}`);
  return sql.slice(start, end + '$function$;'.length);
}

const importWrapper = body('public.vm_bank_admin_import');

has(
  /security definer[\s\S]*set search_path = public, private, auth, pg_temp/i,
  'admin import must retain its pinned security-definer boundary',
  importWrapper
);
has(
  /auth\.uid\(\) is null or not public\.is_admin\(\)[\s\S]*bank_admin_required/i,
  'admin import must reject non-admin callers',
  importWrapper
);

// A retry can arrive either as a fresh raw-TeX upload or as a later id-only
// chunk. Both paths must lock the same private source row before the core runs.
has(
  /extensions\.digest\(convert_to\(v_document_raw,'UTF8'\),'sha256'\)[\s\S]*where content_hash=v_document_hash[\s\S]*for update/i,
  'raw-TeX retry must resolve and lock the canonical source document',
  importWrapper
);
has(
  /where id=\(p_document->>'id'\)::uuid[\s\S]*for update/i,
  'id-only retry chunks must lock the existing source document',
  importWrapper
);
has(
  /v_existing\.status='active'[\s\S]*import_state[\s\S]*complete[\s\S]*private\.vm_bank_document_is_ready/i,
  'only an explicitly complete and currently ready source may use preservation',
  importWrapper
);

// An expected-count drift represents a different parse and must fail before
// any occurrence can be relinked.
const expectedGuard = importWrapper.indexOf('bank_ready_source_expected_mismatch');
const coreCall = importWrapper.indexOf(
  'private.vm_bank_admin_import_core(p_document,p_items)'
);
ok(expectedGuard >= 0, 'missing complete-source expected-count guard');
ok(coreCall >= 0, 'missing proven private import core call');
ok(expectedGuard < coreCall, 'expected-count mismatch must fail before import');

// The complete source occurrence map is snapshotted before the core and
// compared after it. Raising after the core is intentional: PostgreSQL rolls
// the whole RPC transaction back, preventing a partial relink from escaping.
has(
  /jsonb_agg\([\s\S]*'ordinal',source\.source_ordinal[\s\S]*'item_id',source\.item_id[\s\S]*into v_existing_linked[\s\S]*v_existing_map/i,
  'ready source must snapshot every ordinal-to-item mapping',
  importWrapper
);
has(
  /into v_after_linked,v_after_active,v_after_quarantined,v_after_map[\s\S]*v_after_map is distinct from v_existing_map[\s\S]*bank_ready_source_reimport_changed_integrity/i,
  'retry must fail closed if counts, status, quarantine, or mapping changes',
  importWrapper
);
const integrityGuard = importWrapper.indexOf(
  'bank_ready_source_reimport_changed_integrity'
);
ok(
  integrityGuard > coreCall,
  'post-import integrity guard must run after the core so its exception rolls the chunk back'
);

// A successful idempotent chunk may enrich unrelated metadata, but the
// last-known-good lifecycle and active status must be restored atomically.
has(
  /v_ready_lifecycle:=jsonb_build_object\([\s\S]*'import_state','complete'[\s\S]*'expected_count',v_existing_expected/i,
  'successful retry must restore complete lifecycle metadata',
  importWrapper
);
has(
  /v_existing\.metadata \? 'finalized_at'[\s\S]*'finalized_at',v_existing\.metadata->'finalized_at'/i,
  'successful retry must retain the original finalization timestamp',
  importWrapper
);
has(
  /metadata=\([\s\S]*- 'import_state' - 'expected_count' - 'finalized_at'[\s\S]*\)\|\|v_ready_lifecycle[\s\S]*status=v_existing\.status/i,
  'staged metadata and status must not downgrade a ready source',
  importWrapper
);
has(
  /'ready_source_preserved',true[\s\S]*'ready_source_expected_count',v_existing_expected/i,
  'admin response must make preservation observable',
  importWrapper
);

// Keep the active-item quarantine guard and response contract from the prior
// wrapper while this migration adds the document-level invariant.
has(
  /set_config\('vm\.bank_import_guard','on',true\)[\s\S]*current_setting\('vm\.bank_import_preserved',true\)/i,
  'ready-source guard must retain active-item protection',
  importWrapper
);
has(
  /'quarantined',v_quarantined,'protected_active',v_preserved/i,
  'ready-source guard must preserve the existing import response contract',
  importWrapper
);
has(
  /exception when others then[\s\S]*set_config\('vm\.bank_import_guard','off',true\)[\s\S]*raise/i,
  'import guard must be cleared on every error path',
  importWrapper
);

has(
  /revoke all on function public\.vm_bank_admin_import\(jsonb,jsonb\)\s+from public, anon/i,
  'anonymous execution must remain revoked'
);
has(
  /grant execute on function public\.vm_bank_admin_import\(jsonb,jsonb\)\s+to authenticated, service_role/i,
  'authenticated admin and service execution contract must remain available'
);

const starts = (sql.match(/as \$function\$/g) || []).length;
const ends = (sql.match(/\$function\$;/g) || []).length;
ok(starts === ends, `unbalanced function bodies: ${starts} starts, ${ends} ends`);

console.log('question-bank ready reimport integrity SQL checks passed');
