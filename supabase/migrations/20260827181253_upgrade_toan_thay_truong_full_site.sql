begin;

-- Upgrade the existing isolated Toán Thầy Trường exam portal in place. The
-- VinhMath feature implementation and learning data remain shared; only the
-- presentation context and the two explicitly audited demo accounts change.
do $migration$
declare
  v_portal public.exam_portals%rowtype;
  v_teacher public.profiles%rowtype;
  v_student public.profiles%rowtype;
  v_class public.classes%rowtype;
  v_teacher_email text;
  v_student_email text;
  v_roster_count integer;
begin
  select * into strict v_portal
  from public.exam_portals
  where slug = 'toan-thay-truong'
  for update;

  select * into strict v_teacher
  from public.profiles
  where lower(username) = 'thaytruong'
  for update;

  select * into strict v_student
  from public.profiles
  where lower(username) = 'hocsinhdemo'
  for update;

  select lower(email) into strict v_teacher_email
  from auth.users where id = v_teacher.id;
  select lower(email) into strict v_student_email
  from auth.users where id = v_student.id;

  if v_teacher_email <> 'thaytruong@gvtt.vinhmath.com'
     or v_student_email <> 'hocsinhdemo@hstt.vinhmath.com' then
    raise exception 'toan_thay_truong_auth_suffix_audit_failed' using errcode = '22023';
  end if;

  select class_row.* into strict v_class
  from public.classes class_row
  join public.class_students roster on roster.class_id = class_row.id
  where class_row.teacher_id = v_teacher.id
    and class_row.portal_id = v_portal.id
    and roster.student_id = v_student.id;

  select count(*) into v_roster_count
  from public.class_students roster
  where roster.class_id = v_class.id;

  if v_roster_count <> 1 then
    raise exception 'toan_thay_truong_roster_scope_changed' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.exam_portal_members membership
    where membership.portal_id = v_portal.id
      and membership.user_id = v_teacher.id
      and membership.member_role = 'manager'
      and membership.portal_only
  ) or not exists (
    select 1 from public.exam_portal_members membership
    where membership.portal_id = v_portal.id
      and membership.user_id = v_student.id
      and membership.member_role = 'student'
      and membership.portal_only
  ) then
    raise exception 'toan_thay_truong_legacy_membership_audit_failed' using errcode = '22023';
  end if;

  -- This old portal manager was deliberately created as a restricted student.
  -- A full-site teacher needs the ordinary teacher profile role. The private
  -- Auth claim is repaired by the audited Edge cutover before activation.
  update public.profiles
  set role = 'teacher'
  where id = v_teacher.id
    and role = 'student';

  if not exists (
    select 1 from public.profiles profile
    where profile.id = v_teacher.id and profile.role = 'teacher'
  ) then
    raise exception 'toan_thay_truong_teacher_promotion_failed' using errcode = '22023';
  end if;

  update public.exam_portals
  set name = 'Không gian Toán Thầy Trường',
      short_name = 'Toán Thầy Trường',
      description = 'Không gian học tập và giảng dạy của Thầy Trường trên nền tảng VinhMath.',
      support_text = 'Liên hệ Thầy Trường khi cần hỗ trợ.',
      experience_mode = 'full_site',
      home_path = 'khong-gian?tenant=toan-thay-truong',
      home_title = 'Không gian Toán Thầy Trường',
      home_subtitle = 'Học tập, luyện đề và theo dõi tiến bộ trong giao diện riêng của Thầy Trường.',
      is_active = false,
      updated_at = now()
  where id = v_portal.id;

  insert into public.exam_portal_feature_rules (
    portal_id, role_scope, feature_key, state, sort_order, label_override, updated_at
  )
  select v_portal.id, feature.role_scope, feature.feature_key,
         'shown', feature.sort_order, null, now()
  from (values
    ('teacher', 'home', 10),
    ('teacher', 'classes', 20),
    ('teacher', 'grading', 30),
    ('teacher', 'authoring', 40),
    ('teacher', 'question_bank', 45),
    ('teacher', 'schedule', 50),
    ('teacher', 'vmtool', 60),
    ('teacher', 'profile', 70),
    ('student', 'home', 10),
    ('student', 'lessons', 20),
    ('student', 'practice', 30),
    ('student', 'results', 40),
    ('student', 'leaderboard', 50),
    ('student', 'vmtool', 60),
    ('student', 'profile', 70)
  ) as feature(role_scope, feature_key, sort_order)
  on conflict (portal_id, role_scope, feature_key) do update
  set state = excluded.state,
      sort_order = excluded.sort_order,
      label_override = excluded.label_override,
      updated_at = excluded.updated_at;
end
$migration$;

commit;
