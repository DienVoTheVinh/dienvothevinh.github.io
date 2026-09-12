-- Must run in a surrounding transaction followed by ROLLBACK, never COMMIT.
-- Existing identities are used only as authorization contexts; no profile/Auth
-- updates. Notification/web-push inserts are rolled back before pg_net dispatch.
create temporary table security_lesson_notice_fixture (
  id uuid, class_id uuid, title text, published boolean, test_active boolean
) on commit drop;
create trigger security_lesson_notice after insert on security_lesson_notice_fixture
  for each row execute function public.trg_noti_lesson();
create temporary table security_submit_notice_fixture (
  id uuid, lesson_id uuid, exam_id uuid, student_id uuid, kind text, is_late boolean
) on commit drop;
create trigger security_submit_notice after insert on security_submit_notice_fixture
  for each row execute function public.fn_noti_submit();
grant insert on security_lesson_notice_fixture, security_submit_notice_fixture to authenticated;

do $test$
declare
  student_actor uuid;
  class_target uuid;
  lesson_target uuid;
  fixture_id uuid := gen_random_uuid();
  expected_count integer;
  actual_count integer;
  f text;
  caller text;
  c record;
begin
  foreach f in array array['notify_class','notify_staff'] loop
    foreach caller in array array['anon','authenticated'] loop
      if has_function_privilege(caller,'public.'||f||'(uuid,text,text,text,text)','execute') then
        raise exception 'Internal helper still exposed: %/%',f,caller;
      end if;
    end loop;
    if not has_function_privilege('service_role','public.'||f||'(uuid,text,text,text,text)','execute') then
      raise exception 'Service notification helper unavailable';
    end if;
  end loop;
  for c in select table_name,column_name from information_schema.columns
    where table_schema='public' and table_name in ('messages','notifications') loop
    if has_column_privilege('authenticated','public.'||c.table_name,c.column_name,'UPDATE')
       is distinct from (c.column_name='read_at') then
      raise exception 'Incorrect column privilege: %.%',c.table_name,c.column_name;
    end if;
  end loop;

  select membership.student_id,membership.class_id,lesson.id
    into student_actor,class_target,lesson_target
  from public.class_students membership
  join public.profiles profile on profile.id=membership.student_id and profile.role='student'
  join public.lessons lesson on lesson.class_id=membership.class_id
  order by membership.class_id,lesson.id limit 1;
  if student_actor is null then raise exception 'A class/student/lesson fixture is required'; end if;
  select count(*) into expected_count from public.class_students where class_id=class_target;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',student_actor,'role','authenticated')::text,true);
  set local role authenticated;
  foreach f in array array['notify_class','notify_staff'] loop
    begin
      execute format('select public.%I($1,$2,$3,$4,$5)',f)
        using class_target,'security-denied','security-denied','/','system';
      raise exception 'Signed-in caller bypassed helper permission: %',f;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    update public.messages set sender_id=student_actor where false;
    raise exception 'Message sender can still be rewritten';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.notifications set link='/' where false;
    raise exception 'Notification content can still be rewritten';
  exception when insufficient_privilege then null;
  end;
  update public.messages set read_at=now() where false;
  update public.notifications set read_at=now() where false;

  -- Invoke the exact production SECURITY DEFINER triggers through isolated
  -- source tables. The trigger must retain owner access to the internal helper.
  insert into security_lesson_notice_fixture values (fixture_id,class_target,'security-regression',true,false);
  insert into security_submit_notice_fixture values (fixture_id,lesson_target,null,student_actor,'homework',false);
  reset role;
  select count(*) into actual_count from public.notifications
    where link='bai-hoc?id='||fixture_id::text;
  if actual_count<>expected_count then raise exception 'Lesson notification fan-out regressed'; end if;
  if not exists (select 1 from public.notifications where link like '%submission='||fixture_id::text) then
    raise exception 'Submission-to-staff notification regressed';
  end if;
  set local role authenticated;
  update public.notifications set read_at=now()
    where user_id=student_actor and link='bai-hoc?id='||fixture_id::text;
  get diagnostics actual_count=row_count;
  if actual_count<>1 then raise exception 'Own notification read receipt failed'; end if;
  update public.notifications set read_at=now()
    where user_id<>student_actor and link='bai-hoc?id='||fixture_id::text;
  get diagnostics actual_count=row_count;
  if actual_count<>0 then raise exception 'Another user receipt can be modified'; end if;
  reset role;
end;
$test$;
select 'PASS helper ACLs, read-receipt columns, real notification triggers and recipient RLS (rollback required)' as verification;
