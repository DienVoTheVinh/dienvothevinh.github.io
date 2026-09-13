-- Contact-email verification preserves the existing Auth identity/password.
-- Only hashes are stored; raw proof tokens leave the server only in email.
create table public.vm_teacher_email_requests (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),
 email text not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 status text not null check(status in ('sending','sent','failed','cancelled','confirmed')),
 expires_at timestamptz not null,
 updated_at timestamptz not null default now(),
 window_start timestamptz not null default now(),
 attempts integer not null default 1,
 confirmed_at timestamptz
);
alter table public.vm_teacher_email_requests enable row level security;
revoke all on public.vm_teacher_email_requests from public,anon,authenticated;
grant select,insert,update,delete on public.vm_teacher_email_requests to service_role;

create function public.vm_teacher_email_request(p_actor uuid,p_user uuid,p_email text,p_hash text)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare prior public.vm_teacher_email_requests; deadline timestamptz:=now()+interval '30 minutes';
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') or not exists(select 1 from public.vmtools_accounts where auth_user_id=p_actor and role='owner' and status='active') then raise exception 'Chỉ chủ sở hữu được liên kết';end if;
 perform 1 from public.profiles where id=p_user and role='teacher' for update;
 if not found then raise exception 'Không tìm thấy giáo viên';end if;
 if p_email is null or length(p_email)>254 or p_email<>lower(btrim(p_email)) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_email like '%.vinhmath.com' then raise exception 'Nhập email thật của giáo viên';end if;
 if exists(select 1 from public.vmtools_accounts where auth_user_id=p_user) then raise exception 'Tài khoản đã liên kết';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_email,719));
 if exists(select 1 from public.profiles where lower(email)=p_email and id<>p_user) or exists(select 1 from public.vmtools_accounts where lower(email)=p_email) then raise exception 'Email đã thuộc tài khoản khác';end if;
 if exists(select 1 from public.vm_teacher_email_requests where email=p_email and user_id<>p_user and status in ('sending','sent') and expires_at>now()) then raise exception 'Email đang chờ xác nhận cho tài khoản khác';end if;
 select * into prior from public.vm_teacher_email_requests where user_id=p_user for update;
 if found and prior.updated_at>now()-interval '60 seconds' then raise exception 'Vui lòng chờ một phút trước khi gửi lại';end if;
 if prior.window_start>now()-interval '1 hour' and prior.attempts>=5 then raise exception 'Đã gửi nhiều lần. Vui lòng thử lại sau một giờ';end if;
 insert into public.vm_teacher_email_requests(user_id,actor_id,email,token_hash,status,expires_at)
 values(p_user,p_actor,p_email,p_hash,'sending',deadline)
 on conflict(user_id) do update set actor_id=excluded.actor_id,email=excluded.email,token_hash=excluded.token_hash,status='sending',expires_at=deadline,updated_at=now(),confirmed_at=null,
 attempts=case when vm_teacher_email_requests.window_start>now()-interval '1 hour' then vm_teacher_email_requests.attempts+1 else 1 end,
 window_start=case when vm_teacher_email_requests.window_start>now()-interval '1 hour' then vm_teacher_email_requests.window_start else now() end;
 return deadline;
end$$;

create function public.vm_teacher_email_confirm(p_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare request public.vm_teacher_email_requests; teacher_name text; account_id uuid; owner_id uuid; target_id uuid;
begin
 -- Match the request path's lock order: teacher, email, request.
 select user_id into target_id from public.vm_teacher_email_requests where token_hash=p_hash;
 if not found then raise exception 'Liên kết không hợp lệ hoặc đã hết hạn';end if;
 select full_name into teacher_name from public.profiles where id=target_id and role='teacher' for update;
 if not found then raise exception 'Không tìm thấy giáo viên';end if;
 select * into request from public.vm_teacher_email_requests where user_id=target_id and token_hash=p_hash;
 if not found then raise exception 'Liên kết không hợp lệ hoặc đã hết hạn';end if;
 perform pg_advisory_xact_lock(hashtextextended(request.email,719));
 select * into request from public.vm_teacher_email_requests where user_id=target_id and token_hash=p_hash for update;
 if not found or request.status not in ('sent','confirmed') or request.expires_at<=now() then raise exception 'Liên kết không hợp lệ hoặc đã hết hạn';end if;
 select a.id into owner_id from public.vmtools_accounts a join public.profiles p on p.id=a.auth_user_id where a.auth_user_id=request.actor_id and a.role='owner' and a.status='active' and p.role='admin';
 if not found then raise exception 'Yêu cầu không còn được chủ sở hữu cho phép';end if;
 select id into account_id from public.vmtools_accounts where auth_user_id=request.user_id and email=request.email;
 if request.status='confirmed' and account_id is not null then return account_id;end if;
 if exists(select 1 from public.profiles where lower(email)=request.email and id<>request.user_id) or exists(select 1 from public.vmtools_accounts where lower(email)=request.email or auth_user_id=request.user_id) then raise exception 'Email hoặc tài khoản đã được liên kết. Vui lòng liên hệ quản trị';end if;
 insert into public.vmtools_accounts(auth_user_id,email,name,web_enabled,app_enabled,download_enabled)
 values(request.user_id,request.email,coalesce(teacher_name,''),false,true,true) returning id into account_id;
 update public.profiles set email=request.email where id=request.user_id;
 update public.vm_teacher_email_requests set status='confirmed',confirmed_at=now(),updated_at=now() where user_id=request.user_id;
 insert into public.vmtools_audit(actor,account_id,action,details) values(owner_id,account_id,'teacher-email-confirmed',jsonb_build_object('userId',request.user_id));
 return account_id;
end$$;

-- Retire the unverified path instead of granting access to auth.users.
create or replace function public.vm_teacher_link_email(p_actor uuid,p_user uuid,p_email text) returns uuid
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Email cần được người nhận xác nhận trước khi liên kết';end$$;
revoke all on function public.vm_teacher_link_email(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.vm_teacher_email_request(uuid,uuid,text,text),public.vm_teacher_email_confirm(text) from public,anon,authenticated;
grant execute on function public.vm_teacher_email_request(uuid,uuid,text,text),public.vm_teacher_email_confirm(text) to service_role;
