-- ============================================================
-- VINHMATH — CẬP NHẬT TRIGGER PHÂN VAI TRÒ THEO TÊN MIỀN EMAIL
-- Hướng dẫn: Mở Supabase > SQL Editor > Paste đoạn code này và bấm Run.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_username text;
  v_role text;
  v_full_name text;
  v_class_name text;
  v_class_id uuid;
begin
  -- 1. Trích xuất phần trước dấu @ làm username
  v_username := split_part(new.email, '@', 1);
  
  -- 2. Xác định vai trò dựa trên tiền tố username hoặc đuôi tên miền email
  if v_username = 'thayvinh' 
     or new.email = 'dienvothevinh29@gmail.com' 
     or v_username like 'admin.%' 
     or new.email like '%@admin.vinhmath%' then
    v_role := 'admin';
    v_full_name := coalesce(new.raw_user_meta_data->>'full_name', 'Thầy Vinh (Admin)');
    
  elsif v_username like 'gv.%' 
        or v_username like 'teacher.%' 
        or new.email like '%@gv.vinhmath%' 
        or new.email like '%@teacher.vinhmath%' then
    v_role := 'teacher';
    v_full_name := coalesce(
      new.raw_user_meta_data->>'full_name',
      'Giáo viên ' || initcap(replace(replace(v_username, 'gv.', ''), 'teacher.', ''))
    );
    
  elsif v_username like 'tg.%' 
        or v_username like 'trogiang.%' 
        or v_username like 'assistant.%' 
        or new.email like '%@tg.vinhmath%' 
        or new.email like '%@trogiang.vinhmath%' 
        or new.email like '%@assistant.vinhmath%' then
    v_role := 'assistant';
    v_full_name := coalesce(
      new.raw_user_meta_data->>'full_name',
      'Trợ giảng ' || initcap(replace(replace(replace(v_username, 'tg.', ''), 'trogiang.', ''), 'assistant.', ''))
    );
    
  else
    v_role := 'student';
    v_full_name := coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'display_name',
      initcap(replace(split_part(v_username, '.', 1), '-', ' '))
    );
  end if;

  -- 3. Chèn hoặc cập nhật bảng profiles
  insert into public.profiles (id, role, username, full_name, class_id)
  values (new.id, v_role, v_username, v_full_name, null)
  on conflict (id) do update 
  set role = excluded.role, 
      username = excluded.username, 
      full_name = excluded.full_name;
      
  return new;
end;
$$ language plpgsql security definer;
