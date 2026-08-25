-- Separate provenance (who/where a source came from) from its pedagogical
-- category. A legacy Dethamkhao7 may still be THPTQG/reference content, but it
-- belongs to the internally authored shelf rather than the province shelf.

create or replace function private.vm_bank_document_source_origin(
  p_source_kind text,
  p_title text,
  p_original_filename text,
  p_province text,
  p_exam_kind text,
  p_tags text[],
  p_metadata jsonb,
  p_provenance jsonb
)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog, pg_temp
as $function$
  with normalized as (
    select
      lower(btrim(coalesce(
        nullif(p_metadata->>'source_origin',''),
        nullif(p_provenance->>'source_origin',''),
        ''
      ))) explicit_origin,
      lower(concat_ws(
        ' ',p_title,p_original_filename,p_exam_kind,
        array_to_string(coalesce(p_tags,'{}'::text[]),' '),
        p_metadata->>'source_title',p_metadata->>'source_label'
      )) source_text
  )
  select case
    when coalesce(p_source_kind,'')='topic_pack' then 'topic_pack'
    when explicit_origin in (
      'authored','author','teacher_authored','internal','original'
    ) then 'authored'
    when explicit_origin in (
      'province_exam','province','local_exam','external_exam','institution_exam'
    ) then 'province_exam'
    when explicit_origin in ('topic_pack','topic') then 'topic_pack'
    when explicit_origin='other' then 'other'
    -- This exact compact naming convention belongs to the legacy author's
    -- self-created sets. Keep 4-digit official years such as DeThamKhao2025
    -- outside this rule.
    when source_text ~ '(^|[^a-z0-9])dethamkhao[0-9]{1,2}([^a-z0-9]|$)'
      then 'authored'
    when lower(btrim(coalesce(p_exam_kind,''))) in (
      'authored','teacher_authored','internal','original'
    ) or coalesce(p_tags,'{}'::text[]) && array[
      'authored','teacher-authored','internal','tu-soan','tự soạn'
    ]::text[] then 'authored'
    when nullif(btrim(coalesce(p_province,'')),'') is not null
      then 'province_exam'
    when source_text ~ '(^|[^a-z])(sở gd|so gd|sở giáo dục|so giao duc|trường thpt|truong thpt|bộ gd|bo gd|ubnd)([^a-z]|$)'
      then 'province_exam'
    else 'other'
  end
  from normalized;
$function$;

create or replace function private.vm_bank_safe_relative_path(
  p_provenance jsonb,
  p_metadata jsonb
)
returns text
language plpgsql
immutable
parallel safe
security invoker
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_path text;
begin
  v_path:=nullif(btrim(coalesce(
    p_provenance->>'relative_path',
    p_metadata->>'relative_path',
    p_provenance->>'source_relative_path',
    ''
  )), '');
  if v_path is null then return null; end if;
  v_path:=replace(v_path,E'\\','/');
  if char_length(v_path)>500
    or v_path ~ '(^/|^[a-zA-Z]:/|(^|/)\.\.(/|$)|://)'
  then
    return null;
  end if;
  return v_path;
end;
$function$;

