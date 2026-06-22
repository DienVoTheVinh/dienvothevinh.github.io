-- ============================================================
-- VINHMATH — CHO PHÉP HỌC SINH XEM HỒ SƠ GIÁO VIÊN & TRỢ GIẢNG
-- Hướng dẫn: Mở Supabase > SQL Editor > Paste đoạn code này và bấm Run.
-- ============================================================

-- Cho phép học sinh đọc thông tin của giáo viên, trợ giảng, admin để hiển thị tên chính xác trên giao diện học tập
drop policy if exists s_profiles_staff_read on public.profiles;

create policy s_profiles_staff_read on public.profiles
  for select
  using (role in ('admin', 'teacher', 'assistant'));
