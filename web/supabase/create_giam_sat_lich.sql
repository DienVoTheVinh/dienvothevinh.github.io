-- VINHMATH — TẠO HÀM GIÁM SÁT LỊCH DẠY CHI TIẾT
create or replace function public.giam_sat_lich(p_from date, p_to date, p_teacher_id uuid default null)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_res json;
begin
  with cls as (
    select c.id, c.name, c.grade, c.is_specialized, c.mode, c.teacher_id, c.co_teacher_id,
           t.full_name as teacher_name, cot.full_name as co_teacher_name
    from classes c
    left join profiles t on t.id = c.teacher_id
    left join profiles cot on cot.id = c.co_teacher_id
    where (public.is_admin() or c.teacher_id = auth.uid() or c.co_teacher_id = auth.uid())
      and (p_teacher_id is null or c.teacher_id = p_teacher_id or c.co_teacher_id = p_teacher_id)
  ),
  days as (
    select d::date dd, extract(isodow from d)::int wd
    from generate_series(p_from, p_to, interval '1 day') d
  ),
  exp_rec as (
    select
      dy.dd as event_date,
      s.class_id,
      s.start_time,
      s.end_time,
      s.mode,
      'scheduled'::text as type,
      exists (
        select 1 from schedule_overrides o
        where o.schedule_id = s.id and o.orig_date = dy.dd and o.status = 'cancelled'
      ) as is_cancelled
    from cls c
    join schedules s on s.class_id = c.id
      and coalesce(s.recurrence,'weekly') <> 'once' and coalesce(s.visible,true)
    join days dy on dy.wd = s.weekday
      and (s.start_date is null or dy.dd >= s.start_date)
      and (s.end_date is null or dy.dd <= s.end_date)
  ),
  exp_once as (
    select
      s.date as event_date,
      s.class_id,
      s.start_time,
      s.end_time,
      s.mode,
      'once'::text as type,
      false as is_cancelled
    from cls c
    join schedules s on s.class_id = c.id and s.recurrence = 'once' and coalesce(s.visible,true)
    where s.date between p_from and p_to
  ),
  all_sched as (
    select event_date, class_id, start_time, end_time, mode, type, is_cancelled from exp_rec
    union all
    select event_date, class_id, start_time, end_time, mode, type, is_cancelled from exp_once
  ),
  act as (
    select class_id, held_on, id as actual_id, 'class_session'::text as actual_type
    from class_sessions
    where held_on between p_from and p_to
    union all
    select class_id, held_on, id as actual_id, 'taught_session'::text as actual_type
    from taught_sessions
    where held_on between p_from and p_to
  ),
  act_grouped as (
    select class_id, held_on,
           (array_agg(actual_id))[1] as actual_id,
           (array_agg(actual_type))[1] as actual_type
    from act
    group by class_id, held_on
  ),
  joined as (
    select
      coalesce(s.event_date, a.held_on) as event_date,
      coalesce(s.class_id, a.class_id) as class_id,
      coalesce(s.type, 'actual_only') as type,
      coalesce(s.is_cancelled, false) as is_cancelled,
      s.start_time,
      s.end_time,
      s.mode,
      a.actual_id,
      a.actual_type
    from all_sched s
    full outer join act_grouped a on s.class_id = a.class_id and s.event_date = a.held_on
  )
  select coalesce(json_agg(json_build_object(
    'date', j.event_date,
    'class_id', j.class_id,
    'class_name', c.name,
    'grade', c.grade,
    'teacher_id', c.teacher_id,
    'co_teacher_id', c.co_teacher_id,
    'teacher_name', c.teacher_name,
    'co_teacher_name', c.co_teacher_name,
    'start_time', to_char(j.start_time, 'HH24:MI'),
    'end_time', to_char(j.end_time, 'HH24:MI'),
    'mode', coalesce(j.mode, c.mode),
    'type', j.type,
    'is_cancelled', j.is_cancelled,
    'actual_id', j.actual_id,
    'actual_type', j.actual_type
  ) order by j.event_date, j.start_time), '[]'::json) into v_res
  from joined j
  join cls c on c.id = j.class_id;

  return v_res;
end;
$$;
