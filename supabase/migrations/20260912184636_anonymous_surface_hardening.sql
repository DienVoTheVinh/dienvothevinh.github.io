begin;
set local lock_timeout = '5s';

-- Browsers have no legitimate TRUNCATE/DDL path. RLS does not cover TRUNCATE.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon;
revoke truncate, references, trigger
  on all tables in schema public from authenticated;
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- A visitor needs presentation settings, never meeting links or future private keys.
drop policy if exists settings_read on public.app_settings;
alter policy settings_write on public.app_settings to authenticated;
create policy settings_public_presentation on public.app_settings
  for select to anon
  using (key in ('festival_config','theme_accent','theme_blur','theme_canvas_opacity',
    'theme_dark_start','theme_light_start','theme_mode','theme_theme','theme_transparency'));
create policy settings_signed_in_read on public.app_settings
  for select to authenticated using (true);

-- Stop anonymous telemetry writes and identity spoofing. Existing telemetry is
-- preserved; only signed-in sessions are collected going forward.
revoke all on public.analytics_sessions, public.analytics_page_views from anon;
revoke delete on public.analytics_sessions, public.analytics_page_views from authenticated;
alter table public.analytics_sessions enable row level security;
alter table public.analytics_page_views enable row level security;
drop policy if exists allow_insert_sessions on public.analytics_sessions;
drop policy if exists allow_select_admin_sessions on public.analytics_sessions;
drop policy if exists allow_update_sessions on public.analytics_sessions;
drop policy if exists allow_insert_views on public.analytics_page_views;
drop policy if exists allow_select_admin_views on public.analytics_page_views;

create policy analytics_session_read on public.analytics_sessions for select to authenticated
using (profile_id = (select auth.uid()) or (select public.is_teacher()) or exists (
  select 1 from public.profiles child
  where child.id = analytics_sessions.profile_id and child.parent_id = (select auth.uid())
));
create policy analytics_session_insert on public.analytics_sessions for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and device_type in ('Desktop','Tablet','Mobile')
  and length(session_key) between 16 and 160
  and length(os) between 1 and 80 and length(browser) between 1 and 80
  and length(user_agent) <= 2048 and duration_seconds between 0 and 2678400
);
create policy analytics_session_update on public.analytics_sessions for update to authenticated
using (profile_id = (select auth.uid()))
with check (
  profile_id = (select auth.uid())
  and device_type in ('Desktop','Tablet','Mobile')
  and length(session_key) between 16 and 160
  and length(os) between 1 and 80 and length(browser) between 1 and 80
  and length(user_agent) <= 2048 and duration_seconds between 0 and 2678400
);
create policy analytics_view_insert on public.analytics_page_views for insert to authenticated
with check (
  length(page_path) between 1 and 512 and coalesce(length(referrer),0) <= 2048
  and exists (select 1 from public.analytics_sessions s
    where s.id = analytics_page_views.session_id and s.profile_id = (select auth.uid()))
);
create policy analytics_view_read on public.analytics_page_views for select to authenticated
using ((select public.is_teacher()) or exists (
  select 1 from public.analytics_sessions s
  where s.id = analytics_page_views.session_id and s.profile_id = (select auth.uid())
));

commit;
