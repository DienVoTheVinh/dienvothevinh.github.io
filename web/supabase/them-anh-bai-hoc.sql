-- ============================================================
-- VINHMATH — THÊM ẢNH BUỔI HỌC VÀO BÀI GIẢNG
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================

-- Cột chứa danh sách ảnh của bài học (mảng đường dẫn file)
alter table public.lessons add column if not exists images jsonb not null default '[]'::jsonb;

-- Kho chứa ảnh (công khai để HS xem được)
insert into storage.buckets (id, name, public) values ('hinh-anh','hinh-anh', true)
on conflict (id) do nothing;

-- Quyền: chỉ giáo viên/admin được thêm-sửa-xoá ảnh
drop policy if exists img_up  on storage.objects;
drop policy if exists img_upd on storage.objects;
drop policy if exists img_del on storage.objects;
create policy img_up  on storage.objects for insert to authenticated with check (bucket_id = 'hinh-anh' and is_teacher());
create policy img_upd on storage.objects for update to authenticated using (bucket_id = 'hinh-anh' and is_teacher());
create policy img_del on storage.objects for delete to authenticated using (bucket_id = 'hinh-anh' and is_teacher());

select 'Nâng cấp ảnh bài học: OK' as ket_qua;
