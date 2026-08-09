-- VinhMath exam authoring source + protected teacher analytics.
-- Applied to project nrnokgciogxqzjqjeuwi through a tracked Supabase migration.

alter table public.exams
  add column if not exists latex_source text,
  add column if not exists template_key text not null default 'custom';

comment on column public.exams.latex_source is
  'Original ex_test source so teachers can reopen the exact three-part structure.';
comment on column public.exams.template_key is
  'Authoring template identifier such as custom, thpt-standard or thpt-practice.';

create index if not exists attempts_exam_submitted_student_idx
  on public.attempts (exam_id, submitted_at, student_id)
  where exam_id is not null and submitted_at is not null;

create index if not exists attempt_answers_question_attempt_idx
  on public.attempt_answers (question_id, attempt_id);

create or replace function public.gv_thong_ke_luyen_de(
  p_class uuid,
  p_exam uuid default null,
  p_student uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_exam_class uuid;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_uid;

  if v_role is null or v_role not in ('admin', 'teacher') then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if v_role <> 'admin' and not coalesce(public.can_manage_class(p_class), false) then
    return jsonb_build_object('error', 'not_allowed');
  end if;

  if not exists (select 1 from public.classes c where c.id = p_class) then
    return jsonb_build_object('error', 'class_not_found');
  end if;

  if p_exam is not null then
    select e.class_id into v_exam_class from public.exams e where e.id = p_exam;
    if not found then
      return jsonb_build_object('error', 'exam_not_found');
    end if;
    if v_exam_class is not null and v_exam_class <> p_class then
      return jsonb_build_object('error', 'exam_not_in_class');
    end if;
  end if;

  if p_student is not null and not exists (
    select 1 from public.class_students cs
    where cs.class_id = p_class and cs.student_id = p_student
  ) then
    return jsonb_build_object('error', 'student_not_in_class');
  end if;

  select jsonb_build_object(
    'class', (
      select jsonb_build_object('id', c.id, 'name', c.name, 'grade', c.grade)
      from public.classes c where c.id = p_class
    ),
    'class_size', (
      select count(*) from public.class_students cs where cs.class_id = p_class
    ),
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'de_type', e.de_type,
        'published', e.published,
        'question_count', coalesce(qs.question_count, 0),
        'attempt_count', coalesce(rollup.attempt_count, 0),
        'student_count', coalesce(rollup.student_count, 0),
        'avg_score', rollup.avg_score
      ) order by e.created_at desc)
      from public.exams e
      left join lateral (
        select count(*)::integer as question_count
        from public.exam_questions eq where eq.exam_id = e.id
      ) qs on true
      left join lateral (
        select
          count(*)::integer as attempt_count,
          count(distinct a.student_id)::integer as student_count,
          round(avg(a.score)::numeric, 2) as avg_score
        from public.attempts a
        join public.class_students cs
          on cs.student_id = a.student_id and cs.class_id = p_class
        where a.exam_id = e.id and a.submitted_at is not null
      ) rollup on true
      where e.class_id = p_class or e.class_id is null
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'username', p.username
      ) order by p.full_name)
      from public.class_students cs
      join public.profiles p on p.id = cs.student_id
      where cs.class_id = p_class
    ), '[]'::jsonb),
    'selected_exam', case when p_exam is null then null else (
      select jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'de_type', e.de_type,
        'summary', jsonb_build_object(
          'attempt_count', coalesce(er.attempt_count, 0),
          'student_count', coalesce(er.student_count, 0),
          'avg_score', er.avg_score,
          'max_score', er.max_score,
          'min_score', er.min_score
        ),
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'question_id', q.id,
            'sort', eq.sort,
            'content_latex', q.content_latex,
            'kind', case
              when jsonb_array_length(q.choices) = 4 and q.choices->0->>'key' in ('a','b','c','d') then 'tf'
              when jsonb_array_length(q.choices) = 1 and q.choices->0->>'key' = 'short' then 'short'
              else 'mc'
            end,
            'answered_n', coalesce(qa.answered_n, 0),
            'correct_n', coalesce(qa.correct_n, 0),
            'accuracy', case when coalesce(qa.answered_n, 0) = 0 then 0
              else round(qa.correct_n * 100.0 / qa.answered_n, 1) end,
            'statement_stats', case
              when jsonb_array_length(q.choices) = 4 and q.choices->0->>'key' in ('a','b','c','d') then coalesce((
                select jsonb_agg(jsonb_build_object(
                  'key', ch.item->>'key',
                  'latex', ch.item->>'latex',
                  'correct_value', case when coalesce((ch.item->>'correct')::boolean, false) then 'D' else 'S' end,
                  'answered_n', coalesce(sa.answered_n, 0),
                  'correct_n', coalesce(sa.correct_n, 0),
                  'accuracy', case when coalesce(sa.answered_n, 0) = 0 then 0
                    else round(sa.correct_n * 100.0 / sa.answered_n, 1) end
                ) order by ch.ord)
                from jsonb_array_elements(q.choices) with ordinality ch(item, ord)
                left join lateral (
                  select
                    count(*) filter (where ans.value in ('D','S'))::integer as answered_n,
                    count(*) filter (where ans.value = case when coalesce((ch.item->>'correct')::boolean, false) then 'D' else 'S' end)::integer as correct_n
                  from (
                    select (
                      case when aa.chosen_key ~ '^\s*\{.*\}\s*$'
                        then aa.chosen_key::jsonb else '{}'::jsonb end
                    )->>(ch.item->>'key') as value
                    from public.attempts a
                    join public.class_students cs
                      on cs.student_id = a.student_id and cs.class_id = p_class
                    join public.attempt_answers aa
                      on aa.attempt_id = a.id and aa.question_id = q.id
                    where a.exam_id = p_exam and a.submitted_at is not null
                  ) ans
                ) sa on true
              ), '[]'::jsonb)
              else '[]'::jsonb
            end
          ) order by eq.sort)
          from public.exam_questions eq
          join public.questions q on q.id = eq.question_id
          left join lateral (
            select
              count(aa.question_id)::integer as answered_n,
              count(*) filter (where aa.is_correct is true)::integer as correct_n
            from public.attempts a
            join public.class_students cs
              on cs.student_id = a.student_id and cs.class_id = p_class
            left join public.attempt_answers aa
              on aa.attempt_id = a.id and aa.question_id = q.id
            where a.exam_id = p_exam and a.submitted_at is not null
          ) qa on true
          where eq.exam_id = p_exam
        ), '[]'::jsonb)
      )
      from public.exams e
      left join lateral (
        select
          count(*)::integer as attempt_count,
          count(distinct a.student_id)::integer as student_count,
          round(avg(a.score)::numeric, 2) as avg_score,
          max(a.score) as max_score,
          min(a.score) as min_score
        from public.attempts a
        join public.class_students cs
          on cs.student_id = a.student_id and cs.class_id = p_class
        where a.exam_id = p_exam and a.submitted_at is not null
      ) er on true
      where e.id = p_exam
    ) end,
    'selected_student', case when p_student is null then null else (
      select jsonb_build_object(
        'student', (
          select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'username', p.username)
          from public.profiles p where p.id = p_student
        ),
        'summary', jsonb_build_object(
          'attempt_count', coalesce(sr.attempt_count, 0),
          'avg_score', sr.avg_score,
          'best_score', sr.best_score,
          'latest_score', sr.latest_score,
          'delta', case when sr.first_score is null or sr.latest_score is null then null
            else round((sr.latest_score - sr.first_score)::numeric, 2) end
        ),
        'progress', coalesce((
          select jsonb_agg(jsonb_build_object(
            'attempt_id', a.id,
            'exam_id', e.id,
            'title', e.title,
            'submitted_at', a.submitted_at,
            'score', a.score,
            'correct_n', a.correct_n,
            'total_n', a.total_n
          ) order by a.submitted_at)
          from public.attempts a
          join public.exams e on e.id = a.exam_id
          where a.student_id = p_student
            and a.submitted_at is not null
            and (e.class_id = p_class or e.class_id is null)
        ), '[]'::jsonb)
      )
      from lateral (
        select
          count(*)::integer as attempt_count,
          round(avg(x.score)::numeric, 2) as avg_score,
          max(x.score) as best_score,
          (array_agg(x.score order by x.submitted_at desc) filter (where x.score is not null))[1] as latest_score,
          (array_agg(x.score order by x.submitted_at asc) filter (where x.score is not null))[1] as first_score
        from (
          select a.score, a.submitted_at
          from public.attempts a
          join public.exams e on e.id = a.exam_id
          where a.student_id = p_student
            and a.submitted_at is not null
            and (e.class_id = p_class or e.class_id is null)
        ) x
      ) sr
    ) end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.gv_thong_ke_luyen_de(uuid, uuid, uuid) from public;
grant execute on function public.gv_thong_ke_luyen_de(uuid, uuid, uuid) to authenticated;

comment on function public.gv_thong_ke_luyen_de(uuid, uuid, uuid) is
  'Protected class/exam analytics for admin and teachers who manage the selected class.';
