-- ============================================================
-- TRIGGER TỰ ĐỘNG TẠO HỒ SƠ (PROFILES) KHI TẠO USER TRÊN SUPABASE
-- Cách dùng: vào Supabase > SQL Editor > Bấm New Query > Dán toàn bộ code này > Run
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
  
  -- 2. Xác định vai trò và họ tên
  if v_username = 'thayvinh' then
    v_role := 'teacher';
    v_full_name := 'Thầy Vinh';
  else
    v_role := 'student';
    -- Ưu tiên lấy tên đầy đủ từ ô Display Name lúc tạo user, nếu trống thì tự dịch từ username
    v_full_name := coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'display_name',
      initcap(replace(split_part(v_username, '.', 1), '-', ' '))
    );
    
    -- 3. Không tự xếp lớp qua username nữa (Thầy Vinh sẽ xếp lớp thủ công trên web)
    v_class_id := null;
  end if;

  -- 4. Chèn vào bảng profiles
  insert into public.profiles (id, role, username, full_name, class_id)
  values (new.id, v_role, v_username, v_full_name, v_class_id)
  on conflict (id) do update 
  set role = excluded.role, 
      username = excluded.username, 
      full_name = excluded.full_name,
      class_id = excluded.class_id;
      
  return new;
end;
$$ language plpgsql security definer;

-- Tạo trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
