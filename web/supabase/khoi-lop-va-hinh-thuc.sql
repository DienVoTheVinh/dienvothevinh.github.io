-- ============================================================
-- VINHMATH — LỚP HỌC THEO KHỐI + HÌNH THỨC (online/offline)
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================
alter table public.classes add column if not exists grade int;
alter table public.classes add column if not exists mode  text not null default 'offline';
alter table public.classes add column if not exists note  text;

-- Tự điền khối cho các lớp cũ dựa theo tên ("Lớp 7" -> 7)
update public.classes
set grade = nullif(substring(name from '[0-9]+'), '')::int
where grade is null;

select 'Khoi lop: OK' as ket_qua;
