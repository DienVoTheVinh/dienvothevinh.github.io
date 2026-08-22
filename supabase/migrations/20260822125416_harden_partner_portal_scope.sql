-- Portal-only accounts cannot fall through permissive policies on the main
-- classroom product. The exam engine tables remain scoped by the first
-- migration; everything below is intentionally unavailable to these accounts.

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
        (
          attempt.student_id = (select auth.uid())
          and (
            not (select private.is_portal_only_user())
            or (select private.can_access_portal_exam(attempt.exam_id))
          )
        )
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

revoke all on function private.can_access_portal_attempt(uuid) from public, anon;
grant execute on function private.can_access_portal_attempt(uuid) to authenticated;

create policy class_students_portal_only_scope on public.class_students
as restrictive for all to authenticated
using (not (select private.is_portal_only_user()))
with check (not (select private.is_portal_only_user()));

create policy documents_portal_only_scope on public.documents
as restrictive for all to authenticated
using (not (select private.is_portal_only_user()))
with check (not (select private.is_portal_only_user()));

create policy topics_portal_only_scope on public.topics
as restrictive for all to authenticated
using (not (select private.is_portal_only_user()))
with check (not (select private.is_portal_only_user()));

create policy schedules_portal_only_scope on public.schedules
as restrictive for all to authenticated
using (not (select private.is_portal_only_user()))
with check (not (select private.is_portal_only_user()));

create policy submissions_portal_only_scope on public.submissions
as restrictive for all to authenticated
using (not (select private.is_portal_only_user()))
with check (not (select private.is_portal_only_user()));

create policy class_posts_portal_only_scope on public.class_posts
as restrictive for all to authenticated
using (not (select private.is_portal_only_user()))
with check (not (select private.is_portal_only_user()));

create policy student_lesson_progress_portal_only_scope on public.student_lesson_progress
as restrictive for all to authenticated
using (not (select private.is_portal_only_user()))
with check (not (select private.is_portal_only_user()));

create policy lesson_item_progress_portal_only_scope on public.lesson_item_progress
as restrictive for all to authenticated
using (not (select private.is_portal_only_user()))
with check (not (select private.is_portal_only_user()));

create policy class_sessions_portal_only_scope on public.class_sessions
as restrictive for all to authenticated
using (not (select private.is_portal_only_user()))
with check (not (select private.is_portal_only_user()));

create policy attendance_portal_only_scope on public.attendance
as restrictive for all to authenticated
using (not (select private.is_portal_only_user()))
with check (not (select private.is_portal_only_user()));
