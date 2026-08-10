create or replace function public.trg_noti_graded()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  lt text;
  lcid uuid;
  v_kind_label text;
begin
  if new.status = 'graded' and coalesce(old.status, '') <> 'graded' then
    select title, class_id into lt, lcid from lessons where id = new.lesson_id;
    v_kind_label := case
      when new.kind = 'homework_bonus' then 'bài tập thưởng thêm'
      when new.kind = 'homework' then 'bài tập về nhà'
      else 'bài kiểm tra'
    end;
    insert into notifications(user_id, title, body, link, kind, class_ref)
    values (
      new.student_id,
      '✅ Bài đã được chấm',
      'Thầy đã chấm ' || v_kind_label || coalesce(' bài "' || lt || '"', '') || coalesce(' — ' || new.score || ' điểm', '') || '.',
      'bai-hoc?id=' || new.lesson_id || '&action=graded&kind=' || new.kind || '&submission=' || new.id,
      'graded',
      lcid
    );
  end if;
  return new;
end
$function$;

create or replace function public.fn_noti_attempt()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_class uuid;
  v_ltitle text;
  v_name text;
  v_link text;
begin
  if new.submitted_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.submitted_at is not null then return new; end if;
  if new.lesson_id is not null then
    select l.class_id, l.title into v_class, v_ltitle from lessons l where l.id = new.lesson_id;
    v_link := '/quan-tri-cham-bai?loc=test&lop=' || coalesce(v_class::text, '') || '&lesson=' || new.lesson_id::text || '&attempt=' || new.id::text;
  elsif new.exam_id is not null then
    select e.class_id, e.title into v_class, v_ltitle from exams e where e.id = new.exam_id;
    v_link := '/quan-tri-cham-bai?loc=luyende&lop=' || coalesce(v_class::text, '') || '&exam=' || new.exam_id::text || '&attempt=' || new.id::text;
  else
    return new;
  end if;
  if v_class is null then return new; end if;
  select full_name into v_name from profiles where id = new.student_id;
  perform notify_staff(
    v_class,
    '📝 Học sinh làm xong kiểm tra',
    coalesce(v_name, 'Học sinh') || ' vừa hoàn thành trắc nghiệm: ' || coalesce(v_ltitle, '') ||
      case when new.score is not null then ' — ' || round(new.score::numeric, 1) || ' điểm' else '' end,
    v_link,
    'attempt'
  );
  return new;
end
$function$;

create or replace function public.fn_noti_submit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_class uuid;
  v_ltitle text;
  v_name text;
  v_loai text;
  v_late text;
  v_link text;
begin
  if new.lesson_id is not null then
    select l.class_id, l.title into v_class, v_ltitle from lessons l where l.id = new.lesson_id;
    v_loai := case when new.kind = 'test' then 'bài kiểm tra' when new.kind = 'homework_bonus' then 'bài tập thưởng thêm' else 'bài tập về nhà' end;
    v_link := '/quan-tri-cham-bai?lop=' || coalesce(v_class::text, '') || '&lesson=' || new.lesson_id::text || '&submission=' || new.id::text;
  elsif new.exam_id is not null then
    select e.class_id, e.title into v_class, v_ltitle from exams e where e.id = new.exam_id;
    v_loai := 'bài luyện đề';
    v_link := '/quan-tri-cham-bai';
  else
    return new;
  end if;
  if v_class is null then return new; end if;
  select full_name into v_name from profiles where id = new.student_id;
  v_late := case when new.is_late then ' (nộp trễ)' else '' end;
  perform notify_staff(
    v_class,
    '📥 Học sinh nộp bài' || v_late,
    coalesce(v_name, 'Học sinh') || ' vừa nộp ' || v_loai || ': ' || coalesce(v_ltitle, ''),
    v_link,
    'submit'
  );
  return new;
end
$function$;
