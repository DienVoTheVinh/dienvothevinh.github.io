-- Security boundary for exams and course assets.
-- Students receive only a sanitized exam payload before submission. Grading and
-- answer correctness are computed inside the database, never in the browser.

create or replace function private.vm_can_access_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.exams e
    where e.id = p_exam_id
      and (
        public.is_staff()
        or (
          e.published
          and (
            (
              e.portal_id is null
              and (
                e.class_id is null
                or exists (
                  select 1 from public.class_students cs
                  where cs.class_id = e.class_id and cs.student_id = auth.uid()
                )
              )
            )
            or (
              e.portal_id is not null
              and private.can_access_portal_exam(e.id)
            )
          )
        )
      )
  );
$function$;

revoke all on function private.vm_can_access_exam(uuid) from public, anon, authenticated;
grant execute on function private.vm_can_access_exam(uuid) to service_role;

create or replace function public.vm_exam_catalog(p_exam_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', e.id,
      'class_id', e.class_id,
      'title', e.title,
      'duration_minutes', e.duration_minutes,
      'opens_at', e.opens_at,
      'closes_at', e.closes_at,
      'shuffle', e.shuffle,
      'published', e.published,
      'created_at', e.created_at,
      'de_type', e.de_type,
      'template_key', e.template_key,
      'allow_solution_pdf', e.allow_solution_pdf,
      'portal_id', e.portal_id,
      'classes', case when c.id is null then null else jsonb_build_object(
        'id', c.id, 'name', c.name, 'grade', c.grade, 'is_specialized', c.is_specialized
      ) end,
      'exam_questions', jsonb_build_array(jsonb_build_object(
        'count', (select count(*) from public.exam_questions eq where eq.exam_id = e.id)
      ))
    ) as item
    from public.exams e
    left join public.classes c on c.id = e.class_id
    where (p_exam_id is null or e.id = p_exam_id)
      and private.vm_can_access_exam(e.id)
  ) visible_exams;
$function$;

revoke all on function public.vm_exam_catalog(uuid) from public, anon;
grant execute on function public.vm_exam_catalog(uuid) to authenticated, service_role;

create or replace function public.vm_exam_load(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_exam public.exams%rowtype;
  v_reveal boolean := false;
  v_questions jsonb := '[]'::jsonb;
  v_essay text;
begin
  if not private.vm_can_access_exam(p_exam_id) then
    raise exception 'exam_access_denied' using errcode = '42501';
  end if;

  select * into v_exam from public.exams where id = p_exam_id;
  v_reveal := public.is_staff() or exists (
    select 1 from public.attempts a
    where a.exam_id = p_exam_id
      and a.student_id = auth.uid()
      and a.submitted_at is not null
  );
  if not v_reveal and (
    (v_exam.opens_at is not null and now() < v_exam.opens_at)
    or (v_exam.closes_at is not null and now() > v_exam.closes_at)
  ) then
    raise exception 'exam_not_open' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sort', eq.sort,
      'questions', jsonb_build_object(
        'id', q.id,
        'content_latex', q.content_latex,
        'choices', case
          when v_reveal then q.choices
          else coalesce((
            select jsonb_agg(choice_value - array['correct','is_correct','answer','solution'])
            from jsonb_array_elements(q.choices) choice_value
          ), '[]'::jsonb)
        end,
        'solution_latex', case when v_reveal then q.solution_latex else null end
      )
    ) order by eq.sort
  ), '[]'::jsonb)
  into v_questions
  from public.exam_questions eq
  join public.questions q on q.id = eq.question_id
  where eq.exam_id = p_exam_id;

  v_essay := case
    when v_reveal then coalesce(v_exam.essay_prompt, v_exam.latex_source, '')
    else public.vm_strip_latex_solutions(coalesce(v_exam.essay_prompt, v_exam.latex_source, ''))
  end;

  return jsonb_build_object(
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'class_id', v_exam.class_id,
      'title', v_exam.title,
      'duration_minutes', v_exam.duration_minutes,
      'opens_at', v_exam.opens_at,
      'closes_at', v_exam.closes_at,
      'de_type', v_exam.de_type,
      'allow_solution_pdf', v_exam.allow_solution_pdf,
      'essay_prompt', v_essay
    ),
    'questions', v_questions,
    'solutions_unlocked', v_reveal
  );
end;
$function$;

