-- The matrix UI needs only the 4 x 4 question-type/difficulty totals.  The
-- previous implementation returned hundreds of taxonomy rows plus private
-- sample identifiers for administrators; on the full bank that response was
-- large enough for the browser request to time out and leave a misleading
-- all-zero matrix.  Detailed taxonomy structure remains available through
-- vm_bank_taxonomy_facets.
create or replace function public.vm_bank_matrix(
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_is_admin boolean;
  v_filters jsonb:=coalesce(p_filters,'{}'::jsonb);
  v_status text;
  v_rows bigint;
  v_questions bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;

  v_is_admin:=public.is_admin();
  if not v_is_admin then
    v_filters:=jsonb_strip_nulls(jsonb_build_object(
      'grade',v_filters->'grade','grades',v_filters->'grades',
      'area',v_filters->'area','areas',v_filters->'areas',
      'chapter',v_filters->'chapter','chapters',v_filters->'chapters',
      'skill',v_filters->'skill','skills',v_filters->'skills',
      'difficulty',v_filters->'difficulty','difficulties',v_filters->'difficulties',
      'question_type',v_filters->'question_type','question_types',v_filters->'question_types'
    ));
  end if;
  v_status:=case
    when v_is_admin and p_filters->>'status' in ('active','quarantined','archived')
      then p_filters->>'status'
    else 'active'
  end;

  -- The common dashboard request has no structural filter.  Active rows are
  -- guaranteed by the classification constraint to carry a valid known ID, so
  -- this path can use the indexed item table and avoid rebuilding 23k semantic
  -- routes.  Filtered requests continue through the route projection below.
  if v_status='active' and (v_filters-'status')='{}'::jsonb then
    with grouped as (
      select item.question_type,item.difficulty,count(*)::integer item_count
      from private.vm_question_bank_items item
      where item.status='active'
      group by item.question_type,item.difficulty
    )
    select count(*),coalesce(sum(item_count),0),coalesce(
      jsonb_agg(jsonb_build_object(
        'question_type',question_type,
        'difficulty',difficulty,
        'count',item_count
      ) order by question_type,difficulty),
      '[]'::jsonb
    ) into v_rows,v_questions,v_items
    from grouped;

    return jsonb_build_object(
      'role',case when v_is_admin then 'admin' else 'teacher' end,
      'status',v_status,
      'row_count',v_rows,
      'question_count',v_questions,
      'items',v_items
    );
  end if;

  with filtered as (
    select route.question_type,route.difficulty
    from private.vm_question_bank_routes route
    where route.route_valid
      and route.item_status=v_status
      and case when coalesce(v_filters->>'grade','') ~ '^[0-9]{1,2}$'
        then route.item_grade=(v_filters->>'grade')::smallint else true end
      and case when jsonb_typeof(v_filters->'grades')='array'
          and jsonb_array_length(v_filters->'grades')>0
        then route.item_grade in (
          select value::smallint from jsonb_array_elements_text(v_filters->'grades')
          where value ~ '^[0-9]{1,2}$'
        ) else true end
      and case when jsonb_typeof(v_filters->'difficulties')='array'
          and jsonb_array_length(v_filters->'difficulties')>0
        then route.difficulty in (
          select upper(value) from jsonb_array_elements_text(v_filters->'difficulties')
        ) else true end
      and (nullif(v_filters->>'difficulty','') is null
        or route.difficulty=upper(v_filters->>'difficulty'))
      and case when jsonb_typeof(v_filters->'question_types')='array'
          and jsonb_array_length(v_filters->'question_types')>0
        then route.question_type in (
          select value from jsonb_array_elements_text(v_filters->'question_types')
        ) else true end
      and (nullif(v_filters->>'question_type','') is null
        or route.question_type=v_filters->>'question_type')
      and (nullif(v_filters->>'legacy_prefix','') is null
        or route.legacy_code ilike
          replace(replace(v_filters->>'legacy_prefix','%',E'\\%'),'_',E'\\_')||'%'
          escape E'\\')
      and case when jsonb_typeof(v_filters->'taxonomy_codes')='array'
          and jsonb_array_length(v_filters->'taxonomy_codes')>0 then exists (
        select 1 from jsonb_array_elements_text(v_filters->'taxonomy_codes') code(value)
        where route.legacy_code ilike
            replace(replace(code.value,'%',E'\\%'),'_',E'\\_')||'%' escape E'\\'
          or route.similarity_key=code.value
      ) else true end
      and case when jsonb_typeof(v_filters->'source_kinds')='array'
          and jsonb_array_length(v_filters->'source_kinds')>0 then exists (
        select 1
        from private.vm_question_bank_item_sources source
        join private.vm_question_bank_documents document on document.id=source.document_id
        where source.item_id=route.item_id
          and document.source_kind in (
            select value from jsonb_array_elements_text(v_filters->'source_kinds')
          )
      ) else true end
      and case when jsonb_typeof(v_filters->'tags')='array'
          and jsonb_array_length(v_filters->'tags')>0
        then route.tags && array(
          select value from jsonb_array_elements_text(v_filters->'tags')
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
  ), grouped as (
    select question_type,difficulty,count(*)::integer item_count
    from filtered
    group by question_type,difficulty
  )
  select count(*),coalesce(sum(item_count),0),coalesce(
    jsonb_agg(jsonb_build_object(
      'question_type',question_type,
      'difficulty',difficulty,
      'count',item_count
    ) order by question_type,difficulty),
    '[]'::jsonb
  ) into v_rows,v_questions,v_items
  from grouped;

  return jsonb_build_object(
    'role',case when v_is_admin then 'admin' else 'teacher' end,
    'status',v_status,
    'row_count',v_rows,
    'question_count',v_questions,
    'items',v_items
  );
end;
$function$;

revoke all on function public.vm_bank_matrix(jsonb)
  from public, anon;
grant execute on function public.vm_bank_matrix(jsonb)
  to authenticated, service_role;
