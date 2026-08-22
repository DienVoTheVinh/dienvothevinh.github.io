-- Each portal owns a paired student/teacher login namespace. Portal teachers
-- remain portal-scoped managers and never receive broad VinhMath teacher access.
alter table public.exam_portals
  add column teacher_login_suffix text;

update public.exam_portals
set teacher_login_suffix = 'gv' || substring(login_suffix from 3);

alter table public.exam_portals
  alter column teacher_login_suffix set not null,
  add constraint exam_portals_teacher_login_suffix_format
    check (teacher_login_suffix ~ '^gv[a-z0-9]{2,20}$' and teacher_login_suffix <> 'gv'),
  add constraint exam_portals_teacher_login_suffix_key unique (teacher_login_suffix);

comment on column public.exam_portals.teacher_login_suffix is
  'Compact portal manager login suffix, paired with login_suffix; e.g. gvtt.';
