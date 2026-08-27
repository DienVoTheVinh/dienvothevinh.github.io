-- Extend post-exam recovery to legacy/public exams without weakening answer
-- secrecy.  A legacy question is linked to the private bank only when its
-- trimmed TeX body identifies exactly one active bank item.  Deliberately do
-- not use fuzzy text, source_id or legacy_code as
-- an identity: those fields are classifications/provenance and can collide.

create index if not exists vm_qb_items_active_recovery_content_idx
  on private.vm_question_bank_items (
    (pg_catalog.md5(pg_catalog.btrim(content_latex)))
  )
  where status='active';

-- A generic prompt such as “Mệnh đề nào đúng?” is not an identity by itself.
-- Normalize only the public option text/key (never the answer flag) so an old
-- exam is linked only when both its prompt and its displayed choices are exact.
create or replace function private.vm_bank_recovery_choice_signature(p_choices jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_signature jsonb;
begin
  if jsonb_typeof(coalesce(p_choices,'[]'::jsonb))<>'array' then return null; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'key',coalesce(nullif(choice.value->>'key',''),chr(64+choice.ordinality::integer)),
      'latex',pg_catalog.btrim(coalesce(
        choice.value->>'latex',choice.value->>'text',choice.value#>>'{}',''
      ))
    ) order by choice.ordinality
  ),'[]'::jsonb)
  into v_signature
  from jsonb_array_elements(coalesce(p_choices,'[]'::jsonb))
    with ordinality choice(value,ordinality);
  return v_signature;
end;
$function$;

