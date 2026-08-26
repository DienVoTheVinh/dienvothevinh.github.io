-- Sparse, plain-text presentation overrides for reusable full-site tenants.
-- Layout, routes and feature implementations stay in the shared VinhMath code;
-- an empty key therefore inherits every future central wording improvement.

create or replace function public.vm_tenant_landing_copy_is_valid(p_copy jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select p_copy is not null
    and jsonb_typeof(p_copy) = 'object'
    and pg_column_size(p_copy) <= 8192
    and not exists (
      select 1
      from jsonb_each(p_copy) entry
      where entry.key not in (
        'kicker', 'badge_title', 'badge_text', 'secondary_cta_label',
        'highlights_title', 'highlights_intro',
        'highlight_1_title', 'highlight_1_body',
        'highlight_2_title', 'highlight_2_body',
        'highlight_3_title', 'highlight_3_body',
        'cta_title', 'cta_guest_text', 'footer_brand', 'footer_text'
      )
        or jsonb_typeof(entry.value) <> 'string'
        or char_length(btrim(entry.value #>> '{}')) > case entry.key
          when 'kicker' then 100
          when 'badge_title' then 100
          when 'badge_text' then 240
          when 'secondary_cta_label' then 60
          when 'highlights_title' then 180
          when 'highlights_intro' then 320
          when 'highlight_1_title' then 120
          when 'highlight_1_body' then 320
          when 'highlight_2_title' then 120
          when 'highlight_2_body' then 320
          when 'highlight_3_title' then 120
          when 'highlight_3_body' then 320
          when 'cta_title' then 160
          when 'cta_guest_text' then 280
          when 'footer_brand' then 120
          when 'footer_text' then 240
          else 0
        end
    );
$function$;

revoke all on function public.vm_tenant_landing_copy_is_valid(jsonb)
from public, anon;
grant execute on function public.vm_tenant_landing_copy_is_valid(jsonb)
to authenticated, service_role;

alter table public.exam_portals
  add column if not exists landing_copy jsonb not null default '{}'::jsonb;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.exam_portals'::regclass
      and conname = 'exam_portals_landing_copy_valid'
  ) then
    alter table public.exam_portals
      add constraint exam_portals_landing_copy_valid
      check (public.vm_tenant_landing_copy_is_valid(landing_copy));
  end if;
end;
$do$;

-- Preserve the historic /uyenmath entry as a redirect, while every active
-- navigation path now renders the same generic shell as future tenants.
update public.exam_portals
set home_path = 'khong-gian?tenant=uyenmath',
    updated_at = now()
where slug = 'uyenmath'
  and experience_mode = 'full_site';

-- Public callers receive only presentation data for an active tenant.
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
    'description', portal.description,
    'experience_mode', portal.experience_mode,
    'full_site', true,
    'login_suffix', portal.login_suffix,
    'teacher_login_suffix', portal.teacher_login_suffix,
    'home_path', portal.home_path,
    'home_title', portal.home_title,
    'home_subtitle', portal.home_subtitle,
    'home_image_path', portal.home_image_path,
    'landing_copy', portal.landing_copy,
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

revoke all on function public.vm_public_tenant_context(text)
from public, anon, authenticated;
grant execute on function public.vm_public_tenant_context(text)
to anon, authenticated;

-- Keep draft creation atomic while accepting the same sparse copy overlay.
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
  v_landing_copy jsonb := coalesce(p_config->'landing_copy', '{}'::jsonb);
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
     or (v_home_image_path is not null and char_length(v_home_image_path) > 512)
     or not public.vm_tenant_landing_copy_is_valid(v_landing_copy) then
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
    home_title, home_subtitle, home_image_path, landing_copy
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
    v_home_image_path,
    v_landing_copy
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

comment on column public.exam_portals.landing_copy is
  'Sparse plain-text overrides for the shared full-site landing. Missing keys inherit VinhMath defaults.';
comment on function public.vm_tenant_landing_copy_is_valid(jsonb) is
  'Allow-list and length validation for tenant landing copy. No HTML or arbitrary keys are accepted.';
