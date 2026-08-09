-- Per-exam answer-PDF access control.
-- Students need both teacher approval and a submitted first attempt.

alter table public.exams
  add column if not exists allow_solution_pdf boolean not null default false;

comment on column public.exams.allow_solution_pdf is
  'Teacher-controlled switch. Students may download the answer PDF only after their first submitted attempt.';

create index if not exists attempts_student_exam_submitted_idx
  on public.attempts (student_id, exam_id, submitted_at)
  where exam_id is not null and submitted_at is not null;

create or replace function public.can_download_exam_solution(p_exam_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when public.is_staff() then exists (
      select 1
      from public.exams e
      where e.id = p_exam_id
    )
    else exists (
      select 1
      from public.exams e
      where e.id = p_exam_id
        and e.allow_solution_pdf is true
        and exists (
          select 1
          from public.attempts a
          where a.exam_id = e.id
            and a.student_id = auth.uid()
            and a.submitted_at is not null
        )
    )
  end;
$$;

comment on function public.can_download_exam_solution(uuid) is
  'Server-side answer-PDF gate: staff may preview; students need teacher approval and a submitted attempt.';

revoke all on function public.can_download_exam_solution(uuid) from public, anon;
grant execute on function public.can_download_exam_solution(uuid) to authenticated;
