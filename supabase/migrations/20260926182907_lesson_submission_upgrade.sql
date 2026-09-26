-- Additive upgrade. Existing lesson modes and existing submissions stay unchanged.
alter table public.lessons add column if not exists test_mode text not null default 'legacy';
alter table public.lessons add column if not exists test_opens_at timestamptz;
alter table public.lessons add constraint lessons_test_mode_check check (test_mode in ('legacy','scheduled','flexible'));
alter table public.lessons add constraint lessons_test_schedule_check check
  (test_mode <> 'scheduled' or (test_opens_at is not null and test_deadline is not null and test_deadline > test_opens_at));

create table public.lesson_test_sessions (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (lesson_id, student_id),
  check (expires_at > started_at)
);
create index lesson_test_sessions_student_idx on public.lesson_test_sessions(student_id);
alter table public.lesson_test_sessions enable row level security;
revoke all on public.lesson_test_sessions from public, anon, authenticated;
grant select on public.lesson_test_sessions to authenticated;
grant all on public.lesson_test_sessions to service_role;
create policy lesson_test_sessions_read on public.lesson_test_sessions for select to authenticated
  using (student_id = (select auth.uid()) or exists (select 1 from public.lessons l where l.id=lesson_id and public.can_manage_class(l.class_id)));

create or replace function public.vm_lesson_test_session(p_lesson_id uuid, p_start boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.lessons%rowtype; s public.lesson_test_sessions%rowtype;
  u uuid := auth.uid(); staff boolean; deadline timestamptz; state text; at_time timestamptz := clock_timestamp();
begin
  if u is null then raise exception 'Cần đăng nhập.'; end if;
  select * into l from public.lessons where id=p_lesson_id;
  if not found then raise exception 'Không tìm thấy bài kiểm tra.'; end if;
  staff := coalesce(public.can_manage_class(l.class_id),false);
  if not staff and (not coalesce(l.published,false) or coalesce(l.locked,false) or not exists
    (select 1 from public.class_students where class_id=l.class_id and student_id=u)
    or not exists(select 1 from public.profiles where id=u and role='student')
    or not coalesce(private.vm_classroom_allowed(),false)) then raise exception 'Không có quyền làm bài kiểm tra này.'; end if;
  if l.test_mode='flexible' then
    if p_start and not staff then
      if coalesce(l.test_duration_minutes,0) not between 1 and 1440 then raise exception 'Thời lượng phải từ 1 đến 1440 phút.'; end if;
      insert into public.lesson_test_sessions(lesson_id,student_id,started_at,expires_at)
        values(l.id,u,at_time,at_time+make_interval(mins=>l.test_duration_minutes)) on conflict do nothing;
    end if;
    select * into s from public.lesson_test_sessions where lesson_id=l.id and student_id=u;
    deadline := s.expires_at;
    state := case when s.lesson_id is null then 'ready' when deadline<=at_time then 'ended' else 'open' end;
  elsif l.test_mode='scheduled' then
    deadline:=l.test_deadline;
    state:=case when at_time<l.test_opens_at then 'waiting' when at_time>=deadline then 'ended' else 'open' end;
  else
    deadline:=l.test_deadline;
    state:=case when not coalesce(l.test_active,false) then 'hidden' when deadline<=at_time then 'ended' else 'open' end;
  end if;
  if state not in ('ready','waiting','hidden') then
    select coalesce(o.new_due,deadline) into deadline from (select 1) v left join public.student_deadline_override o
      on o.student_id=u and o.lesson_id=l.id and o.kind='test';
    state:=case when deadline<=at_time then 'ended' else 'open' end;
  end if;
  return jsonb_build_object('mode',l.test_mode,'status',state,'started_at',s.started_at,'ends_at',deadline,
    'opens_at',l.test_opens_at,'server_now',at_time,'duration_minutes',l.test_duration_minutes,'staff',staff);
end $$;
revoke all on function public.vm_lesson_test_session(uuid,boolean) from public,anon;
grant execute on function public.vm_lesson_test_session(uuid,boolean) to authenticated;

-- Private upload receipts are only reachable through the authenticated Edge Function.
-- A SHA-256 manifest freezes the exact selected bytes before the deadline; uploading
-- those bytes may finish later without accepting a changed/late replacement answer.
create table public.submission_upload_receipts (
  id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  student_id uuid not null references public.profiles(id),
  lesson_id uuid references public.lessons(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  kind text not null check(kind in ('test','homework','homework_bonus')),
  is_late boolean not null,
  manifest jsonb not null check(jsonb_typeof(manifest)='array' and jsonb_array_length(manifest) between 1 and 30),
  uploaded_files jsonb not null default '{}'::jsonb,
  folder_id text not null,
  target_title text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 minutes',
  submission_id uuid references public.submissions(id),
  check ((lesson_id is not null)::integer+(exam_id is not null)::integer=1)
);
create index submission_upload_actor_idx on public.submission_upload_receipts(actor_id,created_at desc);
create index submission_upload_student_idx on public.submission_upload_receipts(student_id);
create index submission_upload_lesson_idx on public.submission_upload_receipts(lesson_id);
create index submission_upload_exam_idx on public.submission_upload_receipts(exam_id);
create index submission_upload_class_idx on public.submission_upload_receipts(class_id);
create index submission_upload_result_idx on public.submission_upload_receipts(submission_id);
alter table public.submission_upload_receipts enable row level security;
revoke all on public.submission_upload_receipts from public,anon,authenticated;
grant all on public.submission_upload_receipts to service_role;

create function public.vm_record_submission_upload_file(p_id uuid,p_index integer,p_file jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.submission_upload_receipts%rowtype; existing jsonb;
begin
  select * into r from public.submission_upload_receipts where id=p_id for update;
  if not found or r.expires_at<now() then raise exception 'Phiên tải đã hết hạn. Hãy gửi lại bài.'; end if;
  if p_index<0 or p_index>=jsonb_array_length(r.manifest) then raise exception 'Sai vị trí tệp.'; end if;
  existing:=r.uploaded_files->p_index::text;
  if existing is not null then return existing; end if;
  if r.submission_id is not null then raise exception 'Bài đã hoàn tất.'; end if;
  update public.submission_upload_receipts set uploaded_files=jsonb_set(uploaded_files,array[p_index::text],p_file) where id=p_id;
  return p_file;
end $$;
revoke all on function public.vm_record_submission_upload_file(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.vm_record_submission_upload_file(uuid,integer,jsonb) to service_role;

create function public.vm_finish_submission_upload(p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.submission_upload_receipts%rowtype; result public.submissions%rowtype; files jsonb;
begin
  select * into r from public.submission_upload_receipts where id=p_id for update;
  if not found then raise exception 'Không tìm thấy phiên tải.'; end if;
  if r.submission_id is not null then
    select * into result from public.submissions where id=r.submission_id;
    return jsonb_build_object('id',result.id,'submitted_at',result.submitted_at,'kind',result.kind,'is_late',result.is_late);
  end if;
  if r.expires_at<now() then raise exception 'Phiên tải đã hết hạn. Hãy gửi lại bài.'; end if;
  select jsonb_agg(r.uploaded_files->i::text order by i) into files from generate_series(0,jsonb_array_length(r.manifest)-1)i;
  if exists(select 1 from jsonb_array_elements(files)f where f='null'::jsonb) then raise exception 'Chưa tải đủ tệp. Hãy thử lại các tệp lỗi.'; end if;
  if r.actor_id=r.student_id and exists(select 1 from public.submissions where student_id=r.student_id and lesson_id=r.lesson_id and kind=r.kind and status='graded') then
    raise exception 'Bài đã được chấm. Liên hệ giáo viên nếu cần nộp lại.';
  end if;
  insert into public.submissions(lesson_id,exam_id,student_id,kind,is_late,files,submitted_at)
    values(r.lesson_id,r.exam_id,r.student_id,r.kind,r.is_late,files,r.created_at) returning * into result;
  update public.submission_upload_receipts set submission_id=result.id where id=p_id;
  return jsonb_build_object('id',result.id,'submitted_at',result.submitted_at,'kind',result.kind,'is_late',result.is_late);
end $$;
revoke all on function public.vm_finish_submission_upload(uuid) from public,anon,authenticated;
grant execute on function public.vm_finish_submission_upload(uuid) to service_role;

-- Score lesson quizzes on the server; the browser must not insert its own score.
create function public.vm_submit_lesson_quiz(p_lesson_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); access jsonb; a public.attempts%rowtype; n integer; correct integer; rows jsonb;
begin
  access:=public.vm_lesson_test_session(p_lesson_id,false);
  if access->>'staff'='true' then raise exception 'Giáo viên không nộp thử vào kết quả học sinh.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||p_lesson_id::text,0));
  select * into a from public.attempts where student_id=u and lesson_id=p_lesson_id and submitted_at is not null order by submitted_at desc limit 1;
  if not found then
    if access->>'status'<>'open' then raise exception 'Bài kiểm tra chưa mở hoặc đã hết giờ.'; end if;
    if jsonb_typeof(p_answers)<>'object' or pg_column_size(p_answers)>100000 then raise exception 'Đáp án không hợp lệ.'; end if;
    select count(*) into n from public.lesson_questions where lesson_id=p_lesson_id;
    if n=0 then raise exception 'Bài chưa có câu hỏi trắc nghiệm.'; end if;
    select count(*) into correct from public.lesson_questions lq join public.questions q on q.id=lq.question_id
      where lq.lesson_id=p_lesson_id and exists(select 1 from jsonb_array_elements(q.choices)c where c->>'key'=p_answers->>q.id::text and c->>'correct'='true');
    insert into public.attempts(student_id,lesson_id,started_at,submitted_at,score,correct_n,total_n)
      values(u,p_lesson_id,coalesce((access->>'started_at')::timestamptz,now()),now(),round(correct::numeric/n*10,2),correct,n) returning * into a;
    insert into public.attempt_answers(attempt_id,question_id,chosen_key,is_correct)
      select a.id,q.id,p_answers->>q.id::text,exists(select 1 from jsonb_array_elements(q.choices)c where c->>'key'=p_answers->>q.id::text and c->>'correct'='true')
      from public.lesson_questions lq join public.questions q on q.id=lq.question_id where lq.lesson_id=p_lesson_id;
  end if;
  select coalesce(jsonb_agg(to_jsonb(aa)),'[]'::jsonb) into rows from public.attempt_answers aa where attempt_id=a.id;
  return to_jsonb(a)||jsonb_build_object('attempt_answers',rows);
end $$;
revoke all on function public.vm_submit_lesson_quiz(uuid,jsonb) from public,anon;
grant execute on function public.vm_submit_lesson_quiz(uuid,jsonb) to authenticated;

-- Reuse the existing report's permission checks and output without rewriting it.
create function public.gv_bao_cao_hoc_tap_v2(p_student uuid,p_class uuid,p_start date,p_end date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare report jsonb; results jsonb; start_at timestamptz:=p_start::timestamp at time zone 'Asia/Ho_Chi_Minh';
  end_at timestamptz:=(p_end+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
begin
  report:=public.gv_bao_cao_hoc_tap(p_student,p_class,p_start,p_end);
  if report is null or report ? 'error' then return report; end if;
  with candidates as (
    select l.id lesson_id,null::uuid exam_id,l.title,l.test_deadline due from public.lessons l
      where l.class_id=p_class and l.published and not coalesce(l.locked,false)
      and (l.test_document_id is not null or nullif(l.test_latex_content,'') is not null or exists(select 1 from public.lesson_questions q where q.lesson_id=l.id))
    union all
    select null::uuid,e.id,e.title,e.closes_at from public.exams e where e.published and (e.class_id=p_class or exists
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
      from candidates c where c.due>=start_at and c.due<end_at
      and not exists(select 1 from actual a where a.lesson_id=c.lesson_id or a.exam_id=c.exam_id)
      and not exists(select 1 from public.submissions s where s.student_id=p_student and s.kind='test' and (s.lesson_id=c.lesson_id or s.exam_id=c.exam_id) and s.submitted_at<start_at)
      and not exists(select 1 from public.attempts a where a.student_id=p_student and (a.lesson_id=c.lesson_id or a.exam_id=c.exam_id) and a.submitted_at<start_at)
  ) select coalesce(jsonb_agg(to_jsonb(r) order by at_time,title),'[]'::jsonb) into results from all_rows r;
  return report||jsonb_build_object('test_results',results);
end $$;
revoke all on function public.gv_bao_cao_hoc_tap_v2(uuid,uuid,date,date) from public,anon;
grant execute on function public.gv_bao_cao_hoc_tap_v2(uuid,uuid,date,date) to authenticated;
