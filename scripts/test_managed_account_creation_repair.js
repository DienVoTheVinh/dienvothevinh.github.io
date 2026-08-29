const fs = require('fs');

const migration = fs.readFileSync(
  'supabase/migrations/20260829163500_fix_managed_account_creation.sql',
  'utf8'
);
const followupMigration = fs.readFileSync(
  'supabase/migrations/20260829165000_remove_auth_metadata_profile_sync_trigger.sql',
  'utf8'
);
const edge = fs.readFileSync('supabase/functions/tao-tai-khoan/index.ts', 'utf8');

function expect(value, message) {
  if (!value) throw new Error(message);
}

expect(/v_email_domain\s*:=\s*lower\(split_part\(coalesce\(new\.email,''\),'@',2\)\)/i.test(migration),
  'The Auth trigger must identify the managed parent namespace from the exact email domain.');
expect(/v_parent_identity\s*:=\s*v_email_domain='ph\.vinhmath\.com'\s+or\s+v_role='parent'/i.test(migration),
  'Parent profile usernames must receive the _ph namespace even before the private role claim is visible.');
expect(/v_requested_role\s*:=\s*lower\(coalesce\(new\.raw_app_meta_data->>'vinhmath_role','student'\)\)/i.test(migration),
  'Authorization roles must still come only from private app metadata.');
expect(!/v_role\s*:=\s*case[\s\S]{0,300}v_email_domain/i.test(migration),
  'The parent email domain must never grant a profile role.');
expect(/drop trigger if exists on_auth_user_app_metadata_changed on auth\.users/i.test(followupMigration),
  'Auth-claim rollback must not overwrite the profile authorization source.');

expect(/create or replace function public\.vm_finalize_managed_account_pair\([\s\S]*security definer[\s\S]*set search_path=''/i.test(migration),
  'Student-parent finalization must be one pinned database transaction.');
expect(/set role='parent',[\s\S]*username=v_username \|\| '_ph'[\s\S]*set role='student',[\s\S]*parent_id=p_parent_id/i.test(migration),
  'The finalizer must set both exact roles, usernames and the parent link.');
expect(/from auth\.users[\s\S]*where id=p_student_id[\s\S]*for update[\s\S]*from auth\.users[\s\S]*where id=p_parent_id[\s\S]*for update/i.test(migration),
  'The finalizer must lock and verify both Auth identities.');
expect(/v_student_email is distinct from v_username \|\| '@hs\.vinhmath\.com'[\s\S]*v_parent_email is distinct from v_username \|\| '@ph\.vinhmath\.com'[\s\S]*v_student_claim is distinct from 'student'[\s\S]*v_parent_claim is distinct from 'parent'/i.test(migration),
  'The finalizer must reject mismatched emails or private role claims.');
expect(/from public\.profiles[\s\S]*where id in \(p_student_id,p_parent_id\)[\s\S]*for update[\s\S]*v_profile_count <> 2/i.test(migration),
  'The finalizer must lock and require exactly two profile rows.');
expect(/revoke all on function public\.vm_finalize_managed_account_pair\(uuid,uuid,text,text\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i.test(migration),
  'Only the service-role account factory may finalize a managed pair.');
expect(/update public\.profiles profile[\s\S]*raw_app_meta_data->>'vinhmath_role'[\s\S]*in \('teacher','assistant','parent'\)[\s\S]*profile\.role='student'[\s\S]*auth_role\.email_domain='gv\.vinhmath\.com'[\s\S]*exam_portals portal[\s\S]*portal\.teacher_login_suffix/i.test(migration),
  'The production repair must be bounded to managed staff/parent claims left as student.');
const repairBlock = migration.slice(migration.indexOf('-- Repair the bounded failure mode'));
expect(!/\badmin\b/i.test(repairBlock), 'The production repair must never mass-promote an admin claim.');

expect(/async function rollbackCreatedAuthUsers[\s\S]*try \{[\s\S]*deleteUser\(userId\)[\s\S]*if \(error\) failedUserIds\.push\(userId\)[\s\S]*catch \(_\)[\s\S]*failedUserIds\.push\(userId\)/i.test(edge),
  'Returned and thrown Auth rollback failures must both be observed without stopping cleanup.');
expect(!/deleteUser\([^)]*\)\.catch\(\(\) => \{\}\)/.test(edge),
  'Created Auth users must never be deleted with an ignored result.');
expect(/const \{ data: taken, error: lookupError \}[\s\S]*if \(lookupError\) throw new Error/i.test(edge),
  'A profile lookup failure must not be treated as an available username.');
expect(/svc\.rpc\("vm_finalize_managed_account_pair"[\s\S]*p_student_id: hs\.user\.id[\s\S]*p_parent_id: ph\.user\.id/i.test(edge),
  'The HS/PH branch must use the transactional profile finalizer.');
expect(/studentProfile\?\.role === "student"[\s\S]*studentProfile\?\.parent_id === ph\.user\.id[\s\S]*parentProfile\?\.role === "parent"[\s\S]*parentProfile\?\.username === u \+ "_ph"/i.test(edge),
  'The HS/PH branch must verify both profiles before returning credentials.');
expect(/if \(phErr \|\| !ph\?\.user\)[\s\S]*rollbackCreatedAuthUsers\(svc, \[hs\.user\.id\]\)/i.test(edge),
  'A failed parent creation must roll back the temporary student.');
expect(/update\(\{ full_name: fullName, username: u, role: accountRole \}\)[\s\S]*profileResult\.data\?\.role === accountRole[\s\S]*rollbackCreatedAuthUsers\(svc, \[acc\.user\.id\]\)/i.test(edge),
  'GV/TG creation must finalize, verify and compensate the profile role.');
expect(/rollback\.ok \? 500 : 503/g.test(edge),
  'Uncertain cleanup must surface as 503 instead of a false ordinary failure.');

console.log('PASS managed HS/PH and GV/TG creation repair contracts');
