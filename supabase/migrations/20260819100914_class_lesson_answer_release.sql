-- Đáp án/sửa bài dùng chung cho một bài giảng. Tệp nằm riêng tư trên Google
-- Drive; bảng này chỉ giữ metadata và nội dung TeX. Mọi truy cập đi qua Edge
-- Function nop-bai để kiểm tra quyền quản lý lớp hoặc bài nộp đã được chấm.

create table public.class_lesson_answers (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.lessons(id) on delete cascade,
  tex_content text,
  files jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_lesson_answers_files_array
    check (jsonb_typeof(files) = 'array'),
  constraint class_lesson_answers_files_limit
    check (jsonb_array_length(files) <= 12),
  constraint class_lesson_answers_tex_limit
    check (octet_length(coalesce(tex_content, '')) <= 200000),
  constraint class_lesson_answers_has_content
    check (
      jsonb_array_length(files) > 0
      or nullif(btrim(coalesce(tex_content, '')), '') is not null
    )
);

comment on table public.class_lesson_answers is
  'Đáp án chung theo bài giảng; tệp Drive riêng tư, chỉ Edge Function nop-bai được đọc/ghi.';
comment on column public.class_lesson_answers.files is
  'Metadata tệp riêng tư: id, name, mime_type, size. Không lưu public link.';

create index class_lesson_answers_created_by_idx
  on public.class_lesson_answers(created_by);
create index class_lesson_answers_updated_by_idx
  on public.class_lesson_answers(updated_by);

alter table public.class_lesson_answers enable row level security;
alter table public.class_lesson_answers force row level security;

revoke all on table public.class_lesson_answers from public, anon, authenticated;
grant select, insert, update, delete on table public.class_lesson_answers to service_role;
