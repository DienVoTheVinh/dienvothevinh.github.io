-- Fast semantic bank facets plus source/import integrity hardening.
--
-- 20260825183000 is already applied in production.  Keep this follow-up
-- migration additive so migration history remains immutable.

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
    -- Values emitted by the current import UI are authoritative.  A generic
    -- "mock" or "official" title must not silently become THPTQG.
    when lower(btrim(coalesce(p_exam_kind,''))) in (
      'thpt_official','thpt_reference','thpt_mock'
    ) then 'thptqg'
    when lower(btrim(coalesce(p_exam_kind,''))) in (
      'midterm','final','semester','semester_1','semester_2'
    ) then 'semester'
    when lower(btrim(coalesce(p_exam_kind,''))) in (
      'chapter','mock','other'
    ) then 'other_exam'
    -- Backward compatibility for imported legacy file names and explicit
    -- graduation-exam wording only.  Deliberately excludes generic
    -- "thi thử" and "chính thức" phrases.
    when lower(concat_ws(' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')))
      ~ '(thptqg|thpt qg|tốt nghiệp|tot nghiep|dethamkhao|deminhhoa|dechinhthuc)'
      then 'thptqg'
    when lower(concat_ws(' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')))
      ~ '(^|[^a-z0-9])(hk[12]|ghk[12]?|học kỳ|hoc ky|giữa kỳ|giua ky|cuối kỳ|cuoi ky)'
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
      'midterm','final','semester','semester_1','semester_2','chapter','mock','other'
    ) then lower(btrim(p_exam_kind))
    when lower(concat_ws(' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')))
      ~ '(dechinhthuc)' then 'official'
    when lower(concat_ws(' ',p_title,p_original_filename,p_exam_kind,array_to_string(p_tags,' ')))
      ~ '(dethamkhao|deminhhoa)' then 'reference'
    when coalesce(p_source_kind,'')='mock_exam' then 'mock'
    else 'other'
  end;
$function$;

revoke all on function private.vm_bank_document_category(text,text,text,text,text[])
  from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_document_variant(text,text,text,text,text[])
  from public, anon, authenticated, service_role;

create or replace function private.vm_bank_document_grade(p_metadata jsonb)
returns smallint
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog, pg_temp
as $function$
  select case
    when coalesce(p_metadata->>'grade',p_metadata->>'class_grade','') ~ '^[0-9]{1,2}$'
      and coalesce(p_metadata->>'grade',p_metadata->>'class_grade')::integer between 1 and 12
    then coalesce(p_metadata->>'grade',p_metadata->>'class_grade')::smallint
    else null
  end;
$function$;

