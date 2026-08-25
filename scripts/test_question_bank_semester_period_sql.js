const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260826175000_question_bank_semester_period_contract.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

function must(pattern, message) {
  if (!pattern.test(sql)) throw new Error(message);
}

must(/create\s+or\s+replace\s+function\s+public\.vm_bank_generate_exam\s*\(p_spec\s+jsonb\)/i,
  'public generation RPC must be replaced by the period-aware contract');
must(/security\s+definer[\s\S]*?set\s+search_path\s*=\s*public\s*,\s*private\s*,\s*auth\s*,\s*pg_temp/i,
  'period-aware RPC must preserve a pinned SECURITY DEFINER search path');

for (const [code, label] of [
  ['midterm_1', 'Giữa kỳ I'],
  ['final_1', 'Cuối kỳ I'],
  ['midterm_2', 'Giữa kỳ II'],
  ['final_2', 'Cuối kỳ II']
]) {
  must(new RegExp(`when\\s+'${code}'\\s+then\\s+'${label}'`, 'i'),
    `missing canonical semester period ${code}`);
}

must(/v_output_kind\s*=\s*'semester_exam'[\s\S]*?bank_semester_period_invalid/i,
  'semester exams must reject an explicit non-canonical period');
must(/v_output_kind\s+not\s+in\s*\(\s*'practice_topic'\s*,\s*'semester_exam'\s*,\s*'thptqg_exam'\s*\)[\s\S]*?bank_output_kind_invalid/i,
  'wrapper must preserve output-kind validation before period applicability');
must(/else[\s\S]*?v_semester_period\s+is\s+not\s+null[\s\S]*?bank_semester_period_not_applicable/i,
  'non-semester outputs must reject a non-empty semester period');
must(/v_semester_period_legacy\s*:=\s*v_semester_period\s+is\s+null/i,
  'missing period must remain an explicit legacy-generic state');
must(/semester_period_missing_legacy/i,
  'legacy clients need a machine-readable warning instead of a guessed period');

must(/create\s+or\s+replace\s+function\s+private\.vm_bank_teacher_generation_spec/i,
  'teacher generation specs need a server allow-list');
must(/return\s+jsonb_strip_nulls\s*\(\s*jsonb_build_object\s*\(/i,
  'teacher top-level metadata must be rebuilt from an allow-list');
must(/jsonb_array_elements\s*\(p_spec->'blueprint'\)[\s\S]*?jsonb_build_object\s*\(/i,
  'teacher blueprint segments must be rebuilt from an allow-list');
must(/if\s+public\.is_admin\s*\(\s*\)[\s\S]*?else[\s\S]*?private\.vm_bank_teacher_generation_spec\s*\(p_spec\)/i,
  'teacher input must pass through the allow-list before generation');
must(/-'semester_period_label'[\s\S]*?-'semester_period_name'[\s\S]*?-'semester_period_display'/i,
  'client-provided display metadata must be discarded');

must(/update\s+public\.exams[\s\S]*?generation_spec[\s\S]*?'semester_period'[\s\S]*?'semester_period_label'/i,
  'canonical period data must be persisted with the public exam');
must(/update\s+private\.vm_question_bank_exam_specs[\s\S]*?'semester_period'[\s\S]*?'semester_period_label'/i,
  'canonical period data must be persisted with the private generation spec');
must(/return\s+v_result\s*\|\|\s*jsonb_build_object\s*\([\s\S]*?'semester_period'[\s\S]*?'semester_period_label'[\s\S]*?'semester_period_legacy'/i,
  'RPC response must return canonical period data and legacy state');

must(/alter\s+function\s+public\.vm_bank_generate_exam\s*\(jsonb\)[\s\S]*?rename\s+to\s+vm_bank_generate_exam_source_mix_v1/i,
  'reviewed source-mix engine must be preserved behind the wrapper');
must(/alter\s+function\s+public\.vm_bank_generate_exam_source_mix_v1\s*\(jsonb\)[\s\S]*?set\s+schema\s+private/i,
  'the legacy engine must not remain an exposed public RPC');
must(/revoke\s+all\s+on\s+function\s+private\.vm_bank_generate_exam_source_mix_v1\s*\(jsonb\)[\s\S]*?authenticated\s*,\s*service_role/i,
  'the private generation engine must not be directly callable');
must(/revoke\s+all\s+on\s+function\s+public\.vm_bank_generate_exam\s*\(jsonb\)\s+from\s+public\s*,\s*anon/i,
  'public and anonymous roles must not execute generation');
must(/grant\s+execute\s+on\s+function\s+public\.vm_bank_generate_exam\s*\(jsonb\)[\s\S]*?authenticated\s*,\s*service_role/i,
  'authenticated users and service role must retain the supported RPC');

console.log('question-bank semester period SQL checks passed');
