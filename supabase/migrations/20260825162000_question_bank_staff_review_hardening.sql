-- Follow-up hardening for the already deployed secure question-bank baseline.
-- Keeps answer material private while restoring useful post-submit staff review.

create or replace function private.vm_bank_enforce_active_item()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public, pg_temp
as $function$
declare
  v_taxonomy_key text;
begin
  if new.status <> 'active' then
    return new;
  end if;

  if nullif(btrim(new.legacy_code),'') is null then
    raise exception 'bank_item_id_required' using errcode='22023';
  end if;
  v_taxonomy_key := private.vm_bank_taxonomy_key_from_legacy(new.legacy_code);
  if v_taxonomy_key is null then
    raise exception 'bank_item_id_invalid' using errcode='22023';
  end if;
  if not exists (
    select 1 from private.vm_question_bank_taxonomy t
    where t.taxonomy_key=v_taxonomy_key and t.status='active'
  ) then
    raise exception 'bank_item_taxonomy_unknown' using errcode='22023';
  end if;
  if nullif(btrim(new.content_latex),'') is null then
    raise exception 'bank_item_content_required' using errcode='22023';
  end if;

  if new.question_type='multiple_choice' then
    if jsonb_typeof(new.public_choices) is distinct from 'array' then
      raise exception 'bank_item_choices_invalid' using errcode='22023';
    end if;
    if jsonb_array_length(new.public_choices)<>4 then
      raise exception 'bank_item_choices_invalid' using errcode='22023';
    end if;
    if jsonb_typeof(new.answer_key->'correct_indexes') is distinct from 'array' then
      raise exception 'bank_item_answer_invalid' using errcode='22023';
    end if;
    if jsonb_array_length(new.answer_key->'correct_indexes')<>1 then
      raise exception 'bank_item_answer_invalid' using errcode='22023';
    end if;
    if exists (
        select 1 from jsonb_array_elements_text(new.answer_key->'correct_indexes') x(value)
        where x.value !~ '^[0-3]$'
      ) then
      raise exception 'bank_item_answer_invalid' using errcode='22023';
    end if;
  elsif new.question_type='true_false' then
    if jsonb_typeof(new.public_choices) is distinct from 'array' then
      raise exception 'bank_item_choices_invalid' using errcode='22023';
    end if;
    if jsonb_array_length(new.public_choices)<>4 then
      raise exception 'bank_item_choices_invalid' using errcode='22023';
    end if;
    if jsonb_typeof(new.answer_key->'correct_indexes') is distinct from 'array' then
      raise exception 'bank_item_answer_invalid' using errcode='22023';
    end if;
    if exists (
        select 1 from jsonb_array_elements_text(new.answer_key->'correct_indexes') x(value)
        where x.value !~ '^[0-3]$'
      ) then
      raise exception 'bank_item_answer_invalid' using errcode='22023';
    end if;
    if (
        select count(*)<>count(distinct x.value)
        from jsonb_array_elements_text(new.answer_key->'correct_indexes') x(value)
      ) then
      raise exception 'bank_item_answer_invalid' using errcode='22023';
    end if;
  elsif new.question_type='short_answer' then
    if nullif(btrim(new.answer_key->>'value'),'') is null then
      raise exception 'bank_item_answer_invalid' using errcode='22023';
    end if;
  else
    raise exception 'bank_item_type_not_gradable' using errcode='22023';
  end if;
  return new;
end;
$function$;

revoke all on function private.vm_bank_enforce_active_item()
  from public, anon, authenticated, service_role;

drop trigger if exists vm_bank_active_item_guard
  on private.vm_question_bank_items;
create trigger vm_bank_active_item_guard
before insert or update of
  status, legacy_code, question_type, content_latex, public_choices, answer_key
on private.vm_question_bank_items
for each row execute function private.vm_bank_enforce_active_item();

create or replace function private.vm_bank_safe_json_object(p_value text)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_value jsonb;
begin
  begin
    v_value := coalesce(nullif(btrim(p_value),''),'{}')::jsonb;
  exception when others then
    return '{}'::jsonb;
  end;
  if jsonb_typeof(v_value)<>'object' then
    return '{}'::jsonb;
  end if;
  return v_value;
end;
$function$;

revoke all on function private.vm_bank_safe_json_object(text)
  from public, anon, authenticated, service_role;

