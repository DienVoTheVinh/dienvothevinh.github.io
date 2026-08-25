-- Keep every teacher-facing question-bank preview on the same answer-free
-- contract, including results returned by vm_bank_search.

create or replace function private.vm_bank_preview_content(p_content text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_content text;
begin
  v_content := public.vm_strip_latex_solutions(coalesce(p_content,''));
  -- Normalize optional short-answer display arguments before removing the
  -- complete answer-bearing command with the existing balanced-group helper.
  v_content := regexp_replace(
    v_content,
    E'\\\\shortans\\s*\\[[^\\]]*\\]',
    E'\\\\shortans',
    'gi'
  );
  v_content := public.vm_remove_latex_group_command(v_content,'shortans');
  v_content := replace(v_content,E'\\True','');
  -- Remove the complete classification comment line. Corpus-only control
  -- sequences occasionally follow the ID on that same comment line.
  return regexp_replace(
    v_content,
    E'%\\[[^\\r\\n]*\\][^\\r\\n]*(\\r?\\n|$)',
    E'\\1',
    'g'
  );
end;
$function$;

revoke all on function private.vm_bank_preview_content(text)
  from public, anon, authenticated, service_role;

create or replace function public.vm_bank_search(
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
  v_effective_filters jsonb;
  v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_query text := lower(trim(coalesce(p_filters->>'query','')));
  v_status text;
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;
  v_is_admin := public.is_admin();
  v_effective_filters := coalesce(p_filters,'{}'::jsonb);
  if not v_is_admin then
    v_effective_filters := v_effective_filters
      - 'legacy_prefix' - 'taxonomy_codes' - 'source_kinds' - 'tags' - 'status';
  end if;
  v_status := case
    when v_is_admin and p_filters->>'status' in ('active','quarantined','archived') then p_filters->>'status'
    else 'active'
  end;

  select count(*) into v_total
  from private.vm_question_bank_items i
  where i.status=v_status
    and case when coalesce(v_effective_filters->>'grade','') ~ '^[0-9]{1,2}$'
      then i.grade=(v_effective_filters->>'grade')::smallint else true end
    and (nullif(v_effective_filters->>'question_type','') is null
      or i.question_type=v_effective_filters->>'question_type')
    and (nullif(v_effective_filters->>'difficulty','') is null
      or i.difficulty=v_effective_filters->>'difficulty')
    and private.vm_bank_item_matches(i,v_effective_filters)
    and (
      v_query=''
      or lower(i.content_latex) like '%'||v_query||'%'
      or (v_is_admin and lower(coalesce(i.legacy_code,'')||' '||coalesce(i.taxonomy::text,'')) like '%'||v_query||'%')
    );

  select coalesce(jsonb_agg(row_data order by row_no),'[]'::jsonb) into v_items
  from (
    select row_number() over(order by i.legacy_code nulls last,i.created_at,i.id) row_no,
      case when v_is_admin then
        jsonb_build_object(
          'id',i.id,'stable_id',i.stable_id,'legacy_code',i.legacy_code,
          'question_type',i.question_type,'difficulty',i.difficulty,'grade',i.grade,
          'taxonomy',i.taxonomy,'tags',i.tags,'content_latex',i.content_latex,
          'choices',i.public_choices,'status',i.status,
          'source_label',coalesce((select string_agg(distinct d.title,' · ' order by d.title)
            from private.vm_question_bank_item_sources s
            join private.vm_question_bank_documents d on d.id=s.document_id
            where s.item_id=i.id),'Ngân hàng VinhMath')
        )
      else
        jsonb_build_object(
          'question_type',i.question_type,'difficulty',i.difficulty,'grade',i.grade,
          'content_latex',private.vm_bank_preview_content(i.content_latex),
          'choices',private.vm_bank_preview_choices(i.question_type,i.public_choices)
        )
      end row_data
    from private.vm_question_bank_items i
    where i.status=v_status
      and case when coalesce(v_effective_filters->>'grade','') ~ '^[0-9]{1,2}$'
        then i.grade=(v_effective_filters->>'grade')::smallint else true end
      and (nullif(v_effective_filters->>'question_type','') is null
        or i.question_type=v_effective_filters->>'question_type')
      and (nullif(v_effective_filters->>'difficulty','') is null
        or i.difficulty=v_effective_filters->>'difficulty')
      and private.vm_bank_item_matches(i,v_effective_filters)
      and (
        v_query=''
        or lower(i.content_latex) like '%'||v_query||'%'
        or (v_is_admin and lower(coalesce(i.legacy_code,'')||' '||coalesce(i.taxonomy::text,'')) like '%'||v_query||'%')
      )
    order by i.legacy_code nulls last,i.created_at,i.id
    limit v_limit offset v_offset
  ) rows;
  return jsonb_build_object('total',v_total,'items',v_items,'limit',v_limit,'offset',v_offset);
end;
$function$;

revoke all on function public.vm_bank_search(jsonb,integer,integer)
  from public, anon;
grant execute on function public.vm_bank_search(jsonb,integer,integer)
  to authenticated, service_role;
