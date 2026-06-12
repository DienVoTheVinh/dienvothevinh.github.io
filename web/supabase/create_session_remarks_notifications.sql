-- ============================================================
-- VINHMATH — TẠO BẢNG NHẬN XÉT BUỔI HỌC VÀ THÔNG BÁO
-- (Đã được khởi tạo trực tiếp trong CSDL)
-- ============================================================

-- 1. Tạo bảng Nhận xét theo buổi học (session_remarks)
create table if not exists public.session_remarks (
  id          uuid not null default gen_random_uuid() primary key,
  class_id    uuid not null references public.classes(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  ngay        date not null,
  remark      text not null,
  author_id   uuid references public.profiles(id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(class_id, student_id, ngay)
);

-- Bật bảo mật dòng (RLS) cho session_remarks
alter table public.session_remarks enable row level security;

-- Chính sách RLS cho session_remarks
drop policy if exists nx_staff_all on public.session_remarks;
drop policy if exists nx_hs_sel on public.session_remarks;

-- Thầy / Trợ giảng: được quyền làm mọi việc (xem, thêm, sửa, xóa)
create policy nx_staff_all on public.session_remarks for all 
  using (is_staff()) 
  with check (is_staff());

-- Học sinh: chỉ được quyền xem nhận xét dành riêng cho chính mình
create policy nx_hs_sel on public.session_remarks for select 
  using (student_id = auth.uid());


-- 2. Tạo bảng Thông báo (notifications)
create table if not exists public.notifications (
  id          uuid not null default gen_random_uuid() primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  kind        text,
  class_ref   uuid references public.classes(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Bật bảo mật dòng (RLS) cho notifications
alter table public.notifications enable row level security;

-- Chính sách RLS cho notifications
drop policy if exists noti_sel on public.notifications;
drop policy if exists noti_upd on public.notifications;
drop policy if exists noti_ins on public.notifications;

-- Người dùng xem thông báo của chính mình, hoặc thầy/trợ giảng xem được tất cả
create policy noti_sel on public.notifications for select 
  using ((user_id = auth.uid()) or is_staff());

-- Học sinh tự đánh dấu đã đọc thông báo của chính mình
create policy noti_upd on public.notifications for update 
  using (user_id = auth.uid()) 
  with check (user_id = auth.uid());

-- Chỉ thầy/trợ giảng được quyền gửi (tạo) thông báo
create policy noti_ins on public.notifications for insert 
  with check (is_staff());
