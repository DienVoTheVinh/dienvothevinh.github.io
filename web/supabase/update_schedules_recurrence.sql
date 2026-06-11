-- ============================================================
-- VINHMATH — THÊM CỘT LẶP LẠI LỊCH HỌC
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================

-- Thêm cột recurrence cho schedules nếu chưa có
alter table public.schedules 
add column if not exists recurrence text not null default 'weekly';

select 'Update schedules recurrence: OK' as ket_qua;
