-- Restore and harden direct teacher email linking for administrators,
-- allowing instant VMTools access for existing teachers without blocking on third-party mail services.
create or replace function public.vm_teacher_link_email(p_actor uuid, p_user uuid, p_email text)
returns uuid
language plpgsql security invoker set search_path='' as $function$
declare
  account_id uuid;
  teacher_name text;
  clean_email text;
  owner_id uuid;
begin
  -- Caller must be an active admin and owner of VMTools
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') or
     not exists(select 1 from public.vmtools_accounts where auth_user_id=p_actor and role='owner' and status='active') then
    raise exception 'Chỉ chủ sở hữu được liên kết';
  end if;

  select id into owner_id from public.vmtools_accounts where auth_user_id=p_actor and role='owner' and status='active';

  -- Target must be a teacher
  select full_name into teacher_name from public.profiles where id=p_user and role='teacher' for update;
  if not found then
    raise exception 'Không tìm thấy giáo viên';
  end if;

  -- Validate clean email
  clean_email := lower(btrim(p_email));
  if clean_email is null or length(clean_email) > 254 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or clean_email like '%.vinhmath.com' then
    raise exception 'Nhập email thật của giáo viên';
  end if;

  -- Prevent concurrent conflicts
  perform pg_advisory_xact_lock(hashtextextended(clean_email, 719));

  -- Ensure email is not already taken by another account
  if exists(select 1 from public.profiles where lower(email)=clean_email and id<>p_user) or
     exists(select 1 from public.vmtools_accounts where lower(email)=clean_email and (auth_user_id is distinct from p_user)) then
    raise exception 'Email đã thuộc tài khoản khác';
  end if;

  -- Upsert into vmtools_accounts
  insert into public.vmtools_accounts(auth_user_id, email, name, web_enabled, app_enabled, download_enabled)
  values(p_user, clean_email, coalesce(teacher_name, ''), false, true, true)
  on conflict (auth_user_id) do update set
    email = excluded.email,
    name = case when vmtools_accounts.name = '' then excluded.name else vmtools_accounts.name end,
    updated_at = now()
  returning id into account_id;

  -- Update profiles email
  update public.profiles set email = clean_email where id = p_user;

  -- If an email verification request exists for this teacher, mark it confirmed
  if exists(select 1 from information_schema.tables where table_schema='public' and table_name='vm_teacher_email_requests') then
    update public.vm_teacher_email_requests
    set status = 'confirmed', confirmed_at = now(), updated_at = now()
    where user_id = p_user;
  end if;

  -- Audit entry
  insert into public.vmtools_audit(actor, account_id, action, details)
  values(owner_id, account_id, 'teacher-email-direct-linked', jsonb_build_object('userId', p_user, 'email', clean_email));

  return account_id;
end$function$;

revoke all on function public.vm_teacher_link_email(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.vm_teacher_link_email(uuid, uuid, text) to service_role;
