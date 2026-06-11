-- ============================================================
-- VINHMATH — LINK GOOGLE MEET RIÊNG TỪNG LỚP
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================
create table if not exists public.class_links (
  class_id  uuid primary key references public.classes(id) on delete cascade,
  meet_link text not null default ''
);
alter table public.class_links enable row level security;
drop policy if exists cl_staff   on public.class_links;
drop policy if exists cl_student on public.class_links;
-- Giáo viên/trợ giảng: toàn quyền. Học sinh: chỉ xem link của lớp mình.
create policy cl_staff   on public.class_links for all using (is_staff()) with check (is_staff());
create policy cl_student on public.class_links for select using (class_id = my_class());
select 'Meet theo lop: OK' as ket_qua;
