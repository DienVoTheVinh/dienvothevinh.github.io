begin;

-- The browser-admin preflight audited this exact two-account cohort before the
-- admin session expired. Finish the cutover with the same server-side guards
-- so no unrelated VinhMath account can be changed by this data migration.
do $migration$
declare
  v_portal_id uuid;
  v_teacher_id uuid;
  v_student_id uuid;
  v_class_id uuid;
  v_roster_count integer;
  v_updated_count integer;
  v_result jsonb;
begin
  select portal.id into strict v_portal_id
  from public.exam_portals portal
  where portal.slug = 'toan-thay-truong'
    and portal.experience_mode = 'full_site'
    and not portal.is_active
  for update;

  select profile.id into strict v_teacher_id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where lower(profile.username) = 'thaytruong'
    and profile.role = 'teacher'
    and lower(auth_user.email) = 'thaytruong@gvtt.vinhmath.com'
  for update of profile;

  select profile.id into strict v_student_id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where lower(profile.username) = 'hocsinhdemo'
    and profile.role = 'student'
    and lower(auth_user.email) = 'hocsinhdemo@hstt.vinhmath.com'
  for update of profile;

  select class_row.id into strict v_class_id
  from public.classes class_row
  join public.class_students roster on roster.class_id = class_row.id
  where class_row.portal_id = v_portal_id
    and class_row.teacher_id = v_teacher_id
    and roster.student_id = v_student_id;

  select count(*) into v_roster_count
  from public.class_students roster
  where roster.class_id = v_class_id;

  if v_roster_count <> 1 then
    raise exception 'toan_thay_truong_finalize_roster_scope_changed' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.exam_portal_members membership
    where membership.portal_id = v_portal_id
      and membership.user_id = v_teacher_id
      and membership.member_role = 'manager'
      and membership.portal_only
      and not membership.is_primary
  ) or not exists (
    select 1 from public.exam_portal_members membership
    where membership.portal_id = v_portal_id
      and membership.user_id = v_student_id
      and membership.member_role = 'student'
      and membership.portal_only
      and not membership.is_primary
  ) then
    raise exception 'toan_thay_truong_finalize_membership_state_changed' using errcode = '22023';
  end if;

  -- The login addresses already have the desired suffixes. Only repair the
  -- private authorization claims while preserving all other Auth metadata.
  update auth.users auth_user
  set raw_app_meta_data = coalesce(auth_user.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('vinhmath_role', 'teacher'),
      updated_at = now()
  where auth_user.id = v_teacher_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'toan_thay_truong_teacher_auth_claim_failed' using errcode = '22023';
  end if;

  update auth.users auth_user
  set raw_app_meta_data = coalesce(auth_user.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('vinhmath_role', 'student'),
      updated_at = now()
  where auth_user.id = v_student_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'toan_thay_truong_student_auth_claim_failed' using errcode = '22023';
  end if;

  -- Reuse the central atomic finalizer. Migrations run outside an HTTP JWT, so
  -- provide the transaction-local service role required by that audited RPC.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.vm_admin_finalize_full_site_tenant_migration(
    v_portal_id,
    v_teacher_id,
    array[v_student_id]
  );

  if not coalesce((v_result ->> 'ok')::boolean, false)
     or coalesce((v_result ->> 'activated')::boolean, false) is not true
     or coalesce((v_result ->> 'membership_count')::integer, 0) <> 2 then
    raise exception 'toan_thay_truong_finalize_result_invalid' using errcode = '22023';
  end if;
end
$migration$;

commit;
