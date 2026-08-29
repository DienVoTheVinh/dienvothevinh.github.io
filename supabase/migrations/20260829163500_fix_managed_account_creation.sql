begin;

-- GoTrue persists custom app_metadata after the auth.users INSERT that fires
-- handle_new_user().  The trigger must therefore remain least-privilege when
-- the claim is not visible yet, while still choosing a collision-free profile
-- identifier for the managed parent login domain.  The domain only affects the
-- username; it never grants a role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_username text;
  v_email_domain text;
  v_requested_role text;
  v_role text;
  v_full_name text;
  v_parent_identity boolean;
begin
  v_username := split_part(coalesce(new.email,new.id::text),'@',1);
  v_email_domain := lower(split_part(coalesce(new.email,''),'@',2));
  v_requested_role := lower(coalesce(new.raw_app_meta_data->>'vinhmath_role','student'));
  v_role := case
    when v_requested_role in ('admin','teacher','assistant','student','parent')
      then v_requested_role
    else 'student'
  end;

  -- ph.vinhmath.com is an identifier namespace, not an authorization source.
  -- The service-only account factory finalizes role=parent after Auth succeeds.
  v_parent_identity := v_email_domain='ph.vinhmath.com' or v_role='parent';
  if v_parent_identity then
    if right(v_username,3) <> '_ph' then
      v_username := v_username || '_ph';
    end if;
    v_full_name := coalesce(
      nullif(btrim(new.raw_user_meta_data->>'full_name'),''),
      'Phụ huynh ' || initcap(replace(v_username,'_ph',''))
    );
  else
    v_full_name := coalesce(
      nullif(btrim(new.raw_user_meta_data->>'full_name'),''),
      nullif(btrim(new.raw_user_meta_data->>'display_name'),''),
      initcap(replace(v_username,'-',' '))
    );
  end if;

  insert into public.profiles (id,role,username,full_name,class_id)
  values (new.id,v_role,v_username,v_full_name,null)
  on conflict (id) do update
  set role=excluded.role,
      username=excluded.username,
      full_name=excluded.full_name;

  return new;
end;
$function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Finalize both sides of a managed student-parent pair in one database
-- transaction.  Only the service-role Edge Function can call this RPC.
create or replace function public.vm_finalize_managed_account_pair(
  p_student_id uuid,
  p_parent_id uuid,
  p_username text,
  p_student_full_name text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_username text := lower(btrim(coalesce(p_username,'')));
  v_full_name text := btrim(coalesce(p_student_full_name,''));
  v_student_email text;
  v_parent_email text;
  v_student_claim text;
  v_parent_claim text;
  v_profile_count integer;
begin
  if p_student_id is null or p_parent_id is null or p_student_id=p_parent_id then
    raise exception 'managed_account_ids_invalid' using errcode='22023';
  end if;
  if v_username !~ '^[a-z0-9][a-z0-9]{0,59}$' then
    raise exception 'managed_account_username_invalid' using errcode='22023';
  end if;
  if v_full_name='' or char_length(v_full_name)>200 then
    raise exception 'managed_account_name_invalid' using errcode='22023';
  end if;

  select lower(email), lower(raw_app_meta_data->>'vinhmath_role')
  into v_student_email, v_student_claim
  from auth.users
  where id=p_student_id
  for update;
  select lower(email), lower(raw_app_meta_data->>'vinhmath_role')
  into v_parent_email, v_parent_claim
  from auth.users
  where id=p_parent_id
  for update;

  if v_student_email is distinct from v_username || '@hs.vinhmath.com'
     or v_parent_email is distinct from v_username || '@ph.vinhmath.com'
     or v_student_claim is distinct from 'student'
     or v_parent_claim is distinct from 'parent' then
    raise exception 'managed_account_auth_identity_invalid' using errcode='22023';
  end if;

  perform 1
  from public.profiles
  where id in (p_student_id,p_parent_id)
  order by id
  for update;
  get diagnostics v_profile_count = row_count;
  if v_profile_count <> 2 then
    raise exception 'managed_account_profile_missing' using errcode='23503';
  end if;

  update public.profiles
  set role='parent',
      username=v_username || '_ph',
      full_name='Phụ huynh ' || v_full_name,
      parent_id=null
  where id=p_parent_id;

  update public.profiles
  set role='student',
      username=v_username,
      full_name=v_full_name,
      parent_id=p_parent_id
  where id=p_student_id;

  return jsonb_build_object(
    'student_id',p_student_id,
    'parent_id',p_parent_id,
    'student_username',v_username,
    'parent_username',v_username || '_ph'
  );
end;
$function$;

revoke all on function public.vm_finalize_managed_account_pair(uuid,uuid,text,text)
from public, anon, authenticated;
grant execute on function public.vm_finalize_managed_account_pair(uuid,uuid,text,text)
to service_role;

-- Repair the bounded failure mode already observed in production: a managed
-- staff/parent claim exists but the INSERT-time fallback left profile=student.
-- Do not touch admins, claim-less legacy accounts or any unrelated mismatch.
update public.profiles profile
set role=auth_role.role
from (
  select
    auth_user.id,
    lower(auth_user.raw_app_meta_data->>'vinhmath_role') as role,
    lower(split_part(coalesce(auth_user.email,''),'@',2)) as email_domain
  from auth.users auth_user
  where lower(auth_user.raw_app_meta_data->>'vinhmath_role')
    in ('teacher','assistant','parent')
) auth_role
where profile.id=auth_role.id
  and profile.role='student'
  and (
    (auth_role.role='teacher' and (
      auth_role.email_domain='gv.vinhmath.com'
      or exists (
        select 1
        from public.exam_portals portal
        where auth_role.email_domain=lower(portal.teacher_login_suffix) || '.vinhmath.com'
      )
    ))
    or (auth_role.role='assistant' and auth_role.email_domain='tg.vinhmath.com')
    or (auth_role.role='parent' and auth_role.email_domain='ph.vinhmath.com')
  );

commit;
