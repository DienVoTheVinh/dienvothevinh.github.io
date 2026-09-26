-- Run as database owner in one transaction. All fixtures and trigger effects roll back.
begin;
do $$
declare student uuid; class uuid; admin_id uuid; lesson uuid:=gen_random_uuid(); outsider uuid;
 receipt uuid:=gen_random_uuid(); manifest jsonb; session1 jsonb; session2 jsonb; result jsonb; report jsonb; question uuid; correct_key text;
begin
 select cs.student_id,cs.class_id into student,class from public.class_students cs join public.profiles p on p.id=cs.student_id
 where p.role='student' limit 1;
 select id into admin_id from public.profiles where role='admin' limit 1;
 if student is null or admin_id is null then raise exception 'Missing suitable test principals'; end if;
 insert into public.lessons(id,class_id,title,published,locked,test_mode,test_duration_minutes,homework_text)
 values(lesson,class,'__transactional_upload_test__',true,false,'flexible',45,'fixture');
 perform set_config('request.jwt.claim.sub',student::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'role','authenticated')::text,true);
 session1:=public.vm_lesson_test_session(lesson,false);
 if session1->>'status'<>'ready' then raise exception 'Expected ready'; end if;
 session1:=public.vm_lesson_test_session(lesson,true);
 session2:=public.vm_lesson_test_session(lesson,true);
  if session1->>'status'<>'open' or session1->>'ends_at'<>session2->>'ends_at' then raise exception 'Timer reset on repeated start'; end if;
 select q.id,c->>'key' into question,correct_key from public.questions q cross join lateral jsonb_array_elements(case when jsonb_typeof(q.choices)='array' then q.choices else '[]'::jsonb end)c where c->>'correct'='true' limit 1;
 if question is not null then
   insert into public.lesson_questions(lesson_id,question_id,sort) values(lesson,question,0);
   result:=public.vm_submit_lesson_quiz(lesson,jsonb_build_object(question::text,correct_key));
   if (result->>'score')::numeric<>10 then raise exception 'Server scoring failed'; end if;
   session2:=public.vm_submit_lesson_quiz(lesson,'{}'::jsonb);
   if session2->>'id'<>result->>'id' then raise exception 'Duplicate quiz'; end if;
 end if;
 update public.lesson_test_sessions set started_at=now()-interval '46 minutes',expires_at=now()-interval '1 minute' where lesson_id=lesson;
 if public.vm_lesson_test_session(lesson,false)->>'status'<>'ended' then raise exception 'Expected expiry'; end if;
 update public.lessons set test_mode='scheduled',test_opens_at=now()+interval '10 minutes',test_deadline=now()+interval '55 minutes' where id=lesson;
 if public.vm_lesson_test_session(lesson,false)->>'status'<>'waiting' then raise exception 'Scheduled early access'; end if;
 update public.lessons set test_opens_at=now()-interval '10 minutes' where id=lesson;
 if public.vm_lesson_test_session(lesson,false)->>'status'<>'open' then raise exception 'Scheduled start'; end if;
 update public.lessons set test_opens_at=now()-interval '60 minutes',test_deadline=now()-interval '1 minute' where id=lesson;
 if public.vm_lesson_test_session(lesson,false)->>'status'<>'ended' then raise exception 'Scheduled end'; end if;
 select id into outsider from public.profiles p where role='student' and not exists(select 1 from public.class_students c where c.class_id=class and c.student_id=p.id) limit 1;
 if outsider is not null then
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin perform public.vm_lesson_test_session(lesson,true);raise exception 'SECURITY FAILURE';
  exception when others then if sqlerrm='SECURITY FAILURE' then raise; end if; end;
 end if;
 perform set_config('request.jwt.claim.sub',student::text,true);
 select jsonb_agg(jsonb_build_object('name',i||'.jpg','size',100,'type','image/jpeg','sha256',repeat('a',64))) into manifest from generate_series(1,30)i;
 insert into public.submission_upload_receipts(id,actor_id,student_id,lesson_id,class_id,kind,is_late,manifest,folder_id,target_title)
 values(receipt,student,student,lesson,class,'homework',false,manifest,'fixture','fixture');
 begin perform public.vm_finish_submission_upload(receipt);raise exception 'INCOMPLETE ACCEPTED';
 exception when others then if sqlerrm='INCOMPLETE ACCEPTED' then raise; end if; end;
 for i in 0..29 loop perform public.vm_record_submission_upload_file(receipt,i,jsonb_build_object('id','fixture-'||i,'name',i||'.jpg'));end loop;
 result:=public.vm_record_submission_upload_file(receipt,0,'{"id":"must-not-replace"}'::jsonb);
 if result->>'id'<>'fixture-0' then raise exception 'Duplicate file overwrote original'; end if;
 session1:=public.vm_finish_submission_upload(receipt);session2:=public.vm_finish_submission_upload(receipt);
 if session1->>'id'<>session2->>'id' then raise exception 'Duplicate submission'; end if;
 if (select jsonb_array_length(files) from public.submissions where id=(session1->>'id')::uuid)<>30 then raise exception 'Lost files'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 report:=public.gv_bao_cao_hoc_tap_v2(student,class,(now() at time zone 'Asia/Ho_Chi_Minh')::date-7,(now() at time zone 'Asia/Ho_Chi_Minh')::date);
 if report ? 'error' or not (report ? 'test_results') then raise exception 'Report failed: %',report->>'error'; end if;
 if question is not null and not exists(select 1 from jsonb_array_elements(report->'test_results')r where r->>'lesson_id'=lesson::text and (r->>'score')::numeric=10) then raise exception 'Missing quiz result in report'; end if;
 if has_table_privilege('authenticated','public.submission_upload_receipts','INSERT') or has_function_privilege('authenticated','public.vm_finish_submission_upload(uuid)','EXECUTE') or has_function_privilege('anon','public.vm_lesson_test_session(uuid,boolean)','EXECUTE') then raise exception 'Privilege leak';end if;
end $$;
select 'PASS: timers, class isolation, 30 ordered files, idempotency, report and grants; fixtures rolled back' as result;
rollback;
