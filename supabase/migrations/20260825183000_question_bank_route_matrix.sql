-- Semantic question-bank routes, matrix data and inventory summaries.
-- The public RPCs expose only pedagogical grade/area/chapter/skill facets to
-- teachers. Raw taxonomy IDs, stable IDs and legacy IDs remain admin-only.

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
    when lower(concat_ws(' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')))
      ~ '(thptqg|thpt qg|tốt nghiệp|tot nghiep|thi thử|thi thu|tham khảo|tham khao|minh họa|minh hoa|chính thức|chinh thuc|dethamkhao|deminhhoa|dechinhthuc)'
      then 'thptqg'
    when lower(concat_ws(' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')))
      ~ '(^|[^a-z0-9])(hk[12]|ghk[12]?|học kỳ|hoc ky|giữa kỳ|giua ky|cuối kỳ|cuoi ky)'
      then 'semester'
    else 'other_exam'
  end;
$function$;

revoke all on function private.vm_bank_document_category(text,text,text,text,text[])
  from public, anon, authenticated, service_role;

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
    when lower(concat_ws(' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')))
      ~ '(dechinhthuc|đề chính thức|de chinh thuc)' then 'official'
    when lower(concat_ws(' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')))
      ~ '(dethamkhao|deminhhoa|đề tham khảo|de tham khao|minh họa|minh hoa)'
      then 'reference'
    when coalesce(p_source_kind,'')='mock_exam' then 'mock'
    else 'other'
  end;
$function$;

revoke all on function private.vm_bank_document_variant(text,text,text,text,text[])
  from public, anon, authenticated, service_role;

-- One private, queryable route per canonical bank item. security_invoker and
-- the explicit table revoke keep the view out of the Data API even if the
-- private schema is exposed by mistake later.
create or replace view private.vm_question_bank_routes
with (security_invoker = true) as
select
  i.id as item_id,
  i.stable_id,
  i.legacy_code,
  i.status as item_status,
  i.question_type,
  i.difficulty,
  i.grade as item_grade,
  coalesce(
    nullif(i.taxonomy->>'taxonomy_key',''),
    nullif(i.taxonomy->>'key',''),
    nullif(i.similarity_key,''),
    t.taxonomy_key
  ) as taxonomy_key,
  semantic.grade,
  semantic.area,
  semantic.chapter,
  coalesce(nullif(i.taxonomy->>'topic_code',''),t.topic_code) as topic_code,
  semantic.skill,
  coalesce(nullif(i.taxonomy->>'skill_family',''),t.skill_family)
    as skill_family,
  coalesce(nullif(i.taxonomy->>'variant',''),t.variant) as variant,
  case semantic.area
    when 'C' then 'Chuyên đề'
    when 'D' then 'Đại số và Giải tích'
    when 'H' then 'Hình học'
    else coalesce(semantic.area,'Khác')
  end as area_label,
  coalesce(
    nullif(btrim(i.taxonomy->'vi'->>'chap_name'),''),
    nullif(btrim(t.vi_label->>'chap_name'),''),
    case when semantic.chapter is null then null
      else 'Chương '||semantic.chapter::text end
  ) as chapter_label,
  coalesce(
    nullif(btrim(i.taxonomy->'vi'->>'lesson_name'),''),
    nullif(btrim(t.vi_label->>'lesson_name'),''),
    nullif(btrim(i.taxonomy->'vi'->>'type_name'),''),
    nullif(btrim(t.vi_label->>'type_name'),''),
    nullif(btrim(i.taxonomy->>'topic_code'),''),
    nullif(btrim(t.topic_code),''),
    case when semantic.skill is null then null
      else 'Bài/chủ đề '||semantic.skill::text end
  ) as skill_label,
  coalesce(
    nullif(btrim(i.taxonomy->'vi'->>'type_name'),''),
    nullif(btrim(t.vi_label->>'type_name'),''),
    case when coalesce(nullif(i.taxonomy->>'variant',''),t.variant) is null
      then null else 'Dạng '||coalesce(nullif(i.taxonomy->>'variant',''),t.variant) end
  ) as variant_label,
  (
    semantic.grade is not null
    and semantic.area is not null
    and semantic.chapter is not null
    and semantic.skill is not null
  ) as route_valid
from private.vm_question_bank_items i
left join private.vm_question_bank_taxonomy t
  on t.taxonomy_key=coalesce(
    nullif(i.similarity_key,''),
    nullif(i.taxonomy->>'taxonomy_key',''),
    nullif(i.taxonomy->>'key','')
  )
 and t.status='active'
