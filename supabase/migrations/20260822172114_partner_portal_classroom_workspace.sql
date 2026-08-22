-- Minimal partner classroom workspace.
-- Reuses VinhMath classes, lessons and exams while keeping partner data isolated
-- from the main VinhMath teacher role and navigation.

alter table public.classes
  add column if not exists portal_id uuid references public.exam_portals(id) on delete cascade;

alter table public.lessons
  add column if not exists resource_url text;

alter table public.exams
  add column if not exists portal_id uuid references public.exam_portals(id) on delete cascade;

alter table public.questions
  add column if not exists portal_id uuid references public.exam_portals(id) on delete cascade;

alter table public.exam_portal_exams
  add column if not exists class_id uuid references public.classes(id) on delete cascade;

create index if not exists classes_portal_idx
  on public.classes (portal_id, grade, name)
  where portal_id is not null;

create index if not exists lessons_portal_class_idx
  on public.lessons (class_id, published, sort);

create index if not exists exams_portal_idx
  on public.exams (portal_id, created_at desc)
  where portal_id is not null;

create index if not exists questions_portal_idx
  on public.questions (portal_id, created_at desc)
  where portal_id is not null;

create index if not exists exam_portal_exams_class_idx
  on public.exam_portal_exams (class_id, published, sort)
  where class_id is not null;

