-- VMTools only: no existing VinhMath table or Auth policy is modified.
create table if not exists public.vmtools_accounts (
 id uuid primary key default gen_random_uuid(), auth_user_id uuid unique references auth.users(id), email text not null unique,
 name text not null default '', role text not null default 'user' check(role in ('owner','user')),
 status text not null default 'pending' check(status in ('pending','active','blocked')),
 plan text not null default 'monthly' check(plan in ('monthly','yearly','custom','lifetime','owner')),
 paid_until timestamptz, offline_days integer check(offline_days between 1 and 365), max_devices integer not null default 1 check(max_devices between 1 and 100),
 features text[] not null default array['ink','pdf','geometry2d','geometry3d','graphs','calculator','export'], revision bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(features <@ array['ink','pdf','geometry2d','geometry3d','graphs','calculator','export']::text[]),
 check((role='owner')=(plan='owner'))
);
create table if not exists public.vmtools_devices (
 key_hash text primary key, public_key text not null, account_id uuid not null references public.vmtools_accounts(id),
 name text not null, platform text not null check(platform in ('win32','darwin')), status text not null default 'pending' check(status in ('pending','active','blocked')), last_seen timestamptz, created_at timestamptz not null default now()
);
create index if not exists vmtools_devices_account on public.vmtools_devices(account_id);
create table if not exists public.vmtools_config(id integer primary key check(id=1),offline_days integer not null default 2 check(offline_days between 1 and 365));
insert into public.vmtools_config(id) values(1) on conflict do nothing;
create table if not exists public.vmtools_audit(id bigint generated always as identity primary key,actor uuid references public.vmtools_accounts(id),account_id uuid references public.vmtools_accounts(id),action text not null,details jsonb not null default '{}',at timestamptz not null default now());
create table if not exists public.vmtools_payments(id uuid primary key,account_id uuid not null references public.vmtools_accounts(id),actor uuid not null references public.vmtools_accounts(id),amount numeric not null check(amount>=0),note text not null,paid_until timestamptz,created_at timestamptz not null default now());
create table if not exists public.vmtools_challenges(id uuid primary key default gen_random_uuid(),key_hash text not null,expires_at timestamptz not null default(now()+interval '90 seconds'),created_at timestamptz not null default now());
create index if not exists vmtools_challenge_key on public.vmtools_challenges(key_hash,created_at);
create table if not exists public.vmtools_server_keys(id integer primary key check(id=1),private_jwk jsonb not null,public_pem text not null);
do $$declare t text;begin foreach t in array array['vmtools_accounts','vmtools_devices','vmtools_config','vmtools_audit','vmtools_payments','vmtools_challenges','vmtools_server_keys'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end$$;
grant usage,select on sequence public.vmtools_audit_id_seq to service_role;

create or replace function public.vmtools_challenge(p_key text) returns uuid language plpgsql security invoker set search_path='' as $$declare n uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(p_key,0));
 delete from public.vmtools_challenges where expires_at<now()-interval '5 minutes';
 if (select count(*) from public.vmtools_challenges where key_hash=p_key and created_at>now()-interval '1 minute')>=30 then raise exception 'Thử lại sau một phút';end if;
 insert into public.vmtools_challenges(key_hash) values(p_key) returning id into n;return n;end$$;
create or replace function public.vmtools_consume_challenge(p_id uuid,p_key text) returns boolean language plpgsql security invoker set search_path='' as $$declare n uuid;begin
 delete from public.vmtools_challenges where id=p_id and key_hash=p_key and expires_at>now() returning id into n;return n is not null;end$$;
create or replace function public.vmtools_device_status(p_actor uuid,p_key text,p_status text) returns void language plpgsql security invoker set search_path='' as $$declare a public.vmtools_accounts; d public.vmtools_devices;begin
 if not exists(select 1 from public.vmtools_accounts where id=p_actor and role='owner' and status='active') then raise exception 'Không có quyền quản trị';end if;
 select * into d from public.vmtools_devices where key_hash=p_key;if not found then raise exception 'Không tìm thấy thiết bị';end if;select * into a from public.vmtools_accounts where id=d.account_id for update;
 if a.role='owner' and d.platform<>'web' then raise exception 'Không sửa thiết bị quản trị gốc tại đây';end if;
 if p_status not in ('active','blocked','pending') then raise exception 'Trạng thái không hợp lệ';end if;
 if p_status='active' and d.status<>'active' and (select count(*) from public.vmtools_devices where account_id=a.id and status='active')>=a.max_devices then raise exception 'Đã đủ số thiết bị được cấp';end if;
 update public.vmtools_devices set status=p_status where key_hash=p_key;
 update public.vmtools_accounts set revision=revision+1,updated_at=now() where id=a.id;
 insert into public.vmtools_audit(actor,account_id,action,details) values(p_actor,a.id,'device',jsonb_build_object('key',p_key,'status',p_status));end$$;
