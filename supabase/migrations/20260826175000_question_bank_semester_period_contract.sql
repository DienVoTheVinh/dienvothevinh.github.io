-- Give semester exams an explicit, server-owned assessment period while
-- keeping the pre-period UI compatible. A missing period on a semester exam
-- is retained as a legacy generic exam; it is never guessed from the title.

create or replace function private.vm_bank_teacher_generation_spec(p_spec jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = private, public, pg_temp
as $function$
declare
  v_filters jsonb := '{}'::jsonb;
  v_blueprint jsonb;
begin
  if jsonb_typeof(p_spec->'filters')='object' then
    v_filters := jsonb_strip_nulls(jsonb_build_object(
      'grade',p_spec->'filters'->'grade',
      'grades',p_spec->'filters'->'grades',
      'area',p_spec->'filters'->'area',
      'areas',p_spec->'filters'->'areas',
      'chapter',p_spec->'filters'->'chapter',
      'chapters',p_spec->'filters'->'chapters',
      'skill',p_spec->'filters'->'skill',
      'skills',p_spec->'filters'->'skills',
      'difficulty',p_spec->'filters'->'difficulty',
      'difficulties',p_spec->'filters'->'difficulties',
      'question_type',p_spec->'filters'->'question_type',
      'question_types',p_spec->'filters'->'question_types'
    ));
  end if;

  if jsonb_typeof(p_spec->'blueprint')='array' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'count',segment.value->'count',
      'grade',segment.value->'grade',
      'grades',segment.value->'grades',
      'area',segment.value->'area',
      'areas',segment.value->'areas',
      'chapter',segment.value->'chapter',
      'chapters',segment.value->'chapters',
      'skill',segment.value->'skill',
      'skills',segment.value->'skills',
      'difficulty',segment.value->'difficulty',
      'difficulties',segment.value->'difficulties',
      'question_type',segment.value->'question_type',
      'question_types',segment.value->'question_types'
    )) order by segment.position),'[]'::jsonb)
    into v_blueprint
    from jsonb_array_elements(p_spec->'blueprint')
      with ordinality segment(value,position)
    where jsonb_typeof(segment.value)='object';
  end if;

  -- This is an allow-list, not a blacklist. In particular, a teacher cannot
  -- persist private notes, raw source selectors, answer metadata or arbitrary
  -- keys through generation_spec/blueprint segments.
  return jsonb_strip_nulls(jsonb_build_object(
    'class_id',p_spec->'class_id',
    'portal_id',p_spec->'portal_id',
    'output_kind',p_spec->'output_kind',
    'semester_period',p_spec->'semester_period',
    'title',p_spec->'title',
    'source_origins',p_spec->'source_origins',
    'seed',p_spec->'seed',
    'filters',v_filters,
    'blueprint',v_blueprint,
    'count',p_spec->'count',
    'duration_minutes',p_spec->'duration_minutes',
    'opens_at',p_spec->'opens_at',
    'closes_at',p_spec->'closes_at',
    'shuffle',p_spec->'shuffle',
    'published',p_spec->'published',
    'allow_solution_pdf',p_spec->'allow_solution_pdf'
  ));
end;
$function$;

revoke all on function private.vm_bank_teacher_generation_spec(jsonb)
  from public, anon, authenticated, service_role;

-- Preserve the already-deployed, reviewed selection engine behind a private
-- entry point. The public RPC below owns validation and canonical metadata.
alter function public.vm_bank_generate_exam(jsonb)
  rename to vm_bank_generate_exam_source_mix_v1;
alter function public.vm_bank_generate_exam_source_mix_v1(jsonb)
  set schema private;

