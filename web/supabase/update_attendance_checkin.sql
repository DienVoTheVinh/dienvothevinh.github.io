-- ============================================================
-- VINHMATH — NÂNG CẤP CƠ CHẾ ĐIỂM DANH (MÃ SỐ + TRẠNG THÁI MỞ)
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================

-- Thêm cột checkin_code (mã số ngắn dễ nhập) vào class_sessions
alter table public.class_sessions 
add column if not exists checkin_code text;

-- Thêm cột attendance_open (trạng thái mở điểm danh) vào class_sessions
alter table public.class_sessions 
add column if not exists attendance_open boolean not null default false;

select 'Nang cap diem danh: OK' as ket_qua;
