-- Deterministic legacy-v1 -> named display-ID conversion.
-- The original compact code remains authoritative; aliases and generated IDs
-- are projections, so question UID and legacy taxonomy never change.

create or replace function public.vm_bank_admin_convert_id(
  p_schema_name text,
  p_legacy_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_schema text:=lower(btrim(coalesce(p_schema_name,'')));
  v_legacy text:=upper(btrim(coalesce(p_legacy_code,'')));
  v_match text[];
  v_order text[];
  v_codes jsonb;
  v_separators jsonb;
  v_values jsonb;
  v_segment text;
  v_raw text;
  v_mapped text;
  v_result text:='';
  v_index integer:=0;
  v_alias text;
  v_difficulty text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  select segment_order,segment_codes,separators
  into v_order,v_codes,v_separators
  from private.vm_question_bank_id_schemas
  where schema_name=v_schema and is_active;
  if v_order is null then
    raise exception 'bank_invalid_target_schema' using errcode='22023';
  end if;
  v_match:=regexp_match(v_legacy,'^([012])([A-Z])([0-9]+)([NBYHTVKGC])([0-9]+)-([0-9]+)$');
  if v_match is null
     or private.vm_bank_taxonomy_key_from_legacy(v_legacy) is null
     or not exists (
       select 1 from private.vm_question_bank_taxonomy
       where taxonomy_key=private.vm_bank_taxonomy_key_from_legacy(v_legacy)
     ) then
    raise exception 'bank_invalid_legacy_id' using errcode='22023';
  end if;
  if v_schema='legacy-v1' then
    return jsonb_build_object('schema_name',v_schema,'legacy_code',v_legacy,'mapped_code',v_legacy,'source','locked_legacy');
  end if;
  select mapped_code into v_alias
  from private.vm_question_bank_id_aliases
  where schema_name=v_schema and legacy_code=v_legacy;
  if v_alias is not null then
    return jsonb_build_object('schema_name',v_schema,'legacy_code',v_legacy,'mapped_code',v_alias,'source','explicit_alias');
  end if;
  v_difficulty:=case
    when v_match[4] in ('N','B','Y') then 'NB'
    when v_match[4] in ('H','T') then 'TH'
    when v_match[4] in ('V','K') then 'VD'
    when v_match[4] in ('G','C') then 'VDC'
  end;
  v_values:=jsonb_build_object(
    'grade',v_match[1],'area',v_match[2],'chapter',v_match[3],
    'difficulty',v_match[4],'skill',v_match[5],'variant',v_match[6]
  );
  foreach v_segment in array v_order loop
    v_index:=v_index+1;
    v_raw:=v_values->>v_segment;
    v_mapped:=coalesce(
      v_codes->v_segment->>v_raw,
      case when v_segment='difficulty' then v_codes->v_segment->>v_difficulty end,
      v_raw
    );
    v_result:=v_result
      || case when v_index=1 then ''
              when v_separators ? v_segment then coalesce(v_separators->>v_segment,'')
              when v_segment='variant' then coalesce(v_separators->>'variant','-')
              else coalesce(v_separators->>'default','') end
      || coalesce(v_mapped,'');
  end loop;
  return jsonb_build_object(
    'schema_name',v_schema,'legacy_code',v_legacy,'mapped_code',v_result,
    'source','generated','stable_uid_unchanged',true
  );
end;
$function$;

revoke all on function public.vm_bank_admin_convert_id(text,text) from public, anon;
grant execute on function public.vm_bank_admin_convert_id(text,text) to authenticated;