cross join lateral (
  select
    coalesce(
      case when coalesce(i.taxonomy->>'grade','') ~ '^[0-9]{1,2}$'
        then (i.taxonomy->>'grade')::smallint end,
      t.grade,
      i.grade
    ) grade,
    coalesce(nullif(upper(i.taxonomy->>'area'),''),t.area) area,
    coalesce(
      case when coalesce(i.taxonomy->>'chapter','') ~ '^[0-9]+$'
        then (i.taxonomy->>'chapter')::integer end,
      t.chapter
    ) chapter,
    coalesce(
      case when coalesce(i.taxonomy->>'skill','') ~ '^[0-9]+$'
        then (i.taxonomy->>'skill')::integer end,
      t.skill
    ) skill
) semantic;

revoke all on table private.vm_question_bank_routes
  from public, anon, authenticated, service_role;

create index if not exists vm_qb_items_route_filter_idx
  on private.vm_question_bank_items(
    status,grade,similarity_key,question_type,difficulty
  );

-- Adds safe semantic routing filters. Structural filters (legacy_prefix,
-- taxonomy_codes and source_kinds) remain available only to admin callers
-- because the public search/generator sanitizers remove them for teachers.
create or replace function private.vm_bank_item_matches(
  p_item private.vm_question_bank_items,
  p_filters jsonb default '{}'::jsonb
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $function$
  select case when coalesce(p_filters->>'grade','') ~ '^[0-9]{1,2}$'
      then (p_item).grade=(p_filters->>'grade')::smallint else true end
    and case when jsonb_typeof(p_filters->'grades')='array' and jsonb_array_length(p_filters->'grades')>0
      then (p_item).grade in (select value::smallint from jsonb_array_elements_text(p_filters->'grades') where value ~ '^[0-9]{1,2}$') else true end
    and case when jsonb_typeof(p_filters->'difficulties')='array' and jsonb_array_length(p_filters->'difficulties')>0
      then (p_item).difficulty in (select value from jsonb_array_elements_text(p_filters->'difficulties')) else true end
    and (
      nullif(p_filters->>'difficulty','') is null
      or (p_item).difficulty = upper(p_filters->>'difficulty')
    )
    and case when jsonb_typeof(p_filters->'question_types')='array' and jsonb_array_length(p_filters->'question_types')>0
      then (p_item).question_type in (select value from jsonb_array_elements_text(p_filters->'question_types')) else true end
    and (
      nullif(p_filters->>'question_type','') is null
      or (p_item).question_type = p_filters->>'question_type'
    )
    and (
      nullif(p_filters->>'legacy_prefix','') is null
      or (p_item).legacy_code ilike replace(replace(p_filters->>'legacy_prefix','%',E'\\%'),'_',E'\\_') || '%' escape E'\\'
    )
    and case when jsonb_typeof(p_filters->'taxonomy_codes')='array' and jsonb_array_length(p_filters->'taxonomy_codes')>0 then exists (
        select 1 from jsonb_array_elements_text(p_filters->'taxonomy_codes') t(code)
        where (p_item).legacy_code ilike replace(replace(t.code,'%',E'\\%'),'_',E'\\_') || '%' escape E'\\'
           or (p_item).similarity_key = t.code
      ) else true end
    and case when jsonb_typeof(p_filters->'source_kinds')='array' and jsonb_array_length(p_filters->'source_kinds')>0 then exists (
        select 1
        from private.vm_question_bank_item_sources src
        join private.vm_question_bank_documents d on d.id = src.document_id
        where src.item_id = (p_item).id
          and d.source_kind in (select value from jsonb_array_elements_text(p_filters->'source_kinds'))
      ) else true end
    and case when jsonb_typeof(p_filters->'tags')='array' and jsonb_array_length(p_filters->'tags')>0
      then (p_item).tags && array(select value from jsonb_array_elements_text(p_filters->'tags'))
      else true end
    and case when
      nullif(p_filters->>'area','') is not null
      or (jsonb_typeof(p_filters->'areas')='array' and jsonb_array_length(p_filters->'areas')>0)
      or coalesce(p_filters->>'chapter','') ~ '^[0-9]+$'
      or (jsonb_typeof(p_filters->'chapters')='array' and jsonb_array_length(p_filters->'chapters')>0)
      or coalesce(p_filters->>'skill','') ~ '^[0-9]+$'
      or (jsonb_typeof(p_filters->'skills')='array' and jsonb_array_length(p_filters->'skills')>0)
    then exists (
      select 1
      from (values(1)) seed(n)
      left join private.vm_question_bank_taxonomy route
        on route.status='active'
       and route.taxonomy_key=coalesce(
          nullif((p_item).similarity_key,''),
          nullif((p_item).taxonomy->>'taxonomy_key',''),
          nullif((p_item).taxonomy->>'key','')
        )
      where (nullif(p_filters->>'area','') is null
          or coalesce(nullif(upper((p_item).taxonomy->>'area'),''),route.area)
            =upper(p_filters->>'area'))
        and case when jsonb_typeof(p_filters->'areas')='array' and jsonb_array_length(p_filters->'areas')>0
          then coalesce(nullif(upper((p_item).taxonomy->>'area'),''),route.area)
            in (select upper(value) from jsonb_array_elements_text(p_filters->'areas')) else true end
        and (coalesce(p_filters->>'chapter','') !~ '^[0-9]+$'
          or coalesce(
            case when coalesce((p_item).taxonomy->>'chapter','') ~ '^[0-9]+$'
              then ((p_item).taxonomy->>'chapter')::integer end,
            route.chapter
          )=(p_filters->>'chapter')::integer)
        and case when jsonb_typeof(p_filters->'chapters')='array' and jsonb_array_length(p_filters->'chapters')>0
          then coalesce(
            case when coalesce((p_item).taxonomy->>'chapter','') ~ '^[0-9]+$'
              then ((p_item).taxonomy->>'chapter')::integer end,
            route.chapter
          ) in (select value::integer from jsonb_array_elements_text(p_filters->'chapters') where value ~ '^[0-9]+$') else true end
        and (coalesce(p_filters->>'skill','') !~ '^[0-9]+$'
          or coalesce(
            case when coalesce((p_item).taxonomy->>'skill','') ~ '^[0-9]+$'
              then ((p_item).taxonomy->>'skill')::integer end,
            route.skill
          )=(p_filters->>'skill')::integer)
        and case when jsonb_typeof(p_filters->'skills')='array' and jsonb_array_length(p_filters->'skills')>0
          then coalesce(
            case when coalesce((p_item).taxonomy->>'skill','') ~ '^[0-9]+$'
              then ((p_item).taxonomy->>'skill')::integer end,
            route.skill
          ) in (select value::integer from jsonb_array_elements_text(p_filters->'skills') where value ~ '^[0-9]+$') else true end
    ) else true end;
$function$;

revoke all on function private.vm_bank_item_matches(private.vm_question_bank_items,jsonb)
  from public, anon, authenticated, service_role;

-- Frontend contract: a dependent semantic catalogue for grade -> area ->
-- chapter -> lesson/topic. Teachers receive labels and counts only. Admins get
-- an additional structure object, never raw TeX, answers or solutions.
create or replace function public.vm_bank_taxonomy_facets(
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
  v_filters jsonb := coalesce(p_filters,'{}'::jsonb);
  v_status text;
  v_total bigint;
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

  with grouped as (
    select
      route.grade,
      route.area,
      route.chapter,
      route.skill,
      mode() within group (order by route.area_label)
        filter (where route.area_label is not null) area_label,
      mode() within group (order by route.chapter_label)
        filter (where route.chapter_label is not null) chapter_label,
      mode() within group (order by route.skill_label)
        filter (where route.skill_label is not null) skill_label,
      count(*)::integer item_count,
      array_agg(distinct route.taxonomy_key order by route.taxonomy_key)
        filter (where v_is_admin)
        taxonomy_keys,
      array_agg(distinct route.topic_code order by route.topic_code)
        filter (where v_is_admin)
        topic_codes,
      array_agg(distinct route.skill_family order by route.skill_family)
        filter (where v_is_admin)
        skill_families,
      (array_agg(distinct route.stable_id order by route.stable_id)
        filter (where v_is_admin))[1:25]
        sample_stable_ids,
      (array_agg(distinct route.legacy_code order by route.legacy_code)
        filter (where v_is_admin and route.legacy_code is not null))[1:25]
        sample_legacy_ids
    from private.vm_question_bank_routes route
    join private.vm_question_bank_items item on item.id=route.item_id
    where route.route_valid
      and item.status=v_status
      and private.vm_bank_item_matches(item,v_filters)
    group by route.grade,route.area,route.chapter,route.skill
  ), payload as (
    select
      grade,area,chapter,skill,
      case when v_is_admin then jsonb_build_object(
        'grade',grade,'area',area,'chapter',chapter,'skill',skill,
        'area_label',area_label,'chapter_label',chapter_label,
        'skill_label',skill_label,'count',item_count,
        'structure',jsonb_build_object(
          'taxonomy_keys',taxonomy_keys,
          'topic_codes',topic_codes,
          'skill_families',skill_families,
          'sample_stable_ids',sample_stable_ids,
          'sample_legacy_ids',sample_legacy_ids
        )
      ) else jsonb_build_object(
        'grade',grade,'area',area,'chapter',chapter,'skill',skill,
        'area_label',area_label,'chapter_label',chapter_label,
        'skill_label',skill_label,'count',item_count
      ) end item
    from grouped
  )
  select count(*),coalesce(
    jsonb_agg(item order by grade,chapter,area,skill),'[]'::jsonb
  )
  into v_total,v_items
  from payload;

  return jsonb_build_object(
    'role',case when v_is_admin then 'admin' else 'teacher' end,
    'status',v_status,'total',v_total,'items',v_items
  );
end;
$function$;

revoke all on function public.vm_bank_taxonomy_facets(jsonb)
  from public, anon;
grant execute on function public.vm_bank_taxonomy_facets(jsonb)
  to authenticated, service_role;

-- A compact count matrix used by the exam builder. The teacher branch exposes
-- only semantic labels and aggregate counts. The admin branch additionally
-- includes bounded ID samples and the underlying taxonomy structure.
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

  with grouped as (
    select
      route.grade,
      route.area,
      route.chapter,
      route.skill,
      mode() within group (order by route.area_label)
        filter (where route.area_label is not null) area_label,
      mode() within group (order by route.chapter_label)
        filter (where route.chapter_label is not null) chapter_label,
      mode() within group (order by route.skill_label)
        filter (where route.skill_label is not null) skill_label,
      route.question_type,
      route.difficulty,
      count(*)::integer item_count,
      array_agg(distinct route.taxonomy_key order by route.taxonomy_key)
        filter (where v_is_admin)
        taxonomy_keys,
      array_agg(distinct route.topic_code order by route.topic_code)
        filter (where v_is_admin)
        topic_codes,
      array_agg(distinct route.skill_family order by route.skill_family)
        filter (where v_is_admin)
        skill_families,
      (array_agg(distinct route.stable_id order by route.stable_id)
        filter (where v_is_admin))[1:25]
        sample_stable_ids,
      (array_agg(distinct route.legacy_code order by route.legacy_code)
        filter (where v_is_admin and route.legacy_code is not null))[1:25]
        sample_legacy_ids
    from private.vm_question_bank_routes route
    join private.vm_question_bank_items item on item.id=route.item_id
    where route.route_valid
      and item.status=v_status
      and private.vm_bank_item_matches(item,v_filters)
    group by route.grade,route.area,route.chapter,route.skill,
      route.question_type,route.difficulty
  ), payload as (
    select
      grade,area,chapter,skill,question_type,difficulty,item_count,
      case when v_is_admin then jsonb_build_object(
        'grade',grade,'area',area,'chapter',chapter,'skill',skill,
        'area_label',area_label,'chapter_label',chapter_label,
        'skill_label',skill_label,'question_type',question_type,
        'difficulty',difficulty,'count',item_count,
        'structure',jsonb_build_object(
          'taxonomy_keys',taxonomy_keys,
          'topic_codes',topic_codes,
          'skill_families',skill_families,
          'sample_stable_ids',sample_stable_ids,
          'sample_legacy_ids',sample_legacy_ids
        )
      ) else jsonb_build_object(
        'grade',grade,'area',area,'chapter',chapter,'skill',skill,
        'area_label',area_label,'chapter_label',chapter_label,
        'skill_label',skill_label,'question_type',question_type,
        'difficulty',difficulty,'count',item_count
      ) end item
    from grouped
  )
  select count(*),coalesce(sum(item_count),0),coalesce(
    jsonb_agg(item order by grade,chapter,area,skill,question_type,difficulty),
    '[]'::jsonb
  )
  into v_rows,v_questions,v_items
  from payload;

  return jsonb_build_object(
    'role',case when v_is_admin then 'admin' else 'teacher' end,
    'status',v_status,'row_count',v_rows,'question_count',v_questions,
    'items',v_items
  );
end;
$function$;

revoke all on function public.vm_bank_matrix(jsonb)
  from public, anon;
grant execute on function public.vm_bank_matrix(jsonb)
  to authenticated, service_role;

-- Inventory cards for the bank overview. Classification is derived from
-- source_kind plus safe document metadata; raw source content never leaves
-- private. Teachers see active inventory only; admins may inspect quarantine.
create or replace function public.vm_bank_inventory(
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
  v_status text;
  v_category text:=nullif(p_filters->>'category','');
  v_documents bigint;
  v_questions bigint;
  v_full_exams bigint;
  v_topic_packs bigint;
  v_active_documents bigint;
  v_quarantined_documents bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;
  v_is_admin:=public.is_admin();
  v_status:=case
    when v_is_admin and p_filters->>'status' in ('active','quarantined','archived')
      then p_filters->>'status'
    when v_is_admin then null
    else 'active'
  end;

  with document_stats as (
    select
      private.vm_bank_document_category(
        document.source_kind,document.title,document.original_filename,
        document.exam_kind,document.tags
      ) category,
      private.vm_bank_document_variant(
        document.source_kind,document.title,document.original_filename,
        document.exam_kind,document.tags
      ) variant,
      document.status,
      count(source.item_id)::integer question_occurrences,
      count(source.item_id) filter (where item.status='active')::integer
        active_questions,
      count(source.item_id) filter (where item.status='quarantined')::integer
        quarantined_questions
    from private.vm_question_bank_documents document
    left join private.vm_question_bank_item_sources source
      on source.document_id=document.id
    left join private.vm_question_bank_items item on item.id=source.item_id
    where (v_status is null or document.status=v_status)
    group by document.id,document.source_kind,document.title,
      document.original_filename,document.exam_kind,document.tags,document.status
  ), grouped as (
    select
      category,variant,status,
      count(*)::integer document_count,
      count(*) filter (
        where category in ('thptqg','semester','other_exam')
          and status='active' and active_questions between 1 and 200
      )::integer assignable_documents,
      coalesce(sum(question_occurrences),0)::bigint question_occurrences,
      coalesce(sum(active_questions),0)::bigint active_questions,
      coalesce(sum(quarantined_questions),0)::bigint quarantined_questions
    from document_stats
    where v_category is null or category=v_category
    group by category,variant,status
  ), payload as (
    select
      category,variant,status,document_count,assignable_documents,
      question_occurrences,active_questions,quarantined_questions,
      case when v_is_admin then question_occurrences else active_questions end
        visible_question_occurrences,
      case category
        when 'topic_pack' then 'Câu theo chủ đề'
        when 'thptqg' then 'THPTQG / thi thử'
        when 'semester' then 'Học kỳ / giữa kỳ'
        when 'other_exam' then 'Đề hoàn chỉnh khác'
        else 'Nội dung khác'
      end category_label,
      case when v_is_admin then jsonb_build_object(
        'key',category,
        'label',case category
          when 'topic_pack' then 'Câu theo chủ đề'
          when 'thptqg' then 'THPTQG / thi thử'
          when 'semester' then 'Học kỳ / giữa kỳ'
          when 'other_exam' then 'Đề hoàn chỉnh khác'
          else 'Nội dung khác' end,
        'variant',variant,'status',status,'documents',document_count,
        'assignable_documents',assignable_documents,
        'question_occurrences',question_occurrences,
        'active_questions',active_questions,
        'quarantined_questions',quarantined_questions
      ) else jsonb_build_object(
        'key',category,
        'label',case category
          when 'topic_pack' then 'Câu theo chủ đề'
          when 'thptqg' then 'THPTQG / thi thử'
          when 'semester' then 'Học kỳ / giữa kỳ'
          when 'other_exam' then 'Đề hoàn chỉnh khác'
          else 'Nội dung khác' end,
        'variant',variant,
        'documents',document_count,
        'assignable_documents',assignable_documents,
        'question_occurrences',active_questions
      ) end item
    from grouped
  )
  select coalesce(sum(document_count),0),
    coalesce(sum(visible_question_occurrences),0),
    coalesce(sum(assignable_documents) filter (
      where category in ('thptqg','semester','other_exam')
    ),0),
    coalesce(sum(document_count) filter (
      where category='topic_pack' and status='active'
    ),0),
    coalesce(sum(document_count) filter (where status='active'),0),
    coalesce(sum(document_count) filter (where status='quarantined'),0),
    coalesce(jsonb_agg(item order by category,variant,status),'[]'::jsonb)
  into v_documents,v_questions,v_full_exams,v_topic_packs,
    v_active_documents,v_quarantined_documents,v_items
  from payload;

  return jsonb_build_object(
    'role',case when v_is_admin then 'admin' else 'teacher' end,
    'documents',v_documents,'question_occurrences',v_questions,
    'summary',jsonb_build_object(
      'full_exams',v_full_exams,
      'topic_packs',v_topic_packs,
      'active',v_active_documents,
      'quarantined',case when v_is_admin then v_quarantined_documents else 0 end
    ),
    'available_statuses',case when v_is_admin
      then jsonb_build_array('active','quarantined','archived')
      else jsonb_build_array('active') end,
    'items',v_items
  );
end;
$function$;

revoke all on function public.vm_bank_inventory(jsonb)
  from public, anon;
grant execute on function public.vm_bank_inventory(jsonb)
  to authenticated, service_role;

-- Keeps the existing source-exam contract and adds bank_category/bank_variant
-- filters. The classifier reads original_filename internally but never returns
-- it to a teacher.
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

  select count(*) into v_total
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
    and (v_query='' or lower(document.title||' '||coalesce(document.province,'')||' '||coalesce(document.exam_kind,'')) like '%'||v_query||'%')
    and (nullif(coalesce(p_filters->>'province',p_filters->>'province_or_unit'),'') is null
      or lower(coalesce(document.province,''))=lower(coalesce(p_filters->>'province',p_filters->>'province_or_unit')))
    and (v_exam_year_filter is null or document.exam_year=v_exam_year_filter)
    and (nullif(coalesce(p_filters->>'exam_kind',p_filters->>'exam_type'),'') is null
      or lower(coalesce(document.exam_kind,''))=lower(coalesce(p_filters->>'exam_kind',p_filters->>'exam_type')))
    and (v_min_questions is null or counts.active_count>=v_min_questions)
    and (v_max_questions is null or counts.active_count<=v_max_questions)
    and (v_category is null or private.vm_bank_document_category(
      document.source_kind,document.title,document.original_filename,
      document.exam_kind,document.tags
    )=v_category)
    and (v_variant is null or private.vm_bank_document_variant(
      document.source_kind,document.title,document.original_filename,
      document.exam_kind,document.tags
    )=v_variant)
    and case when jsonb_typeof(p_filters->'tags')='array' and jsonb_array_length(p_filters->'tags')>0
      then document.tags && array(select value from jsonb_array_elements_text(p_filters->'tags')) else true end;

  select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb)
  into v_items
  from (
    select document.created_at,
      case when v_is_admin then jsonb_build_object(
        'id',document.id,'stable_id',document.stable_id,
        'title',document.title,'province',document.province,
        'exam_year',document.exam_year,'exam_kind',document.exam_kind,
        'tags',document.tags,'status',document.status,
        'bank_category',private.vm_bank_document_category(
          document.source_kind,document.title,document.original_filename,
          document.exam_kind,document.tags
        ),
        'bank_variant',private.vm_bank_document_variant(
          document.source_kind,document.title,document.original_filename,
          document.exam_kind,document.tags
        ),
        'assignable',(counts.active_count between 1 and 200),
        'question_count',counts.active_count,
        'total_question_count',counts.total_count,
        'quarantined_count',counts.quarantined_count,
        'created_at',document.created_at
      ) else jsonb_build_object(
        'id',document.id,'title',document.title,
        'province',document.province,'exam_year',document.exam_year,
        'exam_kind',document.exam_kind,'tags',document.tags,
        'bank_category',private.vm_bank_document_category(
          document.source_kind,document.title,document.original_filename,
          document.exam_kind,document.tags
        ),
        'bank_variant',private.vm_bank_document_variant(
          document.source_kind,document.title,document.original_filename,
          document.exam_kind,document.tags
        ),
        'assignable',(counts.active_count between 1 and 200),
        'question_count',counts.active_count,
        'created_at',document.created_at
      ) end item
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
      and (v_query='' or lower(document.title||' '||coalesce(document.province,'')||' '||coalesce(document.exam_kind,'')) like '%'||v_query||'%')
      and (nullif(coalesce(p_filters->>'province',p_filters->>'province_or_unit'),'') is null
        or lower(coalesce(document.province,''))=lower(coalesce(p_filters->>'province',p_filters->>'province_or_unit')))
      and (v_exam_year_filter is null or document.exam_year=v_exam_year_filter)
      and (nullif(coalesce(p_filters->>'exam_kind',p_filters->>'exam_type'),'') is null
        or lower(coalesce(document.exam_kind,''))=lower(coalesce(p_filters->>'exam_kind',p_filters->>'exam_type')))
      and (v_min_questions is null or counts.active_count>=v_min_questions)
      and (v_max_questions is null or counts.active_count<=v_max_questions)
      and (v_category is null or private.vm_bank_document_category(
        document.source_kind,document.title,document.original_filename,
        document.exam_kind,document.tags
      )=v_category)
      and (v_variant is null or private.vm_bank_document_variant(
        document.source_kind,document.title,document.original_filename,
        document.exam_kind,document.tags
      )=v_variant)
      and case when jsonb_typeof(p_filters->'tags')='array' and jsonb_array_length(p_filters->'tags')>0
        then document.tags && array(select value from jsonb_array_elements_text(p_filters->'tags')) else true end
    order by document.created_at desc
    limit v_limit offset v_offset
  ) rows;

  return jsonb_build_object(
    'total',v_total,'items',v_items,'limit',v_limit,'offset',v_offset
  );
end;
$function$;

revoke all on function public.vm_bank_source_exam_catalog(jsonb,integer,integer)
  from public, anon;
grant execute on function public.vm_bank_source_exam_catalog(jsonb,integer,integer)
  to authenticated, service_role;

-- Keep automatic generation backward compatible while allowing the semantic
-- route filters exposed by vm_bank_taxonomy_facets. Teachers never pass or
-- receive physical taxonomy/source identifiers through this entry point.
create or replace function public.vm_bank_generate_exam(p_spec jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_class_id uuid := nullif(p_spec->>'class_id','')::uuid;
  v_portal_id uuid := nullif(p_spec->>'portal_id','')::uuid;
  v_exam_id uuid;
  v_seed text := left(coalesce(nullif(p_spec->>'seed',''),encode(extensions.gen_random_bytes(12),'hex')),100);
  v_title text := left(coalesce(nullif(trim(p_spec->>'title'),''),'Đề tạo tự động từ ngân hàng'),240);
  v_blueprint jsonb := p_spec->'blueprint';
  v_segment jsonb;
  v_segment_filters jsonb;
  v_base_filters jsonb;
  v_filters jsonb;
  v_is_admin boolean;
  v_needed integer;
  v_default_count integer;
  v_picked uuid[];
  v_selected uuid[] := '{}'::uuid[];
  v_warnings jsonb := '[]'::jsonb;
  v_matrix jsonb := '[]'::jsonb;
  v_count integer;
  v_requested_total integer := 0;
begin
  perform private.vm_bank_assert_exam_target(v_class_id,v_portal_id);
  v_is_admin := public.is_admin();
  v_base_filters := case when jsonb_typeof(p_spec->'filters')='object'
    then p_spec->'filters' else '{}'::jsonb end;
  if not v_is_admin then
    -- Teachers select only pedagogical attributes. Taxonomy/legacy/source IDs
    -- and explicit bank item IDs remain an admin-only implementation detail.
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
  if jsonb_typeof(v_blueprint) is distinct from 'array' then
    v_blueprint := null;
  elsif jsonb_array_length(v_blueprint)=0 then
    v_blueprint := null;
  end if;
  if v_blueprint is null then
    begin
      v_default_count:=coalesce(nullif(p_spec->>'count','')::integer,20);
    exception when others then
      raise exception 'bank_blueprint_count_invalid' using errcode='22023';
    end;
    if v_default_count<1 then
      raise exception 'bank_blueprint_count_invalid' using errcode='22023';
    elsif v_default_count>200 then
      raise exception 'bank_blueprint_question_limit_exceeded' using errcode='22023';
    elsif v_default_count>100 then
      -- Keep each query bounded while honoring a legitimate total up to 200.
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
  if jsonb_array_length(v_blueprint)>30 then
    raise exception 'bank_blueprint_too_large' using errcode='22023';
  end if;

  for v_segment in select value from jsonb_array_elements(v_blueprint) loop
    begin
      v_needed := coalesce(nullif(v_segment->>'count','')::integer,0);
    exception when others then
      raise exception 'bank_blueprint_count_invalid' using errcode='22023';
    end;
    if v_needed<0 or v_needed>100 then
      raise exception 'bank_blueprint_count_invalid' using errcode='22023';
    end if;
    if v_needed=0 then continue; end if;
    v_requested_total := v_requested_total + v_needed;
    if v_requested_total>200 then
      raise exception 'bank_blueprint_question_limit_exceeded' using errcode='22023';
    end if;
    v_segment_filters := case when jsonb_typeof(v_segment)='object'
      then v_segment-'count' else '{}'::jsonb end;
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
    v_filters := v_base_filters || v_segment_filters;
    select coalesce(array_agg(id order by order_key),'{}'::uuid[]) into v_picked
    from (
      select i.id,md5(v_seed||':'||i.stable_id||':'||coalesce(v_filters::text,'')) order_key
      from private.vm_question_bank_items i
      where i.status='active'
        and not (i.id=any(v_selected))
        and case when coalesce(v_filters->>'grade','') ~ '^[0-9]{1,2}$'
          then i.grade=(v_filters->>'grade')::smallint else true end
        and (nullif(v_filters->>'question_type','') is null
          or i.question_type=v_filters->>'question_type')
        and (nullif(v_filters->>'difficulty','') is null
          or i.difficulty=v_filters->>'difficulty')
        and private.vm_bank_item_matches(i,v_filters)
        and case when v_is_admin and jsonb_typeof(p_spec->'exclude_question_ids')='array' then not exists(
          select 1 from jsonb_array_elements_text(p_spec->'exclude_question_ids') excluded(value)
          where excluded.value in (i.id::text,i.stable_id,i.snapshot_question_id::text)
        ) else true end
      order by order_key
      limit v_needed
    ) candidates;
    v_selected := v_selected || v_picked;
    if cardinality(v_picked)<v_needed then
      v_warnings := v_warnings || jsonb_build_array(
        jsonb_build_object('requested',v_needed,'selected',cardinality(v_picked))
        || case when v_is_admin then jsonb_build_object('filters',v_filters)
          else jsonb_build_object('scope',jsonb_strip_nulls(jsonb_build_object(
            'grade',v_filters->'grade','grades',v_filters->'grades',
            'area',v_filters->'area','areas',v_filters->'areas',
            'chapter',v_filters->'chapter','chapters',v_filters->'chapters',
            'skill',v_filters->'skill','skills',v_filters->'skills',
            'difficulty',v_filters->'difficulty','difficulties',v_filters->'difficulties',
            'question_type',v_filters->'question_type','question_types',v_filters->'question_types'
          ))) end
      );
    end if;
  end loop;
  v_count := cardinality(v_selected);
  if v_count=0 then raise exception 'bank_no_matching_questions' using errcode='P0002'; end if;

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

  insert into public.exams(
    class_id,title,duration_minutes,opens_at,closes_at,shuffle,published,de_type,
    template_key,allow_solution_pdf,portal_id,bank_generated,generation_spec,generated_by
  ) values (
    v_class_id,v_title,least(greatest(coalesce(nullif(p_spec->>'duration_minutes','')::integer,90),1),600),
    nullif(p_spec->>'opens_at','')::timestamptz,nullif(p_spec->>'closes_at','')::timestamptz,
    coalesce(nullif(p_spec->>'shuffle','')::boolean,true),coalesce(nullif(p_spec->>'published','')::boolean,false),
    'mc','bank-generated',coalesce(nullif(p_spec->>'allow_solution_pdf','')::boolean,false),v_portal_id,
    true,jsonb_build_object('mode','blueprint','question_count',v_count),auth.uid()
  ) returning id into v_exam_id;

  insert into private.vm_question_bank_exam_specs(exam_id,mode,seed,spec,created_by)
  values(v_exam_id,'blueprint',v_seed,p_spec,auth.uid());

  insert into public.exam_questions(exam_id,question_id,sort)
  select v_exam_id,i.snapshot_question_id,(selected.ordinality-1)::integer
  from unnest(v_selected) with ordinality selected(item_id,ordinality)
  join private.vm_question_bank_items i on i.id=selected.item_id
  order by selected.ordinality;

  insert into private.vm_question_bank_exam_occurrences(exam_id,question_id,item_id,sort)
  select v_exam_id,i.snapshot_question_id,i.id,(selected.ordinality-1)::integer
  from unnest(v_selected) with ordinality selected(item_id,ordinality)
  join private.vm_question_bank_items i on i.id=selected.item_id
  order by selected.ordinality;

  return jsonb_build_object(
    'exam_id',v_exam_id,'title',v_title,'question_count',v_count,
    'seed',v_seed,'warnings',v_warnings,'matrix',v_matrix
  );
end;
$function$;

revoke all on function public.vm_bank_generate_exam(jsonb) from public, anon;
grant execute on function public.vm_bank_generate_exam(jsonb) to authenticated, service_role;
