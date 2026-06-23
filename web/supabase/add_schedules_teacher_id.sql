-- ============================================================
-- VINHMATH — BỔ SUNG GIÁO VIÊN VÀO THỜI KHÓA BIỂU (SCHEDULES)
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================

-- 1. Bổ sung cột teacher_id vào bảng schedules tham chiếu đến bảng profiles
alter table public.schedules 
add column if not exists teacher_id uuid references public.profiles(id) on delete set null;

-- 2. Backfill dữ liệu cũ: Mặc định gán giáo viên chính của lớp cho các lịch học đã có
update public.schedules s
set teacher_id = c.teacher_id
from public.classes c
where s.class_id = c.id and s.teacher_id is null;

select 'Schedules teacher_id migration: OK' as ket_qua;
