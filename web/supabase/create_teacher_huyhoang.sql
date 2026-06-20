-- ============================================================
-- VINHMATH — TẠO TÀI KHOẢN GIÁO VIÊN ĐẬU VĂN HUY HOÀNG
-- Hướng dẫn: Mở Supabase > SQL Editor > Paste toàn bộ code này và bấm Run.
-- ============================================================

-- 1. DỌN DẸP TÀI KHOẢN TRÙNG LẶP CŨ (NẾU CÓ)
DELETE FROM auth.users WHERE email = 'dauvanhuyhoang@gv.vinhmath' OR email = 'dauvanhuyhoang@gv.vinhmath.com';
DELETE FROM public.profiles WHERE username = 'dauvanhuyhoang';

-- 2. TẠO MỚI TÀI KHOẢN GIÁO VIÊN VỚI ĐÔI .COM NGẦM
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'dauvanhuyhoang@gv.vinhmath.com',
  crypt('HuyHoang_VinhMath2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Thầy Đậu Văn Huy Hoàng"}',
  now(),
  now()
);