-- A new/chunked import is assignable only after an explicit finalization.
-- Legacy documents pre-dating import_state remain compatible when every
-- linked occurrence is active and none is quarantined.
create or replace function private.vm_bank_document_is_ready(
  p_metadata jsonb,
  p_linked_count integer,
  p_active_count integer,
  p_quarantined_count integer
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog, pg_temp
as $function$
  select coalesce(p_linked_count,0) between 1 and 200
    and coalesce(p_active_count,0)=coalesce(p_linked_count,0)
    and coalesce(p_quarantined_count,0)=0
    and case
      when coalesce(p_metadata,'{}'::jsonb) ? 'import_state' then
        lower(coalesce(p_metadata->>'import_state',''))='complete'
        and coalesce(p_metadata->>'expected_count','') ~ '^[1-9][0-9]*$'
        and (p_metadata->>'expected_count')::integer=p_linked_count
      else true
    end;
$function$;

revoke all on function private.vm_bank_document_grade(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_document_is_ready(jsonb,integer,integer,integer)
  from public, anon, authenticated, service_role;

-- Extend the private route projection with the two structural fields needed by
-- admin-only filters.  Facet RPCs can now scan this projection once instead of
-- joining vm_question_bank_items a second time and invoking a SQL function for
-- every item.
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
  coalesce(nullif(i.taxonomy->>'skill_family',''),t.skill_family) as skill_family,
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
    case when semantic.chapter is null then null else 'Chương '||semantic.chapter::text end
  ) as chapter_label,
  coalesce(
    nullif(btrim(i.taxonomy->'vi'->>'lesson_name'),''),
    nullif(btrim(t.vi_label->>'lesson_name'),''),
    nullif(btrim(i.taxonomy->'vi'->>'type_name'),''),
    nullif(btrim(t.vi_label->>'type_name'),''),
    nullif(btrim(i.taxonomy->>'topic_code'),''),
    nullif(btrim(t.topic_code),''),
    case when semantic.skill is null then null else 'Bài/chủ đề '||semantic.skill::text end
  ) as skill_label,
  coalesce(
    nullif(btrim(i.taxonomy->'vi'->>'type_name'),''),
    nullif(btrim(t.vi_label->>'type_name'),''),
    case when coalesce(nullif(i.taxonomy->>'variant',''),t.variant) is null
      then null else 'Dạng '||coalesce(nullif(i.taxonomy->>'variant',''),t.variant) end
  ) as variant_label,
  (
    semantic.grade is not null and semantic.area is not null
    and semantic.chapter is not null and semantic.skill is not null
  ) as route_valid,
  i.similarity_key,
  i.tags
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

-- Fast path for the dependent grade -> chapter -> lesson catalogue.  Every
-- filter is applied to columns already present in the route projection.  The
-- JSON array subqueries are uncorrelated InitPlans; there is no per-item call
-- to private.vm_bank_item_matches and no second item-table join.
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

  with filtered as (
    select route.*
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
          select value from jsonb_array_elements_text(v_filters->'difficulties')
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
    select
      route.grade,route.area,route.chapter,route.skill,
      mode() within group (order by route.area_label)
        filter (where route.area_label is not null) area_label,
      mode() within group (order by route.chapter_label)
        filter (where route.chapter_label is not null) chapter_label,
      mode() within group (order by route.skill_label)
        filter (where route.skill_label is not null) skill_label,
      count(*)::integer item_count,
      array_agg(distinct route.taxonomy_key order by route.taxonomy_key)
        filter (where v_is_admin) taxonomy_keys,
      array_agg(distinct route.topic_code order by route.topic_code)
        filter (where v_is_admin) topic_codes,
      array_agg(distinct route.skill_family order by route.skill_family)
        filter (where v_is_admin) skill_families,
      (array_agg(distinct route.stable_id order by route.stable_id)
        filter (where v_is_admin))[1:25] sample_stable_ids,
      (array_agg(distinct route.legacy_code order by route.legacy_code)
        filter (where v_is_admin and route.legacy_code is not null))[1:25]
        sample_legacy_ids
    from filtered route
    group by route.grade,route.area,route.chapter,route.skill
  ), payload as (
    select grade,area,chapter,skill,
      case when v_is_admin then jsonb_build_object(
        'grade',grade,'area',area,'chapter',chapter,'skill',skill,
        'area_label',area_label,'chapter_label',chapter_label,
        'skill_label',skill_label,'count',item_count,
        'structure',jsonb_build_object(
          'taxonomy_keys',taxonomy_keys,'topic_codes',topic_codes,
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
  ) into v_total,v_items
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

  with filtered as (
    select route.*
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
          select value from jsonb_array_elements_text(v_filters->'difficulties')
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
    select
      route.grade,route.area,route.chapter,route.skill,
      mode() within group (order by route.area_label)
        filter (where route.area_label is not null) area_label,
      mode() within group (order by route.chapter_label)
        filter (where route.chapter_label is not null) chapter_label,
      mode() within group (order by route.skill_label)
        filter (where route.skill_label is not null) skill_label,
      route.question_type,route.difficulty,count(*)::integer item_count,
      array_agg(distinct route.taxonomy_key order by route.taxonomy_key)
        filter (where v_is_admin) taxonomy_keys,
      array_agg(distinct route.topic_code order by route.topic_code)
        filter (where v_is_admin) topic_codes,
      array_agg(distinct route.skill_family order by route.skill_family)
        filter (where v_is_admin) skill_families,
      (array_agg(distinct route.stable_id order by route.stable_id)
        filter (where v_is_admin))[1:25] sample_stable_ids,
      (array_agg(distinct route.legacy_code order by route.legacy_code)
        filter (where v_is_admin and route.legacy_code is not null))[1:25]
        sample_legacy_ids
    from filtered route
    group by route.grade,route.area,route.chapter,route.skill,
      route.question_type,route.difficulty
  ), payload as (
    select grade,area,chapter,skill,question_type,difficulty,item_count,
      case when v_is_admin then jsonb_build_object(
        'grade',grade,'area',area,'chapter',chapter,'skill',skill,
        'area_label',area_label,'chapter_label',chapter_label,
        'skill_label',skill_label,'question_type',question_type,
        'difficulty',difficulty,'count',item_count,
        'structure',jsonb_build_object(
          'taxonomy_keys',taxonomy_keys,'topic_codes',topic_codes,
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
  ) into v_rows,v_questions,v_items
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
        quarantined_questions,
      private.vm_bank_document_is_ready(
        document.metadata,
        count(source.item_id)::integer,
        count(source.item_id) filter (where item.status='active')::integer,
        count(source.item_id) filter (where item.status='quarantined')::integer
      ) source_ready
    from private.vm_question_bank_documents document
    left join private.vm_question_bank_item_sources source
      on source.document_id=document.id
    left join private.vm_question_bank_items item on item.id=source.item_id
    where (v_status is null or document.status=v_status)
    group by document.id,document.source_kind,document.title,
      document.original_filename,document.exam_kind,document.tags,
      document.status,document.metadata
  ), grouped as (
    select
      category,variant,status,
      count(*)::integer document_count,
      count(*) filter (
        where category in ('thptqg','semester','other_exam')
          and status='active' and source_ready
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
        'variant',variant,'documents',document_count,
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
      'full_exams',v_full_exams,'topic_packs',v_topic_packs,
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
      and (v_variant is null or bank_variant=v_variant)
      and case when jsonb_typeof(p_filters->'tags')='array'
          and jsonb_array_length(p_filters->'tags')>0
        then tags && array(
          select value from jsonb_array_elements_text(p_filters->'tags')
        ) else true end
  ), totals as (
    select count(*)::bigint total from filtered
  ), page as (
    select * from filtered order by created_at desc limit v_limit offset v_offset
  ), payload as (
    select created_at,
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
    jsonb_agg(payload.item order by payload.created_at desc)
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

revoke all on function public.vm_bank_source_exam_catalog(jsonb,integer,integer)
  from public, anon;
grant execute on function public.vm_bank_source_exam_catalog(jsonb,integer,integer)
  to authenticated, service_role;

-- Finalization is explicit for new chunked imports.  The frontend sends the
-- expected number once and calls this after every chunk has linked.  A source
-- with a partial upload or any quarantined occurrence remains unassignable.
create or replace function public.vm_bank_admin_finalize_document(
  p_document_id uuid,
  p_expected_count integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_document private.vm_question_bank_documents%rowtype;
  v_linked integer;
  v_active integer;
  v_quarantined integer;
  v_expected integer;
  v_ready boolean;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  select * into v_document
  from private.vm_question_bank_documents
  where id=p_document_id;
  if v_document.id is null then
    raise exception 'bank_document_not_found' using errcode='P0002';
  end if;

  select count(*)::integer,
    count(*) filter (where item.status='active')::integer,
    count(*) filter (where item.status='quarantined')::integer
  into v_linked,v_active,v_quarantined
  from private.vm_question_bank_item_sources source
  join private.vm_question_bank_items item on item.id=source.item_id
  where source.document_id=p_document_id;

  v_expected:=coalesce(
    case when p_expected_count is not null and p_expected_count>0
      then p_expected_count end,
    case when coalesce(v_document.metadata->>'expected_count','') ~ '^[1-9][0-9]*$'
      then (v_document.metadata->>'expected_count')::integer end,
    case when coalesce(v_document.metadata->>'question_count','') ~ '^[1-9][0-9]*$'
      then (v_document.metadata->>'question_count')::integer end,
    v_linked
  );
  if v_expected<1 or v_linked<>v_expected then
    raise exception 'bank_import_incomplete expected %, linked %',v_expected,v_linked
      using errcode='22023';
  end if;
  if v_active<>v_linked or v_quarantined<>0 then
    raise exception 'bank_import_has_quarantined active %, linked %, quarantined %',
      v_active,v_linked,v_quarantined using errcode='22023';
  end if;

  update private.vm_question_bank_documents
  set metadata=metadata||jsonb_build_object(
        'import_state','complete','expected_count',v_expected,
        'finalized_at',now()
      ),
      updated_at=now()
  where id=p_document_id
  returning * into v_document;

  v_ready:=private.vm_bank_document_is_ready(
    v_document.metadata,v_linked,v_active,v_quarantined
  );
  return jsonb_build_object(
    'document_id',p_document_id,'import_state','complete',
    'expected_count',v_expected,'linked_count',v_linked,
    'active_count',v_active,'quarantined_count',v_quarantined,
    'ready',v_ready
  );
end;
$function$;

revoke all on function public.vm_bank_admin_finalize_document(uuid,integer)
  from public, anon;
grant execute on function public.vm_bank_admin_finalize_document(uuid,integer)
  to authenticated, service_role;

create or replace function private.vm_bank_guard_source_exam_ready()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_document private.vm_question_bank_documents%rowtype;
  v_linked integer;
  v_active integer;
  v_quarantined integer;
begin
  if new.mode not in ('source_exam','clone_source') then
    return new;
  end if;
  select * into v_document
  from private.vm_question_bank_documents
  where id=new.source_document_id
    and source_kind='mock_exam'
    and status='active';
  if v_document.id is null then
    raise exception 'bank_source_exam_not_found' using errcode='P0002';
  end if;
  select count(*)::integer,
    count(*) filter (where item.status='active')::integer,
    count(*) filter (where item.status='quarantined')::integer
  into v_linked,v_active,v_quarantined
  from private.vm_question_bank_item_sources source
  join private.vm_question_bank_items item on item.id=source.item_id
  where source.document_id=new.source_document_id;
  if not private.vm_bank_document_is_ready(
    v_document.metadata,v_linked,v_active,v_quarantined
  ) then
    raise exception 'bank_source_exam_not_ready' using errcode='55000';
  end if;
  return new;
end;
$function$;

revoke all on function private.vm_bank_guard_source_exam_ready()
  from public, anon, authenticated, service_role;
drop trigger if exists vm_bank_guard_source_exam_ready
  on private.vm_question_bank_exam_specs;
create trigger vm_bank_guard_source_exam_ready
before insert or update of mode,source_document_id
on private.vm_question_bank_exam_specs
for each row execute function private.vm_bank_guard_source_exam_ready();

-- Keep the proven import parser intact by moving it behind a narrow wrapper.
-- The transaction-local guard lets the row trigger distinguish a re-import
-- from an intentional admin review action.
alter function public.vm_bank_admin_import(jsonb,jsonb) set schema private;
alter function private.vm_bank_admin_import(jsonb,jsonb)
  rename to vm_bank_admin_import_core;
revoke all on function private.vm_bank_admin_import_core(jsonb,jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.vm_bank_preserve_active_reimport()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_preserved integer;
begin
  if current_setting('vm.bank_import_guard',true)='on'
    and old.status='active'
    and new.status='quarantined'
    and old.canonical_hash=new.canonical_hash then
    new.legacy_code:=old.legacy_code;
    new.question_type:=old.question_type;
    new.difficulty:=old.difficulty;
    new.grade:=old.grade;
    new.similarity_key:=old.similarity_key;
    new.taxonomy:=coalesce(new.taxonomy,'{}'::jsonb)||old.taxonomy;
    new.tags:=case when cardinality(old.tags)>0 then old.tags else new.tags end;
    new.content_latex:=case when nullif(btrim(old.content_latex),'') is not null
      then old.content_latex else new.content_latex end;
    new.public_choices:=old.public_choices;
    new.answer_key:=old.answer_key;
    new.solution_latex:=old.solution_latex;
    new.raw_tex:=old.raw_tex;
    new.canonical_tex:=old.canonical_tex;
    new.asset_refs:=old.asset_refs;
    new.status:=old.status;
    new.quarantine_reason:=old.quarantine_reason;
    update public.questions
    set difficulty=old.difficulty,
        content_latex='[Nội dung ngân hàng được bảo vệ]',
        choices='[]'::jsonb,
        solution_latex=null
    where id=old.snapshot_question_id;
    v_preserved:=coalesce(nullif(
      current_setting('vm.bank_import_preserved',true),''
    )::integer,0)+1;
    perform set_config('vm.bank_import_preserved',v_preserved::text,true);
  end if;
  return new;
end;
$function$;

revoke all on function private.vm_bank_preserve_active_reimport()
  from public, anon, authenticated, service_role;
drop trigger if exists vm_bank_preserve_active_reimport
  on private.vm_question_bank_items;
create trigger vm_bank_preserve_active_reimport
before update on private.vm_question_bank_items
for each row execute function private.vm_bank_preserve_active_reimport();

create or replace function public.vm_bank_admin_import(
  p_document jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_result jsonb;
  v_preserved integer;
  v_quarantined integer;
  v_document_raw text:=coalesce(p_document->>'raw_tex','');
  v_document_hash text;
  v_existing_source_kind text;
  v_requested_source_kind text:=coalesce(nullif(p_document->>'source_kind',''),'topic_pack');
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  if v_document_raw<>'' then
    if v_requested_source_kind='tex_upload' then
      v_requested_source_kind:=case
        when coalesce(p_document->'metadata'->>'exam_type','')='chapter'
          then 'topic_pack' else 'mock_exam' end;
    elsif v_requested_source_kind not in ('topic_pack','mock_exam','manual','other') then
      v_requested_source_kind:='other';
    end if;
    v_document_hash:=encode(
      extensions.digest(convert_to(v_document_raw,'UTF8'),'sha256'),'hex'
    );
    select source_kind into v_existing_source_kind
    from private.vm_question_bank_documents
    where content_hash=v_document_hash;
    if found and v_existing_source_kind<>v_requested_source_kind then
      raise exception 'bank_document_kind_conflict existing %, requested %',
        v_existing_source_kind,v_requested_source_kind using errcode='22023';
    end if;
  end if;
  perform set_config('vm.bank_import_guard','on',true);
  perform set_config('vm.bank_import_preserved','0',true);
  v_result:=private.vm_bank_admin_import_core(p_document,p_items);
  v_preserved:=coalesce(nullif(
    current_setting('vm.bank_import_preserved',true),''
  )::integer,0);
  v_quarantined:=greatest(coalesce((v_result->>'quarantined')::integer,0)-v_preserved,0);
  perform set_config('vm.bank_import_guard','off',true);
  return v_result||jsonb_build_object(
    'quarantined',v_quarantined,'protected_active',v_preserved
  );
exception when others then
  perform set_config('vm.bank_import_guard','off',true);
  raise;
end;
$function$;

revoke all on function public.vm_bank_admin_import(jsonb,jsonb)
  from public, anon;
grant execute on function public.vm_bank_admin_import(jsonb,jsonb)
  to authenticated, service_role;