revoke all on function private.vm_bank_recovery_choice_signature(jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.vm_bank_recommendation_source_item_id(
  p_exam_id uuid,
  p_question_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_direct uuid;
  v_match uuid;
  v_match_count integer := 0;
begin
  -- Bank-generated exams keep their authoritative occurrence/snapshot link.
  v_direct := private.vm_bank_question_item_id(p_exam_id,p_question_id);
  if v_direct is not null then return v_direct; end if;

  -- For ordinary exams, content is an identity only when the match is exact
  -- and unique.  If the same prompt exists in more than one bank item (for
  -- example with different options), the uniqueness guard rejects the link.
  select (pg_catalog.array_agg(item.id order by item.id))[1],count(*)::integer
  into v_match,v_match_count
  from public.questions question
  join private.vm_question_bank_items item
    on item.status='active'
   and pg_catalog.md5(pg_catalog.btrim(item.content_latex)) =
       pg_catalog.md5(pg_catalog.btrim(question.content_latex))
   and pg_catalog.btrim(item.content_latex) =
       pg_catalog.btrim(question.content_latex)
   and private.vm_bank_recovery_choice_signature(item.public_choices) =
       private.vm_bank_recovery_choice_signature(question.choices)
  where question.id=p_question_id;

  if v_match_count=1 then return v_match; end if;
  return null;
end;
$function$;

revoke all on function private.vm_bank_recommendation_source_item_id(uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function private.vm_bank_build_recommendations(p_attempt_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_attempt public.attempts%rowtype;
  v_source private.vm_question_bank_items%rowtype;
  v_current_items uuid[] := '{}'::uuid[];
  v_history_items uuid[] := '{}'::uuid[];
  v_inserted integer := 0;
  v_rows integer;
begin
  select * into v_attempt from public.attempts where id=p_attempt_id;
  if v_attempt.id is null or v_attempt.submitted_at is null then return 0; end if;

  -- Resolve once per question, not once for every recommendation candidate.
  select coalesce(
    array_agg(distinct resolved.item_id) filter(where resolved.item_id is not null),
    '{}'::uuid[]
  )
  into v_current_items
  from public.exam_questions eq
  cross join lateral (
    select private.vm_bank_recommendation_source_item_id(eq.exam_id,eq.question_id) item_id
  ) resolved
  where eq.exam_id=v_attempt.exam_id;

  select coalesce(
    array_agg(distinct resolved.item_id) filter(where resolved.item_id is not null),
    '{}'::uuid[]
  )
  into v_history_items
  from public.attempts old_attempt
  join public.attempt_answers old_answer on old_answer.attempt_id=old_attempt.id
  cross join lateral (
    select private.vm_bank_recommendation_source_item_id(
      old_attempt.exam_id,old_answer.question_id
    ) item_id
  ) resolved
  where old_attempt.student_id=v_attempt.student_id
    and old_attempt.submitted_at is not null;

  delete from private.vm_question_bank_recommendations
  where attempt_id=p_attempt_id and status='ready';

  for v_source in
    select item.*
    from public.exam_questions eq
    join private.vm_question_bank_items item
      on item.id=private.vm_bank_recommendation_source_item_id(
        eq.exam_id,eq.question_id
      )
    left join public.attempt_answers answer
      on answer.attempt_id=p_attempt_id and answer.question_id=eq.question_id
    where eq.exam_id=v_attempt.exam_id
      and coalesce(answer.is_correct,false)=false
      and item.status='active'
  loop
    insert into private.vm_question_bank_recommendations(
      student_id,attempt_id,source_item_id,recommended_item_id,score,reason
    )
    select v_attempt.student_id,p_attempt_id,v_source.id,candidate.id,
      (case
        when candidate.similarity_key is not null
          and candidate.similarity_key=v_source.similarity_key then 100
        when candidate.legacy_code is not null
          and candidate.legacy_code=v_source.legacy_code then 95
        when coalesce(
          candidate.taxonomy->>'skill_family',candidate.taxonomy->>'skill_code',''
        )<>'' and coalesce(
          candidate.taxonomy->>'skill_family',candidate.taxonomy->>'skill_code'
        )=coalesce(
          v_source.taxonomy->>'skill_family',v_source.taxonomy->>'skill_code'
        ) then 85
        when coalesce(
          candidate.taxonomy->>'topic_code',candidate.taxonomy->>'chapter_code',''
        )<>'' and coalesce(
          candidate.taxonomy->>'topic_code',candidate.taxonomy->>'chapter_code'
        )=coalesce(
          v_source.taxonomy->>'topic_code',v_source.taxonomy->>'chapter_code'
        ) then 70
        else 0 end
        - 5*abs(
          case candidate.difficulty
            when 'NB' then 1 when 'TH' then 2 when 'VD' then 3 else 4 end
          - case v_source.difficulty
            when 'NB' then 1 when 'TH' then 2 when 'VD' then 3 else 4 end
        ))::integer,
      case
        when candidate.similarity_key is not null
          and candidate.similarity_key=v_source.similarity_key then 'Cùng kỹ năng'
        when candidate.legacy_code is not null
          and candidate.legacy_code=v_source.legacy_code then 'Cùng ID phân loại'
        when coalesce(
          candidate.taxonomy->>'skill_family',candidate.taxonomy->>'skill_code',''
        )<>'' and coalesce(
          candidate.taxonomy->>'skill_family',candidate.taxonomy->>'skill_code'
        )=coalesce(
          v_source.taxonomy->>'skill_family',v_source.taxonomy->>'skill_code'
        ) then 'Cùng dạng toán'
        else 'Cùng chương' end
    from private.vm_question_bank_items candidate
    where candidate.status='active'
      and candidate.id<>v_source.id
      and candidate.question_type=v_source.question_type
      and (v_source.grade is null or candidate.grade=v_source.grade)
      and not (candidate.id=any(v_current_items))
      and not (candidate.id=any(v_history_items))
      -- Similar means at least one exact pedagogical classification matches.
      -- There is intentionally no fuzzy-text or generic same-grade fallback.
      and (
        (candidate.similarity_key is not null
          and candidate.similarity_key=v_source.similarity_key)
        or (candidate.legacy_code is not null
          and candidate.legacy_code=v_source.legacy_code)
        or (
          coalesce(
            candidate.taxonomy->>'skill_family',candidate.taxonomy->>'skill_code',''
          )<>'' and coalesce(
            candidate.taxonomy->>'skill_family',candidate.taxonomy->>'skill_code'
          )=coalesce(
            v_source.taxonomy->>'skill_family',v_source.taxonomy->>'skill_code'
          )
        )
        or (
          coalesce(
            candidate.taxonomy->>'topic_code',candidate.taxonomy->>'chapter_code',''
          )<>'' and coalesce(
            candidate.taxonomy->>'topic_code',candidate.taxonomy->>'chapter_code'
          )=coalesce(
            v_source.taxonomy->>'topic_code',v_source.taxonomy->>'chapter_code'
          )
        )
      )
    order by
      case
        when candidate.similarity_key is not null
          and candidate.similarity_key=v_source.similarity_key then 100
        when candidate.legacy_code is not null
          and candidate.legacy_code=v_source.legacy_code then 95
        when coalesce(
          candidate.taxonomy->>'skill_family',candidate.taxonomy->>'skill_code',''
        )<>'' and coalesce(
          candidate.taxonomy->>'skill_family',candidate.taxonomy->>'skill_code'
        )=coalesce(
          v_source.taxonomy->>'skill_family',v_source.taxonomy->>'skill_code'
        ) then 85
        else 70 end desc,
      abs(
        case candidate.difficulty
          when 'NB' then 1 when 'TH' then 2 when 'VD' then 3 else 4 end
        - case v_source.difficulty
          when 'NB' then 1 when 'TH' then 2 when 'VD' then 3 else 4 end
      ),
      md5(p_attempt_id::text||candidate.stable_id)
    limit 4
    on conflict (attempt_id,source_item_id,recommended_item_id) do nothing;
    get diagnostics v_rows=row_count;
    v_inserted:=v_inserted+v_rows;
  end loop;
  return v_inserted;
end;
$function$;

revoke all on function private.vm_bank_build_recommendations(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.vm_exam_recommendations(p_attempt_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_attempt public.attempts%rowtype;
  v_items jsonb;
  v_wrong_count integer := 0;
  v_matched_wrong_count integer := 0;
begin
  select * into v_attempt from public.attempts where id=p_attempt_id;
  if v_attempt.id is null or v_attempt.submitted_at is null
    or not (
      (v_attempt.student_id=auth.uid() and not public.is_staff())
      or public.is_admin()
      or private.vm_bank_can_manage_exam(v_attempt.exam_id)
    ) then
    raise exception 'attempt_access_denied' using errcode='42501';
  end if;

  select count(*)::integer,
    count(*) filter(where resolved.item_id is not null)::integer
  into v_wrong_count,v_matched_wrong_count
  from public.exam_questions eq
  left join public.attempt_answers answer
    on answer.attempt_id=p_attempt_id and answer.question_id=eq.question_id
  cross join lateral (
    select private.vm_bank_recommendation_source_item_id(
      eq.exam_id,eq.question_id
    ) item_id
  ) resolved
  where eq.exam_id=v_attempt.exam_id
    and coalesce(answer.is_correct,false)=false;

  -- Submitted attempts created before this migration did not have legacy
  -- links.  Build them on the first authorized result view.
  if not exists(
    select 1 from private.vm_question_bank_recommendations
    where attempt_id=p_attempt_id and status in ('ready','used')
  ) then
    perform private.vm_bank_build_recommendations(p_attempt_id);
  end if;

  select coalesce(jsonb_agg(item order by score desc,sort_key),'[]'::jsonb)
  into v_items
  from (
    select distinct on (recommendation.recommended_item_id)
      recommendation.score,item.stable_id sort_key,
      jsonb_build_object(
        'question_type',item.question_type,
        'difficulty',item.difficulty,
        'grade',item.grade,
        'reason',recommendation.reason,
        'score',recommendation.score
      ) item
    from private.vm_question_bank_recommendations recommendation
    join private.vm_question_bank_items item
      on item.id=recommendation.recommended_item_id and item.status='active'
    where recommendation.attempt_id=p_attempt_id
      and recommendation.student_id=v_attempt.student_id
      and recommendation.status in ('ready','used')
    order by recommendation.recommended_item_id,recommendation.score desc
  ) rows;

  return jsonb_build_object(
    'count',jsonb_array_length(v_items),
    'wrong_count',v_wrong_count,
    'matched_wrong_count',v_matched_wrong_count,
    'unmatched_wrong_count',greatest(v_wrong_count-v_matched_wrong_count,0),
    'items',v_items
  );
end;
$function$;

revoke all on function public.vm_exam_recommendations(uuid) from public, anon;
grant execute on function public.vm_exam_recommendations(uuid)
  to authenticated, service_role;
