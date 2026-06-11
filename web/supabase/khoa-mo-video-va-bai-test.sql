-- ============================================================
-- VINHMATH — BÀI TEST CUỐI GIỜ + KHOÁ/MỞ VIDEO TOÀN HỆ THỐNG
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================

-- 1. Bài test cuối giờ đính kèm bài giảng (PDF từ kho tài liệu)
alter table public.lessons add column if not exists test_document_id uuid references public.documents(id) on delete set null;

-- 2. Khoá riêng từng bài giảng
alter table public.lessons add column if not exists locked boolean not null default false;

-- 3. Bảng cài đặt chung của hệ thống
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
insert into public.app_settings (key, value) values ('video_mode', 'class')
on conflict (key) do nothing;
-- video_mode: 'class' = HS chỉ xem bài của lớp mình (mặc định)
--             'open'  = mọi HS xem được mọi bài đã xuất bản
--             'locked'= khoá toàn bộ — không HS nào xem được bài giảng

alter table public.app_settings enable row level security;
drop policy if exists settings_read  on public.app_settings;
drop policy if exists settings_write on public.app_settings;
create policy settings_read  on public.app_settings for select using (true);
create policy settings_write on public.app_settings for all using (is_admin()) with check (is_admin());

-- Hàm đọc chế độ video hiện tại
create or replace function public.video_mode() returns text
language sql stable security definer set search_path = public as
$$ select coalesce((select value from public.app_settings where key = 'video_mode'), 'class') $$;

-- 4. Cập nhật quyền xem bài giảng của học sinh theo chế độ
drop policy if exists t_lessons_read on public.lessons;
create policy t_lessons_read on public.lessons for select using (
  is_staff()
  or (
    published
    and not locked
    and video_mode() <> 'locked'
    and (video_mode() = 'open' or class_id = my_class())
  )
);

select 'Nang cap bai test + khoa/mo video: OK' as ket_qua;
