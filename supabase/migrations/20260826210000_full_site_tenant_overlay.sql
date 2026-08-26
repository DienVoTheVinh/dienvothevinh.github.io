-- Full-site tenant overlays reuse the partner directory and brand system without
-- changing the caller's VinhMath role or moving classroom data into portal scope.

alter table public.exam_portals
  add column experience_mode text not null default 'exam_only',
  add column home_path text not null default 'thi',
  add column home_title text,
  add column home_subtitle text,
  add column home_image_path text;

alter table public.exam_portals
  add constraint exam_portals_experience_mode_check
    check (experience_mode in ('exam_only', 'full_site')),
  add constraint exam_portals_home_path_check
    check (
      char_length(home_path) between 1 and 256
      and home_path ~ '^[a-z0-9][a-z0-9/_.?&=#%-]*$'
      and home_path not like '%..%'
    ),
  add constraint exam_portals_home_title_length
    check (home_title is null or char_length(btrim(home_title)) between 1 and 120),
  add constraint exam_portals_home_subtitle_length
    check (home_subtitle is null or char_length(home_subtitle) <= 320),
  add constraint exam_portals_home_image_path_length
    check (home_image_path is null or char_length(home_image_path) between 1 and 512);

alter table public.exam_portal_members
  add column is_primary boolean not null default false;

create unique index exam_portal_members_one_primary_tenant_idx
  on public.exam_portal_members (user_id)
  where is_primary;

create table public.exam_portal_feature_rules (
  portal_id uuid not null references public.exam_portals(id) on delete cascade,
  role_scope text not null default '*',
  feature_key text not null,
  state text not null default 'shown',
  sort_order integer not null default 0,
  label_override text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (portal_id, role_scope, feature_key),
  constraint exam_portal_feature_rules_role_scope_check
    check (role_scope in ('*', 'admin', 'teacher', 'assistant', 'student', 'parent', 'owner', 'manager')),
  constraint exam_portal_feature_rules_feature_key_check
    check (feature_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint exam_portal_feature_rules_state_check
    check (state in ('shown', 'locked', 'hidden')),
  constraint exam_portal_feature_rules_sort_order_check
    check (sort_order between -1000 and 1000),
  constraint exam_portal_feature_rules_label_length
    check (label_override is null or char_length(btrim(label_override)) between 1 and 80)
);

create index exam_portal_feature_rules_render_idx
  on public.exam_portal_feature_rules (portal_id, role_scope, sort_order, feature_key);

alter table public.exam_portal_feature_rules enable row level security;

revoke all on table public.exam_portal_feature_rules from anon, authenticated;
grant select, insert, update, delete on table public.exam_portal_feature_rules to authenticated;
grant all on table public.exam_portal_feature_rules to service_role;

create policy exam_portal_feature_rules_member_read
on public.exam_portal_feature_rules
for select
to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1
    from public.exam_portal_members membership
    where membership.portal_id = exam_portal_feature_rules.portal_id
      and membership.user_id = (select auth.uid())
  )
);

create policy exam_portal_feature_rules_admin_insert
on public.exam_portal_feature_rules
for insert
to authenticated
with check ((select public.is_admin()));

create policy exam_portal_feature_rules_admin_update
on public.exam_portal_feature_rules
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy exam_portal_feature_rules_admin_delete
on public.exam_portal_feature_rules
for delete
to authenticated
using ((select public.is_admin()));

