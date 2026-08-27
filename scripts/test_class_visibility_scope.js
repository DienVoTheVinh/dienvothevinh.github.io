const fs = require('fs');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const sql = fs.readFileSync('supabase/migrations/20260827193020_class_visibility_scope.sql', 'utf8');
const page = fs.readFileSync('quan-tri-lop.html', 'utf8');

expect(/create policy classes_actor_visibility_scope[\s\S]*as restrictive for select to authenticated/i.test(sql),
  'Class visibility must be enforced by a restrictive authenticated SELECT policy.');
expect(/revoke select on table public\.classes from anon/i.test(sql),
  'Anonymous Data API callers must not enumerate classes.');
expect(/vm_current_actor_can_access_class\(id\)/i.test(sql),
  'The classes policy must authorize the current actor per class.');
expect(/classroom\.teacher_id=p_actor_id[\s\S]*classroom\.co_teacher_id=p_actor_id[\s\S]*class_assistants[\s\S]*assistant_id=p_actor_id/i.test(sql),
  'Owner, co-teacher, and assigned assistant access are not all represented.');
expect(/class_students[\s\S]*student_id=p_actor_id[\s\S]*profiles child[\s\S]*child\.parent_id=p_actor_id/i.test(sql),
  'Student and linked-parent classroom access must remain available.');
expect(/create or replace function public\.vm_list_accessible_classes/i.test(sql),
  'The bounded classroom listing RPC is missing.');
expect(/if v_role<>'admin' then[\s\S]*v_scope := 'mine'[\s\S]*v_teacher_ids := array\[\]::uuid\[\]/i.test(sql),
  'Non-admin RPC callers must not be able to request admin filters.');
expect(/when v_scope='selected'[\s\S]*teacher_id=any\(v_teacher_ids\)[\s\S]*co_teacher_id=any\(v_teacher_ids\)[\s\S]*assistant_id=any\(v_teacher_ids\)/i.test(sql),
  'Admin multi-teacher filtering must include owners, co-teachers, and assistants.');
expect(/revoke all on function public\.vm_list_accessible_classes\(text,uuid\[\]\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to authenticated/i.test(sql),
  'RPC execute grants must be explicit and authenticated-only.');
expect(/class_assistants_actor_visibility_scope[\s\S]*as restrictive for select to authenticated[\s\S]*vm_current_actor_can_access_class\(class_id\)/i.test(sql),
  'Assistant membership rows must inherit the class privacy boundary.');
expect(/class_students_actor_visibility_scope[\s\S]*as restrictive for select to authenticated[\s\S]*vm_current_actor_can_access_class\(class_id\)/i.test(sql),
  'Student membership rows must inherit the class privacy boundary.');

expect(page.includes('id="classScopePanel"') && page.includes('id="classScopeSelect"'),
  'Admin class scope controls are missing from the sidebar.');
for (const scope of ['mine', 'collaboration', 'selected', 'all']) {
  expect(page.includes(`value="${scope}"`), `Missing class scope UI option: ${scope}`);
}
expect(/hoSoNguoiDung\.role !== 'admin'[\s\S]*return;[\s\S]*panel\.classList\.add\('is-visible'\)/.test(page),
  'Teacher accounts must not see admin class-scope controls.');
expect(/sb\.rpc\('vm_list_accessible_classes',\s*\{\s*p_scope:\s*scope,\s*p_teacher_ids:\s*teacherIds\s*\}\)/.test(page),
  'Sidebar must load classes from the server-scoped RPC.');
expect(!/sb\.from\('classes'\)\.select\('id, name, grade, mode, school_year, is_specialized, teacher_id, co_teacher_id/.test(page),
  'Sidebar must not fall back to loading every class directly.');

console.log('PASS class visibility RLS/RPC and admin class-scope filter');
