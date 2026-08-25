-- Keep the explicit categories emitted by the current import UI, while
-- allowing legacy documents named Dethamkhao/Deminhhoa/Dechinhthuc to reach
-- the graduation-exam catalogue even when their old exam_kind is just mock.

create index if not exists vm_question_bank_item_sources_document_item_idx
  on private.vm_question_bank_item_sources(document_id,item_id);

create or replace function private.vm_bank_document_category(
  p_source_kind text,
  p_title text,
  p_original_filename text,
  p_exam_kind text,
  p_tags text[]
)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog, pg_temp
as $function$
  select case
    when coalesce(p_source_kind,'')='topic_pack' then 'topic_pack'
    when coalesce(p_source_kind,'')<>'mock_exam' then 'other_content'
    when lower(btrim(coalesce(p_exam_kind,''))) in (
      'thpt_official','thpt_reference','thpt_mock'
    ) then 'thptqg'
    when lower(btrim(coalesce(p_exam_kind,''))) in (
      'midterm','final','semester','semester_1','semester_2'
    ) then 'semester'
    when lower(btrim(coalesce(p_exam_kind,''))) in ('chapter','other')
      then 'other_exam'
    -- Old imports used exam_kind=mock for every whole exam.  Only filenames
    -- with explicit graduation/reference wording are promoted; a generic mock
    -- remains in the catch-all group below.
    when lower(concat_ws(
      ' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')
    )) ~ '(thptqg|thpt qg|tốt nghiệp|tot nghiep|dethamkhao|deminhhoa|dechinhthuc)'
      then 'thptqg'
    when lower(concat_ws(
      ' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')
    )) ~ '(^|[^a-z0-9])(hk[12]|ghk[12]?|học kỳ|hoc ky|giữa kỳ|giua ky|cuối kỳ|cuoi ky)'
      then 'semester'
    else 'other_exam'
  end;
$function$;

create or replace function private.vm_bank_document_variant(
  p_source_kind text,
  p_title text,
  p_original_filename text,
  p_exam_kind text,
  p_tags text[]
)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog, pg_temp
as $function$
  select case
    when coalesce(p_source_kind,'')='topic_pack' then 'topic'
    when lower(btrim(coalesce(p_exam_kind,'')))='thpt_official' then 'official'
    when lower(btrim(coalesce(p_exam_kind,'')))='thpt_reference' then 'reference'
    when lower(btrim(coalesce(p_exam_kind,'')))='thpt_mock' then 'mock'
    when lower(btrim(coalesce(p_exam_kind,''))) in (
      'midterm','final','semester','semester_1','semester_2','chapter','other'
    ) then lower(btrim(p_exam_kind))
    -- Legacy imports stored every complete source as exam_kind=mock.  Derive
    -- the semantic variant from its original name before the generic fallback.
    when lower(concat_ws(
      ' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')
    )) ~ '(dechinhthuc)'
      then 'official'
    when lower(concat_ws(
      ' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')
    )) ~ '(dethamkhao|deminhhoa)'
      then 'reference'
    when lower(concat_ws(
      ' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')
    )) ~ '(^|[^a-z0-9])(ghk[12]?|giữa kỳ|giua ky)'
      then 'midterm'
    when lower(concat_ws(
      ' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')
    )) ~ '(^|[^a-z0-9])(cuối kỳ|cuoi ky)'
      then 'final'
    when lower(concat_ws(
      ' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')
    )) ~ '(^|[^a-z0-9])(hk1|học kỳ 1|hoc ky 1)'
      then 'semester_1'
    when lower(concat_ws(
      ' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')
    )) ~ '(^|[^a-z0-9])(hk2|học kỳ 2|hoc ky 2)'
      then 'semester_2'
    when coalesce(p_source_kind,'')='mock_exam' then 'mock'
    else 'other'
  end;
$function$;

revoke all on function private.vm_bank_document_category(
  text,text,text,text,text[]
) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_document_variant(
  text,text,text,text,text[]
) from public, anon, authenticated, service_role;

-- Re-publish the source catalogue so semantic category/variant filters also
-- work for legacy exam_kind=mock documents.  Missing grade metadata stays
-- explicit: several legacy files contain mixed-grade IDs, so silently calling
-- them grade 12 would make the strict grade filter unreliable.
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
        count(*) filter (where item.status='quarantined')::integer quarantined_count
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
    select * from filtered order by created_at desc,id desc limit v_limit offset v_offset
  ), payload as (
    select created_at,id,
      case when v_is_admin then jsonb_build_object(
        'id',id,'stable_id',stable_id,'title',title,'province',province,
        'grade',document_grade,'exam_year',exam_year,'exam_kind',exam_kind,
        'tags',tags,'status',status,'bank_category',bank_category,
        'bank_variant',bank_variant,'assignable',source_ready,
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
        'assignable',source_ready,'question_count',active_count,
        'created_at',created_at
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

-- Canonical totals are deliberately separate from document occurrences.
-- The same canonical question can appear in several topic packs; the overview
-- must show the real usable capacity of the bank instead of counting copies.
create or replace function public.vm_bank_category_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_items jsonb;
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
      document.id document_id,
      document.status document_status
    from private.vm_question_bank_documents document
    where document.status in ('active','quarantined')
  ), links as (
    select
      document.category,
      document.document_id,
      document.document_status,
      item.id item_id,
      item.status item_status
    from bank_documents document
    left join private.vm_question_bank_item_sources source
      on source.document_id=document.document_id
    left join private.vm_question_bank_items item on item.id=source.item_id
  ), grouped as (
    select
      category,
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
    from links
    group by category
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',category,
    'active_documents',active_documents,
    'quarantined_documents',case when public.is_admin()
      then quarantined_documents else 0 end,
    'active_questions',active_questions,
    'quarantined_questions',case when public.is_admin()
      then quarantined_questions else 0 end
  ) order by category),'[]'::jsonb)
  into v_items
  from grouped;

  return jsonb_build_object(
    'role',case when public.is_admin() then 'admin' else 'teacher' end,
    'items',v_items
  );
end;
$function$;

revoke all on function public.vm_bank_category_summary() from public, anon;
grant execute on function public.vm_bank_category_summary()
  to authenticated, service_role;
