-- Keep attendance sessions separate when one class has more than one lesson slot
-- on the same day. Legacy/manual sessions may keep schedule_id NULL.
alter table public.class_sessions
  add column if not exists schedule_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.class_sessions'::regclass
      and conname = 'class_sessions_schedule_id_fkey'
  ) then
    alter table public.class_sessions
      add constraint class_sessions_schedule_id_fkey
      foreign key (schedule_id)
      references public.schedules(id)
      on delete set null;
  end if;
end
$$;

create unique index if not exists uq_class_sessions_schedule_held_on
  on public.class_sessions (schedule_id, held_on)
  where schedule_id is not null;

comment on column public.class_sessions.schedule_id is
  'Recurring or one-off schedule slot that owns this attendance session; distinguishes multiple periods of one class on the same date.';