-- An authenticated caller receives only their active primary full-site tenant.
-- Rules are resolved server-side: a portal role overrides a profile role, which
-- overrides the tenant-wide '*' default.
create or replace function public.vm_current_tenant_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_context jsonb;
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  select jsonb_build_object(
    'tenant_id', portal.id,
    'id', portal.id,
    'slug', portal.slug,
    'name', portal.name,
    'short_name', portal.short_name,
    'experience_mode', portal.experience_mode,
    'full_site', true,
    'login_suffix', portal.login_suffix,
    'teacher_login_suffix', portal.teacher_login_suffix,
    'home_path', portal.home_path,
    'home_title', portal.home_title,
    'home_subtitle', portal.home_subtitle,
    'home_image_path', portal.home_image_path,
    'support_text', portal.support_text,
    'member_role', membership.member_role,
    'portal_only', membership.portal_only,
    'brand', case when brand.id is null then null else jsonb_build_object(
      'id', brand.id,
      'slug', brand.slug,
      'name', brand.name,
      'short_name', brand.short_name,
      'wordmark_primary_text', brand.wordmark_primary_text,
      'wordmark_secondary_text', brand.wordmark_secondary_text,
      'wordmark_primary_color', brand.wordmark_primary_color,
      'wordmark_secondary_color', brand.wordmark_secondary_color,
      'tagline', brand.tagline,
      'logo_path', brand.logo_path,
      'preset', brand.preset,
      'primary_color', brand.primary_color,
      'secondary_color', brand.secondary_color,
      'accent_color', brand.accent_color,
      'accent_soft_color', brand.accent_soft_color,
      'surface_color', brand.surface_color,
      'text_color', brand.text_color,
      'topbar_color', brand.topbar_color,
      'topbar_text_color', brand.topbar_text_color,
      'logo_scale', brand.logo_scale,
      'logo_x', brand.logo_x,
      'logo_y', brand.logo_y,
      'radius_px', brand.radius_px,
      'is_active', brand.is_active
    ) end,
    'features', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'feature_key', effective.feature_key,
          'audience', effective.role_scope,
          'state', effective.state,
          'sort_order', effective.sort_order,
          'label_override', effective.label_override
        )
        order by effective.sort_order, effective.feature_key
      )
      from (
        select distinct on (candidate.feature_key)
          candidate.feature_key,
          candidate.role_scope,
          candidate.state,
          candidate.sort_order,
          candidate.label_override
        from public.exam_portal_feature_rules candidate
        where candidate.portal_id = portal.id
          and candidate.role_scope in ('*', profile.role, membership.member_role)
        order by
          candidate.feature_key,
          case
            when candidate.role_scope = membership.member_role then 0
            when candidate.role_scope = profile.role then 1
            else 2
          end,
          candidate.updated_at desc
      ) effective
    ), '[]'::jsonb)
  )
  into v_context
  from public.exam_portal_members membership
  join public.exam_portals portal on portal.id = membership.portal_id
  join public.profiles profile on profile.id = membership.user_id
  left join public.brand_templates brand on brand.id = portal.brand_id
  where membership.user_id = (select auth.uid())
    and membership.is_primary
    and not membership.portal_only
    and portal.is_active
    and portal.experience_mode = 'full_site'
    and (brand.id is null or brand.is_active)
  order by membership.created_at, portal.id
  limit 1;

  return v_context;
end;
$function$;

revoke all on function public.vm_current_tenant_context() from public, anon;
grant execute on function public.vm_current_tenant_context() to authenticated;

-- The login page may fetch this deliberately small, presentation-only payload
-- before authentication. It never returns membership, account or authorization
-- data, and inactive tenants remain undiscoverable.
create or replace function public.vm_public_tenant_context(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_context jsonb;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    return null;
  end if;

  select jsonb_build_object(
    'tenant_id', portal.id,
    'id', portal.id,
    'slug', portal.slug,
    'name', portal.name,
    'short_name', portal.short_name,
    'experience_mode', portal.experience_mode,
    'full_site', true,
    'login_suffix', portal.login_suffix,
    'teacher_login_suffix', portal.teacher_login_suffix,
    'home_path', portal.home_path,
    'home_title', portal.home_title,
    'home_subtitle', portal.home_subtitle,
    'home_image_path', portal.home_image_path,
    'support_text', portal.support_text,
    'member_role', null,
    'portal_only', false,
    'brand', case when brand.id is null then null else jsonb_build_object(
      'id', brand.id,
      'slug', brand.slug,
      'name', brand.name,
      'short_name', brand.short_name,
      'wordmark_primary_text', brand.wordmark_primary_text,
      'wordmark_secondary_text', brand.wordmark_secondary_text,
      'wordmark_primary_color', brand.wordmark_primary_color,
      'wordmark_secondary_color', brand.wordmark_secondary_color,
      'tagline', brand.tagline,
      'logo_path', brand.logo_path,
      'preset', brand.preset,
      'primary_color', brand.primary_color,
      'secondary_color', brand.secondary_color,
      'accent_color', brand.accent_color,
      'accent_soft_color', brand.accent_soft_color,
      'surface_color', brand.surface_color,
      'text_color', brand.text_color,
      'topbar_color', brand.topbar_color,
      'topbar_text_color', brand.topbar_text_color,
      'logo_scale', brand.logo_scale,
      'logo_x', brand.logo_x,
      'logo_y', brand.logo_y,
      'radius_px', brand.radius_px,
      'is_active', brand.is_active
    ) end,
    'features', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'feature_key', rule.feature_key,
          'audience', rule.role_scope,
          'state', rule.state,
          'sort_order', rule.sort_order,
          'label_override', rule.label_override
        )
        order by rule.sort_order, rule.feature_key
      )
      from public.exam_portal_feature_rules rule
      where rule.portal_id = portal.id
        and rule.role_scope = '*'
    ), '[]'::jsonb)
  )
  into v_context
  from public.exam_portals portal
  left join public.brand_templates brand on brand.id = portal.brand_id
  where portal.slug = p_slug
    and portal.is_active
    and portal.experience_mode = 'full_site'
    and (brand.id is null or brand.is_active)
  limit 1;

  return v_context;
