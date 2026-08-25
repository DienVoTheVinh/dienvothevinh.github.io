begin;

-- A profile role is part of the authorization boundary.  Keep the ordinary
-- profile editor useful, but never let a client promote itself (or another
-- account) by writing security-owned columns directly.
alter table public.profiles enable row level security;

drop policy if exists s_profile_self on public.profiles;
drop policy if exists s_profile_self_sel on public.profiles;
drop policy if exists s_profile_self_upd on public.profiles;
drop policy if exists t_profiles_write on public.profiles;

create policy s_profile_self_sel
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy s_profile_self_upd
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Administrative account management remains compatible with the existing
-- direct table calls.  Teachers receive no broad write policy.
create policy t_profiles_write
on public.profiles
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create or replace function private.vm_profile_actor_can_manage_student(
  p_actor_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    p_actor_id is not null
    and exists (
      select 1
      from public.profiles actor
      where actor.id=p_actor_id
        and actor.role in ('teacher','assistant')
    )
    and exists (
      select 1
      from public.class_students membership
      join public.classes classroom on classroom.id=membership.class_id
      where membership.student_id=p_student_id
        and (
          classroom.teacher_id=p_actor_id
          or classroom.co_teacher_id=p_actor_id
          or exists (
            select 1
            from public.class_assistants assistant
            where assistant.class_id=membership.class_id
              and assistant.assistant_id=p_actor_id
          )
        )
    );
$function$;

revoke all on function private.vm_profile_actor_can_manage_student(uuid,uuid)
from public, anon, authenticated, service_role;

create or replace function private.vm_guard_profile_privileged_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  -- Internal/service operations do not carry an end-user uid.  Admins need
  -- all columns for the existing account-management screens.
  if v_actor is null or exists (
    select 1
    from public.profiles actor
    where actor.id=v_actor and actor.role='admin'
  ) then
    return new;
  end if;

  -- Default deny: only these harmless, user-editable presentation/contact
  -- fields may differ.  Every current or future profile column not listed
  -- here is security-owned automatically.
  if (
    to_jsonb(new)
      - array['full_name','gender','email','school','phone','objective','avatar_url']::text[]
  ) is distinct from (
    to_jsonb(old)
      - array['full_name','gender','email','school','phone','objective','avatar_url']::text[]
  ) then
    -- The scoped RPC below preserves the existing teacher workflow without
    -- restoring broad profile writes.  RLS blocks direct updates to another
    -- profile; the trigger additionally limits the trusted path to these two
    -- fields and to an assigned student.
    if (
      to_jsonb(new)
        - array['full_name','gender','email','school','phone','objective','avatar_url','parent_id','teacher_comment']::text[]
    ) is not distinct from (
      to_jsonb(old)
        - array['full_name','gender','email','school','phone','objective','avatar_url','parent_id','teacher_comment']::text[]
    )
    and private.vm_profile_actor_can_manage_student(v_actor,old.id)
    and (
      new.parent_id is null
      or exists (
        select 1
        from public.profiles parent_profile
        where parent_profile.id=new.parent_id
          and parent_profile.role='parent'
      )
    ) then
      return new;
    end if;

    raise exception 'profile_privileged_update_forbidden'
      using errcode='42501';
  end if;

  return new;
end;
$function$;

revoke all on function private.vm_guard_profile_privileged_update()
from public, anon, authenticated, service_role;

drop trigger if exists profiles_guard_privileged_update on public.profiles;
create trigger profiles_guard_privileged_update
before update on public.profiles
for each row
execute function private.vm_guard_profile_privileged_update();

create or replace function public.vm_update_student_parent_note(
  p_student_id uuid,
  p_parent_id uuid,
  p_teacher_comment text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if p_student_id is null or not exists (
    select 1
    from public.profiles student
    where student.id=p_student_id and student.role='student'
  ) then
    raise exception 'student_not_found' using errcode='22023';
  end if;

  if p_parent_id is not null and not exists (
    select 1
    from public.profiles parent_profile
    where parent_profile.id=p_parent_id and parent_profile.role='parent'
  ) then
    raise exception 'parent_profile_invalid' using errcode='22023';
  end if;

  if char_length(coalesce(p_teacher_comment,'')) > 4000 then
    raise exception 'teacher_comment_too_long' using errcode='22023';
  end if;

  if not public.is_admin()
     and not private.vm_profile_actor_can_manage_student(v_actor,p_student_id) then
    raise exception 'student_profile_scope_denied' using errcode='42501';
  end if;

  update public.profiles
  set parent_id=p_parent_id,
      teacher_comment=nullif(btrim(coalesce(p_teacher_comment,'')),'')
  where id=p_student_id and role='student';

  return true;
end;
$function$;

revoke all on function public.vm_update_student_parent_note(uuid,uuid,text)
from public, anon;
grant execute on function public.vm_update_student_parent_note(uuid,uuid,text)
to authenticated;

-- TRUNCATE bypasses row-level security and is not used by the application.
revoke truncate on table public.profiles from anon, authenticated;

commit;
