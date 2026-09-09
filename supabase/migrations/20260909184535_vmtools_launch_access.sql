-- Explicit, independent classroom and VMTools service grants.
-- Preserve all existing teacher classroom access; new teachers start pending.
alter table public.vmtools_accounts add column app_enabled boolean not null default true;
alter table public.vmtools_accounts add column download_enabled boolean not null default true;
insert into public.teacher_service_accounts(user_id,status,plan)
select id,'active','lifetime' from public.profiles where role='teacher' on conflict do nothing;
alter table public.teacher_service_accounts drop constraint teacher_service_accounts_user_id_fkey;
alter table public.teacher_service_accounts add constraint teacher_service_accounts_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;

create function private.vm_classroom_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not exists (
  select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'
  and not exists(select 1 from public.teacher_service_accounts a where a.user_id=p.id and a.status='active' and (a.plan='lifetime' or a.expires_at>now()))
 );
$$;
revoke all on function private.vm_classroom_allowed() from public,anon;
grant execute on function private.vm_classroom_allowed() to authenticated,service_role;

create function private.vm_teacher_service_default() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role='teacher' then insert into public.teacher_service_accounts(user_id,status,plan) values(new.id,'pending','lifetime') on conflict do nothing;end if;
 return new;
end$$;
revoke all on function private.vm_teacher_service_default() from public,anon,authenticated;
create trigger vm_teacher_service_default after insert or update of role on public.profiles for each row execute function private.vm_teacher_service_default();

create function private.vm_require_classroom_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not private.vm_classroom_allowed() then
  raise exception 'Các tính năng trên lớp chưa được kích hoạt hoặc đã hết hạn. Vui lòng liên hệ thầy Vinh.' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
revoke all on function private.vm_require_classroom_write() from public,anon,authenticated;
-- Triggers also guard writes through SECURITY DEFINER RPCs; RLS guards direct reads.
do $$declare t text;begin
 foreach t in array array['classes','class_posts','lessons','exams','class_sessions','class_links','class_post_comments','class_post_reactions','schedules','class_students','session_remarks','documents','class_assistants','reminders','schedule_overrides','taught_sessions','teacher_report_insights','exam_portal_exams'] loop
  if to_regclass('public.'||t) is null then continue;end if;
  execute format('create policy vm_classroom_service on public.%I as restrictive for all to authenticated using ((select private.vm_classroom_allowed())) with check ((select private.vm_classroom_allowed()))',t);
  execute format('create trigger vm_classroom_service_write before insert or update or delete on public.%I for each row execute function private.vm_require_classroom_write()',t);
 end loop;
end$$;

create function public.vm_my_services() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('classroom',private.vm_classroom_allowed());
$$;
revoke all on function public.vm_my_services() from public,anon;
grant execute on function public.vm_my_services() to authenticated;

create function public.vm_teacher_services_provision(p_actor uuid,p_user uuid,p_email text,p_name text,p_classroom jsonb,p_vmtools jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare owner_id uuid;account_id uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'Chỉ quản trị được cấp dịch vụ';end if;
 if not exists(select 1 from public.profiles where id=p_user and role='teacher') then raise exception 'Không tìm thấy giáo viên';end if;
 if (p_vmtools->>'plan')<>'pending' then
  select id into owner_id from public.vmtools_accounts where auth_user_id=p_actor and role='owner' and status='active';
  if owner_id is null then raise exception 'Chưa có quyền cấp VMTools';end if;
 end if;
 if coalesce((p_classroom->>'enabled')::boolean,false) then
  perform public.teacher_service_renew(p_actor,p_user,gen_random_uuid(),p_classroom->>'plan',(p_classroom->>'units')::integer,(p_classroom->>'until')::timestamptz,(p_classroom->>'amount')::numeric,'Cấp tài khoản giáo viên');
 else insert into public.teacher_service_accounts(user_id,status,plan) values(p_user,'pending','lifetime') on conflict(user_id) do update set status='pending',updated_at=now();end if;
 insert into public.vmtools_accounts(auth_user_id,email,name,web_enabled,app_enabled,download_enabled,features)
 values(p_user,lower(p_email),p_name,coalesce((p_vmtools->>'webEnabled')::boolean,false),coalesce((p_vmtools->>'appEnabled')::boolean,true),coalesce((p_vmtools->>'downloadEnabled')::boolean,true),array(select jsonb_array_elements_text(p_vmtools->'features')))
 returning id into account_id;
 if p_vmtools->>'plan'<>'pending' then perform public.vmtools_renew(owner_id,account_id,gen_random_uuid(),p_vmtools->>'plan',(p_vmtools->>'units')::integer,(p_vmtools->>'until')::timestamptz,(p_vmtools->>'amount')::numeric,'Cấp tài khoản giáo viên');end if;
 return account_id;
end$$;
revoke all on function public.vm_teacher_services_provision(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.vm_teacher_services_provision(uuid,uuid,text,text,jsonb,jsonb) to service_role;

create table public.vmtools_release_files (
 id uuid primary key default gen_random_uuid(),
 version text not null references public.vmtools_releases(version),
 platform text not null check(platform in ('win32','darwin')),
 arch text not null check(arch in ('x64','arm64')),
 kind text not null check(kind in ('installer','update_manifest')),
 storage_path text not null unique,
 file_name text not null,
 size bigint not null check(size>0),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 notarized boolean not null default false,
 unique(version,platform,arch,kind)
);
alter table public.vmtools_release_files enable row level security;
revoke all on public.vmtools_release_files from anon,authenticated;
grant all on public.vmtools_release_files to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('vmtools-releases','vmtools-releases',false,2147483648);
-- Release binaries have no end-user SELECT policy. The Edge download action
-- checks current activation/expiry and issues a short-lived URL on demand.
create function public.vm_teacher_link_email(p_actor uuid,p_user uuid,p_email text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare account_id uuid;teacher_name text;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') or not exists(select 1 from public.vmtools_accounts where auth_user_id=p_actor and role='owner' and status='active') then raise exception 'Chỉ chủ sở hữu được liên kết';end if;
 select full_name into teacher_name from public.profiles where id=p_user and role='teacher' for update;
 if not found then raise exception 'Không tìm thấy giáo viên';end if;
 if exists(select 1 from auth.users where lower(email)=lower(p_email) and id<>p_user) or exists(select 1 from public.profiles where lower(email)=lower(p_email) and id<>p_user) then raise exception 'Email đã thuộc tài khoản khác';end if;
 insert into public.vmtools_accounts(auth_user_id,email,name,web_enabled,app_enabled,download_enabled)
 values(p_user,lower(p_email),coalesce(teacher_name,''),false,true,true) returning id into account_id;
 update public.profiles set email=lower(p_email) where id=p_user;
 return account_id;
end$$;
revoke all on function public.vm_teacher_link_email(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vm_teacher_link_email(uuid,uuid,text) to service_role;