end;
$function$;

revoke all on function public.vm_public_tenant_context(text) from public, anon, authenticated;
grant execute on function public.vm_public_tenant_context(text) to anon, authenticated;

-- The server-side account migration invokes this only after every Auth email
-- rename succeeds. One RPC transaction cuts over the whole cohort or none of it.
create or replace function public.vm_admin_finalize_full_site_tenant_migration(
  p_portal_id uuid,
  p_teacher_id uuid,
  p_student_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_ids uuid[] := coalesce(p_student_ids, '{}'::uuid[]);
  v_student_count integer := coalesce(cardinality(p_student_ids), 0);
  v_distinct_student_count integer;
  v_membership_count integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'tenant_migration_service_role_required' using errcode = '42501';
  end if;

  if p_portal_id is null or p_teacher_id is null then
    raise exception 'tenant_migration_target_required' using errcode = '22023';
  end if;
  if v_student_count > 1000 or array_position(v_student_ids, null) is not null then
    raise exception 'tenant_migration_student_list_invalid' using errcode = '22023';
  end if;

  select count(distinct student_id)
  into v_distinct_student_count
  from unnest(v_student_ids) as students(student_id);

  if v_distinct_student_count <> v_student_count
     or p_teacher_id = any(v_student_ids) then
    raise exception 'tenant_migration_cohort_invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.exam_portals portal
    where portal.id = p_portal_id
      and portal.experience_mode = 'full_site'
      and portal.brand_id is not null
  ) then
    raise exception 'tenant_migration_full_site_portal_required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_teacher_id and profile.role = 'teacher'
  ) then
    raise exception 'tenant_migration_teacher_role_invalid' using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.profiles profile
    where profile.id = any(v_student_ids)
      and profile.role = 'student'
  ) <> v_student_count then
    raise exception 'tenant_migration_student_role_invalid' using errcode = '22023';
  end if;

  update public.exam_portal_members membership
  set is_primary = false
  where membership.is_primary
    and (
      membership.user_id = p_teacher_id
      or membership.user_id = any(v_student_ids)
    );

  insert into public.exam_portal_members (
    portal_id, user_id, member_role, portal_only, is_primary
  )
  values (p_portal_id, p_teacher_id, 'manager', false, true)
  on conflict (portal_id, user_id) do update
  set member_role = excluded.member_role,
      portal_only = excluded.portal_only,
      is_primary = excluded.is_primary;

  insert into public.exam_portal_members (
    portal_id, user_id, member_role, portal_only, is_primary
  )
  select p_portal_id, students.student_id, 'student', false, true
  from unnest(v_student_ids) as students(student_id)
  on conflict (portal_id, user_id) do update
  set member_role = excluded.member_role,
      portal_only = excluded.portal_only,
      is_primary = excluded.is_primary;

  update public.exam_portals portal
  set is_active = true,
      updated_at = now()
  where portal.id = p_portal_id;

  select count(*)
  into v_membership_count
  from public.exam_portal_members membership
  where membership.portal_id = p_portal_id
    and membership.is_primary
    and not membership.portal_only
    and (
      membership.user_id = p_teacher_id
      or membership.user_id = any(v_student_ids)
    );

  return jsonb_build_object(
    'ok', true,
    'portal_id', p_portal_id,
    'teacher_count', 1,
    'student_count', v_student_count,
    'membership_count', v_membership_count,
    'activated', true
  );
end;
$function$;