revoke all on function public.vm_exam_load(uuid) from public, anon;
grant execute on function public.vm_exam_load(uuid) to authenticated, service_role;

create or replace function private.vm_exam_grade_answer(p_question_id uuid, p_chosen_key text)
returns table(is_correct boolean, earned numeric, maximum numeric)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_choices jsonb;
  v_first_key text;
  v_selected jsonb;
  v_matches integer := 0;
  v_total integer := 0;
  v_correct_key text;
begin
  select q.choices into v_choices from public.questions q where q.id = p_question_id;
  if v_choices is null or jsonb_typeof(v_choices) <> 'array' or jsonb_array_length(v_choices) = 0 then
    return query select false, 0::numeric, 0::numeric;
    return;
  end if;

  v_first_key := v_choices->0->>'key';
  if v_first_key in ('A','B','C','D') then
    select choice->>'key' into v_correct_key
    from jsonb_array_elements(v_choices) choice
    where coalesce((choice->>'correct')::boolean, false)
    limit 1;
    return query select coalesce(v_correct_key = p_chosen_key, false),
      case when v_correct_key = p_chosen_key then 0.25 else 0 end::numeric,
      0.25::numeric;
    return;
  end if;

  if lower(v_first_key) in ('a','b','c','d') and jsonb_array_length(v_choices) = 4 then
    begin
      v_selected := coalesce(nullif(p_chosen_key, ''), '{}')::jsonb;
    exception when others then
      v_selected := '{}'::jsonb;
    end;
    select count(*), count(*) filter (
      where coalesce(v_selected->>(choice->>'key'), '') =
        case when coalesce((choice->>'correct')::boolean, false) then 'D' else 'S' end
    )
    into v_total, v_matches
    from jsonb_array_elements(v_choices) choice;

    return query select v_matches = v_total,
      case v_matches when 1 then 0.1 when 2 then 0.25 when 3 then 0.5 when 4 then 1.0 else 0 end::numeric,
      1.0::numeric;
    return;
  end if;

  v_correct_key := coalesce(v_choices->0->>'latex', '');
  return query select
    replace(replace(regexp_replace(trim(coalesce(p_chosen_key,'')), '\s+', '', 'g'), ',', '.'), '−', '-') =
      replace(replace(regexp_replace(trim(v_correct_key), '\s+', '', 'g'), ',', '.'), '−', '-'),
    case when replace(replace(regexp_replace(trim(coalesce(p_chosen_key,'')), '\s+', '', 'g'), ',', '.'), '−', '-') =
      replace(replace(regexp_replace(trim(v_correct_key), '\s+', '', 'g'), ',', '.'), '−', '-') then 0.5 else 0 end::numeric,
    0.5::numeric;
end;
$function$;

revoke all on function private.vm_exam_grade_answer(uuid, text) from public, anon, authenticated;
grant execute on function private.vm_exam_grade_answer(uuid, text) to service_role;

create or replace function public.vm_exam_state(p_exam_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select case
    when auth.uid() is null or not private.vm_can_access_exam(p_exam_id) then '[]'::jsonb
    else coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'exam_id', a.exam_id,
      'score', a.score,
      'correct_n', a.correct_n,
      'total_n', a.total_n,
      'started_at', a.started_at,
      'submitted_at', a.submitted_at,
      'attempt_answers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'question_id', aa.question_id,
          'chosen_key', aa.chosen_key,
          'is_correct', case when a.submitted_at is not null then aa.is_correct else null end
        )) from public.attempt_answers aa where aa.attempt_id = a.id
      ), '[]'::jsonb)
    ) order by a.started_at desc), '[]'::jsonb)
  end
  from public.attempts a
  where a.exam_id = p_exam_id and a.student_id = auth.uid();
$function$;

revoke all on function public.vm_exam_state(uuid) from public, anon;
grant execute on function public.vm_exam_state(uuid) to authenticated, service_role;

