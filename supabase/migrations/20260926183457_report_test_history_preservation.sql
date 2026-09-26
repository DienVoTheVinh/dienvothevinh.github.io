create or replace function public.gv_bao_cao_hoc_tap_v2(p_student uuid,p_class uuid,p_start date,p_end date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare report jsonb; results jsonb; start_at timestamptz:=p_start::timestamp at time zone 'Asia/Ho_Chi_Minh';
  end_at timestamptz:=(p_end+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
begin
  report:=public.gv_bao_cao_hoc_tap(p_student,p_class,p_start,p_end);
  if report is null or report ? 'error' then return report; end if;
  with candidates as (
    select l.id lesson_id,null::uuid exam_id,l.title,l.test_deadline due,(l.published and not coalesce(l.locked,false)) visible from public.lessons l
      where l.class_id=p_class
    union all
    select null::uuid,e.id,e.title,e.closes_at,e.published from public.exams e where (e.class_id=p_class or exists
      (select 1 from public.lessons l where l.class_id=p_class and (l.linked_exam_id=e.id or e.id=any(l.linked_exam_ids))))
  ), actual as (
    select c.lesson_id,c.exam_id,c.title,s.submitted_at at_time,s.status,s.score,s.assessment_level,s.is_late,s.feedback,'Bài nộp'::text source
      from candidates c join public.submissions s on (s.lesson_id=c.lesson_id or s.exam_id=c.exam_id)
      where s.student_id=p_student and s.kind='test' and s.submitted_at>=start_at and s.submitted_at<end_at
    union all
    select c.lesson_id,c.exam_id,c.title,a.submitted_at,'graded',a.score,null::text,false,null::text,'Trắc nghiệm'::text
      from candidates c join public.attempts a on (a.lesson_id=c.lesson_id or a.exam_id=c.exam_id)
      where a.student_id=p_student and a.submitted_at>=start_at and a.submitted_at<end_at
  ), all_rows as (
    select * from actual
    union all
    select c.lesson_id,c.exam_id,c.title,c.due,'missing',null::numeric,null::text,false,null::text,'Chưa nộp trong kỳ'::text
      from candidates c where c.visible and c.due>=start_at and c.due<end_at
      and not exists(select 1 from actual a where a.lesson_id=c.lesson_id or a.exam_id=c.exam_id)
      and not exists(select 1 from public.submissions s where s.student_id=p_student and s.kind='test' and (s.lesson_id=c.lesson_id or s.exam_id=c.exam_id) and s.submitted_at<start_at)
      and not exists(select 1 from public.attempts a where a.student_id=p_student and (a.lesson_id=c.lesson_id or a.exam_id=c.exam_id) and a.submitted_at<start_at)
  ) select coalesce(jsonb_agg(to_jsonb(r) order by at_time,title),'[]'::jsonb) into results from all_rows r;
  return report||jsonb_build_object('test_results',results);
end $$;
revoke all on function public.gv_bao_cao_hoc_tap_v2(uuid,uuid,date,date) from public,anon;
grant execute on function public.gv_bao_cao_hoc_tap_v2(uuid,uuid,date,date) to authenticated;
