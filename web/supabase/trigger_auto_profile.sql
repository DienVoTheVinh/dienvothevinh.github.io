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
    
    -- 3. Tự động nhận diện lớp học dựa vào đuôi username (ví dụ: nguyenvana.12a1 -> lớp 12)
    if position('.' in v_username) > 0 then
      v_class_name := upper(split_part(v_username, '.', 2));
      -- Trích xuất số lớp (ví dụ: 12A1 -> 12, LOP11 -> 11)
      declare
        v_grade text;
      begin
        v_grade := substring(v_class_name from '[0-9]+');
        if v_grade is not null and v_grade <> '' then
          select id into v_class_id from public.classes where name = 'Lớp ' || v_grade limit 1;
        end if;
        -- Nếu không tìm thấy, thử khớp chính xác tên lớp
        if v_class_id is null then
          select id into v_class_id from public.classes where upper(name) = v_class_name limit 1;
        end if;
      end;
    end if;
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
