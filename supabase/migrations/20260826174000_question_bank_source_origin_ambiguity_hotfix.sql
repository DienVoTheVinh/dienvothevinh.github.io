-- Forward hotfix for databases where the generated document.source_origin
-- column already exists. The prior catalog selected document.* and also
-- emitted a computed source_origin alias, producing an ambiguous duplicate
-- column at execution time. Keep the computed value under a distinct name.
create or replace function public.vm_bank_source_exam_catalog(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_is_admin boolean;
  v_status text;
  v_exam_year_filter integer;
  v_grade_filter smallint;
  v_question_count_filter integer;
  v_min_questions integer;
  v_max_questions integer;
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_query text:=lower(trim(coalesce(p_filters->>'query','')));
  v_category text:=nullif(coalesce(
    p_filters->>'bank_category',p_filters->>'category'
  ),'');
  v_variant text:=nullif(coalesce(
    p_filters->>'bank_variant',p_filters->>'variant'
  ),'');
  v_source_origin text:=nullif(p_filters->>'source_origin','');
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;
  v_is_admin:=public.is_admin();
  v_status:=case
    when v_is_admin and p_filters->>'status' in ('active','quarantined','archived')
      then p_filters->>'status'
    else 'active'
  end;
  begin
    v_exam_year_filter:=nullif(p_filters->>'exam_year','')::integer;
  exception when others then v_exam_year_filter:=null;
  end;
  begin
    v_grade_filter:=nullif(p_filters->>'grade','')::smallint;
    if v_grade_filter not between 1 and 12 then v_grade_filter:=null; end if;
  exception when others then v_grade_filter:=null;
  end;
  begin
    v_question_count_filter:=nullif(coalesce(
      p_filters->>'question_count',p_filters->>'count'
    ),'')::integer;
  exception when others then v_question_count_filter:=null;
  end;
  begin
    v_min_questions:=nullif(coalesce(
      p_filters->>'min_questions',p_filters->>'min_count'
    ),'')::integer;
  exception when others then v_min_questions:=null;
  end;
  begin
    v_max_questions:=nullif(coalesce(
      p_filters->>'max_questions',p_filters->>'max_count'
    ),'')::integer;
  exception when others then v_max_questions:=null;
  end;
  if v_question_count_filter is not null and v_question_count_filter>=0 then
    v_min_questions:=v_question_count_filter;
    v_max_questions:=v_question_count_filter;
  else
    if v_min_questions<0 then v_min_questions:=null; end if;
    if v_max_questions<0 then v_max_questions:=null; end if;
  end if;

  with catalog as (
    select
      document.*,
      private.vm_bank_document_grade(document.metadata) document_grade,
      private.vm_bank_document_category(
        document.source_kind,document.title,document.original_filename,
        document.exam_kind,document.tags
      ) bank_category,
      private.vm_bank_document_variant(
        document.source_kind,document.title,document.original_filename,
        document.exam_kind,document.tags
      ) bank_variant,
      private.vm_bank_document_source_origin(
        document.source_kind,document.title,document.original_filename,
        document.province,document.exam_kind,document.tags,
        document.metadata,document.provenance
      ) catalog_source_origin,
      counts.total_count,counts.active_count,counts.quarantined_count,
      private.vm_bank_document_is_ready(
        document.metadata,counts.total_count,counts.active_count,
        counts.quarantined_count
      ) source_ready
    from private.vm_question_bank_documents document
    cross join lateral (
      select
        count(*)::integer total_count,
        count(*) filter (where item.status='active')::integer active_count,
        count(*) filter (where item.status='quarantined')::integer
          quarantined_count
      from private.vm_question_bank_item_sources source
      join private.vm_question_bank_items item on item.id=source.item_id
      where source.document_id=document.id
    ) counts
    where document.source_kind='mock_exam'
      and document.status=v_status
  ), filtered as (
    select * from catalog
    where (v_query='' or lower(title||' '||coalesce(province,'')||' '
        ||coalesce(exam_kind,'')) like '%'||v_query||'%')
      and (nullif(coalesce(p_filters->>'province',p_filters->>'province_or_unit'),'') is null
        or lower(coalesce(province,''))=lower(coalesce(
          p_filters->>'province',p_filters->>'province_or_unit'
        )))
      and (v_exam_year_filter is null or exam_year=v_exam_year_filter)
      and (v_grade_filter is null or document_grade=v_grade_filter)
      and (v_source_origin is null
        or catalog.catalog_source_origin=v_source_origin)
      and (nullif(coalesce(p_filters->>'exam_kind',p_filters->>'exam_type'),'') is null
        or lower(coalesce(exam_kind,''))=lower(coalesce(
          p_filters->>'exam_kind',p_filters->>'exam_type'
        )))
      and (v_min_questions is null or active_count>=v_min_questions)
      and (v_max_questions is null or active_count<=v_max_questions)
      and (v_category is null or bank_category=v_category)
      and (
        v_variant is null
        or bank_variant=v_variant
        or (
          v_variant='semester_1' and bank_category='semester'
          and coalesce(metadata->>'term',metadata->>'exam_period','')
            in ('1','semester_1')
        )
        or (
          v_variant='semester_2' and bank_category='semester'
          and coalesce(metadata->>'term',metadata->>'exam_period','')
            in ('2','semester_2')
        )
      )
      and case when jsonb_typeof(p_filters->'tags')='array'
          and jsonb_array_length(p_filters->'tags')>0
        then tags && array(
          select value from jsonb_array_elements_text(p_filters->'tags')
        ) else true end
  ), totals as (
    select count(*)::bigint total from filtered
  ), page as (
    select * from filtered
    order by created_at desc,id desc
    limit v_limit offset v_offset
  ), payload as (
    select created_at,id,
      case when v_is_admin then jsonb_build_object(
        'id',id,'stable_id',stable_id,'title',title,'province',province,
        'grade',document_grade,'exam_year',exam_year,'exam_kind',exam_kind,
        'tags',tags,'status',status,'bank_category',bank_category,
        'bank_variant',bank_variant,
        'source_origin',catalog_source_origin,
        'assignable',source_ready,
        'question_count',active_count,'total_question_count',total_count,
        'quarantined_count',quarantined_count,
        'import_state',coalesce(metadata->>'import_state','legacy_complete'),
        'expected_count',case
          when coalesce(metadata->>'expected_count','') ~ '^[1-9][0-9]*$'
            then (metadata->>'expected_count')::integer
          else null end,
        'created_at',created_at
      ) else jsonb_build_object(
        'id',id,'title',title,'province',province,'grade',document_grade,
        'exam_year',exam_year,'exam_kind',exam_kind,'tags',tags,
        'bank_category',bank_category,'bank_variant',bank_variant,
        'source_origin',catalog_source_origin,'assignable',source_ready,
        'question_count',active_count,'created_at',created_at
      ) end item
    from page
  )
  select totals.total,coalesce(
    jsonb_agg(payload.item order by payload.created_at desc,payload.id desc)
      filter (where payload.item is not null),
    '[]'::jsonb
  ) into v_total,v_items
  from totals left join payload on true
  group by totals.total;

  return jsonb_build_object(
    'total',coalesce(v_total,0),'items',coalesce(v_items,'[]'::jsonb),
    'limit',v_limit,'offset',v_offset
  );
end;
$function$;

revoke all on function public.vm_bank_source_exam_catalog(
  jsonb,integer,integer
) from public, anon;
grant execute on function public.vm_bank_source_exam_catalog(
  jsonb,integer,integer
) to authenticated, service_role;
