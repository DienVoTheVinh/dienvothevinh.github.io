-- ============================================================
-- VINHMATH — NÂNG CẤP PHÂN QUYỀN 4 VAI TRÒ & HỆ THỐNG GIÁM SÁT
-- Hướng dẫn: dán toàn bộ file này vào Supabase > SQL Editor > Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. TẠO CÁC BẢNG LƯU TRỮ PHÂN TÍCH TRUY CẬP (ANALYTICS)
-- ------------------------------------------------------------
-- Thêm cột liên kết tài liệu PDF vào bảng bài học
alter table public.lessons add column if not exists document_id uuid references public.documents(id) on delete set null;

create table if not exists public.analytics_sessions (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid references public.profiles(id) on delete set null,
  session_key      text not null unique,
  device_type      text not null,
  os               text not null,
  browser          text not null,
  user_agent       text not null,
  started_at       timestamptz not null default now(),
  last_active_at   timestamptz not null default now(),
  duration_seconds int not null default 0
);

create table if not exists public.analytics_page_views (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references public.analytics_sessions(id) on delete cascade,
  page_path   text not null,
  referrer    text,
  viewed_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. CẬP NHẬT RÀNG BUỘC VAI TRÒ TRÊN BẢNG PROFILES
-- ------------------------------------------------------------
-- Tự động tìm và xóa mọi ràng buộc CHECK cũ trên cột role để tránh lỗi xung đột
do $$
declare
    r record;
begin
    for r in 
        select conname 
        from pg_constraint 
        where conrelid = 'public.profiles'::regclass 
          and contype = 'c' 
          and pg_get_constraintdef(oid) like '%role%'
    loop
        execute 'alter table public.profiles drop constraint ' || quote_ident(r.conname);
    end loop;
end;
$$;

-- Thêm ràng buộc mới cho phép cả 4 vai trò
alter table public.profiles 
  add constraint profiles_role_check check (role in ('admin', 'teacher', 'assistant', 'student'));

-- ------------------------------------------------------------
-- 3. ĐỊNH NGHĨA CÁC HÀM KIỂM TRA QUYỀN TRÊN SUPABASE
-- ------------------------------------------------------------

-- Hàm 1: Kiểm tra Admin (Thầy Vinh - Toàn quyền)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Hàm 2: Kiểm tra Giáo viên (Gồm cả Admin và Giáo viên đồng nghiệp)
create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin', 'teacher'));
$$;

-- Hàm 3: Kiểm tra Ban quản lý / Nhân sự (Gồm Admin, Giáo viên, Trợ giảng)
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin', 'teacher', 'assistant'));
$$;

-- ------------------------------------------------------------
-- 4. CẬP NHẬT LẠI TRIGGER TỰ ĐỘNG PHÂN VAI TRÒ THEO EMAIL
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_username text;
  v_role text;
  v_full_name text;
  v_class_name text;
  v_class_id uuid;
begin
  -- Trích xuất phần trước dấu @ làm username
  v_username := split_part(new.email, '@', 1);
  
  -- Xác định vai trò dựa trên tiền tố username hoặc email
  if v_username = 'thayvinh' or new.email = 'dienvothevinh29@gmail.com' or v_username like 'admin.%' then
    v_role := 'admin';
    v_full_name := coalesce(new.raw_user_meta_data->>'full_name', 'Thầy Vinh (Admin)');
  elsif v_username like 'gv.%' or v_username like 'teacher.%' then
    v_role := 'teacher';
    v_full_name := coalesce(
      new.raw_user_meta_data->>'full_name',
      'Giáo viên ' || initcap(replace(replace(v_username, 'gv.', ''), 'teacher.', ''))
    );
  elsif v_username like 'tg.%' or v_username like 'trogiang.%' or v_username like 'assistant.%' then
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
    
    -- Tự động tìm lớp học dựa vào đuôi username (ví dụ: nguyenvana.12a1 -> lớp 12)
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

  -- Chèn hoặc cập nhật bảng profiles
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

-- ------------------------------------------------------------
-- 5. THIẾT LẬP CHÍNH SÁCH BẢO MẬT (RLS POLICIES) TRÊN CÁC BẢNG
-- ------------------------------------------------------------

-- Bật RLS cho các bảng phân tích
alter table public.analytics_sessions enable row level security;
alter table public.analytics_page_views enable row level security;

-- Hủy tất cả chính sách cũ trước khi tạo mới (để tránh trùng lặp)
drop policy if exists t_classes on public.classes;
drop policy if exists t_classes_write on public.classes;
drop policy if exists t_classes_read on public.classes;
drop policy if exists t_profiles on public.profiles;
drop policy if exists t_profiles_write on public.profiles;
drop policy if exists t_profiles_read on public.profiles;
drop policy if exists s_profile on public.profiles;
drop policy if exists s_profile_self on public.profiles;
drop policy if exists t_topics on public.topics;
drop policy if exists s_topics on public.topics;
drop policy if exists t_topics_write on public.topics;
drop policy if exists t_topics_read on public.topics;
drop policy if exists t_quest on public.questions;
drop policy if exists t_quest_write on public.questions;
drop policy if exists t_quest_read on public.questions;
drop policy if exists s_quest on public.questions;
drop policy if exists t_lessons on public.lessons;
drop policy if exists t_lessons_write on public.lessons;
drop policy if exists t_lessons_read on public.lessons;
drop policy if exists s_lessons on public.lessons;
drop policy if exists t_lq on public.lesson_questions;
drop policy if exists t_lq_write on public.lesson_questions;
drop policy if exists t_lq_read on public.lesson_questions;
drop policy if exists s_lq on public.lesson_questions;
drop policy if exists t_exams on public.exams;
drop policy if exists t_exams_write on public.exams;
drop policy if exists t_exams_read on public.exams;
drop policy if exists s_exams on public.exams;
drop policy if exists t_eq on public.exam_questions;
drop policy if exists t_eq_write on public.exam_questions;
drop policy if exists t_eq_read on public.exam_questions;
drop policy if exists s_eq on public.exam_questions;
drop policy if exists t_att on public.attempts;
drop policy if exists t_att_all on public.attempts;
drop policy if exists s_att_ins on public.attempts;
drop policy if exists s_att_sel on public.attempts;
drop policy if exists s_att_upd on public.attempts;
drop policy if exists t_ans on public.attempt_answers;
drop policy if exists t_ans_all on public.attempt_answers;
drop policy if exists s_ans_ins on public.attempt_answers;
drop policy if exists s_ans_sel on public.attempt_answers;
drop policy if exists t_sess on public.class_sessions;
drop policy if exists t_sess_all on public.class_sessions;
drop policy if exists s_sess on public.class_sessions;
drop policy if exists s_sess_read on public.class_sessions;
drop policy if exists t_attend on public.attendance;
drop policy if exists t_attend_all on public.attendance;
drop policy if exists s_attend_ins on public.attendance;
drop policy if exists s_attend_sel on public.attendance;
drop policy if exists t_docs on public.documents;
drop policy if exists t_docs_write on public.documents;
drop policy if exists t_docs_read on public.documents;
drop policy if exists s_docs on public.documents;
drop policy if exists allow_insert_sessions on public.analytics_sessions;
drop policy if exists allow_update_sessions on public.analytics_sessions;
drop policy if exists allow_insert_views on public.analytics_page_views;
drop policy if exists allow_select_admin_sessions on public.analytics_sessions;
drop policy if exists allow_select_admin_views on public.analytics_page_views;

-- ** BẢNG: analytics_sessions & analytics_page_views (Giám sát truy cập) **
-- Cho phép mọi người chèn lượt truy cập và cập nhật thời lượng phiên
create policy allow_insert_sessions on public.analytics_sessions for insert with check (true);
create policy allow_update_sessions on public.analytics_sessions for update using (true) with check (true);
create policy allow_insert_views on public.analytics_page_views for insert with check (true);
-- Chỉ duy nhất ADMIN (Thầy Vinh) mới được xem dữ liệu phân tích hệ thống
create policy allow_select_admin_sessions on public.analytics_sessions for select using (is_admin());
create policy allow_select_admin_views on public.analytics_page_views for select using (is_admin());

-- ** BẢNG: classes (Lớp học) **
create policy t_classes_write on public.classes for all using (is_teacher()) with check (is_teacher()); -- Giáo viên quản lý lớp
create policy t_classes_read  on public.classes for select using (true); -- Mọi tài khoản đều được xem

-- ** BẢNG: profiles (Tài khoản) **
create policy t_profiles_write on public.profiles for all using (is_admin()) with check (is_admin()); -- Chỉ Admin được tạo/xóa tài khoản
create policy t_profiles_read  on public.profiles for select using (is_staff()); -- GV và Trợ giảng được xem danh sách
create policy s_profile_self    on public.profiles for all using (id = auth.uid()); -- Tự xem/sửa thông tin mình

-- ** BẢNG: topics & questions (Chuyên đề & Câu hỏi) **
create policy t_topics_write on public.topics for all using (is_teacher()) with check (is_teacher());
create policy t_topics_read  on public.topics for select using (true);
create policy t_quest_write on public.questions for all using (is_teacher()) with check (is_teacher()); -- Chỉ Giáo viên được thêm/sửa câu hỏi
create policy t_quest_read  on public.questions for select using (
  is_staff() or
  exists(select 1 from public.lesson_questions lq join public.lessons l on l.id = lq.lesson_id where lq.question_id = questions.id and l.published and l.class_id = my_class()) or
  exists(select 1 from public.exam_questions eq join public.exams e on e.id = eq.exam_id where eq.question_id = questions.id and e.published and (e.class_id is null or e.class_id = my_class()))
);

-- ** BẢNG: lessons & lesson_questions (Bài giảng) **
create policy t_lessons_write on public.lessons for all using (is_teacher()) with check (is_teacher()); -- Chỉ Giáo viên được thêm/sửa/xóa bài giảng (Trợ giảng không có quyền)
create policy t_lessons_read  on public.lessons for select using (is_staff() or (published and class_id = my_class()));
create policy t_lq_write on public.lesson_questions for all using (is_teacher()) with check (is_teacher());
create policy t_lq_read  on public.lesson_questions for select using (
  is_staff() or 
  exists(select 1 from public.lessons l where l.id = lesson_id and l.published and l.class_id = my_class())
);

-- ** BẢNG: exams & exam_questions (Kiểm tra / Đề thi) **
create policy t_exams_write on public.exams for all using (is_teacher()) with check (is_teacher()); -- Chỉ Giáo viên được quản lý đề kiểm tra (Trợ giảng không được phép)
create policy t_exams_read  on public.exams for select using (is_staff() or (published and (class_id is null or class_id = my_class())));
create policy t_eq_write on public.exam_questions for all using (is_teacher()) with check (is_teacher());
create policy t_eq_read  on public.exam_questions for select using (
  is_staff() or 
  exists(select 1 from public.exams e where e.id = exam_id and e.published and (e.class_id is null or e.class_id = my_class()))
);

-- ** BẢNG: attempts & attempt_answers (Kết quả làm bài) **
create policy t_att_all on public.attempts for all using (is_staff()) with check (is_staff()); -- GV/Trợ giảng xem kết quả chấm điểm
create policy s_att_ins on public.attempts for insert with check (student_id = auth.uid()); -- Học sinh làm bài
create policy s_att_sel on public.attempts for select using (student_id = auth.uid());
create policy s_att_upd on public.attempts for update using (student_id = auth.uid() and submitted_at is null);
create policy t_ans_all on public.attempt_answers for all using (is_staff()) with check (is_staff());
create policy s_ans_ins on public.attempt_answers for insert with check (exists(select 1 from public.attempts a where a.id = attempt_id and a.student_id = auth.uid()));
create policy s_ans_sel on public.attempt_answers for select using (exists(select 1 from public.attempts a where a.id = attempt_id and a.student_id = auth.uid()));

-- ** BẢNG: class_sessions & attendance (Điểm danh chuyên cần) **
create policy t_sess_all on public.class_sessions for all using (is_staff()) with check (is_staff()); -- GV và Trợ giảng tạo buổi học, điểm danh
create policy s_sess_read on public.class_sessions for select using (class_id = my_class());
create policy t_attend_all on public.attendance for all using (is_staff()) with check (is_staff());
create policy s_attend_ins on public.attendance for insert with check (student_id = auth.uid()); -- HS tự quét QR điểm danh
create policy s_attend_sel on public.attendance for select using (student_id = auth.uid());

-- ** BẢNG: documents (Kho tài liệu PDF) **
create policy t_docs_write on public.documents for all using (is_teacher()) with check (is_teacher()); -- Giáo viên quản lý kho tài liệu
create policy t_docs_read  on public.documents for select using (is_staff() or class_id is null or class_id = my_class());

-- ------------------------------------------------------------
-- 6. THIẾT LẬP TÀI KHOẢN THẦY VINH LÀM ADMIN CAO CẤP NHẤT
-- ------------------------------------------------------------
update public.profiles 
set role = 'admin' 
where username = 'thayvinh';

-- ------------------------------------------------------------
-- 7. TẠO CÁC LỚP HỌC TỪ KHỐI 6 ĐẾN KHỐI 12 (NẾU CHƯA CÓ)
-- ------------------------------------------------------------
insert into public.classes (name, school_year)
select name, school_year from (values 
  ('Lớp 6', '2026-2027'),
  ('Lớp 7', '2026-2027'),
  ('Lớp 8', '2026-2027'),
  ('Lớp 9', '2026-2027'),
  ('Lớp 10', '2026-2027'),
  ('Lớp 11', '2026-2027'),
  ('Lớp 12', '2026-2027')
) as new_classes(name, school_year)
where not exists (
  select 1 from public.classes where public.classes.name = new_classes.name
);
