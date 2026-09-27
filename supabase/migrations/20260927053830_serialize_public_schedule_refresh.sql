-- Serialize concurrent schedule/class updates before rebuilding the small projection.
create or replace function public.refresh_public_home_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(746219035);
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

