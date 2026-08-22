-- Partner exam portals: isolated memberships and exam assignments that can be
-- moved to a standalone site later without granting broad VinhMath staff access.

create schema if not exists private;
revoke all on schema private from public;

create table public.exam_portals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text,
  description text,
  brand_id uuid references public.brand_templates(id) on delete set null,
  logo_path text,
  support_text text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_portals_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint exam_portals_name_not_blank check (btrim(name) <> '')
);

create table public.exam_portal_members (
  portal_id uuid not null references public.exam_portals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'student',
  portal_only boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (portal_id, user_id),
  constraint exam_portal_members_role check (member_role in ('owner', 'manager', 'student'))
);

create table public.exam_portal_exams (
  portal_id uuid not null references public.exam_portals(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  published boolean not null default false,
  show_result boolean not null default true,
  available_from timestamptz,
  available_until timestamptz,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (portal_id, exam_id),
  constraint exam_portal_exam_window check (
    available_from is null or available_until is null or available_from < available_until
  )
);

create index exam_portal_members_user_idx on public.exam_portal_members (user_id, portal_id);
create index exam_portal_members_manager_idx on public.exam_portal_members (portal_id, member_role, user_id);
create index exam_portal_exams_exam_idx on public.exam_portal_exams (exam_id, portal_id);
create index exam_portal_exams_visible_idx on public.exam_portal_exams (portal_id, published, sort);

alter table public.exam_portals enable row level security;
alter table public.exam_portal_members enable row level security;
alter table public.exam_portal_exams enable row level security;

create or replace function private.is_portal_only_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exam_portal_members membership
    where membership.user_id = (select auth.uid())
      and membership.portal_only
  );
$$;

create or replace function private.can_manage_exam_portal(p_portal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_admin()) or exists (
    select 1
    from public.exam_portal_members membership
    where membership.portal_id = p_portal_id
      and membership.user_id = (select auth.uid())
      and membership.member_role in ('owner', 'manager')
  );
$$;

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
        )
      )
  );
$$;

create or replace function private.can_access_portal_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exam_questions eq
    where eq.question_id = p_question_id
      and (select private.can_access_portal_exam(eq.exam_id))
  );
$$;

create or replace function private.can_access_portal_attempt(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.attempts attempt
    where attempt.id = p_attempt_id
      and attempt.exam_id is not null
      and (
        attempt.student_id = (select auth.uid())
        or exists (
          select 1
          from public.exam_portal_exams assignment
          join public.exam_portal_members manager on manager.portal_id = assignment.portal_id
          join public.exam_portal_members student on student.portal_id = assignment.portal_id
          where assignment.exam_id = attempt.exam_id
            and student.user_id = attempt.student_id
            and manager.user_id = (select auth.uid())
            and manager.member_role in ('owner', 'manager')
        )
        or (select public.is_admin())
      )
  );
$$;

create or replace function private.can_view_portal_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1
      from public.exam_portal_members manager
      join public.exam_portal_members member on member.portal_id = manager.portal_id
      where manager.user_id = (select auth.uid())
        and manager.member_role in ('owner', 'manager')
        and member.user_id = p_profile_id
    );
$$;

revoke all on function private.is_portal_only_user() from public, anon;
revoke all on function private.can_manage_exam_portal(uuid) from public, anon;
revoke all on function private.can_access_portal_exam(uuid) from public, anon;
revoke all on function private.can_access_portal_question(uuid) from public, anon;
revoke all on function private.can_access_portal_attempt(uuid) from public, anon;
revoke all on function private.can_view_portal_profile(uuid) from public, anon;
grant execute on function private.is_portal_only_user() to authenticated;
grant execute on function private.can_manage_exam_portal(uuid) to authenticated;
grant execute on function private.can_access_portal_exam(uuid) to authenticated;
grant execute on function private.can_access_portal_question(uuid) to authenticated;
grant execute on function private.can_access_portal_attempt(uuid) to authenticated;
grant execute on function private.can_view_portal_profile(uuid) to authenticated;

create policy exam_portals_member_read
on public.exam_portals for select to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1 from public.exam_portal_members membership
    where membership.portal_id = exam_portals.id
      and membership.user_id = (select auth.uid())
  )
);

