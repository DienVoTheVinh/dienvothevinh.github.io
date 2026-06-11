-- ============================================================
-- VINHMATH — LỊCH HỌC ĐỊNH KỲ + LINK GOOGLE MEET
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================

-- Thời khóa biểu định kỳ theo lớp (hiện công khai cho phụ huynh nếu visible)
create table if not exists public.schedules (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  weekday    int  not null check (weekday between 1 and 7), -- 1=Thứ 2 … 7=Chủ nhật
  start_time time not null,
  end_time   time not null,
  mode       text not null default 'online' check (mode in ('online','offline')),
  location   text,      -- 'Google Meet' hoặc địa chỉ phòng học
  note       text,      -- 'Còn nhận HS', 'Đã đầy'…
  visible    boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.schedules enable row level security;
drop policy if exists sch_read  on public.schedules;
drop policy if exists sch_write on public.schedules;
-- Ai cũng đọc được lịch công khai (kể cả chưa đăng nhập — cho trang chủ)
create policy sch_read  on public.schedules for select using (visible or is_staff());
create policy sch_write on public.schedules for all using (is_teacher()) with check (is_teacher());

-- Link Google Meet cố định của thầy (admin sửa trên web)
insert into public.app_settings (key, value) values ('meet_link', '')
on conflict (key) do nothing;

select 'Lich hoc + Meet: OK' as ket_qua;
