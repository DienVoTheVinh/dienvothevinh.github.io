-- ============================================================
-- VINHMATH — SỔ NỘP BÀI & CHẤM BÀI
-- File trong Drive của thầy, sổ điểm ở đây.
-- ============================================================

create table if not exists public.submissions (
  id           uuid primary key default gen_random_uuid(),
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  files        jsonb not null default '[]'::jsonb,  -- file HS nộp: [{id,name,link}]
  status       text not null default 'submitted' check (status in ('submitted','graded')),
  score        numeric(4,2),                        -- điểm thang 10
  feedback     text,                                -- lời phê của thầy
  graded_files jsonb not null default '[]'::jsonb,  -- file thầy chấm trả lại
  graded_at    timestamptz
);

alter table public.submissions enable row level security;
drop policy if exists sub_staff    on public.submissions;
drop policy if exists sub_self_sel on public.submissions;
-- Thầy/trợ giảng: toàn quyền (xem, chấm, sửa)
create policy sub_staff on public.submissions for all using (is_staff()) with check (is_staff());
-- Học sinh: chỉ xem bài của chính mình (việc NỘP đi qua trạm trung chuyển)
create policy sub_self_sel on public.submissions for select using (student_id = auth.uid());

select 'So nop bai: OK' as ket_qua;
