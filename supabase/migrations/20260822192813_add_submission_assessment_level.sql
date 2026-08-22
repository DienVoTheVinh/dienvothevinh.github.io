alter table public.submissions
  add column if not exists assessment_level text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.submissions'::regclass
      and conname = 'submissions_assessment_level_check'
  ) then
    alter table public.submissions
      add constraint submissions_assessment_level_check
      check (
        assessment_level is null
        or assessment_level in ('needs_improvement', 'meets', 'good')
      ) not valid;
  end if;
end
$$;

alter table public.submissions
  validate constraint submissions_assessment_level_check;

comment on column public.submissions.assessment_level is
  'Optional teacher assessment: needs_improvement, meets, or good.';