create or replace function public.vm_exam_start(p_exam_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_attempt public.attempts%rowtype;
  v_exam public.exams%rowtype;
begin
  if auth.uid() is null or not private.vm_can_access_exam(p_exam_id) then
    raise exception 'exam_access_denied' using errcode = '42501';
  end if;

  select * into v_exam from public.exams where id = p_exam_id;

  select * into v_attempt from public.attempts
  where exam_id = p_exam_id and student_id = auth.uid() and submitted_at is not null
  order by started_at asc limit 1;

  if v_attempt.id is null then
    if (v_exam.opens_at is not null and now() < v_exam.opens_at)
      or (v_exam.closes_at is not null and now() > v_exam.closes_at) then
      raise exception 'exam_not_open' using errcode = '42501';
    end if;
    select * into v_attempt from public.attempts
    where exam_id = p_exam_id and student_id = auth.uid() and submitted_at is null
    order by started_at desc limit 1;
  end if;

  if v_attempt.id is null then
    insert into public.attempts(student_id, exam_id, started_at)
    values(auth.uid(), p_exam_id, now()) returning * into v_attempt;
  end if;

  return jsonb_build_object(
    'id', v_attempt.id, 'exam_id', v_attempt.exam_id,
    'started_at', v_attempt.started_at, 'submitted_at', v_attempt.submitted_at,
    'score', v_attempt.score, 'correct_n', v_attempt.correct_n, 'total_n', v_attempt.total_n
  );
end;
$function$;

revoke all on function public.vm_exam_start(uuid) from public, anon;
grant execute on function public.vm_exam_start(uuid) to authenticated, service_role;

create or replace function public.vm_exam_save_answer(p_attempt_id uuid, p_question_id uuid, p_chosen_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_attempt public.attempts%rowtype;
  v_is_correct boolean;
  v_earned numeric;
  v_maximum numeric;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id <> auth.uid() or v_attempt.submitted_at is not null then
    raise exception 'attempt_not_editable' using errcode = '42501';
  end if;
  if not private.vm_can_access_exam(v_attempt.exam_id) or not exists (
    select 1 from public.exam_questions eq
    where eq.exam_id = v_attempt.exam_id and eq.question_id = p_question_id
  ) then
    raise exception 'question_not_in_exam' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.exams e
    where e.id = v_attempt.exam_id
      and (e.opens_at is null or now() >= e.opens_at)
      and (e.closes_at is null or now() <= e.closes_at)
      and (e.duration_minutes is null or now() <= v_attempt.started_at + make_interval(mins => e.duration_minutes))
  ) then
    raise exception 'exam_time_expired' using errcode = '42501';
  end if;

  select g.is_correct, g.earned, g.maximum
  into v_is_correct, v_earned, v_maximum
  from private.vm_exam_grade_answer(p_question_id, p_chosen_key) g;

  insert into public.attempt_answers(attempt_id, question_id, chosen_key, is_correct)
  values(p_attempt_id, p_question_id, p_chosen_key, v_is_correct)
  on conflict (attempt_id, question_id) do update
  set chosen_key = excluded.chosen_key, is_correct = excluded.is_correct;

  return jsonb_build_object('question_id', p_question_id, 'chosen_key', p_chosen_key, 'saved', true);
end;
$function$;

revoke all on function public.vm_exam_save_answer(uuid, uuid, text) from public, anon;
grant execute on function public.vm_exam_save_answer(uuid, uuid, text) to authenticated, service_role;

create or replace function public.vm_exam_submit(p_attempt_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_attempt public.attempts%rowtype;
  v_exam_type text;
  v_earned numeric := 0;
  v_maximum numeric := 0;
  v_correct integer := 0;
  v_total integer := 0;
  v_score numeric(4,2) := 0;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id <> auth.uid() then
    raise exception 'attempt_access_denied' using errcode = '42501';
  end if;
  if v_attempt.submitted_at is not null then
    return jsonb_build_object(
      'id', v_attempt.id, 'score', v_attempt.score, 'correct_n', v_attempt.correct_n,
      'total_n', v_attempt.total_n, 'submitted_at', v_attempt.submitted_at
    );
  end if;
  if not private.vm_can_access_exam(v_attempt.exam_id) then
    raise exception 'exam_access_denied' using errcode = '42501';
  end if;

  select de_type into v_exam_type from public.exams where id = v_attempt.exam_id;
  if v_exam_type = 'essay' then
    update public.attempts
    set submitted_at = now(), score = null, correct_n = null, total_n = null
    where id = v_attempt.id
    returning * into v_attempt;
    return jsonb_build_object(
      'id', v_attempt.id, 'exam_id', v_attempt.exam_id,
      'score', v_attempt.score, 'correct_n', v_attempt.correct_n,
      'total_n', v_attempt.total_n, 'submitted_at', v_attempt.submitted_at
    );
  end if;

  select coalesce(sum(g.earned),0), coalesce(sum(g.maximum),0),
         count(*) filter (where g.is_correct), count(*)
  into v_earned, v_maximum, v_correct, v_total
  from public.exam_questions eq
  left join public.attempt_answers aa
    on aa.attempt_id = v_attempt.id and aa.question_id = eq.question_id
  cross join lateral private.vm_exam_grade_answer(eq.question_id, aa.chosen_key) g
  where eq.exam_id = v_attempt.exam_id;

  if v_maximum > 0 then v_score := round((v_earned / v_maximum) * 10, 2); end if;

  update public.attempts
  set score = v_score, correct_n = v_correct, total_n = v_total, submitted_at = now()
  where id = v_attempt.id
  returning * into v_attempt;

  return jsonb_build_object(
    'id', v_attempt.id, 'exam_id', v_attempt.exam_id,
    'score', v_attempt.score, 'correct_n', v_attempt.correct_n,
    'total_n', v_attempt.total_n, 'submitted_at', v_attempt.submitted_at
  );
end;
$function$;

revoke all on function public.vm_exam_submit(uuid) from public, anon;
grant execute on function public.vm_exam_submit(uuid) to authenticated, service_role;

create or replace function public.vm_exam_cancel(p_attempt_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  delete from public.attempts
  where id = p_attempt_id and student_id = auth.uid() and submitted_at is null;
  return found;
end;
$function$;

revoke all on function public.vm_exam_cancel(uuid) from public, anon;
grant execute on function public.vm_exam_cancel(uuid) to authenticated, service_role;

create or replace function private.vm_can_read_course_asset(p_bucket text, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or coalesce(p_name, '') = '' then return false; end if;
  if public.is_staff() then return true; end if;

  if p_bucket = 'tai-lieu' then
    return exists (
      select 1 from public.documents d
      where (d.file_path = p_name or right(d.file_path, length(p_name)) = p_name)
        and (
          d.class_id is null
          or exists (
            select 1 from public.class_students cs
            where cs.class_id = d.class_id and cs.student_id = auth.uid()
          )
        )
    );
  end if;

  if p_bucket = 'hinh-anh' then
    return exists (
      select 1 from public.lessons l
      where l.published and not l.locked
        and (
          coalesce(public.video_mode(), 'class') = 'open'
          or exists (
            select 1 from public.class_students cs
            where cs.class_id = l.class_id and cs.student_id = auth.uid()
          )
        )
        and (
          coalesce(l.images, '[]'::jsonb) ? p_name
          or coalesce(l.homework_images, '[]'::jsonb) ? p_name
          or coalesce(l.homework2_images, '[]'::jsonb) ? p_name
        )
    ) or exists (
      select 1 from public.class_posts cp
      join public.class_students cs on cs.class_id = cp.class_id and cs.student_id = auth.uid()
      where strpos(coalesce(cp.body, ''), p_name) > 0
         or strpos(coalesce(cp.cover_url, ''), p_name) > 0
    ) or exists (
      select 1 from public.submissions s
      where s.student_id = auth.uid()
        and (
          strpos(coalesce(s.files::text, ''), p_name) > 0
          or strpos(coalesce(s.graded_files::text, ''), p_name) > 0
        )
    );
  end if;

  return false;
end;
$function$;

revoke all on function private.vm_can_read_course_asset(text, text) from public, anon, authenticated;
grant execute on function private.vm_can_read_course_asset(text, text) to service_role;

-- Public blog media is intentionally isolated from private lesson and submission
-- assets. Only staff can upload or mutate objects in this bucket.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-assets', 'blog-assets', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists blog_assets_staff_insert on storage.objects;
create policy blog_assets_staff_insert on storage.objects for insert to authenticated
with check (bucket_id = 'blog-assets' and public.is_staff());
drop policy if exists blog_assets_staff_update on storage.objects;
create policy blog_assets_staff_update on storage.objects for update to authenticated
using (bucket_id = 'blog-assets' and public.is_staff())
with check (bucket_id = 'blog-assets' and public.is_staff());
drop policy if exists blog_assets_staff_delete on storage.objects;
create policy blog_assets_staff_delete on storage.objects for delete to authenticated
using (bucket_id = 'blog-assets' and public.is_staff());
