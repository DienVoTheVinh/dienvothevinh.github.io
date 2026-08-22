-- A checked-in demo brand and isolated portal for validating suffix-based
-- white-label routing. Accounts are created separately through the authenticated
-- tao-tai-khoan Edge Function; migrations must never contain credentials.

insert into public.brand_templates (
  slug, name, short_name, tagline, logo_path, preset,
  primary_color, secondary_color, accent_color, accent_soft_color,
  surface_color, text_color, topbar_color, topbar_text_color,
  logo_scale, logo_x, logo_y, radius_px, is_active
)
values (
  'toan-thay-truong',
  'Toán Thầy Trường',
  'TOÁN THẦY TRƯỜNG',
  'Vững nền tảng, sáng tư duy',
  'site:logo/toan-thay-truong-logo.svg',
  'vinhmath',
  '#172554',
  '#0F766E',
  '#F59E0B',
  '#FFF4D6',
  '#FFFFFF',
  '#172033',
  '#F7FAFF',
  '#172554',
  100,
  50,
  50,
  16,
  true
)
on conflict (slug) do nothing;

insert into public.exam_portals (
  slug, name, short_name, description, brand_id, support_text,
  login_suffix, teacher_login_suffix, is_active
)
select
  'toan-thay-truong',
  'Khu học tập Toán Thầy Trường',
  'Toán Thầy Trường',
  'Khu vực học tập và thi thử riêng dành cho học sinh của Thầy Trường.',
  brand.id,
  'Liên hệ Thầy Trường khi cần hỗ trợ.',
  'hstt',
  'gvtt',
  true
from public.brand_templates brand
where brand.slug = 'toan-thay-truong'
on conflict (slug) do nothing;

-- Avoid ambiguous routing: the login screen and global menu intentionally load
-- a single private portal. Existing VinhMath accounts can still join multiple
-- portals with portal_only=false.
create unique index if not exists exam_portal_members_one_private_portal_per_user_idx
  on public.exam_portal_members (user_id)
  where portal_only;

-- Pin the four functions reported by the database advisor to a trusted schema
-- search path. `public, pg_temp` preserves their existing unqualified objects
-- while preventing caller-controlled schemas from taking precedence.
alter function public.thong_ke_truy_cap(timestamptz)
  set search_path = public, pg_temp;
alter function public.phan_tich_truy_cap(timestamptz, timestamptz)
  set search_path = public, pg_temp;
alter function public.delete_user_by_admin(uuid)
  set search_path = public, pg_temp;
alter function public.get_leaderboard(uuid)
  set search_path = public, pg_temp;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that
-- default from SECURITY DEFINER functions that are not required by public RLS.
-- Authenticated RPCs retain explicit access; trigger functions need no direct
-- client EXECUTE privilege. The seven allow-listed helpers are referenced by
-- legacy policies that still apply to the public role and are left unchanged.
do $migration$
declare
  fn record;
  signature text;
begin
  for fn in
    select
      proc.oid,
      proc.proname,
      proc.prorettype = 'pg_catalog.trigger'::regtype as is_trigger,
      pg_get_function_identity_arguments(proc.oid) as identity_args
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.prosecdef
      and proc.proname not in (
        'can_manage_class', 'can_see_class', 'is_admin', 'is_staff',
        'is_teacher', 'my_class', 'video_mode'
      )
  loop
    signature := format('public.%I(%s)', fn.proname, fn.identity_args);
    execute 'revoke all on function ' || signature || ' from public, anon, authenticated';
    if not fn.is_trigger then
      execute 'grant execute on function ' || signature || ' to authenticated';
    end if;
  end loop;
end
$migration$;
