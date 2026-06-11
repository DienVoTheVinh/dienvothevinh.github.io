-- ============================================================
-- VINHMATH — CẬP NHẬT LÝ THUYẾT TƯƠNG TÁC & GIÁM SÁT TIẾN ĐỘ
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================

-- 1. Thêm cột theory_sections vào bảng lessons nếu chưa có
alter table public.lessons add column if not exists theory_sections jsonb;

-- 2. Tạo bảng giám sát tiến độ đọc lý thuyết của học sinh
create table if not exists public.student_lesson_progress (
  student_id        uuid not null references public.profiles(id) on delete cascade,
  lesson_id         uuid not null references public.lessons(id) on delete cascade,
  unlocked_section  int not null default 0,
  completed_at      timestamptz,
  answers           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

-- 3. Kích hoạt bảo mật dòng RLS
alter table public.student_lesson_progress enable row level security;

-- 4. Định nghĩa chính sách bảo mật RLS cho bảng mới
drop policy if exists t_progress on public.student_lesson_progress;
drop policy if exists s_progress_ins on public.student_lesson_progress;
drop policy if exists s_progress_sel on public.student_lesson_progress;
drop policy if exists s_progress_upd on public.student_lesson_progress;

-- Thầy cô / Admin: Có toàn quyền xem và sửa tiến trình học của toàn bộ học sinh
create policy t_progress on public.student_lesson_progress for all 
  using (is_teacher()) 
  with check (is_teacher());

-- Học sinh: Chỉ có quyền xem, tạo và cập nhật tiến độ đọc bài của chính mình
create policy s_progress_ins on public.student_lesson_progress for insert 
  with check (student_id = auth.uid());

create policy s_progress_sel on public.student_lesson_progress for select 
  using (student_id = auth.uid());

create policy s_progress_upd on public.student_lesson_progress for update 
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- 5. Trigger tự động cập nhật cột updated_at khi có chỉnh sửa
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_progress_updated on public.student_lesson_progress;
create trigger on_progress_updated
  before update on public.student_lesson_progress
  for each row execute procedure public.handle_updated_at();

select 'Database update for theory progress: OK' as ket_qua;