revoke all on function private.vm_bank_document_source_origin(
  text,text,text,text,text,text[],jsonb,jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_safe_relative_path(jsonb,jsonb)
  from public, anon, authenticated, service_role;

-- Admin-only repository index. Raw TeX, answer data, hashes and unrestricted
-- provenance stay private; the full source is fetched only through the existing
-- guarded vm_bank_admin_document RPC after an administrator chooses a row.
create or replace function public.vm_bank_admin_document_catalog(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 40,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_document_status text:=nullif(btrim(coalesce(p_filters->>'status','')), '');
  v_repository_status text:=nullif(btrim(coalesce(
    p_filters->>'repository_status',''
  )), '');
  v_source_kind text:=nullif(btrim(coalesce(p_filters->>'source_kind','')), '');
  v_source_origin text:=nullif(btrim(coalesce(p_filters->>'source_origin','')), '');
  v_category text:=nullif(btrim(coalesce(
    p_filters->>'bank_category',p_filters->>'category',''
  )), '');
  v_variant text:=nullif(btrim(coalesce(
    p_filters->>'bank_variant',p_filters->>'variant',''
  )), '');
  v_grade smallint;
  v_query text:=lower(btrim(coalesce(p_filters->>'query','')));
  v_limit integer:=least(greatest(coalesce(p_limit,40),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;

  begin
    v_grade:=nullif(p_filters->>'grade','')::smallint;
    if v_grade not between 1 and 12 then v_grade:=null; end if;
  exception when others then v_grade:=null;
  end;

  with repository as (
    select
      document.id,document.stable_id,document.source_kind,document.title,
      document.province,document.exam_year,document.exam_kind,document.tags,
      document.original_filename,document.status document_status,
      document.created_at,
      document.updated_at,document.metadata,
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
      ) source_origin,
      private.vm_bank_safe_relative_path(
        document.provenance,document.metadata
      ) relative_path,
      pg_catalog.octet_length(document.raw_tex) raw_size,
      case
        when jsonb_typeof(document.metadata->'parse_errors')='array'
          then jsonb_array_length(document.metadata->'parse_errors')
        else 0
      end error_count,
      counts.total_count,counts.active_count,counts.quarantined_count,
      case when document.source_kind='mock_exam' then
        private.vm_bank_document_is_ready(
          document.metadata,counts.total_count,counts.active_count,
          counts.quarantined_count
        )
      else
        counts.total_count>0
        and counts.active_count=counts.total_count
        and counts.quarantined_count=0
        and case when document.metadata ? 'import_state' then
          lower(coalesce(document.metadata->>'import_state',''))='complete'
          and coalesce(document.metadata->>'expected_count','') ~ '^[1-9][0-9]*$'
          and (document.metadata->>'expected_count')::integer=counts.total_count
        else true end
      end source_ready
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
  ), classified as (
    select repository.*,
      case
        when document_status='archived' then 'archived'
        when error_count>0 then 'error'
        when lower(coalesce(metadata->>'import_state','legacy_complete'))
          not in ('complete','legacy_complete') then 'staging'
        when document_status='quarantined' or not source_ready then 'review'
        else 'ready'
      end repository_status
    from repository
  ), filtered as (
    select * from classified
    where (v_document_status is null
        or document_status=v_document_status)
      and (v_repository_status is null
        or repository_status=v_repository_status)
      and (v_source_kind is null or source_kind=v_source_kind)
      and (v_source_origin is null or source_origin=v_source_origin)
      and (v_category is null or bank_category=v_category)
      and (v_variant is null or bank_variant=v_variant)
      and (v_grade is null or document_grade=v_grade)
      and (
        v_query=''
        or lower(concat_ws(
          ' ',stable_id,title,original_filename,province,exam_kind,
          array_to_string(tags,' '),relative_path
        )) like '%'||v_query||'%'
      )
  ), totals as (
    select count(*)::bigint total from filtered
  ), page as (
    select * from filtered
    order by updated_at desc,id desc
    limit v_limit offset v_offset
  ), payload as (
    select updated_at,id,jsonb_build_object(
      'id',id,
      'stable_id',stable_id,
      'title',title,
      'original_filename',original_filename,
      'relative_path',relative_path,
      'source_kind',source_kind,
      'source_origin',source_origin,
      'status',document_status,
      'repository_status',repository_status,
      'province',province,
      'grade',document_grade,
      'exam_year',exam_year,
      'exam_kind',exam_kind,
      'tags',tags,
      'bank_category',bank_category,
      'bank_variant',bank_variant,
      'assignable',source_ready,
      'question_count',active_count,
      'total_question_count',total_count,
      'active_count',active_count,
      'total_count',total_count,
      'quarantined_count',quarantined_count,
      'error_count',error_count,
      'import_state',coalesce(metadata->>'import_state','legacy_complete'),
      'expected_count',case
        when coalesce(metadata->>'expected_count','') ~ '^[1-9][0-9]*$'
          then (metadata->>'expected_count')::integer
        else null
      end,
      'raw_size',raw_size,
      'created_at',created_at,
      'updated_at',updated_at
    ) item
    from page
  )
  select totals.total,coalesce(
    jsonb_agg(payload.item order by payload.updated_at desc,payload.id desc)
      filter (where payload.item is not null),
    '[]'::jsonb
  ) into v_total,v_items
  from totals left join payload on true
  group by totals.total;

  return jsonb_build_object(
    'total',coalesce(v_total,0),
    'items',coalesce(v_items,'[]'::jsonb),
    'limit',v_limit,
    'offset',v_offset
  );
end;
$function$;

revoke all on function public.vm_bank_admin_document_catalog(
  jsonb,integer,integer
) from public, anon;
grant execute on function public.vm_bank_admin_document_catalog(
  jsonb,integer,integer
) to authenticated, service_role;

-- Keep the existing complete-exam catalogue API, adding source_origin as an
-- orthogonal filter and response field. This lets the UI show author-created
-- legacy sets separately without changing their THPTQG/reference semantics.
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

-- Preserve the category overview and add an independent origin overview.
create or replace function public.vm_bank_category_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_items jsonb;
  v_origins jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;

  with bank_documents as materialized (
    select
      private.vm_bank_document_category(
        document.source_kind,document.title,document.original_filename,
        document.exam_kind,document.tags
      ) category,
      private.vm_bank_document_source_origin(
        document.source_kind,document.title,document.original_filename,
        document.province,document.exam_kind,document.tags,
        document.metadata,document.provenance
      ) source_origin,
      document.id document_id,
      document.status document_status
    from private.vm_question_bank_documents document
    where document.status in ('active','quarantined')
  ), links as materialized (
    select
      document.category,document.source_origin,document.document_id,
      document.document_status,item.id item_id,item.status item_status
    from bank_documents document
    left join private.vm_question_bank_item_sources source
      on source.document_id=document.document_id
    left join private.vm_question_bank_items item on item.id=source.item_id
  ), category_grouped as (
    select
      category key,
      count(distinct document_id) filter (
        where document_status='active'
      )::integer active_documents,
      count(distinct document_id) filter (
        where document_status='quarantined'
      )::integer quarantined_documents,
      count(distinct item_id) filter (
        where document_status='active' and item_status='active'
      )::bigint active_questions,
      count(distinct item_id) filter (
        where item_status='quarantined'
      )::bigint quarantined_questions
    from links group by category
  ), origin_grouped as (
    select
      source_origin key,
      count(distinct document_id) filter (
        where document_status='active'
      )::integer active_documents,
      count(distinct document_id) filter (
        where document_status='quarantined'
      )::integer quarantined_documents,
      count(distinct item_id) filter (
        where document_status='active' and item_status='active'
      )::bigint active_questions,
      count(distinct item_id) filter (
        where item_status='quarantined'
      )::bigint quarantined_questions
    from links group by source_origin
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'key',key,
      'active_documents',active_documents,
      'quarantined_documents',case when public.is_admin()
        then quarantined_documents else 0 end,
      'active_questions',active_questions,
      'quarantined_questions',case when public.is_admin()
        then quarantined_questions else 0 end
    ) order by key) from category_grouped),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'key',key,
      'active_documents',active_documents,
      'quarantined_documents',case when public.is_admin()
        then quarantined_documents else 0 end,
      'active_questions',active_questions,
      'quarantined_questions',case when public.is_admin()
        then quarantined_questions else 0 end
    ) order by key) from origin_grouped),'[]'::jsonb)
  into v_items,v_origins;

  return jsonb_build_object(
    'role',case when public.is_admin() then 'admin' else 'teacher' end,
    'items',v_items,
    'origins',v_origins
  );
end;
$function$;

revoke all on function public.vm_bank_category_summary() from public, anon;
grant execute on function public.vm_bank_category_summary()
  to authenticated, service_role;
