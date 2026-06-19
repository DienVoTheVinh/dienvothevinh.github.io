-- ============================================================
-- VINHMATH — NÂNG CẤP LỚP HỌC HỢP TÁC (CO-TEACHING)
-- Chạy 1 lần trong Supabase > SQL Editor
-- ============================================================

-- 1. Bổ sung các cột lưu giáo viên vào bảng classes
alter table public.classes 
add column if not exists teacher_id uuid references public.profiles(id) on delete set null,
add column if not exists co_teacher_id uuid references public.profiles(id) on delete set null;

-- 2. Bổ sung cột lưu giáo viên giảng dạy bài học vào bảng lessons
alter table public.lessons
add column if not exists teacher_id uuid references public.profiles(id) on delete set null;

-- 3. Điền dữ liệu mặc định (Backfill) cho lớp và bài học cũ
do $$
declare
  v_default_teacher_id uuid;
begin
  -- Tìm tài khoản giáo viên/admin mặc định (Thầy Vinh)
  select id into v_default_teacher_id 
  from public.profiles 
  where username = 'thayvinh' or role = 'admin' 
  order by created_at asc 
  limit 1;
  
  if v_default_teacher_id is not null then
    -- Cập nhật lớp học cũ chưa có giáo viên
    update public.classes 
    set teacher_id = v_default_teacher_id 
    where teacher_id is null;
    
    -- Cập nhật bài học cũ chưa có giáo viên giảng dạy
    update public.lessons l
    set teacher_id = coalesce(c.teacher_id, v_default_teacher_id)
    from public.classes c
    where l.class_id = c.id and l.teacher_id is null;
  end if;
end $$;

select 'Co-teaching schema migration: OK' as ket_qua;