create or replace function public.vmtools_renew(p_actor uuid,p_account uuid,p_request uuid,p_plan text,p_units integer,p_until timestamptz,p_amount numeric,p_note text) returns timestamptz language plpgsql security invoker set search_path='' as $$declare a public.vmtools_accounts; deadline timestamptz; prior public.vmtools_payments;begin
 if not exists(select 1 from public.vmtools_accounts where id=p_actor and role='owner' and status='active') then raise exception 'Không có quyền quản trị';end if;
 select * into a from public.vmtools_accounts where id=p_account for update;
 if not found or a.role='owner' then raise exception 'Tài khoản không hợp lệ';end if;
 select * into prior from public.vmtools_payments where id=p_request;
 if found then if prior.account_id<>p_account then raise exception 'Mã thanh toán đã dùng';end if;return prior.paid_until;end if;
 if p_amount<0 or length(p_note)>500 or p_units not between 1 and 120 then raise exception 'Thông tin thanh toán không hợp lệ';end if;
 if p_plan='lifetime' then deadline=null;
 elsif p_plan='custom' then deadline=p_until;if deadline is null or deadline<=now() then raise exception 'Ngày hết hạn phải ở tương lai';end if;
 elsif p_plan in ('monthly','yearly') then deadline=((greatest(now(),coalesce(a.paid_until,now())) at time zone 'Asia/Ho_Chi_Minh')+make_interval(months=>p_units*case when p_plan='yearly' then 12 else 1 end)) at time zone 'Asia/Ho_Chi_Minh';
 else raise exception 'Gói không hợp lệ';end if;
 update public.vmtools_accounts set plan=p_plan,paid_until=deadline,status='active',revision=revision+1,updated_at=now() where id=p_account;
 insert into public.vmtools_payments(id,account_id,actor,amount,note,paid_until) values(p_request,p_account,p_actor,p_amount,p_note,deadline);
 insert into public.vmtools_audit(actor,account_id,action,details) values(p_actor,p_account,'payment-confirmed',jsonb_build_object('request',p_request,'plan',p_plan,'until',deadline,'amount',p_amount));return deadline;end$$;
revoke all on function public.vmtools_challenge(text),public.vmtools_consume_challenge(uuid,text),public.vmtools_device_status(uuid,text,text),public.vmtools_renew(uuid,uuid,uuid,text,integer,timestamptz,numeric,text) from public,anon,authenticated;
grant execute on function public.vmtools_challenge(text),public.vmtools_consume_challenge(uuid,text),public.vmtools_device_status(uuid,text,text),public.vmtools_renew(uuid,uuid,uuid,text,integer,timestamptz,numeric,text) to service_role;

alter table public.vmtools_accounts add column if not exists web_enabled boolean not null default false;
alter table public.vmtools_devices drop constraint if exists vmtools_devices_platform_check;
alter table public.vmtools_devices add constraint vmtools_devices_platform_check check(platform in ('win32','darwin','web'));
alter table public.vmtools_challenges add column if not exists consumed boolean not null default false;
create or replace function public.vmtools_consume_challenge(p_id uuid,p_key text) returns boolean language plpgsql security invoker set search_path='' as $$declare n uuid;begin
 update public.vmtools_challenges set consumed=true where id=p_id and key_hash=p_key and expires_at>now() and not consumed returning id into n;return n is not null;end$$;
