-- ============================================================
-- VINHMATH — THÊM CỘT TEACHER_ID VÀO CLASS_SESSIONS (CO-TEACHING)
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================

-- 1. Bổ sung cột teacher_id vào bảng class_sessions
alter table public.class_sessions 
add column if not exists teacher_id uuid references public.profiles(id) on delete set null;

-- 2. Cập nhật teacher_id mặc định cho các buổi học cũ dựa trên giáo viên của lớp học
update public.class_sessions cs
set teacher_id = c.teacher_id
from public.classes c
where cs.class_id = c.id and cs.teacher_id is null;

select 'Class sessions teacher schema migration: OK' as ket_qua;