create or replace function public.vm_exam_attempt_review(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_attempt public.attempts%rowtype;
  v_exam public.exams%rowtype;
  v_is_admin boolean := false;
  v_protected boolean := false;
  v_answers_visible boolean := false;
  v_answers jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode='42501';
  end if;
  v_is_admin := public.is_admin();
  if not v_is_admin and not public.is_staff() then
    raise exception 'staff_required' using errcode='42501';
  end if;

  select * into v_attempt from public.attempts where id=p_attempt_id;
  if v_attempt.id is null then
    raise exception 'attempt_not_found' using errcode='P0002';
  end if;
  if v_attempt.submitted_at is null and not v_is_admin then
    raise exception 'attempt_review_requires_submission' using errcode='42501';
  end if;

  if v_attempt.exam_id is not null then
    select * into v_exam from public.exams where id=v_attempt.exam_id;
    v_protected := private.vm_bank_exam_is_protected(
      v_exam.id,v_exam.bank_generated,v_exam.source_bank_document_id
    ) or exists (
      select 1
      from public.attempt_answers aa
      where aa.attempt_id=v_attempt.id
        and private.vm_bank_question_item_id(v_attempt.exam_id,aa.question_id) is not null
    );
    if v_protected and not v_is_admin and (
      not public.is_teacher() or not private.vm_bank_can_manage_exam(v_attempt.exam_id)
    ) then
      raise exception 'attempt_review_forbidden' using errcode='42501';
    end if;
  else
    v_protected := exists (
      select 1
      from public.attempt_answers aa
      join private.vm_question_bank_items i on i.snapshot_question_id=aa.question_id
      where aa.attempt_id=v_attempt.id
    );
    if v_protected and not v_is_admin then
      raise exception 'bank_lesson_review_admin_only' using errcode='42501';
    end if;
  end if;
  v_answers_visible := v_is_admin or not v_protected;

  select coalesce(jsonb_agg(jsonb_build_object(
    'chosen_key',aa.chosen_key,
    'is_correct',aa.is_correct,
    'sort',coalesce(eq.sort,lq.sort,2147483647),
    'questions',jsonb_build_object(
      'content_latex',coalesce(bank_item.content_latex,q.content_latex),
      'question_type',coalesce(bank_item.question_type,'legacy'),
      'choices',case
        when bank_item.id is not null and v_is_admin
          then private.vm_bank_reveal_choices(bank_item.id)
        when bank_item.id is not null then coalesce((
          select jsonb_agg(choice_value-array['correct','is_correct','answer','solution'])
          from jsonb_array_elements(bank_item.public_choices) choice_value
        ),'[]'::jsonb)
        else q.choices
      end,
      'solution_latex',case
        when bank_item.id is not null and not v_is_admin then null
        else coalesce(bank_item.solution_latex,q.solution_latex)
      end
    )
  ) order by coalesce(eq.sort,lq.sort,2147483647),aa.question_id),'[]'::jsonb)
  into v_answers
  from public.attempt_answers aa
  join public.questions q on q.id=aa.question_id
  left join public.exam_questions eq
    on eq.exam_id=v_attempt.exam_id and eq.question_id=aa.question_id
  left join public.lesson_questions lq
    on lq.lesson_id=v_attempt.lesson_id and lq.question_id=aa.question_id
  left join private.vm_question_bank_items bank_item
    on bank_item.id=private.vm_bank_question_item_id(v_attempt.exam_id,aa.question_id)
  where aa.attempt_id=v_attempt.id;

  return jsonb_build_object(
    'id',v_attempt.id,
    'score',v_attempt.score,
    'correct_n',v_attempt.correct_n,
    'total_n',v_attempt.total_n,
    'submitted_at',v_attempt.submitted_at,
    'protected_bank',v_protected,
    'answers_visible',v_answers_visible,
    'attempt_answers',v_answers
  );
end;
$function$;

revoke all on function public.vm_exam_attempt_review(uuid) from public, anon;
grant execute on function public.vm_exam_attempt_review(uuid)
  to authenticated, service_role;

create or replace function public.vm_bank_staff_exam_analytics(
  p_class_id uuid,
  p_exam_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_exam public.exams%rowtype;
  v_class public.classes%rowtype;
  v_is_admin boolean := false;
  v_protected boolean := false;
  v_questions jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode='42501';
  end if;
  v_is_admin := public.is_admin();
  if not v_is_admin and not public.is_teacher() then
    raise exception 'teacher_required' using errcode='42501';
  end if;
  select * into v_exam from public.exams where id=p_exam_id;
  if v_exam.id is null then
    raise exception 'exam_not_found' using errcode='P0002';
  end if;
  select * into v_class from public.classes where id=p_class_id;
  if v_class.id is null then
    raise exception 'class_not_found' using errcode='P0002';
  end if;
  if v_exam.class_id is not null and v_exam.class_id<>p_class_id then
    raise exception 'exam_not_in_class' using errcode='42501';
  end if;
  if v_exam.class_id is null and v_exam.portal_id is not null
    and v_exam.portal_id is distinct from v_class.portal_id then
    raise exception 'exam_not_in_class_portal' using errcode='42501';
  end if;
  v_protected := private.vm_bank_exam_is_protected(
    v_exam.id,v_exam.bank_generated,v_exam.source_bank_document_id
  );
  if not v_protected then
    return jsonb_build_object('protected_bank',false,'questions','[]'::jsonb);
  end if;
  if not v_is_admin and (
    not private.vm_bank_can_manage_exam(p_exam_id)
    or not private.vm_bank_target_is_manageable(p_class_id,v_class.portal_id)
  ) then
    raise exception 'bank_analytics_forbidden' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sort',eq.sort,
    'content_latex',bank_item.content_latex,
    'kind',case bank_item.question_type
      when 'true_false' then 'tf'
      when 'short_answer' then 'short'
      else 'mc'
    end,
    'answered_n',coalesce(question_stats.answered_n,0),
    'correct_n',coalesce(question_stats.correct_n,0),
    'accuracy',case when coalesce(question_stats.answered_n,0)=0 then 0
      else round(question_stats.correct_n*100.0/question_stats.answered_n,1) end,
    'statement_stats',case when bank_item.question_type='true_false' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'key',coalesce(choice_entry.value->>'key',chr(96+choice_entry.ordinality::integer)),
        'answered_n',coalesce(statement_stats.answered_n,0),
        'correct_n',coalesce(statement_stats.correct_n,0),
        'accuracy',case when coalesce(statement_stats.answered_n,0)=0 then 0
          else round(statement_stats.correct_n*100.0/statement_stats.answered_n,1) end
      ) order by choice_entry.ordinality)
      from jsonb_array_elements(bank_item.public_choices) with ordinality choice_entry(value,ordinality)
      left join lateral (
        select
          count(*) filter (where selected.value in ('D','S'))::integer answered_n,
          count(*) filter (
            where selected.value=case when exists (
              select 1
              from jsonb_array_elements_text(coalesce(bank_item.answer_key->'correct_indexes','[]'::jsonb)) expected(value)
              where expected.value::integer=choice_entry.ordinality::integer-1
            ) then 'D' else 'S' end
          )::integer correct_n
        from (
          select upper(
            private.vm_bank_safe_json_object(aa.chosen_key)
              ->>chr(96+choice_entry.ordinality::integer)
          ) value
          from public.attempts a
          join public.class_students cs
            on cs.student_id=a.student_id and cs.class_id=p_class_id
          join public.attempt_answers aa
            on aa.attempt_id=a.id and aa.question_id=eq.question_id
          where a.exam_id=p_exam_id and a.submitted_at is not null
        ) selected
      ) statement_stats on true
    ),'[]'::jsonb) else '[]'::jsonb end
  ) order by eq.sort),'[]'::jsonb)
  into v_questions
  from public.exam_questions eq
  join private.vm_question_bank_items bank_item
    on bank_item.id=private.vm_bank_question_item_id(eq.exam_id,eq.question_id)
  left join lateral (
    select
      count(aa.question_id)::integer answered_n,
      count(*) filter (where aa.is_correct is true)::integer correct_n
    from public.attempts a
    join public.class_students cs
      on cs.student_id=a.student_id and cs.class_id=p_class_id
    left join public.attempt_answers aa
      on aa.attempt_id=a.id and aa.question_id=eq.question_id
    where a.exam_id=p_exam_id and a.submitted_at is not null
  ) question_stats on true
  where eq.exam_id=p_exam_id;

  return jsonb_build_object('protected_bank',true,'questions',v_questions);
end;
$function$;

revoke all on function public.vm_bank_staff_exam_analytics(uuid,uuid)
  from public, anon;
grant execute on function public.vm_bank_staff_exam_analytics(uuid,uuid)
  to authenticated, service_role;