create policy exam_portals_admin_write
on public.exam_portals for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy exam_portal_members_scoped_read
on public.exam_portal_members for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.can_manage_exam_portal(portal_id))
);

create policy exam_portal_members_admin_write
on public.exam_portal_members for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy exam_portal_exams_scoped_read
on public.exam_portal_exams for select to authenticated
using (
  (select private.can_manage_exam_portal(portal_id))
  or (
    published
    and (available_from is null or available_from <= now())
    and (available_until is null or available_until >= now())
    and exists (
      select 1 from public.exam_portal_members membership
      where membership.portal_id = exam_portal_exams.portal_id
        and membership.user_id = (select auth.uid())
    )
  )
);

create policy exam_portal_exams_admin_write
on public.exam_portal_exams for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Portal users can read only exams explicitly assigned to their portal.
create policy exams_portal_assigned_read
on public.exams for select to authenticated
using ((select private.can_access_portal_exam(id)));

create policy exams_portal_only_scope
on public.exams as restrictive for select to authenticated
using (
  not (select private.is_portal_only_user())
  or (select private.can_access_portal_exam(id))
);

create policy exam_questions_portal_only_scope
on public.exam_questions as restrictive for select to authenticated
using (
  not (select private.is_portal_only_user())
  or (select private.can_access_portal_exam(exam_id))
);

create policy exam_questions_portal_assigned_read
on public.exam_questions for select to authenticated
using ((select private.can_access_portal_exam(exam_id)));

create policy questions_portal_only_scope
on public.questions as restrictive for select to authenticated
using (
  not (select private.is_portal_only_user())
  or (select private.can_access_portal_question(id))
);

create policy questions_portal_assigned_read
on public.questions for select to authenticated
using ((select private.can_access_portal_question(id)));

create policy attempts_portal_manager_read
on public.attempts for select to authenticated
using (
  exam_id is not null
  and (select private.can_access_portal_attempt(id))
);

create policy attempts_portal_only_scope
on public.attempts as restrictive for all to authenticated
using (
  not (select private.is_portal_only_user())
  or (
    exam_id is not null
    and (select private.can_access_portal_exam(exam_id))
  )
)
with check (
  not (select private.is_portal_only_user())
  or (
    student_id = (select auth.uid())
    and exam_id is not null
    and (select private.can_access_portal_exam(exam_id))
  )
);

create policy attempt_answers_portal_manager_read
on public.attempt_answers for select to authenticated
using ((select private.can_access_portal_attempt(attempt_id)));

create policy attempt_answers_portal_only_scope
on public.attempt_answers as restrictive for all to authenticated
using (
  not (select private.is_portal_only_user())
  or (select private.can_access_portal_attempt(attempt_id))
)
with check (
  not (select private.is_portal_only_user())
  or (select private.can_access_portal_attempt(attempt_id))
);

create policy profiles_portal_manager_read
on public.profiles for select to authenticated
using ((select private.can_view_portal_profile(id)));

create policy profiles_portal_only_scope
on public.profiles as restrictive for select to authenticated
using (
  not (select private.is_portal_only_user())
  or (select private.can_view_portal_profile(id))
);

create policy classes_portal_only_scope
on public.classes as restrictive for select to authenticated
using (not (select private.is_portal_only_user()));

create policy lessons_portal_only_scope
on public.lessons as restrictive for select to authenticated
using (not (select private.is_portal_only_user()));

grant select, insert, update, delete on public.exam_portals to authenticated;
grant select, insert, update, delete on public.exam_portal_members to authenticated;
grant select, insert, update, delete on public.exam_portal_exams to authenticated;

comment on table public.exam_portals is 'Partner-branded exam areas isolated from the main VinhMath navigation and staff role.';
comment on table public.exam_portal_members is 'Portal-scoped roles. Partner managers must not receive the broad profiles.role=teacher permission.';
comment on table public.exam_portal_exams is 'Published exam assignments for one partner portal.';

insert into public.exam_portals (slug, name, short_name, description, brand_id, is_active)
select
  'demo-doi-tac',
  'Cổng thi thử đối tác',
  'Thi thử',
  'Portal mẫu để kiểm tra giao diện và quy trình trước khi cấu hình thương hiệu thật.',
  brand.id,
  true
from public.brand_templates brand
where brand.slug = 'vinhmath'
on conflict (slug) do nothing;