create or replace function public.vmtools_auth_id(p_email text) returns uuid language sql stable security invoker set search_path='' as $$select id from auth.users where lower(email)=lower(p_email) limit 1$$;
create or replace function public.vmtools_auth_session(p_user uuid,p_session uuid) returns boolean language sql stable security invoker set search_path='' as $$select exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now()))$$;
create or replace function public.vmtools_account_save(p_actor uuid,p_id uuid,p_name text,p_status text,p_days integer,p_devices integer,p_features text[],p_web boolean) returns void language plpgsql security invoker set search_path='' as $$declare a public.vmtools_accounts;begin
 if not exists(select 1 from public.vmtools_accounts where id=p_actor and role='owner' and status='active') then raise exception 'Không có quyền quản trị';end if;
 select * into a from public.vmtools_accounts where id=p_id for update;
 if not found or a.role='owner' then raise exception 'Không sửa quyền chủ sở hữu tại đây';end if;
 if length(p_name)>160 or p_devices<(select count(*) from public.vmtools_devices where account_id=p_id and status='active') then raise exception 'Hãy khóa thiết bị thừa trước khi giảm giới hạn';end if;
 update public.vmtools_accounts set name=p_name,status=p_status,offline_days=p_days,max_devices=p_devices,features=p_features,web_enabled=p_web,revision=revision+1,updated_at=now() where id=p_id;
 insert into public.vmtools_audit(actor,account_id,action,details) values(p_actor,p_id,'account-updated',jsonb_build_object('status',p_status,'offlineDays',p_days,'maxDevices',p_devices,'features',p_features,'web',p_web));end$$;
create or replace function public.vmtools_register(p_account uuid,p_key text,p_public text,p_name text,p_platform text) returns void language plpgsql security invoker set search_path='' as $$declare a public.vmtools_accounts;begin
 select * into a from public.vmtools_accounts where id=p_account for update;
 if not found then raise exception 'Chưa được cấp tài khoản';end if;
 if exists(select 1 from public.vmtools_devices where key_hash=p_key and account_id<>p_account) then raise exception 'Thiết bị đã liên kết tài khoản khác';end if;
 if (select count(*) from public.vmtools_devices where account_id=p_account)>=100 and not exists(select 1 from public.vmtools_devices where key_hash=p_key) then raise exception 'Đã đủ thiết bị đăng ký';end if;
 insert into public.vmtools_devices(key_hash,public_key,account_id,name,platform) values(p_key,p_public,p_account,left(p_name,100),p_platform) on conflict(key_hash) do nothing;
end$$;
revoke all on function public.vmtools_auth_id(text),public.vmtools_auth_session(uuid,uuid),public.vmtools_account_save(uuid,uuid,text,text,integer,integer,text[],boolean),public.vmtools_register(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.vmtools_auth_id(text),public.vmtools_auth_session(uuid,uuid),public.vmtools_account_save(uuid,uuid,text,text,integer,integer,text[],boolean),public.vmtools_register(uuid,text,text,text,text) to service_role;

create table if not exists public.vmtools_releases(
 version text primary key check(version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
 title text not null check(length(title) between 1 and 100),notes text not null default '' check(length(notes)<=4000),
 windows_url text not null check(windows_url like 'https://%'),macos_url text not null check(macos_url like 'https://%'),
 published boolean not null default false,published_at timestamptz not null default now(),actor uuid not null references public.vmtools_accounts(id)
);
alter table public.vmtools_releases enable row level security;
revoke all on public.vmtools_releases from anon,authenticated;
grant all on public.vmtools_releases to service_role;

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
 perform public.vmtools_renew(p_actor,account_id,gen_random_uuid(),p_plan,p_units,p_until,p_amount,'Cấp tài khoản giáo viên');
 return account_id;
end$$;
revoke all on function public.vmtools_provision(uuid,uuid,text,text,boolean,text,integer,timestamptz,numeric) from public,anon,authenticated;
grant execute on function public.vmtools_provision(uuid,uuid,text,text,boolean,text,integer,timestamptz,numeric) to service_role;
create index if not exists vmtools_audit_actor on public.vmtools_audit(actor);
create index if not exists vmtools_audit_account on public.vmtools_audit(account_id,at desc);
create index if not exists vmtools_payments_account on public.vmtools_payments(account_id);
create index if not exists vmtools_payments_actor on public.vmtools_payments(actor);
create index if not exists vmtools_releases_actor on public.vmtools_releases(actor);
