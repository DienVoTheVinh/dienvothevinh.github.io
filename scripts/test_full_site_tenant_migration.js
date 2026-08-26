const fs = require('fs');

const edge = fs.readFileSync('supabase/functions/tao-tai-khoan/index.ts', 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const start = edge.indexOf('async function migrateFullSiteTenant(');
const end = edge.indexOf('\nDeno.serve(', start);
expect(start >= 0 && end > start, 'The full-site tenant migration implementation is missing.');
const migration = edge.slice(start, end);

expect(edge.includes('"full_site_tenant_migrate"'), 'The account-action allowlist misses full-site migration.');
expect(/type === "full_site_tenant_migrate"[\s\S]{0,180}prof\.role !== "admin"/.test(edge),
  'Full-site migration must reject every non-admin caller before doing work.');
expect(/tenantId[\s\S]*teacherId[\s\S]*classId[\s\S]*UUID_RE/.test(migration),
  'Tenant, teacher and class identifiers must be validated.');
expect(/experience_mode !== "full_site"/.test(migration),
  'The action must only migrate accounts into a full-site tenant.');
expect(/STUDENT_SUFFIX_RE\.test\(studentSuffix\)[\s\S]*TEACHER_SUFFIX_RE\.test\(teacherSuffix\)/.test(migration),
  'Both student and teacher tenant suffixes must be validated.');

expect(/from\("profiles"\)\.select\("id,username,role"\).*teacherId/.test(migration),
  'The exact teacher profile must be loaded.');
expect(/teacherResult\.data\.role !== "teacher"/.test(migration),
  'The selected teacher must retain the teacher profile role.');
expect(/from\("classes"\)\.select\("id,teacher_id"\).*classId/.test(migration) &&
  /classResult\.data\.teacher_id !== teacherId/.test(migration),
  'The class must be owned by the selected teacher.');
expect(/from\("class_students"\)\.select\("student_id"\).*classId/.test(migration),
  'The student cohort must come from the exact class roster.');
expect(/studentIds\.length > 1000/.test(migration),
  'The Edge preflight must enforce the same cohort bound as the atomic RPC.');
expect(/profile\.role !== "student"/.test(migration),
  'Every roster member must still be an ordinary student profile.');

expect(/auth\.admin\.getUserById\(actor\.id\)/.test(migration),
  'Auth users must be resolved by immutable profile id.');
expect(/portal\.is_active === true[\s\S]*fullSiteTenantState\(svc, portalId, teacherId, studentIds\)[\s\S]*!existingState\.complete/.test(migration),
  'An active tenant may only be retried when the exact cohort is already finalized.');
expect(/auth\.admin\.listUsers\(\{ page, perPage: 1000 \}\)/.test(migration) &&
  /owner && owner !== actor\.id/.test(migration),
  'Target Auth emails must be collision-checked while allowing idempotent same-user retries.');
expect(migration.indexOf('if (dryRun)') < migration.indexOf('svc.auth.admin.updateUserById(actor.id'),
  'Dry-run must return before the first Auth mutation.');
expect(/oldEmail: authUser\.email\.toLowerCase\(\)/.test(migration) &&
  /appMetadata: copyMetadata\(authUser\.app_metadata\)/.test(migration) &&
  /userMetadata: copyMetadata\(authUser\.user_metadata\)/.test(migration),
  'The action must snapshot the original email and both metadata objects.');
expect(/app_metadata: \{ \.\.\.actor\.appMetadata \}/.test(migration) &&
  /user_metadata: \{ \.\.\.actor\.userMetadata \}/.test(migration),
  'Auth renames must preserve app and user metadata.');
expect(/actor\.oldEmail === actor\.targetEmail\) continue/.test(migration),
  'Already-migrated Auth users must be skipped on retry.');
expect(/rollbackAuthEmails\(svc, changed\)/.test(migration) &&
  /for \(const actor of \[\.\.\.changed\]\.reverse\(\)\)/.test(edge) &&
  /email: actor\.oldEmail/.test(edge),
  'Partial Auth changes need reverse-order compensating rollback.');
expect(/const observed = await svc\.auth\.admin\.getUserById\(actor\.id\)/.test(migration) &&
  /observedEmail === actor\.targetEmail\) changed\.push\(actor\)/.test(migration) &&
  /rollbackKnownOk: rollback\.ok/.test(migration) && /retryable: true/.test(migration),
  'Ambiguous Auth responses must be observed before rollback or an idempotent retry.');

expect(/vm_admin_finalize_full_site_tenant_migration/.test(migration) &&
  /p_portal_id: portalId[\s\S]*p_teacher_id: teacherId[\s\S]*p_student_ids: studentIds/.test(migration),
  'Membership upsert and tenant activation must use the single transactional RPC.');
expect(/portal_only,is_primary/.test(edge) && /member\.portal_only === false && member\.is_primary === true/.test(edge),
  'Ambiguous RPC responses must verify full-site primary memberships before recovery.');
expect(/idempotentRecovery: true/.test(migration),
  'A committed RPC with a lost response must be recoverable idempotently.');

expect(!/from\("profiles"\)\.update|from\("classes"\)\.update|from\("class_students"\)\.(?:insert|update|delete)/.test(migration),
  'Migration must not rewrite profile roles, classes or enrollments.');
expect(!/["'`]\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b["'`]/i.test(migration),
  'Migration must not hardcode a teacher, class or tenant id.');
expect(!/password|parent_id|attempts/.test(migration),
  'Migration must neither inspect nor mutate passwords, parent links or attempts.');

console.log('PASS admin-only full-site tenant preflight, safe Auth rename, rollback and atomic activation');
