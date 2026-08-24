-- Apply only after every frontend consumer has moved to the sanitized exam RPCs
-- and short-lived signed course-asset URLs.

-- Direct exam rows and question answer keys are staff-only. Student-facing code
-- must use the sanitized functions above.
drop policy if exists s_exams on public.exams;
drop policy if exists t_exams_read on public.exams;
drop policy if exists p_exams_parent on public.exams;
drop policy if exists exams_portal_assigned_read on public.exams;
drop policy if exists exams_staff_read on public.exams;
create policy exams_staff_read on public.exams for select to authenticated using (public.is_staff());

drop policy if exists s_quest on public.questions;
drop policy if exists t_quest_read on public.questions;
drop policy if exists questions_portal_assigned_read on public.questions;
drop policy if exists questions_staff_read on public.questions;
create policy questions_staff_read on public.questions for select to authenticated using (public.is_staff());
drop policy if exists questions_lesson_student_read on public.questions;
create policy questions_lesson_student_read on public.questions for select to authenticated using (
  exists (
    select 1
    from public.lesson_questions lq
    join public.lessons l on l.id = lq.lesson_id
    join public.class_students cs on cs.class_id = l.class_id
    where lq.question_id = questions.id
      and l.published
      and cs.student_id = auth.uid()
  )
);

drop policy if exists s_att_ins on public.attempts;
drop policy if exists s_att_upd on public.attempts;
drop policy if exists s_ans_ins on public.attempt_answers;
drop policy if exists s_ans_upd on public.attempt_answers;
drop policy if exists s_ans_sel on public.attempt_answers;
create policy s_ans_sel on public.attempt_answers for select to authenticated using (
  exists (
    select 1 from public.attempts a
    where a.id = attempt_answers.attempt_id
      and a.student_id = auth.uid()
      and a.submitted_at is not null
  )
);

-- No anonymous course catalogue or document metadata. Global documents remain
-- available to signed-in users, while class documents require enrollment.
drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons for select to authenticated using (
  public.is_staff()
  or (
    published and not locked
    and coalesce(public.video_mode(), 'class') <> 'locked'
    and (
      coalesce(public.video_mode(), 'class') = 'open'
      or exists (
        select 1 from public.class_students cs
        where cs.student_id = auth.uid() and cs.class_id = lessons.class_id
      )
    )
  )
);

drop policy if exists s_docs on public.documents;
drop policy if exists t_docs_read on public.documents;
drop policy if exists documents_authenticated_read on public.documents;
create policy documents_authenticated_read on public.documents for select to authenticated using (
  public.is_staff()
  or class_id is null
  or exists (
    select 1 from public.class_students cs
    where cs.student_id = auth.uid() and cs.class_id = documents.class_id
  )
);

drop policy if exists s_profiles_staff_read on public.profiles;
create policy s_profiles_staff_read on public.profiles for select to authenticated using (
  role = any(array['admin'::text, 'teacher'::text, 'assistant'::text])
);

revoke all on table public.lessons, public.documents, public.exams,
  public.questions, public.exam_questions, public.attempts, public.attempt_answers
from anon;

-- Course assets are private. Authenticated users receive short-lived signed URLs
-- only after RLS has allowed them to read the containing lesson/document row.
update storage.buckets set public = false where id in ('tai-lieu', 'hinh-anh');

drop policy if exists course_assets_authenticated_read on storage.objects;
create policy course_assets_authenticated_read
on storage.objects for select to authenticated
using (
  bucket_id in ('tai-lieu', 'hinh-anh')
  and private.vm_can_read_course_asset(bucket_id, name)
);
