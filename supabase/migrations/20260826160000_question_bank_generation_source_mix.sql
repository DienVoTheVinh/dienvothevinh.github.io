-- Generate a pedagogically scoped bank exam from an explicit mix of trusted
-- source shelves. The source mix is enforced by the database so a client
-- cannot present a filter that the actual selection silently ignores.

alter table private.vm_question_bank_documents
  add column if not exists source_origin text generated always as (
    private.vm_bank_document_source_origin(
      source_kind,title,original_filename,province,exam_kind,tags,metadata,provenance
    )
  ) stored;

create index if not exists vm_qb_documents_origin_status_idx
  on private.vm_question_bank_documents(source_origin,status,id);

create or replace function private.vm_bank_item_has_source_origin(
  p_item_id uuid,
  p_source_origin text
)
returns boolean
language sql
stable
security invoker
set search_path = private, public, pg_temp
as $function$
  select exists (
    select 1
    from private.vm_question_bank_item_sources source
    join private.vm_question_bank_documents document
      on document.id=source.document_id
    where source.item_id=p_item_id
      and document.status='active'
      and document.source_origin=p_source_origin
  );
$function$;

revoke all on function private.vm_bank_item_has_source_origin(uuid,text)
  from public, anon, authenticated, service_role;

create or replace function public.vm_bank_generate_exam(p_spec jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_class_id uuid;
  v_portal_id uuid;
  v_exam_id uuid;
  v_seed text;
  v_title text;
  v_output_kind text;
  v_template_key text;
  v_de_type text;
  v_duration_default integer;
  v_blueprint jsonb;
  v_normalized_spec jsonb;
  v_segment jsonb;
  v_segment_filters jsonb;
  v_base_filters jsonb;
  v_filters jsonb;
  v_is_admin boolean;
  v_needed integer;
  v_default_count integer;
  v_picked uuid[];
  v_picked_origins text[];
  v_selected uuid[] := '{}'::uuid[];
  v_selected_origins text[] := '{}'::text[];
  v_source_origins text[];
  v_source_origin text;
  v_origin_count integer;
  v_origin_position integer;
  v_origin_needed integer;
  v_remaining integer;
  v_segment_number integer := 0;
  v_segment_start_count integer;
  v_segment_selected integer;
  v_warnings jsonb := '[]'::jsonb;
  v_matrix jsonb := '[]'::jsonb;
  v_source_mix jsonb := '[]'::jsonb;
  v_count integer;
  v_requested_total integer := 0;
begin
  if p_spec is null or jsonb_typeof(p_spec) is distinct from 'object' then
    raise exception 'bank_generation_spec_invalid' using errcode='22023';
  end if;

  begin
    v_class_id := nullif(p_spec->>'class_id','')::uuid;
    v_portal_id := nullif(p_spec->>'portal_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'bank_exam_target_invalid' using errcode='22023';
  end;
  perform private.vm_bank_assert_exam_target(v_class_id,v_portal_id);
  v_is_admin := public.is_admin();

  v_output_kind := coalesce(nullif(btrim(p_spec->>'output_kind'),''),'practice_topic');
  if v_output_kind not in ('practice_topic','semester_exam','thptqg_exam') then
    raise exception 'bank_output_kind_invalid' using errcode='22023';
  end if;
  v_title := left(coalesce(
    nullif(btrim(p_spec->>'title'),''),
    case v_output_kind
      when 'semester_exam' then 'Đề kiểm tra học kỳ'
      when 'thptqg_exam' then 'Đề luyện thi tốt nghiệp THPT'
      else 'Chuyên đề bài tập'
    end
  ),240);
  v_template_key := case v_output_kind
    when 'semester_exam' then 'bank-semester-exam'
    when 'thptqg_exam' then 'bank-thptqg-exam'
    else 'bank-practice-topic'
  end;
  v_duration_default := case when v_output_kind='practice_topic' then 45 else 90 end;

  -- Missing source_origins keeps older clients compatible by selecting all
  -- three supported shelves. An explicitly supplied value must be a unique,
  -- non-empty subset; an empty array never means "silently use everything".
  if p_spec ? 'source_origins' then
    if jsonb_typeof(p_spec->'source_origins') is distinct from 'array' then
      raise exception 'bank_source_origins_invalid' using errcode='22023';
    end if;
    if jsonb_array_length(p_spec->'source_origins')=0
      or jsonb_array_length(p_spec->'source_origins')>3 then
      raise exception 'bank_source_origins_invalid' using errcode='22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_spec->'source_origins') entry(value)
      where jsonb_typeof(entry.value) is distinct from 'string'
         or entry.value#>>'{}' not in ('province_exam','authored','topic_pack')
    ) then
      raise exception 'bank_source_origins_invalid' using errcode='22023';
    end if;
    select array_agg(value order by position),count(distinct value)
      into v_source_origins,v_origin_count
    from jsonb_array_elements_text(p_spec->'source_origins')
      with ordinality requested(value,position);
    if cardinality(v_source_origins)<>v_origin_count then
      raise exception 'bank_source_origins_duplicate' using errcode='22023';
    end if;
  else
    v_source_origins := array['province_exam','authored','topic_pack']::text[];
  end if;
  v_origin_count := cardinality(v_source_origins);

  v_seed := left(coalesce(
    nullif(p_spec->>'seed',''),
    encode(extensions.gen_random_bytes(12),'hex')
  ),100);
  v_base_filters := case when jsonb_typeof(p_spec->'filters')='object'
    then p_spec->'filters' else '{}'::jsonb end;
  if not v_is_admin then
    -- Teachers can choose pedagogical dimensions and source shelves, but
    -- cannot address bank IDs, raw source kinds, tags or internal taxonomy.
    v_base_filters := jsonb_strip_nulls(jsonb_build_object(
      'grade',v_base_filters->'grade',
      'grades',v_base_filters->'grades',
      'area',v_base_filters->'area',
      'areas',v_base_filters->'areas',
      'chapter',v_base_filters->'chapter',
      'chapters',v_base_filters->'chapters',
      'skill',v_base_filters->'skill',
      'skills',v_base_filters->'skills',
      'difficulty',v_base_filters->'difficulty',
      'difficulties',v_base_filters->'difficulties',
      'question_type',v_base_filters->'question_type',
      'question_types',v_base_filters->'question_types'
    ));
  end if;

  -- A THPTQG output is always grade 12. Reject a contradictory explicit
  -- grade instead of quietly mixing it with grade 12 questions.
  if v_output_kind='thptqg_exam' then
    if (coalesce(v_base_filters->>'grade','') ~ '^[0-9]{1,2}$'
          and (v_base_filters->>'grade')::integer<>12)
      or (jsonb_typeof(v_base_filters->'grades')='array'
          and exists (
            select 1 from jsonb_array_elements_text(v_base_filters->'grades') grade(value)
            where value !~ '^[0-9]{1,2}$' or value::integer<>12
          ))
    then
      raise exception 'bank_thptqg_requires_grade_12' using errcode='22023';
    end if;
    v_base_filters := (v_base_filters-'grades') || jsonb_build_object('grade',12);
  end if;

  v_blueprint := p_spec->'blueprint';
  if jsonb_typeof(v_blueprint) is distinct from 'array' then
    v_blueprint := null;
  elsif jsonb_array_length(v_blueprint)=0 then
    v_blueprint := null;
  end if;
  if v_blueprint is null then
    if v_output_kind='thptqg_exam' and nullif(p_spec->>'count','') is null then
      -- Current national-exam layout: 12 multiple-choice, 4 true/false and
      -- 6 short-answer questions. A caller may still provide a custom
      -- blueprint (or an explicit total count) when preparing another format.
      v_blueprint := jsonb_build_array(
        v_base_filters||jsonb_build_object('question_type','multiple_choice','count',12),
        v_base_filters||jsonb_build_object('question_type','true_false','count',4),
        v_base_filters||jsonb_build_object('question_type','short_answer','count',6)
      );
    else
      begin
        v_default_count := coalesce(
          nullif(p_spec->>'count','')::integer,
          case when v_output_kind='semester_exam' then 40 else 20 end
        );
      exception when others then
        raise exception 'bank_blueprint_count_invalid' using errcode='22023';
      end;
      if v_default_count<1 then
        raise exception 'bank_blueprint_count_invalid' using errcode='22023';
      elsif v_default_count>200 then
        raise exception 'bank_blueprint_question_limit_exceeded' using errcode='22023';
      elsif v_default_count>100 then
        v_blueprint:=jsonb_build_array(
          v_base_filters||jsonb_build_object('count',100),
          v_base_filters||jsonb_build_object('count',v_default_count-100)
        );
      else
        v_blueprint:=jsonb_build_array(
          v_base_filters||jsonb_build_object('count',v_default_count)
        );
      end if;
    end if;
  end if;
  if jsonb_array_length(v_blueprint)>30 then
    raise exception 'bank_blueprint_too_large' using errcode='22023';
  end if;

  for v_segment in select value from jsonb_array_elements(v_blueprint) loop
    v_segment_number := v_segment_number+1;
    begin
      v_needed := coalesce(nullif(v_segment->>'count','')::integer,0);
    exception when others then
      raise exception 'bank_blueprint_count_invalid' using errcode='22023';
    end;
    if v_needed<0 or v_needed>100 then
      raise exception 'bank_blueprint_count_invalid' using errcode='22023';
    end if;
    if v_needed=0 then continue; end if;
    v_requested_total := v_requested_total+v_needed;
    if v_requested_total>200 then
      raise exception 'bank_blueprint_question_limit_exceeded' using errcode='22023';
    end if;

    v_segment_filters := case when jsonb_typeof(v_segment)='object'
      then v_segment-'count'-'source_origins'-'output_kind' else '{}'::jsonb end;
    if not v_is_admin then
      v_segment_filters := jsonb_strip_nulls(jsonb_build_object(
        'grade',v_segment_filters->'grade',
        'grades',v_segment_filters->'grades',
        'area',v_segment_filters->'area',
        'areas',v_segment_filters->'areas',
        'chapter',v_segment_filters->'chapter',
        'chapters',v_segment_filters->'chapters',
        'skill',v_segment_filters->'skill',
        'skills',v_segment_filters->'skills',
        'difficulty',v_segment_filters->'difficulty',
        'difficulties',v_segment_filters->'difficulties',
        'question_type',v_segment_filters->'question_type',
        'question_types',v_segment_filters->'question_types'
      ));
    end if;
    v_filters := v_base_filters||v_segment_filters;
    if v_output_kind='thptqg_exam' then
      if (coalesce(v_filters->>'grade','') ~ '^[0-9]{1,2}$'
            and (v_filters->>'grade')::integer<>12)
        or (jsonb_typeof(v_filters->'grades')='array'
            and exists (
              select 1 from jsonb_array_elements_text(v_filters->'grades') grade(value)
              where value !~ '^[0-9]{1,2}$' or value::integer<>12
            ))
      then
        raise exception 'bank_thptqg_requires_grade_12' using errcode='22023';
      end if;
      v_filters := (v_filters-'grades')||jsonb_build_object('grade',12);
    end if;

    v_segment_start_count := cardinality(v_selected);

    -- Scan the eligible item set once per segment. Each canonical item is
    -- assigned to the first selected shelf that contains it, then ranked
    -- deterministically inside that shelf. This avoids one full bank scan per
    -- source checkbox while retaining a balanced quota.
    select
      coalesce(array_agg(candidate.id order by candidate.origin_position,
        candidate.source_rank,candidate.id),'{}'::uuid[]),
      coalesce(array_agg(candidate.source_origin order by candidate.origin_position,
        candidate.source_rank,candidate.id),'{}'::text[])
    into v_picked,v_picked_origins
    from (
      with origin_candidates as (
        select distinct item.id,item.stable_id,item.snapshot_question_id,
          requested.source_origin,requested.position origin_position
        from private.vm_question_bank_routes route
        join private.vm_question_bank_items item on item.id=route.item_id
        join private.vm_question_bank_item_sources source on source.item_id=item.id
        join private.vm_question_bank_documents document
          on document.id=source.document_id and document.status='active'
        join unnest(v_source_origins) with ordinality
          requested(source_origin,position)
          on requested.source_origin=document.source_origin
        where route.item_status='active'
          and not (item.id=any(v_selected))
          and (coalesce(v_filters->>'grade','') !~ '^[0-9]{1,2}$'
            or route.grade=(v_filters->>'grade')::smallint)
          and case when jsonb_typeof(v_filters->'grades')='array'
              and jsonb_array_length(v_filters->'grades')>0
            then route.grade in (
              select value::smallint from jsonb_array_elements_text(v_filters->'grades')
              where value ~ '^[0-9]{1,2}$'
            ) else true end
          and (nullif(v_filters->>'area','') is null
            or route.area=upper(v_filters->>'area'))
          and case when jsonb_typeof(v_filters->'areas')='array'
              and jsonb_array_length(v_filters->'areas')>0
            then route.area in (
              select upper(value) from jsonb_array_elements_text(v_filters->'areas')
            ) else true end
          and (coalesce(v_filters->>'chapter','') !~ '^[0-9]+$'
            or route.chapter=(v_filters->>'chapter')::integer)
          and case when jsonb_typeof(v_filters->'chapters')='array'
              and jsonb_array_length(v_filters->'chapters')>0
            then route.chapter in (
              select value::integer from jsonb_array_elements_text(v_filters->'chapters')
              where value ~ '^[0-9]+$'
            ) else true end
          and (coalesce(v_filters->>'skill','') !~ '^[0-9]+$'
            or route.skill=(v_filters->>'skill')::integer)
          and case when jsonb_typeof(v_filters->'skills')='array'
              and jsonb_array_length(v_filters->'skills')>0
            then route.skill in (
              select value::integer from jsonb_array_elements_text(v_filters->'skills')
              where value ~ '^[0-9]+$'
            ) else true end
          and (nullif(v_filters->>'difficulty','') is null
            or route.difficulty=upper(v_filters->>'difficulty'))
          and case when jsonb_typeof(v_filters->'difficulties')='array'
              and jsonb_array_length(v_filters->'difficulties')>0
            then route.difficulty in (
              select upper(value) from jsonb_array_elements_text(v_filters->'difficulties')
            ) else true end
          and (nullif(v_filters->>'question_type','') is null
            or route.question_type=v_filters->>'question_type')
          and case when jsonb_typeof(v_filters->'question_types')='array'
              and jsonb_array_length(v_filters->'question_types')>0
            then route.question_type in (
              select value from jsonb_array_elements_text(v_filters->'question_types')
            ) else true end
          and (nullif(v_filters->>'legacy_prefix','') is null
            or route.legacy_code ilike replace(replace(
              v_filters->>'legacy_prefix','%',E'\\%'),'_',E'\\_'
            )||'%' escape E'\\')
          and case when jsonb_typeof(v_filters->'taxonomy_codes')='array'
              and jsonb_array_length(v_filters->'taxonomy_codes')>0
            then exists (
              select 1 from jsonb_array_elements_text(v_filters->'taxonomy_codes') code(value)
              where route.legacy_code ilike replace(replace(
                    code.value,'%',E'\\%'),'_',E'\\_'
                  )||'%' escape E'\\'
                 or route.similarity_key=code.value
                 or route.taxonomy_key=code.value
            ) else true end
          and case when jsonb_typeof(v_filters->'source_kinds')='array'
              and jsonb_array_length(v_filters->'source_kinds')>0
            then exists (
              select 1
              from private.vm_question_bank_item_sources kind_source
              join private.vm_question_bank_documents kind_document
                on kind_document.id=kind_source.document_id
              where kind_source.item_id=item.id
                and kind_document.status='active'
                and kind_document.source_kind in (
                  select value from jsonb_array_elements_text(v_filters->'source_kinds')
                )
            ) else true end
          and case when jsonb_typeof(v_filters->'tags')='array'
              and jsonb_array_length(v_filters->'tags')>0
            then route.tags && array(
              select value from jsonb_array_elements_text(v_filters->'tags')
            ) else true end
          and case when v_is_admin and jsonb_typeof(p_spec->'exclude_question_ids')='array'
            then not exists (
              select 1
              from jsonb_array_elements_text(p_spec->'exclude_question_ids') excluded(value)
              where excluded.value in (
                item.id::text,item.stable_id,item.snapshot_question_id::text
              )
            ) else true end
      ), assigned as (
        select origin_candidates.*,
          row_number() over (
            partition by origin_candidates.id
            order by origin_candidates.origin_position
          ) item_origin_rank
        from origin_candidates
      ), ranked as (
        select assigned.*,
          row_number() over (
            partition by assigned.source_origin
            order by md5(v_seed||':'||v_segment_number::text||':'||
              assigned.source_origin||':'||assigned.stable_id||':'||
              coalesce(v_filters::text,'')),assigned.id
          ) source_rank
        from assigned
        where assigned.item_origin_rank=1
      )
      select ranked.id,ranked.source_origin,ranked.origin_position,
        ranked.source_rank
      from ranked
      where ranked.source_rank <= (v_needed/v_origin_count)
        + case when ranked.origin_position<=mod(v_needed,v_origin_count) then 1 else 0 end
    ) candidate;
    if cardinality(v_picked)>0 then
      v_selected := v_selected||v_picked;
      v_selected_origins := v_selected_origins||v_picked_origins;
    end if;

    v_origin_position := 0;
    foreach v_source_origin in array v_source_origins loop
      v_origin_position := v_origin_position+1;
      v_origin_needed := (v_needed/v_origin_count)
        + case when v_origin_position<=mod(v_needed,v_origin_count) then 1 else 0 end;
      if v_origin_needed=0 then continue; end if;
      select count(*)::integer into v_segment_selected
      from unnest(v_picked_origins) selected(source_origin)
      where selected.source_origin=v_source_origin;
      if v_segment_selected<v_origin_needed then
        v_warnings := v_warnings||jsonb_build_array(jsonb_build_object(
          'kind','source_origin_shortage',
          'segment',v_segment_number,
          'source_origin',v_source_origin,
          'requested',v_origin_needed,
          'selected',v_segment_selected
        ));
      end if;
    end loop;

    -- Rebalance a short source quota from the other explicitly selected
    -- shelves, never from an unselected shelf and never by relaxing taxonomy.
    v_segment_selected := cardinality(v_selected)-v_segment_start_count;
    v_remaining := v_needed-v_segment_selected;
    if v_remaining>0 then
      select
        coalesce(array_agg(candidate.id order by candidate.order_key,candidate.id),'{}'::uuid[]),
        coalesce(array_agg(candidate.source_origin order by candidate.order_key,candidate.id),'{}'::text[])
      into v_picked,v_picked_origins
      from (
        with origin_candidates as (
          select distinct item.id,item.stable_id,item.snapshot_question_id,
            requested.source_origin,requested.position origin_position
          from private.vm_question_bank_routes route
          join private.vm_question_bank_items item on item.id=route.item_id
          join private.vm_question_bank_item_sources source on source.item_id=item.id
          join private.vm_question_bank_documents document
            on document.id=source.document_id and document.status='active'
          join unnest(v_source_origins) with ordinality
            requested(source_origin,position)
            on requested.source_origin=document.source_origin
          where route.item_status='active'
            and not (item.id=any(v_selected))
            and (coalesce(v_filters->>'grade','') !~ '^[0-9]{1,2}$'
              or route.grade=(v_filters->>'grade')::smallint)
            and case when jsonb_typeof(v_filters->'grades')='array'
                and jsonb_array_length(v_filters->'grades')>0
              then route.grade in (
                select value::smallint from jsonb_array_elements_text(v_filters->'grades')
                where value ~ '^[0-9]{1,2}$'
              ) else true end
            and (nullif(v_filters->>'area','') is null
              or route.area=upper(v_filters->>'area'))
            and case when jsonb_typeof(v_filters->'areas')='array'
                and jsonb_array_length(v_filters->'areas')>0
              then route.area in (
                select upper(value) from jsonb_array_elements_text(v_filters->'areas')
              ) else true end
            and (coalesce(v_filters->>'chapter','') !~ '^[0-9]+$'
              or route.chapter=(v_filters->>'chapter')::integer)
            and case when jsonb_typeof(v_filters->'chapters')='array'
                and jsonb_array_length(v_filters->'chapters')>0
              then route.chapter in (
                select value::integer from jsonb_array_elements_text(v_filters->'chapters')
                where value ~ '^[0-9]+$'
              ) else true end
            and (coalesce(v_filters->>'skill','') !~ '^[0-9]+$'
              or route.skill=(v_filters->>'skill')::integer)
            and case when jsonb_typeof(v_filters->'skills')='array'
                and jsonb_array_length(v_filters->'skills')>0
              then route.skill in (
                select value::integer from jsonb_array_elements_text(v_filters->'skills')
                where value ~ '^[0-9]+$'
              ) else true end
            and (nullif(v_filters->>'difficulty','') is null
              or route.difficulty=upper(v_filters->>'difficulty'))
            and case when jsonb_typeof(v_filters->'difficulties')='array'
                and jsonb_array_length(v_filters->'difficulties')>0
              then route.difficulty in (
                select upper(value) from jsonb_array_elements_text(v_filters->'difficulties')
              ) else true end
            and (nullif(v_filters->>'question_type','') is null
              or route.question_type=v_filters->>'question_type')
            and case when jsonb_typeof(v_filters->'question_types')='array'
                and jsonb_array_length(v_filters->'question_types')>0
              then route.question_type in (
                select value from jsonb_array_elements_text(v_filters->'question_types')
              ) else true end
            and (nullif(v_filters->>'legacy_prefix','') is null
              or route.legacy_code ilike replace(replace(
                v_filters->>'legacy_prefix','%',E'\\%'),'_',E'\\_'
              )||'%' escape E'\\')
            and case when jsonb_typeof(v_filters->'taxonomy_codes')='array'
                and jsonb_array_length(v_filters->'taxonomy_codes')>0
              then exists (
                select 1 from jsonb_array_elements_text(v_filters->'taxonomy_codes') code(value)
                where route.legacy_code ilike replace(replace(
                      code.value,'%',E'\\%'),'_',E'\\_'
                    )||'%' escape E'\\'
                   or route.similarity_key=code.value
                   or route.taxonomy_key=code.value
              ) else true end
            and case when jsonb_typeof(v_filters->'source_kinds')='array'
                and jsonb_array_length(v_filters->'source_kinds')>0
              then exists (
                select 1
                from private.vm_question_bank_item_sources kind_source
                join private.vm_question_bank_documents kind_document
                  on kind_document.id=kind_source.document_id
                where kind_source.item_id=item.id
                  and kind_document.status='active'
                  and kind_document.source_kind in (
                    select value from jsonb_array_elements_text(v_filters->'source_kinds')
                  )
              ) else true end
            and case when jsonb_typeof(v_filters->'tags')='array'
                and jsonb_array_length(v_filters->'tags')>0
              then route.tags && array(
                select value from jsonb_array_elements_text(v_filters->'tags')
              ) else true end
            and case when v_is_admin and jsonb_typeof(p_spec->'exclude_question_ids')='array'
              then not exists (
                select 1
                from jsonb_array_elements_text(p_spec->'exclude_question_ids') excluded(value)
                where excluded.value in (
                  item.id::text,item.stable_id,item.snapshot_question_id::text
                )
              ) else true end
        ), assigned as (
          select origin_candidates.*,
            row_number() over (
              partition by origin_candidates.id
              order by origin_candidates.origin_position
            ) item_origin_rank
          from origin_candidates
        )
        select assigned.id,assigned.source_origin,
          md5(v_seed||':'||v_segment_number::text||':rebalance:'||
            assigned.stable_id||':'||coalesce(v_filters::text,'')) order_key
        from assigned
        where assigned.item_origin_rank=1
        order by order_key,assigned.id
        limit v_remaining
      ) candidate;
      if cardinality(v_picked)>0 then
        v_selected := v_selected||v_picked;
        v_selected_origins := v_selected_origins||v_picked_origins;
      end if;
    end if;

    v_segment_selected := cardinality(v_selected)-v_segment_start_count;
    if v_segment_selected<v_needed then
      v_warnings := v_warnings||jsonb_build_array(
        jsonb_build_object(
          'kind','segment_shortage',
          'segment',v_segment_number,
          'requested',v_needed,
          'selected',v_segment_selected
        ) || case when v_is_admin then jsonb_build_object('filters',v_filters)
          else jsonb_build_object('scope',jsonb_strip_nulls(jsonb_build_object(
            'grade',v_filters->'grade','grades',v_filters->'grades',
            'area',v_filters->'area','areas',v_filters->'areas',
            'chapter',v_filters->'chapter','chapters',v_filters->'chapters',
            'skill',v_filters->'skill','skills',v_filters->'skills',
            'difficulty',v_filters->'difficulty','difficulties',v_filters->'difficulties',
            'question_type',v_filters->'question_type',
            'question_types',v_filters->'question_types'
          ))) end
      );
    end if;
  end loop;

  v_count := cardinality(v_selected);
  if v_count=0 then
    raise exception 'bank_no_matching_questions' using errcode='P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_origin',requested.source_origin,
    'selected',coalesce(actual.item_count,0)
  ) order by requested.position),'[]'::jsonb)
  into v_source_mix
  from unnest(v_source_origins) with ordinality requested(source_origin,position)
  left join (
    select selected.source_origin,count(*)::integer item_count
    from unnest(v_selected_origins) selected(source_origin)
    group by selected.source_origin
  ) actual on actual.source_origin=requested.source_origin;

  select coalesce(jsonb_agg(jsonb_build_object(
    'grade',matrix.grade,
    'area',matrix.area,
    'chapter',matrix.chapter,
    'skill',matrix.skill,
    'area_label',matrix.area_label,
    'chapter_label',matrix.chapter_label,
    'skill_label',matrix.skill_label,
    'question_type',matrix.question_type,
    'difficulty',matrix.difficulty,
    'count',matrix.item_count
  ) order by matrix.grade,matrix.chapter,matrix.area,matrix.skill,
    matrix.question_type,matrix.difficulty),'[]'::jsonb)
  into v_matrix
  from (
    select route.grade,route.area,route.chapter,route.skill,
      mode() within group (order by route.area_label)
        filter (where route.area_label is not null) area_label,
      mode() within group (order by route.chapter_label)
        filter (where route.chapter_label is not null) chapter_label,
      mode() within group (order by route.skill_label)
        filter (where route.skill_label is not null) skill_label,
      route.question_type,route.difficulty,count(*)::integer item_count
    from private.vm_question_bank_routes route
    where route.item_id=any(v_selected)
    group by route.grade,route.area,route.chapter,route.skill,
      route.question_type,route.difficulty
  ) matrix;

  if v_output_kind='thptqg_exam' then
    v_de_type := 'thpt';
  else
    select case
      when count(distinct item.question_type)=1
        and min(item.question_type)='multiple_choice' then 'mc'
      when count(distinct item.question_type)=1
        and min(item.question_type)='true_false' then 'tf'
      when count(distinct item.question_type)=1
        and min(item.question_type)='essay' then 'essay'
      else 'combo'
    end
    into v_de_type
    from private.vm_question_bank_items item
    where item.id=any(v_selected);
  end if;

  v_normalized_spec := p_spec||jsonb_build_object(
    'output_kind',v_output_kind,
    'source_origins',to_jsonb(v_source_origins),
    'blueprint',v_blueprint
  );

  insert into public.exams(
    class_id,title,duration_minutes,opens_at,closes_at,shuffle,published,de_type,
    template_key,allow_solution_pdf,portal_id,bank_generated,generation_spec,generated_by
  ) values (
    v_class_id,v_title,
    least(greatest(coalesce(nullif(p_spec->>'duration_minutes','')::integer,
      v_duration_default),1),600),
    nullif(p_spec->>'opens_at','')::timestamptz,
    nullif(p_spec->>'closes_at','')::timestamptz,
    coalesce(nullif(p_spec->>'shuffle','')::boolean,true),
    coalesce(nullif(p_spec->>'published','')::boolean,false),
    v_de_type,v_template_key,
    coalesce(nullif(p_spec->>'allow_solution_pdf','')::boolean,false),
    v_portal_id,true,
    jsonb_build_object(
      'mode','blueprint',
      'output_kind',v_output_kind,
      'question_count',v_count,
      'source_origins',to_jsonb(v_source_origins),
      'source_mix',v_source_mix
    ),
    auth.uid()
  ) returning id into v_exam_id;

  insert into private.vm_question_bank_exam_specs(exam_id,mode,seed,spec,created_by)
  values(v_exam_id,'blueprint',v_seed,v_normalized_spec,auth.uid());

  insert into public.exam_questions(exam_id,question_id,sort)
  select v_exam_id,item.snapshot_question_id,(selected.position-1)::integer
  from unnest(v_selected) with ordinality selected(item_id,position)
  join private.vm_question_bank_items item on item.id=selected.item_id
  order by selected.position;

  insert into private.vm_question_bank_exam_occurrences(exam_id,question_id,item_id,sort)
  select v_exam_id,item.snapshot_question_id,item.id,(selected.position-1)::integer
  from unnest(v_selected) with ordinality selected(item_id,position)
  join private.vm_question_bank_items item on item.id=selected.item_id
  order by selected.position;

  return jsonb_build_object(
    'exam_id',v_exam_id,
    'title',v_title,
    'output_kind',v_output_kind,
    'question_count',v_count,
    'requested_count',v_requested_total,
    'seed',v_seed,
    'source_origins',to_jsonb(v_source_origins),
    'source_mix',v_source_mix,
    'warnings',v_warnings,
    'matrix',v_matrix
  );
end;
$function$;

revoke all on function public.vm_bank_generate_exam(jsonb) from public, anon;
grant execute on function public.vm_bank_generate_exam(jsonb)
  to authenticated, service_role;