revoke all on function private.vm_bank_generate_exam_source_mix_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.vm_bank_generate_exam(p_spec jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_spec jsonb;
  v_result jsonb;
  v_output_kind text;
  v_semester_period text;
  v_semester_period_label text;
  v_semester_period_legacy boolean := false;
  v_exam_id uuid;
begin
  if p_spec is null or jsonb_typeof(p_spec) is distinct from 'object' then
    raise exception 'bank_generation_spec_invalid' using errcode='22023';
  end if;

  if public.is_admin() then
    v_spec := p_spec;
  else
    v_spec := private.vm_bank_teacher_generation_spec(p_spec);
  end if;

  -- Display labels are derived here. Neither teachers nor admins can persist
  -- a client-provided label that disagrees with the canonical period code.
  v_spec := v_spec
    -'semester_period_label'
    -'semester_period_name'
    -'semester_period_display';
  v_output_kind := coalesce(
    nullif(btrim(v_spec->>'output_kind'),''),
    'practice_topic'
  );
  if v_output_kind not in ('practice_topic','semester_exam','thptqg_exam') then
    raise exception 'bank_output_kind_invalid' using errcode='22023';
  end if;

  if v_spec ? 'semester_period'
    and jsonb_typeof(v_spec->'semester_period') not in ('string','null') then
    raise exception 'bank_semester_period_invalid' using errcode='22023';
  end if;
  v_semester_period := nullif(btrim(v_spec->>'semester_period'),'');

  if v_output_kind='semester_exam' then
    v_semester_period_label := case v_semester_period
      when 'midterm_1' then 'Giữa kỳ I'
      when 'final_1' then 'Cuối kỳ I'
      when 'midterm_2' then 'Giữa kỳ II'
      when 'final_2' then 'Cuối kỳ II'
      when null then null
      else null
    end;
    if v_semester_period is not null
      and v_semester_period_label is null then
      raise exception 'bank_semester_period_invalid' using errcode='22023';
    end if;
    v_semester_period_legacy := v_semester_period is null;
    v_spec := (v_spec-'semester_period')||jsonb_build_object(
      'semester_period',v_semester_period
    );
  else
    if v_semester_period is not null then
      raise exception 'bank_semester_period_not_applicable' using errcode='22023';
    end if;
    v_spec := v_spec-'semester_period';
  end if;

  v_result := private.vm_bank_generate_exam_source_mix_v1(v_spec);
  begin
    v_exam_id := (v_result->>'exam_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'bank_generated_exam_id_invalid' using errcode='22023';
  end;

  if v_output_kind='semester_exam' then
    update public.exams
    set generation_spec=coalesce(generation_spec,'{}'::jsonb)||jsonb_build_object(
      'semester_period',v_semester_period,
      'semester_period_label',v_semester_period_label,
      'semester_period_legacy',v_semester_period_legacy
    )
    where id=v_exam_id;

    update private.vm_question_bank_exam_specs
    set spec=(spec
      -'semester_period_label'
      -'semester_period_name'
      -'semester_period_display')||jsonb_build_object(
        'semester_period',v_semester_period,
        'semester_period_label',v_semester_period_label,
        'semester_period_legacy',v_semester_period_legacy
      )
    where exam_id=v_exam_id;

    if v_semester_period_legacy then
      v_result := jsonb_set(
        v_result,
        '{warnings}',
        coalesce(v_result->'warnings','[]'::jsonb)||jsonb_build_array(
          jsonb_build_object(
            'kind','semester_period_missing_legacy',
            'message','Đề học kỳ cũ chưa xác định đợt kiểm tra.'
          )
        ),
        true
      );
    end if;
  end if;

  return v_result||jsonb_build_object(
    'semester_period',v_semester_period,
    'semester_period_label',v_semester_period_label,
    'semester_period_legacy',v_semester_period_legacy
  );
end;
$function$;

comment on function public.vm_bank_generate_exam(jsonb) is
  'Generates a bank exam; semester_exam accepts midterm_1, final_1, midterm_2 or final_2 and derives its Vietnamese label server-side.';

revoke all on function public.vm_bank_generate_exam(jsonb) from public, anon;
grant execute on function public.vm_bank_generate_exam(jsonb)
  to authenticated, service_role;
