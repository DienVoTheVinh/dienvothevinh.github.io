-- Allow one lesson to assign several exams while keeping linked_exam_id for
-- backward compatibility with older clients and reports.

alter table public.lessons
  add column if not exists linked_exam_ids uuid[] not null default '{}'::uuid[];

update public.lessons
set linked_exam_ids = array[linked_exam_id]::uuid[]
where linked_exam_id is not null
  and cardinality(linked_exam_ids) = 0;

comment on column public.lessons.linked_exam_ids is
  'Ordered exam IDs assigned to the lesson. linked_exam_id mirrors the first item for legacy clients.';
