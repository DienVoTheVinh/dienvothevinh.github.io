-- ============================================================
-- VINHMATH — CƠ SỞ DỮ LIỆU (chạy trên Supabase / PostgreSQL)
-- Cách dùng: vào Supabase > SQL Editor > dán toàn bộ file này > Run
-- ============================================================

-- Tiện ích sinh chuỗi ngẫu nhiên (dùng cho mã QR điểm danh)
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------
-- 1. LỚP HỌC  (12A1, 12A2, lớp luyện đề...)
-- ----------------------------------------------------------------
create table classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- "12A1"
  school_year text not null default '2026-2027',
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- 2. HỒ SƠ NGƯỜI DÙNG (nối với hệ thống đăng nhập của Supabase)
--    Mỗi tài khoản đăng nhập có 1 dòng ở đây: thầy hoặc học sinh.
--    HS đăng nhập bằng "tên đăng nhập" (vd nguyenvana.12a1) —
--    bên dưới hệ thống tự đổi thành email dạng ten@hs.vinhmath.app
-- ----------------------------------------------------------------
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'student' check (role in ('teacher','student')),
  username   text not null unique,           -- "nguyenvana.12a1"
  full_name  text not null,                  -- "Nguyễn Văn A"
  class_id   uuid references classes(id) on delete set null,
  phone      text,                           -- SĐT phụ huynh (tuỳ chọn)
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- 3. CHUYÊN ĐỀ  (Hàm số, Mũ-Log, Tích phân, OXYZ...)
-- ----------------------------------------------------------------
create table topics (
  id        uuid primary key default gen_random_uuid(),
  code      text not null unique,            -- "2D1" — khớp mã trong ID câu hỏi LaTeX
  name      text not null,                   -- "Hàm số"
  grade     int  not null default 12,        -- khối 10/11/12
  sort      int  not null default 0
);

