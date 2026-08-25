begin;

-- This legacy guard trusted every teacher with sensitive profile columns and
-- conflicts with the scoped/default-deny guard installed by the prior
-- migration.
drop trigger if exists trg_protect_profile on public.profiles;
drop function if exists public.protect_profile_sensitive();

-- A public Auth signup controls its email and user_metadata, but cannot write
-- raw_app_meta_data.  Account roles therefore come only from the private claim
-- attached by the service-role account factory.  No email prefix/domain grants
-- authority.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_username text;
  v_requested_role text;
  v_role text;
  v_full_name text;
begin
  v_username := split_part(coalesce(new.email,new.id::text),'@',1);
  v_requested_role := lower(coalesce(new.raw_app_meta_data->>'vinhmath_role','student'));
  v_role := case
    when v_requested_role in ('admin','teacher','assistant','student','parent')
      then v_requested_role
    else 'student'
  end;

  if v_role='parent' then
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

commit;