create or replace function private.can_access_portal_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_admin()) or exists (
    select 1
    from public.classes c
    join public.exam_portals portal on portal.id = c.portal_id
    join public.exam_portal_members membership
      on membership.portal_id = c.portal_id
     and membership.user_id = (select auth.uid())
    where c.id = p_class_id
      and portal.is_active
      and (
        membership.member_role in ('owner', 'manager')
        or exists (
          select 1
          from public.class_students cs
          where cs.class_id = c.id
            and cs.student_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function private.can_manage_portal_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.portal_id is not null
      and (select private.can_manage_exam_portal(c.portal_id))
  );
$$;

create or replace function private.portal_class_member_valid(
  p_class_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classes c
    join public.exam_portal_members membership
      on membership.portal_id = c.portal_id
     and membership.user_id = p_user_id
    where c.id = p_class_id
      and c.portal_id is not null
      and membership.member_role = 'student'
      and (select private.can_manage_exam_portal(c.portal_id))
  );
$$;

create or replace function private.portal_exam_payload_valid(
  p_portal_id uuid,
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_portal_id is not null
    and (select private.can_manage_exam_portal(p_portal_id))
    and (
      p_class_id is null
      or exists (
        select 1
        from public.classes c
        where c.id = p_class_id
          and c.portal_id = p_portal_id
      )
    );
$$;

create or replace function private.can_manage_portal_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exams exam
    where exam.id = p_exam_id
      and exam.portal_id is not null
      and (select private.can_manage_exam_portal(exam.portal_id))
  );
$$;

create or replace function private.portal_exam_question_valid(
  p_exam_id uuid,
  p_question_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exams exam
    join public.questions question
      on question.id = p_question_id
     and question.portal_id = exam.portal_id
    where exam.id = p_exam_id
      and exam.portal_id is not null
      and (select private.can_manage_exam_portal(exam.portal_id))
  );
$$;

-- Class-specific assignments: a portal student sees an exam only when the
-- assignment is global to the portal or belongs to one of their classes.
create or replace function private.can_access_portal_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_admin()) or exists (
    select 1
    from public.exam_portal_exams assignment
    join public.exam_portals portal on portal.id = assignment.portal_id
    join public.exam_portal_members membership on membership.portal_id = assignment.portal_id
    where assignment.exam_id = p_exam_id
      and membership.user_id = (select auth.uid())
      and portal.is_active
      and (
        membership.member_role in ('owner', 'manager')
        or (
          assignment.published
          and (assignment.available_from is null or assignment.available_from <= now())
          and (assignment.available_until is null or assignment.available_until >= now())
          and (
            assignment.class_id is null
            or exists (
              select 1
              from public.class_students cs
              where cs.class_id = assignment.class_id
                and cs.student_id = (select auth.uid())
            )
          )
        )
      )
  );
$$;

revoke all on function private.can_access_portal_class(uuid) from public, anon;
revoke all on function private.can_manage_portal_class(uuid) from public, anon;
revoke all on function private.portal_class_member_valid(uuid, uuid) from public, anon;
revoke all on function private.portal_exam_payload_valid(uuid, uuid) from public, anon;
revoke all on function private.can_manage_portal_exam(uuid) from public, anon;
revoke all on function private.portal_exam_question_valid(uuid, uuid) from public, anon;
grant execute on function private.can_access_portal_class(uuid) to authenticated;
grant execute on function private.can_manage_portal_class(uuid) to authenticated;
grant execute on function private.portal_class_member_valid(uuid, uuid) to authenticated;
grant execute on function private.portal_exam_payload_valid(uuid, uuid) to authenticated;
grant execute on function private.can_manage_portal_exam(uuid) to authenticated;
grant execute on function private.portal_exam_question_valid(uuid, uuid) to authenticated;

drop policy if exists classes_portal_only_scope on public.classes;
create policy classes_portal_only_scope
on public.classes as restrictive for select to authenticated
using (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (
    portal_id is not null
    and (select private.can_access_portal_class(id))
  )
);

create policy classes_portal_manager_write
on public.classes for all to authenticated
using (
  portal_id is not null
  and (select private.can_manage_exam_portal(portal_id))
)
with check (
  portal_id is not null
  and (select private.can_manage_exam_portal(portal_id))
);

drop policy if exists class_students_portal_only_scope on public.class_students;
create policy class_students_portal_only_scope
on public.class_students as restrictive for all to authenticated
using (
  (
    not exists (
      select 1 from public.classes c
      where c.id = class_students.class_id and c.portal_id is not null
    )
    and not (select private.is_portal_only_user())
  )
  or (select private.can_access_portal_class(class_id))
)
with check (
  (
    not exists (
      select 1 from public.classes c
      where c.id = class_students.class_id and c.portal_id is not null
    )
    and not (select private.is_portal_only_user())
  )
  or (select private.portal_class_member_valid(class_id, student_id))
);

create policy class_students_portal_read
on public.class_students for select to authenticated
using ((select private.can_access_portal_class(class_id)));

create policy class_students_portal_manager_write
on public.class_students for all to authenticated
using ((select private.can_manage_portal_class(class_id)))
with check ((select private.portal_class_member_valid(class_id, student_id)));

drop policy if exists lessons_portal_only_scope on public.lessons;
create policy lessons_portal_only_scope
on public.lessons as restrictive for select to authenticated
using (
  (
    not exists (
      select 1 from public.classes c
      where c.id = lessons.class_id and c.portal_id is not null
    )
    and not (select private.is_portal_only_user())
  )
  or (select private.can_access_portal_class(class_id))
);

create policy lessons_portal_read
on public.lessons for select to authenticated
using (
  (select private.can_access_portal_class(class_id))
  and (published or (select private.can_manage_portal_class(class_id)))
);

create policy lessons_portal_manager_write
on public.lessons for all to authenticated
using ((select private.can_manage_portal_class(class_id)))
with check ((select private.can_manage_portal_class(class_id)));

drop policy if exists exams_portal_only_scope on public.exams;
create policy exams_portal_only_scope
on public.exams as restrictive for select to authenticated
using (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (select private.can_access_portal_exam(id))
  or (select private.can_manage_portal_exam(id))
);

create policy exams_portal_manager_read
on public.exams for select to authenticated
using ((select private.can_manage_portal_exam(id)));

create policy exams_portal_manager_insert
on public.exams for insert to authenticated
with check ((select private.portal_exam_payload_valid(portal_id, class_id)));

create policy exams_portal_manager_update
on public.exams for update to authenticated
using ((select private.can_manage_portal_exam(id)))
with check ((select private.portal_exam_payload_valid(portal_id, class_id)));

create policy exams_portal_manager_delete
on public.exams for delete to authenticated
using ((select private.can_manage_portal_exam(id)));

drop policy if exists questions_portal_only_scope on public.questions;
create policy questions_portal_only_scope
on public.questions as restrictive for select to authenticated
using (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (select private.can_access_portal_question(id))
  or (
    portal_id is not null
    and (select private.can_manage_exam_portal(portal_id))
  )
);

create policy questions_portal_manager_read
on public.questions for select to authenticated
using (
  portal_id is not null
  and (select private.can_manage_exam_portal(portal_id))
);

create policy questions_portal_manager_insert
on public.questions for insert to authenticated
with check (
  portal_id is not null
  and (select private.can_manage_exam_portal(portal_id))
);

create policy questions_portal_manager_update
on public.questions for update to authenticated
using (
  portal_id is not null
  and (select private.can_manage_exam_portal(portal_id))
)
with check (
  portal_id is not null
  and (select private.can_manage_exam_portal(portal_id))
);

create policy questions_portal_manager_delete
on public.questions for delete to authenticated
using (
  portal_id is not null
  and (select private.can_manage_exam_portal(portal_id))
);

drop policy if exists exam_questions_portal_only_scope on public.exam_questions;
create policy exam_questions_portal_only_scope
on public.exam_questions as restrictive for select to authenticated
using (
  not (select private.is_portal_only_user())
  or (select private.can_access_portal_exam(exam_id))
  or (select private.can_manage_portal_exam(exam_id))
);

create policy exam_questions_portal_manager_read
on public.exam_questions for select to authenticated
using ((select private.can_manage_portal_exam(exam_id)));

create policy exam_questions_portal_manager_write
on public.exam_questions for all to authenticated
using ((select private.can_manage_portal_exam(exam_id)))
with check ((select private.portal_exam_question_valid(exam_id, question_id)));

drop policy if exists exam_portal_exams_scoped_read on public.exam_portal_exams;
create policy exam_portal_exams_scoped_read
on public.exam_portal_exams for select to authenticated
using (
  (select private.can_manage_exam_portal(portal_id))
  or (
    published
    and (available_from is null or available_from <= now())
    and (available_until is null or available_until >= now())
    and exists (
      select 1
      from public.exam_portal_members membership
      where membership.portal_id = exam_portal_exams.portal_id
        and membership.user_id = (select auth.uid())
    )
    and (
      class_id is null
      or exists (
        select 1
        from public.class_students cs
        where cs.class_id = exam_portal_exams.class_id
          and cs.student_id = (select auth.uid())
      )
    )
  )
);

create policy exam_portal_exams_manager_insert
on public.exam_portal_exams for insert to authenticated
with check (
  (select private.can_manage_exam_portal(portal_id))
  and (
    class_id is null
    or exists (
      select 1 from public.classes c
      where c.id = class_id and c.portal_id = portal_id
    )
  )
  and exists (
    select 1 from public.exams exam
    where exam.id = exam_id
      and (exam.portal_id is null or exam.portal_id = portal_id)
  )
);

create policy exam_portal_exams_manager_update
on public.exam_portal_exams for update to authenticated
using ((select private.can_manage_exam_portal(portal_id)))
with check (
  (select private.can_manage_exam_portal(portal_id))
  and (
    class_id is null
    or exists (
      select 1 from public.classes c
      where c.id = class_id and c.portal_id = portal_id
    )
  )
  and exists (
    select 1 from public.exams exam
    where exam.id = exam_id
      and (exam.portal_id is null or exam.portal_id = portal_id)
  )
);

create policy exam_portal_exams_manager_delete
on public.exam_portal_exams for delete to authenticated
using ((select private.can_manage_exam_portal(portal_id)));

comment on column public.classes.portal_id is
  'Partner portal owner for isolated classroom workspaces; null means a normal VinhMath class.';
comment on column public.lessons.resource_url is
  'Optional external handout or Drive/PDF link shown with the lesson.';
comment on column public.exams.portal_id is
  'Partner portal owner for an exam authored inside the lightweight portal workspace.';
comment on column public.questions.portal_id is
  'Partner portal owner for questions authored inside a portal exam.';
comment on column public.exam_portal_exams.class_id is
  'Optional portal class restriction for this exam assignment.';

update public.exam_portals
set description = 'Không gian lớp học riêng gồm bài giảng và đề thi, được sắp xếp gọn để học sinh dễ theo dõi.',
    updated_at = now()
where slug = 'toan-thay-truong';
