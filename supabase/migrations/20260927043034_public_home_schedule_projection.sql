-- A curated public projection, not anonymous access to classes/schedules.
-- Only explicitly visible schedules in the main VinhMath portal are published.
begin;
create table public.public_home_schedule (
  schedule_key uuid primary key,
  weekday integer, start_time time, end_time time, mode text,
  recurrence text, date date, start_date date, end_date date,
  class_name text not null, grade integer, is_specialized boolean,
  updated_at timestamptz not null default now()
);
alter table public.public_home_schedule enable row level security;
revoke all on public.public_home_schedule from public, anon, authenticated;
grant select on public.public_home_schedule to anon, authenticated;
create policy public_home_schedule_read on public.public_home_schedule
  for select to anon, authenticated using (true);

-- Internal maintenance only. No browser-callable definer RPC or raw-data grant.
create function public.refresh_public_home_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.public_home_schedule;
  insert into public.public_home_schedule
    (schedule_key,weekday,start_time,end_time,mode,recurrence,date,start_date,end_date,class_name,grade,is_specialized)
  select s.id,s.weekday,s.start_time,s.end_time,s.mode,s.recurrence,s.date,s.start_date,s.end_date,c.name,c.grade,c.is_specialized
  from public.schedules s join public.classes c on c.id=s.class_id
  where s.visible is true and c.portal_id is null;
  return null;
end;
$$;
revoke all on function public.refresh_public_home_schedule() from public, anon, authenticated;
create trigger sync_public_home_schedules after insert or update or delete on public.schedules
  for each statement execute function public.refresh_public_home_schedule();
create trigger sync_public_home_classes after insert or update or delete on public.classes
  for each statement execute function public.refresh_public_home_schedule();
insert into public.public_home_schedule
  (schedule_key,weekday,start_time,end_time,mode,recurrence,date,start_date,end_date,class_name,grade,is_specialized)
select s.id,s.weekday,s.start_time,s.end_time,s.mode,s.recurrence,s.date,s.start_date,s.end_date,c.name,c.grade,c.is_specialized
from public.schedules s join public.classes c on c.id=s.class_id
where s.visible is true and c.portal_id is null;
comment on table public.public_home_schedule is 'Public homepage timetable: explicitly visible main-portal schedules only; no meeting links, notes, locations or identities.';
commit;
