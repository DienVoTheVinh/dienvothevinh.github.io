-- Atomic admin-only builder for reusable full-site brand overlays.
-- Creating a draft never changes Auth users, memberships or class data. The
-- existing audited Edge cutover remains the only activation path.

create or replace function public.vm_admin_create_full_site_tenant(
  p_config jsonb,
  p_features jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_portal public.exam_portals%rowtype;
  v_brand_id uuid;
  v_slug text := lower(btrim(coalesce(p_config->>'slug', '')));
  v_name text := btrim(coalesce(p_config->>'name', ''));
  v_short_name text := btrim(coalesce(p_config->>'short_name', ''));
  v_student_suffix text := lower(btrim(coalesce(p_config->>'login_suffix', '')));
  v_teacher_suffix text := lower(btrim(coalesce(p_config->>'teacher_login_suffix', '')));
  v_home_path text;
  v_description text := nullif(btrim(coalesce(p_config->>'description', '')), '');
  v_support_text text := nullif(btrim(coalesce(p_config->>'support_text', '')), '');
  v_home_title text := nullif(btrim(coalesce(p_config->>'home_title', '')), '');
  v_home_subtitle text := nullif(btrim(coalesce(p_config->>'home_subtitle', '')), '');
  v_home_image_path text := nullif(btrim(coalesce(p_config->>'home_image_path', '')), '');
begin
  if v_actor is null or not (select public.is_admin()) then
    raise exception 'tenant_builder_admin_required' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_config, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_features, '[]'::jsonb)) <> 'array' then
    raise exception 'tenant_builder_payload_invalid' using errcode = '22023';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(v_slug) > 64
     or char_length(v_name) not between 1 and 100
     or char_length(v_short_name) not between 1 and 40
     or v_student_suffix !~ '^hs[a-z0-9]{2,20}$'
     or v_teacher_suffix !~ '^gv[a-z0-9]{2,20}$' then
    raise exception 'tenant_builder_identity_invalid' using errcode = '22023';
  end if;

  if coalesce(p_config->>'brand_id', '') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'tenant_builder_brand_invalid' using errcode = '22023';
  end if;
  v_brand_id := (p_config->>'brand_id')::uuid;
  if not exists (
    select 1 from public.brand_templates brand
    where brand.id = v_brand_id and brand.is_active
  ) then
    raise exception 'tenant_builder_brand_unavailable' using errcode = '22023';
  end if;

  -- A newly created tenant does not have a generated static homepage yet. The
  -- shared role homepage is a real, non-looping fallback until one is supplied.
  v_home_path := btrim(coalesce(
    nullif(p_config->>'home_path', ''),
    'khong-gian?tenant=' || v_slug
  ));

  if char_length(v_home_path) not between 1 and 256
     or v_home_path !~ '^[a-z0-9][a-z0-9/_.?&=#%-]*$'
     or v_home_path like '%..%'
     or (v_description is not null and char_length(v_description) > 500)
     or (v_support_text is not null and char_length(v_support_text) > 240)
     or (v_home_title is not null and char_length(v_home_title) > 120)
     or (v_home_subtitle is not null and char_length(v_home_subtitle) > 320)
     or (v_home_image_path is not null and char_length(v_home_image_path) > 512) then
    raise exception 'tenant_builder_presentation_invalid' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_features, '[]'::jsonb)) > 32 then
    raise exception 'tenant_builder_feature_limit' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_features, '[]'::jsonb)) item
    where jsonb_typeof(item) <> 'object'
       or coalesce(item->>'role_scope', '') not in ('teacher', 'student')
       or case coalesce(item->>'role_scope', '')
         when 'teacher' then coalesce(item->>'feature_key', '') not in (
           'home', 'classes', 'grading', 'authoring', 'schedule', 'vmtool', 'profile'
         )
         when 'student' then coalesce(item->>'feature_key', '') not in (
           'home', 'lessons', 'practice', 'results', 'leaderboard', 'vmtool', 'profile'
         )
         else true
       end
       or coalesce(item->>'state', '') not in ('shown', 'locked', 'hidden')
       or not case
         when coalesce(item->>'sort_order', '') ~ '^-?[0-9]{1,4}$'
           then (item->>'sort_order')::integer between -1000 and 1000
         else false
       end
       or (
         item ? 'label_override'
         and jsonb_typeof(item->'label_override') not in ('string', 'null')
       )
       or char_length(coalesce(item->>'label_override', '')) > 80
  ) then
    raise exception 'tenant_builder_feature_invalid' using errcode = '22023';
  end if;

  -- PostgreSQL cannot upsert the same conflict target twice in one statement.
  -- Reject duplicate overrides explicitly so the entire builder remains atomic
  -- and the caller receives a stable, actionable error.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_features, '[]'::jsonb)) item
    group by item->>'role_scope', item->>'feature_key'
    having count(*) > 1
  ) then
    raise exception 'tenant_builder_feature_duplicate' using errcode = '22023';
  end if;

  insert into public.exam_portals (
    slug, name, short_name, description, brand_id, support_text, is_active,
    created_by, login_suffix, teacher_login_suffix, experience_mode, home_path,
    home_title, home_subtitle, home_image_path
  ) values (
    v_slug,
    v_name,
    v_short_name,
    v_description,
    v_brand_id,
    v_support_text,
    false,
    v_actor,
    v_student_suffix,
    v_teacher_suffix,
    'full_site',
    v_home_path,
    v_home_title,
    v_home_subtitle,
    v_home_image_path
  ) returning * into v_portal;

  insert into public.exam_portal_feature_rules (
    portal_id, role_scope, feature_key, state, sort_order, label_override,
    updated_by
  )
  select v_portal.id, feature.role_scope, feature.feature_key, 'shown',
         feature.sort_order, null, v_actor
  from (values
    ('teacher', 'home', 10), ('teacher', 'classes', 20),
    ('teacher', 'grading', 30), ('teacher', 'authoring', 40),
    ('teacher', 'schedule', 50), ('teacher', 'vmtool', 60),
    ('teacher', 'profile', 70),
    ('student', 'home', 10), ('student', 'lessons', 20),
    ('student', 'practice', 30), ('student', 'results', 40),
    ('student', 'leaderboard', 50), ('student', 'vmtool', 60),
    ('student', 'profile', 70)
  ) as feature(role_scope, feature_key, sort_order);

  insert into public.exam_portal_feature_rules (
    portal_id, role_scope, feature_key, state, sort_order, label_override,
    updated_by, updated_at
  )
  select
    v_portal.id,
    item->>'role_scope',
    item->>'feature_key',
    item->>'state',
    (item->>'sort_order')::integer,
    nullif(btrim(coalesce(item->>'label_override', '')), ''),
    v_actor,
    now()
  from jsonb_array_elements(coalesce(p_features, '[]'::jsonb)) item
  on conflict (portal_id, role_scope, feature_key) do update
  set state = excluded.state,
      sort_order = excluded.sort_order,
      label_override = excluded.label_override,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'id', v_portal.id,
    'slug', v_portal.slug,
    'name', v_portal.name,
    'short_name', v_portal.short_name,
    'brand_id', v_portal.brand_id,
    'login_suffix', v_portal.login_suffix,
    'teacher_login_suffix', v_portal.teacher_login_suffix,
    'experience_mode', v_portal.experience_mode,
    'home_path', v_portal.home_path,
    'is_active', v_portal.is_active
  );
exception
  when unique_violation then
    raise exception 'tenant_builder_identity_conflict' using errcode = '23505';
end;
$function$;

revoke all on function public.vm_admin_create_full_site_tenant(jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.vm_admin_create_full_site_tenant(jsonb, jsonb)
to authenticated;

comment on function public.vm_admin_create_full_site_tenant(jsonb, jsonb) is
  'Creates one inactive full-site tenant and its teacher/student presentation rules atomically. It never changes accounts or memberships.';
