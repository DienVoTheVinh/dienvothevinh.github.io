-- The Data API service role cannot SELECT auth tables directly. These two
-- narrowly scoped lookups execute as the function owner; no client can call them.
alter function public.vmtools_auth_id(text) security definer;
alter function public.vmtools_auth_session(uuid,uuid) security definer;
revoke all on function public.vmtools_auth_id(text),public.vmtools_auth_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vmtools_auth_id(text),public.vmtools_auth_session(uuid,uuid) to service_role;

-- Account creation and its first grant are one transaction. Auth creation is
-- performed by the Edge function; it rolls back only the newly created user.
create or replace function public.vmtools_provision(
 p_actor uuid,p_user uuid,p_email text,p_name text,p_web boolean,
 p_plan text,p_units integer,p_until timestamptz,p_amount numeric
) returns uuid language plpgsql security invoker set search_path='' as $$
declare account_id uuid;
begin
 if not exists(select 1 from public.vmtools_accounts where id=p_actor and role='owner' and status='active') then raise exception 'Không có quyền quản trị'; end if;
 if not exists(select 1 from public.profiles where id=p_user and role in ('teacher','admin')) then raise exception 'Cần hồ sơ giáo viên VinhMath'; end if;
 insert into public.vmtools_accounts(auth_user_id,email,name,web_enabled) values(p_user,lower(p_email),p_name,p_web) returning id into account_id;
 if p_plan<>'pending' then perform public.vmtools_renew(p_actor,account_id,gen_random_uuid(),p_plan,p_units,p_until,p_amount,'Cấp tài khoản giáo viên'); end if;
 return account_id;
end$$;
revoke all on function public.vmtools_provision(uuid,uuid,text,text,boolean,text,integer,timestamptz,numeric) from public,anon,authenticated;
grant execute on function public.vmtools_provision(uuid,uuid,text,text,boolean,text,integer,timestamptz,numeric) to service_role;
create index if not exists vmtools_audit_actor on public.vmtools_audit(actor);
create index if not exists vmtools_audit_account on public.vmtools_audit(account_id,at desc);
create index if not exists vmtools_payments_account on public.vmtools_payments(account_id);
create index if not exists vmtools_payments_actor on public.vmtools_payments(actor);
create index if not exists vmtools_releases_actor on public.vmtools_releases(actor);
