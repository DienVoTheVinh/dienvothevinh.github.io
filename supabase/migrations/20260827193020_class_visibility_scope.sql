-- Scope every classroom read at the database boundary.  The legacy policy
-- t_classes_read allowed every authenticated account to read every class and
-- several screens compensated by filtering in JavaScript.  This migration
-- makes the database the source of truth and exposes one bounded listing RPC.

create or replace function private.vm_actor_can_access_class(
  p_actor_id uuid,
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select p_actor_id is not null and exists (
    select 1
    from public.classes classroom
    where classroom.id=p_class_id
      and (
        exists (
          select 1
          from public.profiles actor
          where actor.id=p_actor_id and actor.role='admin'
        )
        or exists (
          select 1
          from public.profiles actor
          where actor.id=p_actor_id
            and actor.role='teacher'
            and (
              classroom.teacher_id=p_actor_id
              or classroom.co_teacher_id=p_actor_id
            )
        )
        or exists (
          select 1
          from public.class_assistants assistant
          join public.profiles actor on actor.id=assistant.assistant_id
          where assistant.class_id=classroom.id
            and assistant.assistant_id=p_actor_id
            and actor.role in ('teacher','assistant')
        )
        or exists (
          select 1
          from public.class_students membership
          join public.profiles actor on actor.id=membership.student_id
          where membership.class_id=classroom.id
            and membership.student_id=p_actor_id
            and actor.role='student'
        )
        or exists (
          select 1
          from public.profiles child
          join public.class_students membership
            on membership.student_id=child.id
          where child.parent_id=p_actor_id
            and child.role='student'
            and membership.class_id=classroom.id
            and exists (
              select 1
              from public.profiles parent_profile
              where parent_profile.id=p_actor_id
                and parent_profile.role='parent'
            )
        )
      )
  );
$function$;

revoke all on function private.vm_actor_can_access_class(uuid,uuid)
from public, anon, authenticated, service_role;

create or replace function private.vm_current_actor_can_access_class(
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select private.vm_actor_can_access_class(auth.uid(),p_class_id);
$function$;

revoke all on function private.vm_current_actor_can_access_class(uuid)
from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.vm_current_actor_can_access_class(uuid)
to authenticated;

-- Keep every mutation path aligned with the class-management UI.  The broad
-- legacy staff policies remain as the permissive half of RLS; these helpers
-- are the restrictive ownership/role boundary and also cover portal managers.
create or replace function private.vm_current_actor_can_manage_class(
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.classes classroom
    where classroom.id=p_class_id
      and (
        exists (
          select 1
          from public.profiles actor
          where actor.id=auth.uid() and actor.role='admin'
        )
        or (
          exists (
            select 1
            from public.profiles actor
            where actor.id=auth.uid() and actor.role='teacher'
          )
          and (
            classroom.teacher_id=auth.uid()
            or classroom.co_teacher_id=auth.uid()
          )
        )
        or (
          classroom.portal_id is not null
          and private.can_manage_exam_portal(classroom.portal_id)
        )
      )
  );
$function$;

revoke all on function private.vm_current_actor_can_manage_class(uuid)
from public, anon, authenticated, service_role;

create or replace function private.vm_class_staff_assignment_valid(
  p_portal_id uuid,
  p_teacher_id uuid,
  p_co_teacher_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    exists (
      select 1
      from public.profiles actor
      where actor.id=auth.uid() and actor.role in ('admin','teacher')
    )
    and (
      p_teacher_id is null
      or exists (
        select 1 from public.profiles profile
        where profile.id=p_teacher_id and profile.role in ('admin','teacher')
      )
    )
    and (
      p_co_teacher_id is null
      or exists (
        select 1 from public.profiles profile
        where profile.id=p_co_teacher_id and profile.role in ('admin','teacher')
      )
    )
    and (
      p_teacher_id is null
      or p_co_teacher_id is null
      or p_teacher_id<>p_co_teacher_id
    )
    and (
      p_portal_id is null
      or (
        (
          p_teacher_id is null
          or exists (
            select 1
            from public.exam_portal_members membership
            where membership.portal_id=p_portal_id
              and membership.user_id=p_teacher_id
              and membership.member_role in ('owner','manager')
          )
        )
        and (
          p_co_teacher_id is null
          or exists (
            select 1
            from public.exam_portal_members membership
            where membership.portal_id=p_portal_id
              and membership.user_id=p_co_teacher_id
              and membership.member_role in ('owner','manager')
          )
        )
      )
    );
$function$;

revoke all on function private.vm_class_staff_assignment_valid(uuid,uuid,uuid)
from public, anon, authenticated, service_role;

create or replace function private.vm_class_student_assignment_valid(
  p_class_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    private.vm_current_actor_can_manage_class(p_class_id)
    and exists (
      select 1 from public.profiles student
      where student.id=p_student_id and student.role='student'
    )
    and exists (
      select 1
      from public.classes classroom
      where classroom.id=p_class_id
        and (
          classroom.portal_id is null
          or private.portal_class_member_valid(p_class_id,p_student_id)
        )
    );
$function$;

revoke all on function private.vm_class_student_assignment_valid(uuid,uuid)
from public, anon, authenticated, service_role;

create or replace function private.vm_class_assistant_assignment_valid(
  p_class_id uuid,
  p_assistant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    private.vm_current_actor_can_manage_class(p_class_id)
    and exists (
      select 1 from public.profiles assistant
      where assistant.id=p_assistant_id
        and assistant.role in ('teacher','assistant')
    )
    and exists (
      select 1
      from public.classes classroom
      where classroom.id=p_class_id
        and (
          classroom.portal_id is null
          or exists (
            select 1
            from public.exam_portal_members membership
            where membership.portal_id=classroom.portal_id
              and membership.user_id=p_assistant_id
              and membership.member_role in ('owner','manager')
          )
        )
    );
$function$;

revoke all on function private.vm_class_assistant_assignment_valid(uuid,uuid)
from public, anon, authenticated, service_role;

grant execute on function private.vm_current_actor_can_manage_class(uuid)
to authenticated;
grant execute on function private.vm_class_staff_assignment_valid(uuid,uuid,uuid)
to authenticated;
grant execute on function private.vm_class_student_assignment_valid(uuid,uuid)
to authenticated;
grant execute on function private.vm_class_assistant_assignment_valid(uuid,uuid)
to authenticated;

create index if not exists classes_teacher_id_idx
  on public.classes (teacher_id);
create index if not exists classes_co_teacher_id_idx
  on public.classes (co_teacher_id);
create index if not exists class_assistants_assistant_class_idx
  on public.class_assistants (assistant_id,class_id);
create index if not exists class_students_student_class_idx
  on public.class_students (student_id,class_id);
create index if not exists profiles_parent_id_idx
  on public.profiles (parent_id)
  where parent_id is not null;

revoke select on table public.classes from anon;

drop policy if exists classes_actor_visibility_scope on public.classes;
create policy classes_actor_visibility_scope
on public.classes as restrictive for select to authenticated
using (
  (select private.vm_current_actor_can_access_class(id))
  or (
    portal_id is not null
    and (select private.can_access_portal_class(id))
  )
);

-- Membership rows reveal the existence of a private class even when the class
-- row itself is hidden.  Apply the same boundary to the two membership tables.
alter table public.class_assistants enable row level security;
revoke select on table public.class_assistants from anon;
drop policy if exists class_assistants_actor_visibility_scope on public.class_assistants;
create policy class_assistants_actor_visibility_scope
on public.class_assistants as restrictive for select to authenticated
using (
  assistant_id=(select auth.uid())
  or (select private.vm_current_actor_can_access_class(class_id))
  or (select private.can_access_portal_class(class_id))
);

drop policy if exists class_assistants_actor_insert_scope on public.class_assistants;
create policy class_assistants_actor_insert_scope
on public.class_assistants as restrictive for insert to authenticated
with check (
  (select private.vm_class_assistant_assignment_valid(class_id,assistant_id))
);

drop policy if exists class_assistants_actor_delete_scope on public.class_assistants;
create policy class_assistants_actor_delete_scope
on public.class_assistants as restrictive for delete to authenticated
using ((select private.vm_current_actor_can_manage_class(class_id)));

alter table public.class_students enable row level security;
revoke select on table public.class_students from anon;
drop policy if exists class_students_actor_visibility_scope on public.class_students;
create policy class_students_actor_visibility_scope
on public.class_students as restrictive for select to authenticated
using (
  student_id=(select auth.uid())
  or exists (
    select 1
    from public.profiles child
    where child.id=class_students.student_id
      and child.role='student'
      and child.parent_id=(select auth.uid())
  )
  or (
    exists (
      select 1
      from public.profiles actor
      where actor.id=(select auth.uid())
        and actor.role in ('admin','teacher','assistant')
    )
    and (select private.vm_current_actor_can_access_class(class_id))
  )
  or (select private.vm_current_actor_can_manage_class(class_id))
);

drop policy if exists class_students_actor_insert_scope on public.class_students;
create policy class_students_actor_insert_scope
on public.class_students as restrictive for insert to authenticated
with check (
  (select private.vm_class_student_assignment_valid(class_id,student_id))
);

drop policy if exists class_students_actor_update_scope on public.class_students;
create policy class_students_actor_update_scope
on public.class_students as restrictive for update to authenticated
using ((select private.vm_current_actor_can_manage_class(class_id)))
with check (
  (select private.vm_class_student_assignment_valid(class_id,student_id))
);

drop policy if exists class_students_actor_delete_scope on public.class_students;
create policy class_students_actor_delete_scope
on public.class_students as restrictive for delete to authenticated
using ((select private.vm_current_actor_can_manage_class(class_id)));

-- Keep broad legacy teacher write policies from being used to create or move a
-- class into somebody else's ownership.  Admin keeps system-wide authority.
drop policy if exists classes_actor_insert_scope on public.classes;
create policy classes_actor_insert_scope
on public.classes as restrictive for insert to authenticated
with check (
  (select private.vm_class_staff_assignment_valid(portal_id,teacher_id,co_teacher_id))
  and (
    (select public.is_admin())
    or teacher_id=(select auth.uid())
    or (
      portal_id is not null
      and (select private.can_manage_exam_portal(portal_id))
    )
  )
);

drop policy if exists classes_actor_update_scope on public.classes;
create policy classes_actor_update_scope
on public.classes as restrictive for update to authenticated
using (
  (select public.is_admin())
  or teacher_id=(select auth.uid())
  or co_teacher_id=(select auth.uid())
  or (
    portal_id is not null
    and (select private.can_manage_exam_portal(portal_id))
  )
)
with check (
  (select private.vm_class_staff_assignment_valid(portal_id,teacher_id,co_teacher_id))
  and (
    (select public.is_admin())
    or teacher_id=(select auth.uid())
    or co_teacher_id=(select auth.uid())
    or (
      portal_id is not null
      and (select private.can_manage_exam_portal(portal_id))
    )
  )
);

drop policy if exists classes_actor_delete_scope on public.classes;
create policy classes_actor_delete_scope
on public.classes as restrictive for delete to authenticated
using (
  (select public.is_admin())
  or teacher_id=(select auth.uid())
  or co_teacher_id=(select auth.uid())
  or (
    portal_id is not null
    and (select private.can_manage_exam_portal(portal_id))
  )
);

create or replace function public.vm_list_accessible_classes(
  p_scope text default 'mine',
  p_teacher_ids uuid[] default null
)
returns table (
  id uuid,
  name text,
  grade integer,
  mode text,
  school_year text,
  is_specialized boolean,
  teacher_id uuid,
  co_teacher_id uuid,
  theme text,
  brand_id uuid,
  portal_id uuid,
  brand jsonb
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_scope text := lower(coalesce(nullif(trim(p_scope),''),'mine'));
  v_teacher_ids uuid[] := coalesce(p_teacher_ids,array[]::uuid[]);
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select profile.role into v_role
  from public.profiles profile
  where profile.id=v_actor;

  if v_role is null then
    raise exception 'profile_required' using errcode='42501';
  end if;

  if v_scope not in ('mine','collaboration','selected','all') then
    raise exception 'invalid_class_scope' using errcode='22023';
  end if;

  -- Non-admin callers never gain authority from filter parameters.  This is
  -- deliberate: even a hand-written RPC request stays inside their own scope.
  if v_role<>'admin' then
    v_scope := 'mine';
    v_teacher_ids := array[]::uuid[];
  elsif v_scope='selected' and cardinality(v_teacher_ids)=0 then
    return;
  end if;

  return query
  select
    classroom.id,
    classroom.name,
    classroom.grade,
    classroom.mode,
    classroom.school_year,
    classroom.is_specialized,
    classroom.teacher_id,
    classroom.co_teacher_id,
    classroom.theme,
    classroom.brand_id,
    classroom.portal_id,
    case when brand_row.id is null then null else jsonb_build_object(
      'id',brand_row.id,
      'slug',brand_row.slug,
      'name',brand_row.name,
      'short_name',brand_row.short_name,
      'wordmark_primary_text',brand_row.wordmark_primary_text,
      'wordmark_secondary_text',brand_row.wordmark_secondary_text,
      'wordmark_primary_color',brand_row.wordmark_primary_color,
      'wordmark_secondary_color',brand_row.wordmark_secondary_color,
      'tagline',brand_row.tagline,
      'logo_path',brand_row.logo_path,
      'preset',brand_row.preset,
      'primary_color',brand_row.primary_color,
      'secondary_color',brand_row.secondary_color,
      'accent_color',brand_row.accent_color,
      'accent_soft_color',brand_row.accent_soft_color,
      'surface_color',brand_row.surface_color,
      'text_color',brand_row.text_color,
      'topbar_color',brand_row.topbar_color,
      'topbar_text_color',brand_row.topbar_text_color,
      'logo_scale',brand_row.logo_scale,
      'logo_x',brand_row.logo_x,
      'logo_y',brand_row.logo_y,
      'radius_px',brand_row.radius_px,
      'is_active',brand_row.is_active
    ) end as brand
  from public.classes classroom
  left join public.brand_templates brand_row on brand_row.id=classroom.brand_id
  where
    case
      when v_role<>'admin' then
        (
          classroom.portal_id is null
          and not private.is_portal_only_user()
          and private.vm_actor_can_access_class(v_actor,classroom.id)
        )
        or (
          classroom.portal_id is not null
          and private.can_access_portal_class(classroom.id)
        )
      when v_scope='all' then true
      when v_scope='selected' then
        classroom.teacher_id=any(v_teacher_ids)
        or classroom.co_teacher_id=any(v_teacher_ids)
        or exists (
          select 1 from public.class_assistants assistant
          where assistant.class_id=classroom.id
            and assistant.assistant_id=any(v_teacher_ids)
        )
      when v_scope='collaboration' then
        (
          classroom.teacher_id=v_actor
          or classroom.co_teacher_id=v_actor
          or exists (
            select 1 from public.class_assistants mine
            where mine.class_id=classroom.id and mine.assistant_id=v_actor
          )
        )
        and (
          (classroom.teacher_id is not null and classroom.teacher_id<>v_actor)
          or (classroom.co_teacher_id is not null and classroom.co_teacher_id<>v_actor)
          or exists (
            select 1 from public.class_assistants colleague
            where colleague.class_id=classroom.id
              and colleague.assistant_id<>v_actor
          )
        )
      else
        classroom.teacher_id=v_actor
        or classroom.co_teacher_id=v_actor
        or exists (
          select 1 from public.class_assistants assistant
          where assistant.class_id=classroom.id
            and assistant.assistant_id=v_actor
        )
    end
  order by classroom.grade, classroom.name, classroom.id;
end;
$function$;

revoke all on function public.vm_list_accessible_classes(text,uuid[])
from public, anon, authenticated, service_role;
grant execute on function public.vm_list_accessible_classes(text,uuid[])
to authenticated;
