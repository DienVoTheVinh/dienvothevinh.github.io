-- ============================================================
-- VINHMATH — BỔ SUNG THÔNG TIN CÁ NHÂN HỌC SINH & AVATAR STORAGE
-- Hướng dẫn: dán toàn bộ file này vào Supabase > SQL Editor > Run
-- ============================================================

-- 1. Thêm các cột thông tin chi tiết vào bảng profiles nếu chưa có
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists school text;
alter table public.profiles add column if not exists objective text;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists email text;

-- 2. Tạo kho lưu trữ ảnh đại diện (avatars) công khai
insert into storage.buckets (id, name, public) 
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 3. Thiết lập RLS policies cho kho avatars để bảo mật
-- Hủy các policy cũ nếu có để tránh trùng lặp
drop policy if exists "Allow avatar upload for owner" on storage.objects;
drop policy if exists "Allow avatar update for owner" on storage.objects;
drop policy if exists "Allow avatar delete for owner" on storage.objects;

-- Cho phép người dùng đăng nhập được tải ảnh lên thư mục trùng với ID của họ
create policy "Allow avatar upload for owner" on storage.objects 
  for insert to authenticated 
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Cho phép người dùng cập nhật ảnh trong thư mục của họ
create policy "Allow avatar update for owner" on storage.objects 
  for update to authenticated 
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Cho phép người dùng xóa ảnh trong thư mục của họ
create policy "Allow avatar delete for owner" on storage.objects 
  for delete to authenticated 
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

select 'Nâng cấp thông tin cá nhân & Avatar storage: OK' as ket_qua;
