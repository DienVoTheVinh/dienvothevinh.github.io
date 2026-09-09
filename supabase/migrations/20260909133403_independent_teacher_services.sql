-- Classroom billing is independent of VMTools and of the teacher's identity.
-- Records are administrative only until a separate rollout enables enforcement.
create table public.teacher_service_accounts (
 user_id uuid primary key references auth.users(id),
 status text not null default 'pending' check(status in ('pending','active','blocked')),
 plan text not null default 'custom' check(plan in ('monthly','yearly','custom','lifetime')),
 expires_at timestamptz, updated_at timestamptz not null default now()
);
create table public.teacher_service_payments (
 id uuid primary key, user_id uuid not null references auth.users(id),
 actor uuid not null references auth.users(id), plan text not null,
 amount numeric not null check(amount>=0), note text not null,
 expires_at timestamptz, created_at timestamptz not null default now()
);
alter table public.teacher_service_accounts enable row level security;
alter table public.teacher_service_payments enable row level security;
revoke all on public.teacher_service_accounts,public.teacher_service_payments from anon,authenticated;
grant all on public.teacher_service_accounts,public.teacher_service_payments to service_role;
create index teacher_service_payments_user on public.teacher_service_payments(user_id,created_at desc);
create index teacher_service_payments_actor on public.teacher_service_payments(actor);
create function public.teacher_service_renew(p_actor uuid,p_user uuid,p_request uuid,p_plan text,p_units integer,p_until timestamptz,p_amount numeric,p_note text)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare a public.teacher_service_accounts; prior public.teacher_service_payments; deadline timestamptz;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'Không có quyền quản trị'; end if;
 if not exists(select 1 from public.profiles where id=p_user and role='teacher') then raise exception 'Không tìm thấy giáo viên'; end if;
 insert into public.teacher_service_accounts(user_id) values(p_user) on conflict do nothing;
 select * into a from public.teacher_service_accounts where user_id=p_user for update;
 select * into prior from public.teacher_service_payments where id=p_request;
 if found then if prior.user_id<>p_user then raise exception 'Mã xác nhận đã dùng'; end if; return prior.expires_at; end if;
 if p_amount is null or p_amount<0 or p_units is null or p_units not between 1 and 120 or p_note is null or length(p_note)>500 then raise exception 'Thông tin xác nhận không hợp lệ'; end if;
 if p_plan='lifetime' then deadline=null;
 elsif p_plan='custom' then deadline=p_until; if deadline is null or deadline<=now() then raise exception 'Hạn dùng phải ở tương lai'; end if;
 elsif p_plan in ('monthly','yearly') then deadline=((greatest(now(),coalesce(a.expires_at,now())) at time zone 'Asia/Ho_Chi_Minh')+make_interval(months=>p_units*case when p_plan='yearly' then 12 else 1 end)) at time zone 'Asia/Ho_Chi_Minh';
 else raise exception 'Gói không hợp lệ'; end if;
 update public.teacher_service_accounts set status='active',plan=p_plan,expires_at=deadline,updated_at=now() where user_id=p_user;
 insert into public.teacher_service_payments(id,user_id,actor,plan,amount,note,expires_at) values(p_request,p_user,p_actor,p_plan,p_amount,p_note,deadline);
 return deadline;
end$$;
revoke all on function public.teacher_service_renew(uuid,uuid,uuid,text,integer,timestamptz,numeric,text) from public,anon,authenticated;
grant execute on function public.teacher_service_renew(uuid,uuid,uuid,text,integer,timestamptz,numeric,text) to service_role;
