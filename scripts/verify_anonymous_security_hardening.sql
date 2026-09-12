-- Run inside a transaction and ROLLBACK. Synthetic analytics only; no real
-- passwords, sessions, lessons or accounts are changed. Never run TRUNCATE.
do $audit$
declare
  actor uuid;
  other_actor uuid;
  administrator uuid;
  session_id uuid := gen_random_uuid();
  other_session_id uuid := gen_random_uuid();
  affected integer;
  rejected boolean;
begin
  select id into actor from public.profiles where role='student' order by id limit 1;
  select id into other_actor from public.profiles where role='student' and id<>actor order by id limit 1;
  select id into administrator from public.profiles where role='admin' order by id limit 1;
  if actor is null or other_actor is null or administrator is null then
    raise exception 'Audit needs two existing students and an administrator; it creates no users';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and (
      has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('authenticated',c.oid,'TRUNCATE')
    )
  ) then raise exception 'Client table privileges are still excessive'; end if;

  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  rejected := false;
  begin
    insert into public.analytics_sessions(session_key,device_type,os,browser,user_agent)
      values ('vm-audit-anon-'||session_id,'Desktop','Audit','Audit','Audit');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Anonymous telemetry insert unexpectedly succeeded'; end if;
  if exists(select 1 from public.app_settings where key='meet_link') then
    raise exception 'Anonymous visitor can still read meeting setting';
  end if;
  if not exists(select 1 from public.app_settings where key='theme_mode') then
    raise exception 'Public theme regression';
  end if;
  execute 'reset role';

  insert into public.analytics_sessions(id,profile_id,session_key,device_type,os,browser,user_agent)
    values (other_session_id,other_actor,'vm-audit-other-'||other_session_id,'Desktop','Audit','Audit','Audit');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  if public.is_admin() then raise exception 'User metadata incorrectly granted admin'; end if;
  insert into public.analytics_sessions(id,profile_id,session_key,device_type,os,browser,user_agent)
    values (session_id,actor,'vm-audit-self-'||session_id,'Desktop','Audit','Audit','Audit');
  update public.analytics_sessions set duration_seconds=15 where id=session_id;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'Own heartbeat regression'; end if;
  insert into public.analytics_page_views(session_id,page_path) values (session_id,'security-audit');

  update public.analytics_sessions set duration_seconds=16 where id=other_session_id;
  get diagnostics affected = row_count;
  if affected<>0 then raise exception 'Cross-account telemetry update succeeded'; end if;
  if exists(select 1 from public.analytics_sessions where id=other_session_id) then
    raise exception 'Student can read another student telemetry';
  end if;
  rejected := false;
  begin
    update public.analytics_sessions set profile_id=other_actor where id=session_id;
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Session identity reassignment succeeded'; end if;
  rejected := false;
  begin
    insert into public.analytics_sessions(profile_id,session_key,device_type,os,browser,user_agent)
      values (other_actor,'vm-audit-spoof-'||session_id,'Desktop','Audit','Audit','Audit');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Spoofed telemetry insert succeeded'; end if;
  rejected := false;
  begin
    update public.analytics_sessions set device_type='<b>security-canary</b>' where id=session_id;
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Untrusted device markup accepted'; end if;
  rejected := false;
  begin
    insert into public.analytics_page_views(session_id,page_path) values (other_session_id,'security-audit');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Cross-account page view insert succeeded'; end if;
  rejected := false;
  begin
    update public.profiles set role='admin' where id=actor;
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Self promotion succeeded'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',administrator::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if not public.is_admin() then raise exception 'Admin role regression'; end if;
  if (select count(*) from public.analytics_sessions where id in (session_id,other_session_id))<>2 then
    raise exception 'Admin telemetry read regression';
  end if;
  if not exists(select 1 from public.app_settings where key='meet_link') then
    raise exception 'Signed-in settings regression';
  end if;
  execute 'reset role';
end;
$audit$;
select 'PASS anonymous denial, ownership, markup, role escalation, admin reads, public theme' as security_audit;
