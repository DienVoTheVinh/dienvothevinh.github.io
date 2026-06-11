-- ============================================================
-- VINHMATH — NÂNG CẤP XẾP LỚP (MỘT HỌC SINH VÀO NHIỀU LỚP)
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================

-- 1. Tạo bảng trung gian class_students nếu chưa có
create table if not exists public.class_students (
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- 2. Di chuyển dữ liệu phân lớp hiện tại từ profiles vào class_students
insert into public.class_students (class_id, student_id)
select class_id, id from public.profiles
where class_id is not null and role = 'student'
on conflict do nothing;

-- 3. Cấu hình bảo mật RLS cho bảng class_students
alter table public.class_students enable row level security;
drop policy if exists cs_staff   on public.class_students;
drop policy if exists cs_student on public.class_students;

create policy cs_staff   on public.class_students for all using (is_staff()) with check (is_staff());
create policy cs_student on public.class_students for select using (student_id = auth.uid());

-- 4. Định nghĩa lại hàm my_class() trả về lớp đầu tiên của học sinh (để tương thích ngược)
create or replace function public.my_class() returns uuid
language sql stable security definer set search_path = public as
$$ 
  select class_id from public.class_students 
  where student_id = auth.uid() 
  order by created_at asc 
  limit 1 
$$;

-- 5. Cập nhật các chính sách RLS liên quan đến lớp của Học sinh
-- RLS cho class_sessions
drop policy if exists s_sess on public.class_sessions;
create policy s_sess on public.class_sessions for select 
  using (exists(select 1 from public.class_students cs where cs.student_id = auth.uid() and cs.class_id = class_sessions.class_id));

-- RLS cho lessons
drop policy if exists s_lessons on public.lessons;
create policy s_lessons on public.lessons for select
  using (published and exists(select 1 from public.class_students cs where cs.student_id = auth.uid() and cs.class_id = lessons.class_id));

drop policy if exists s_lq on public.lesson_questions;
create policy s_lq on public.lesson_questions for select
  using (exists(select 1 from public.lessons l join public.class_students cs on cs.class_id = l.class_id where l.id = lesson_id and l.published and cs.student_id = auth.uid()));

-- RLS cho exams
drop policy if exists s_exams on public.exams;
create policy s_exams on public.exams for select
  using (published and (class_id is null or exists(select 1 from public.class_students cs where cs.student_id = auth.uid() and cs.class_id = exams.class_id)));

drop policy if exists s_eq on public.exam_questions;
create policy s_eq on public.exam_questions for select
  using (exists(select 1 from public.exams e left join public.class_students cs on cs.class_id = e.class_id where e.id = exam_id and e.published and (e.class_id is null or cs.student_id = auth.uid())));

-- RLS cho questions
drop policy if exists s_quest on public.questions;
create policy s_quest on public.questions for select using (
  exists(select 1 from public.lesson_questions lq join public.lessons l on l.id = lq.lesson_id join public.class_students cs on cs.class_id = l.class_id
         where lq.question_id = questions.id and l.published and cs.student_id = auth.uid())
  or
  exists(select 1 from public.exam_questions eq join public.exams e on e.id = eq.exam_id left join public.class_students cs on cs.class_id = e.class_id
         where eq.question_id = questions.id and e.published and (e.class_id is null or cs.student_id = auth.uid()))
);

-- RLS cho documents
drop policy if exists s_docs on public.documents;
create policy s_docs on public.documents for select
  using (class_id is null or exists(select 1 from public.class_students cs where cs.student_id = auth.uid() and cs.class_id = documents.class_id));

-- RLS cho class_links
drop policy if exists cl_student on public.class_links;
create policy cl_student on public.class_links for select
  using (exists(select 1 from public.class_students cs where cs.student_id = auth.uid() and cs.class_id = class_links.class_id));

select 'Update many-to-many classes: OK' as ket_qua;