revoke all on function public.vm_admin_finalize_full_site_tenant_migration(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.vm_admin_finalize_full_site_tenant_migration(uuid, uuid, uuid[])
  to service_role;

-- Fix the correlated-column shadowing in the original policies. Without the
-- outer-table qualification PostgreSQL deparsed both checks as x = x.
drop policy if exists exam_portal_exams_manager_insert on public.exam_portal_exams;
create policy exam_portal_exams_manager_insert
on public.exam_portal_exams
for insert
to authenticated
with check (
  (select private.can_manage_exam_portal(exam_portal_exams.portal_id))
  and (
    exam_portal_exams.class_id is null
    or exists (
      select 1
      from public.classes class_row
      where class_row.id = exam_portal_exams.class_id
        and class_row.portal_id = exam_portal_exams.portal_id
    )
  )
  and exists (
    select 1
    from public.exams exam_row
    where exam_row.id = exam_portal_exams.exam_id
      and (
        exam_row.portal_id is null
        or exam_row.portal_id = exam_portal_exams.portal_id
      )
  )
);

drop policy if exists exam_portal_exams_manager_update on public.exam_portal_exams;
create policy exam_portal_exams_manager_update
on public.exam_portal_exams
for update
to authenticated
using ((select private.can_manage_exam_portal(exam_portal_exams.portal_id)))
with check (
  (select private.can_manage_exam_portal(exam_portal_exams.portal_id))
  and (
    exam_portal_exams.class_id is null
    or exists (
      select 1
      from public.classes class_row
      where class_row.id = exam_portal_exams.class_id
        and class_row.portal_id = exam_portal_exams.portal_id
    )
  )
  and exists (
    select 1
    from public.exams exam_row
    where exam_row.id = exam_portal_exams.exam_id
      and (
        exam_row.portal_id is null
        or exam_row.portal_id = exam_portal_exams.portal_id
      )
  )
);

-- Remove RLS-bypassing or schema-management privileges inherited from broad
-- defaults while preserving every browser flow used by admin and managers.
revoke all on table public.exam_portals from anon, authenticated;
revoke all on table public.exam_portal_members from anon, authenticated;
revoke all on table public.exam_portal_exams from anon, authenticated;
grant select, insert, update, delete on table public.exam_portals to authenticated;
grant select, insert, update, delete on table public.exam_portal_members to authenticated;
grant select, insert, update, delete on table public.exam_portal_exams to authenticated;

-- UYENMATH is staged inactive. No user, class, role or membership is changed by
-- this migration; the service-only finalizer activates it after Auth cutover.
insert into public.exam_portals (
  slug,
  name,
  short_name,
  description,
  brand_id,
  support_text,
  login_suffix,
  teacher_login_suffix,
  experience_mode,
  home_path,
  home_title,
  home_subtitle,
  home_image_path,
  is_active
)
select
  'uyenmath',
  'UYENMATH',
  'UYENMATH',
  'Không gian học tập và giảng dạy của Cô Uyên trên nền tảng VinhMath.',
  brand.id,
  'Liên hệ Cô Uyên khi cần hỗ trợ.',
  'hsum',
  'gvum',
  'full_site',
  'uyenmath',
  'Không gian UYENMATH',
  'Học tập, luyện đề và theo dõi tiến bộ trong một giao diện riêng.',
  null,
  false
from public.brand_templates brand
where brand.slug = 'lop-toan-co-uyen'
on conflict (slug) do nothing;

insert into public.exam_portal_feature_rules (
  portal_id, role_scope, feature_key, state, sort_order, label_override
)
select portal.id, feature.role_scope, feature.feature_key, 'shown', feature.sort_order, null
from public.exam_portals portal
cross join (
  values
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
where portal.slug = 'uyenmath'
on conflict (portal_id, role_scope, feature_key) do nothing;

comment on column public.exam_portals.experience_mode is
  'exam_only keeps the isolated partner exam shell; full_site applies branding and feature controls over the normal VinhMath role experience.';
comment on column public.exam_portal_members.is_primary is
  'Selects the single full-site tenant applied after login; it does not grant permissions.';
comment on table public.exam_portal_feature_rules is
  'Admin-managed presentation and route controls. Authorization-sensitive features still require RLS or RPC enforcement.';
comment on function public.vm_current_tenant_context() is
  'Returns the caller active primary full-site tenant, brand and effective feature rules.';
comment on function public.vm_public_tenant_context(text) is
  'Returns an active full-site tenant public brand descriptor for pre-authentication rendering.';
comment on function public.vm_admin_finalize_full_site_tenant_migration(uuid, uuid, uuid[]) is
  'Service-only atomic membership cutover after an external Auth email migration succeeds.';
