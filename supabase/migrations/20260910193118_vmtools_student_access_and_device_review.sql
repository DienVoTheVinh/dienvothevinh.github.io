-- Explicit VMTools grants do not change VinhMath roles or classroom permissions.
alter table public.vmtools_accounts add column auto_approve_devices boolean not null default true;

create or replace function public.vmtools_activate_device_if_allowed(p_key text)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.vmtools_accounts; d public.vmtools_devices;
begin
 select a0.* into a from public.vmtools_accounts a0 join public.vmtools_devices d0 on d0.account_id=a0.id where d0.key_hash=p_key for update of a0;
 if not found then return; end if;
 select * into d from public.vmtools_devices where key_hash=p_key for update;
 if d.status<>'pending' or a.status<>'active' or (a.role<>'owner' and a.plan<>'lifetime' and (a.paid_until is null or a.paid_until<=now())) then return; end if;
 if not exists(select 1 from public.profiles where id=a.auth_user_id and role in ('teacher','admin','student')) then return; end if;
 if (d.platform='web' and a.web_enabled) or
   (d.platform<>'web' and a.role<>'owner' and a.app_enabled and a.auto_approve_devices and
    (select count(*) from public.vmtools_devices where account_id=a.id and platform<>'web' and status='active')<a.max_devices) then
  update public.vmtools_devices set status='active' where key_hash=p_key;
  insert into public.vmtools_audit(account_id,action,details) values(a.id,'device-auto-approved',jsonb_build_object('platform',d.platform));
 end if;
end$$;
revoke all on function public.vmtools_activate_device_if_allowed(text) from public,anon,authenticated;
grant execute on function public.vmtools_activate_device_if_allowed(text) to service_role;

create or replace function public.vmtools_register(p_account uuid,p_key text,p_public text,p_name text,p_platform text)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.vmtools_accounts;
begin
 select * into a from public.vmtools_accounts where id=p_account for update;
 if not found or a.status='blocked' then raise exception 'Chưa được cấp tài khoản hoặc tài khoản đã khóa'; end if;
 if p_platform not in ('web','win32','darwin') then raise exception 'Nền tảng không hợp lệ'; end if;
 if exists(select 1 from public.vmtools_devices where key_hash=p_key and account_id<>p_account) then raise exception 'Thiết bị đã liên kết tài khoản khác'; end if;
 if (select count(*) from public.vmtools_devices where account_id=p_account)>=100 and not exists(select 1 from public.vmtools_devices where key_hash=p_key) then raise exception 'Đã đủ thiết bị đăng ký'; end if;
 insert into public.vmtools_devices(key_hash,public_key,account_id,name,platform) values(p_key,p_public,p_account,left(p_name,100),p_platform) on conflict(key_hash) do nothing;
 perform public.vmtools_activate_device_if_allowed(p_key);
end$$;

create or replace function public.vmtools_device_status(p_actor uuid,p_key text,p_status text)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.vmtools_accounts; d public.vmtools_devices;
begin
 if not exists(select 1 from public.vmtools_accounts where id=p_actor and role='owner' and status='active') then raise exception 'Không có quyền quản trị'; end if;
 select a0.* into a from public.vmtools_accounts a0 join public.vmtools_devices d0 on d0.account_id=a0.id where d0.key_hash=p_key for update of a0;
 if not found then raise exception 'Không tìm thấy thiết bị'; end if;
 select * into d from public.vmtools_devices where key_hash=p_key for update;
 -- The owner may approve a new device through their authenticated admin page.
 -- Already trusted or explicitly blocked owner computers remain protected.
 if a.role='owner' and d.platform<>'web' and not (d.status='pending' and p_status='active') then raise exception 'Không sửa thiết bị quản trị gốc tại đây'; end if;
 if p_status not in ('active','blocked','pending') then raise exception 'Trạng thái không hợp lệ'; end if;
 if p_status='active' and d.status<>'active' and d.platform<>'web' and
  (select count(*) from public.vmtools_devices where account_id=a.id and platform<>'web' and status='active')>=a.max_devices then raise exception 'Đã đủ số máy tính được cấp; tăng giới hạn hoặc khóa một máy cũ trước'; end if;
 update public.vmtools_devices set status=p_status where key_hash=p_key;
 update public.vmtools_accounts set revision=revision+1,updated_at=now() where id=a.id;
 insert into public.vmtools_audit(actor,account_id,action,details) values(p_actor,a.id,'device',jsonb_build_object('key',p_key,'status',p_status));
end$$;

create or replace function public.vmtools_provision(p_actor uuid,p_user uuid,p_email text,p_name text,p_web boolean,p_plan text,p_units integer,p_until timestamptz,p_amount numeric)
returns uuid language plpgsql security invoker set search_path='' as $$
declare account_id uuid;
begin
 if not exists(select 1 from public.vmtools_accounts where id=p_actor and role='owner' and status='active') then raise exception 'Không có quyền quản trị'; end if;
 if not exists(select 1 from public.profiles where id=p_user and role in ('teacher','admin','student')) then raise exception 'Cần tài khoản giáo viên hoặc học sinh VinhMath'; end if;
 insert into public.vmtools_accounts(auth_user_id,email,name,web_enabled) values(p_user,lower(p_email),p_name,p_web) returning id into account_id;
 if p_plan<>'pending' then perform public.vmtools_renew(p_actor,account_id,gen_random_uuid(),p_plan,p_units,p_until,p_amount,'Cấp quyền VMTools'); end if;
 return account_id;
end$$;
-- Existing function privileges remain service-role-only after CREATE OR REPLACE.