-- ----------------------------------------------------------------
-- 4. NGÂN HÀNG CÂU HỎI
--    Nguồn: thầy upload file .tex, hệ thống tách từng câu và lưu vào đây.
--    Nội dung giữ nguyên LaTeX — trình duyệt render bằng KaTeX.
-- ----------------------------------------------------------------
create table questions (
  id             uuid primary key default gen_random_uuid(),
  source_id      text unique,                -- ID thầy gán trong file .tex, vd "2D1B3-1"
  topic_id       uuid references topics(id) on delete set null,
  difficulty     text default 'TH' check (difficulty in ('NB','TH','VD','VDC')),
  content_latex  text not null,              -- đề bài (LaTeX)
  choices        jsonb not null,             -- [{"key":"A","latex":"...","correct":false}, ...]
  solution_latex text,                       -- lời giải (LaTeX)
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- 5. BÀI HỌC  (video YouTube + bài tập kèm theo, gán cho lớp)
-- ----------------------------------------------------------------
create table lessons (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references classes(id) on delete cascade,
  topic_id    uuid references topics(id) on delete set null,
  title       text not null,                 -- "Buổi 12 · Cực trị của hàm số"
  youtube_url text,                          -- link video (không công khai)
  note        text,                          -- ghi chú của thầy
  sort        int not null default 0,
  published   boolean not null default false,-- thầy soạn xong mới bật cho HS thấy
  created_at  timestamptz not null default now()
);

-- Bài tập kèm theo bài học (chọn câu từ ngân hàng)
create table lesson_questions (
  lesson_id   uuid not null references lessons(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  sort        int not null default 0,
  primary key (lesson_id, question_id)
);

-- ----------------------------------------------------------------
-- 6. ĐỀ THI / ĐỀ LUYỆN  (tách riêng với bài học — có giờ mở/đóng)
-- ----------------------------------------------------------------
create table exams (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid references classes(id) on delete cascade,  -- null = mọi lớp
  title            text not null,            -- "Thi thử lần 3"
  duration_minutes int not null default 90,
  opens_at         timestamptz,              -- null = mở ngay
  closes_at        timestamptz,              -- null = không giới hạn
  shuffle          boolean not null default true,  -- xáo thứ tự câu cho từng HS
  published        boolean not null default false,
  created_at       timestamptz not null default now()
);

create table exam_questions (
  exam_id     uuid not null references exams(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  sort        int not null default 0,
  primary key (exam_id, question_id)
);

-- ----------------------------------------------------------------
-- 7. LƯỢT LÀM BÀI + TỪNG CÂU TRẢ LỜI
--    Dùng chung cho cả bài tập của bài học lẫn đề thi.
-- ----------------------------------------------------------------
create table attempts (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references profiles(id) on delete cascade,
  lesson_id    uuid references lessons(id) on delete cascade,
  exam_id      uuid references exams(id) on delete cascade,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,                  -- null = đang làm dở
  score        numeric(4,2),                 -- điểm thang 10
  correct_n    int,
  total_n      int,
  check (lesson_id is not null or exam_id is not null)
);

create table attempt_answers (
  attempt_id  uuid not null references attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  chosen_key  text,                          -- "A"/"B"/"C"/"D", null = bỏ trống
  is_correct  boolean,
  primary key (attempt_id, question_id)
);

-- ----------------------------------------------------------------
-- 8. BUỔI HỌC + QR ĐIỂM DANH
--    Thầy tạo buổi học → hệ thống sinh mã QR (token) → HS quét
--    bằng điện thoại (đã đăng nhập) → lưu 1 dòng attendance.
-- ----------------------------------------------------------------
create table class_sessions (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references classes(id) on delete cascade,
  title       text not null,                 -- "Buổi 12 · 14/6"
  held_on     date not null default current_date,
  qr_token    text not null unique default encode(gen_random_bytes(16),'hex'),
  qr_expires  timestamptz,                   -- QR hết hạn sau buổi học
  created_at  timestamptz not null default now()
);

create table attendance (
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status     text not null default 'present' check (status in ('present','late','excused','absent')),
  primary key (session_id, student_id)
);

-- ----------------------------------------------------------------
-- 9. KHO TÀI LIỆU PDF (file thật nằm trong Supabase Storage)
-- ----------------------------------------------------------------
create table documents (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid references classes(id) on delete cascade,  -- null = mọi lớp đều xem
  topic_id   uuid references topics(id) on delete set null,
  title      text not null,
  file_path  text not null,                  -- đường dẫn trong Storage bucket "tai-lieu"
  created_at timestamptz not null default now()
);

-- ============================================================
-- PHÂN QUYỀN (Row Level Security)
-- Nguyên tắc: THẦY thấy & sửa tất cả. HS chỉ thấy dữ liệu
-- của mình + nội dung đã xuất bản của lớp mình.
-- ============================================================

-- Hàm tiện ích: người đang đăng nhập có phải là thầy?
create or replace function is_teacher() returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and role = 'teacher') $$;

-- Hàm tiện ích: lớp của học sinh đang đăng nhập
create or replace function my_class() returns uuid
language sql stable security definer set search_path = public as
$$ select class_id from profiles where id = auth.uid() $$;

alter table classes          enable row level security;
alter table profiles         enable row level security;
alter table topics           enable row level security;
alter table questions        enable row level security;
alter table lessons          enable row level security;
alter table lesson_questions enable row level security;
alter table exams            enable row level security;
alter table exam_questions   enable row level security;
alter table attempts         enable row level security;
alter table attempt_answers  enable row level security;
alter table class_sessions   enable row level security;
alter table attendance       enable row level security;
alter table documents        enable row level security;

-- Thầy: toàn quyền mọi bảng
create policy t_classes  on classes          for all using (is_teacher()) with check (is_teacher());
create policy t_profiles on profiles         for all using (is_teacher()) with check (is_teacher());
create policy t_topics   on topics           for all using (is_teacher()) with check (is_teacher());
create policy t_quest    on questions        for all using (is_teacher()) with check (is_teacher());
create policy t_lessons  on lessons          for all using (is_teacher()) with check (is_teacher());
create policy t_lq       on lesson_questions for all using (is_teacher()) with check (is_teacher());
create policy t_exams    on exams            for all using (is_teacher()) with check (is_teacher());
create policy t_eq       on exam_questions   for all using (is_teacher()) with check (is_teacher());
create policy t_att      on attempts         for all using (is_teacher()) with check (is_teacher());
create policy t_ans      on attempt_answers  for all using (is_teacher()) with check (is_teacher());
create policy t_sess     on class_sessions   for all using (is_teacher()) with check (is_teacher());
create policy t_attend   on attendance       for all using (is_teacher()) with check (is_teacher());
create policy t_docs     on documents        for all using (is_teacher()) with check (is_teacher());

-- Học sinh: đọc hồ sơ của chính mình
create policy s_profile on profiles for select using (id = auth.uid());

-- Học sinh: xem danh sách chuyên đề
create policy s_topics on topics for select using (true);

-- Học sinh: xem bài học đã xuất bản của lớp mình
create policy s_lessons on lessons for select
  using (published and class_id = my_class());
create policy s_lq on lesson_questions for select
  using (exists(select 1 from lessons l where l.id = lesson_id and l.published and l.class_id = my_class()));

-- Học sinh: xem đề đã xuất bản của lớp mình (hoặc đề chung)
create policy s_exams on exams for select
  using (published and (class_id is null or class_id = my_class()));
create policy s_eq on exam_questions for select
  using (exists(select 1 from exams e where e.id = exam_id and e.published and (e.class_id is null or e.class_id = my_class())));

-- Học sinh: xem câu hỏi thuộc bài học/đề mình được giao
create policy s_quest on questions for select using (
  exists(select 1 from lesson_questions lq join lessons l on l.id = lq.lesson_id
         where lq.question_id = questions.id and l.published and l.class_id = my_class())
  or
  exists(select 1 from exam_questions eq join exams e on e.id = eq.exam_id
         where eq.question_id = questions.id and e.published and (e.class_id is null or e.class_id = my_class()))
);

-- Học sinh: tạo & xem lượt làm bài của chính mình
create policy s_att_ins on attempts for insert with check (student_id = auth.uid());
create policy s_att_sel on attempts for select using (student_id = auth.uid());
create policy s_att_upd on attempts for update using (student_id = auth.uid() and submitted_at is null);
create policy s_ans_ins on attempt_answers for insert
  with check (exists(select 1 from attempts a where a.id = attempt_id and a.student_id = auth.uid()));
create policy s_ans_sel on attempt_answers for select
  using (exists(select 1 from attempts a where a.id = attempt_id and a.student_id = auth.uid()));

-- Học sinh: điểm danh chính mình + xem lịch sử của mình
create policy s_attend_ins on attendance for insert with check (student_id = auth.uid());
create policy s_attend_sel on attendance for select using (student_id = auth.uid());

-- Học sinh: xem buổi học của lớp mình (cần để quét QR)
create policy s_sess on class_sessions for select using (class_id = my_class());

-- Học sinh: xem tài liệu của lớp mình hoặc tài liệu chung
create policy s_docs on documents for select
  using (class_id is null or class_id = my_class());

-- ============================================================
-- DỮ LIỆU MẪU: các chuyên đề Toán 12 (sửa thoải mái)
-- ============================================================
insert into topics (code, name, grade, sort) values
  ('2D1', 'Ứng dụng đạo hàm — Khảo sát hàm số', 12, 1),
  ('2D2', 'Hàm số luỹ thừa — Mũ — Lôgarit',     12, 2),
  ('2D3', 'Nguyên hàm — Tích phân',              12, 3),
  ('2D4', 'Số phức',                             12, 4),
  ('2H1', 'Khối đa diện — Thể tích',             12, 5),
  ('2H2', 'Mặt nón — Trụ — Cầu',                 12, 6),
  ('2H3', 'Phương pháp toạ độ trong không gian', 12, 7),
  ('1D2', 'Tổ hợp — Xác suất',                   11, 8),
  ('1D3', 'Dãy số — Cấp số',                     11, 9);
