-- Preserve the original NganHangTHPT1.x ID contract while allowing future,
-- admin-controlled display schemas and aliases. Stable QB identities never
-- depend on these editable classification codes.

create or replace function private.vm_bank_taxonomy_key_from_legacy(p_code text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare v_parts text[];
begin
  v_parts:=regexp_match(
    upper(trim(coalesce(p_code,''))),
    '^([012])([A-Z])([0-9]+)([NBYHTVKGC])([0-9]+)-([0-9]+)$'
  );
  if v_parts is null then return null; end if;
  return v_parts[1]||v_parts[2]||v_parts[3]||'?'||v_parts[5]||'-'||v_parts[6];
end;
$function$;

create or replace function private.vm_bank_difficulty_from_legacy(p_code text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare v_parts text[];
begin
  v_parts:=regexp_match(
    upper(trim(coalesce(p_code,''))),
    '^([012])([A-Z])([0-9]+)([NBYHTVKGC])([0-9]+)-([0-9]+)$'
  );
  if v_parts is null then return null; end if;
  return case
    when v_parts[4] in ('N','B','Y') then 'NB'
    when v_parts[4] in ('H','T') then 'TH'
    when v_parts[4] in ('V','K') then 'VD'
    else 'VDC'
  end;
end;
$function$;

-- A THPTQG/reference source is always a grade-12 source. Question-level
-- classification remains authoritative and is not rewritten here.
update private.vm_question_bank_documents document
set metadata = coalesce(document.metadata,'{}'::jsonb) || jsonb_build_object(
      'grade',12,
      'grade_source','thptqg_contract'
    ),
    updated_at = now()
where private.vm_bank_document_category(
        document.source_kind,
        document.title,
        document.original_filename,
        document.exam_kind,
        document.tags
      )='thptqg'
  and private.vm_bank_document_grade(document.metadata) is distinct from 12;

create table if not exists private.vm_question_bank_id_schemas (
  schema_name text primary key,
  label text not null,
  segment_order text[] not null,
  segment_codes jsonb not null default '{}'::jsonb,
  separators jsonb not null default '{"default":"","variant":"-"}'::jsonb,
  is_locked boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vm_bank_id_schema_name_ck check (schema_name ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  constraint vm_bank_id_schema_segments_ck check (
    cardinality(segment_order)=6
    and segment_order @> array['grade','area','chapter','difficulty','skill','variant']::text[]
  )
);

create table if not exists private.vm_question_bank_id_aliases (
  schema_name text not null references private.vm_question_bank_id_schemas(schema_name) on delete cascade,
  legacy_code text not null,
  mapped_code text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (schema_name,legacy_code),
  constraint vm_bank_id_alias_legacy_ck check (
    legacy_code ~ '^([012])([A-Z])([0-9]+)([NBYHTVKGC])([0-9]+)-([0-9]+)$'
  ),
  constraint vm_bank_id_alias_mapped_ck check (length(btrim(mapped_code)) between 1 and 120)
);

alter table private.vm_question_bank_id_schemas enable row level security;
alter table private.vm_question_bank_id_aliases enable row level security;
revoke all on private.vm_question_bank_id_schemas from public, anon, authenticated;
revoke all on private.vm_question_bank_id_aliases from public, anon, authenticated;

insert into private.vm_question_bank_id_schemas(
  schema_name,label,segment_order,segment_codes,separators,is_locked,is_active
) values (
  'legacy-v1',
  'Chuẩn tác giả gốc NganHangTHPT1.x',
  array['grade','area','chapter','difficulty','skill','variant'],
  '{"grade":{"0":"0","1":"1","2":"2"},"difficulty":{"NB":"N","TH":"H","VD":"V","VDC":"G"}}'::jsonb,
  '{"default":"","variant":"-"}'::jsonb,
  true,
  true
)
on conflict (schema_name) do update set
  label=excluded.label,
  segment_order=excluded.segment_order,
  segment_codes=excluded.segment_codes,
  separators=excluded.separators,
  is_locked=true,
  is_active=true,
  updated_at=now();

create or replace function public.vm_bank_admin_id_schemas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'schemas',coalesce((
      select jsonb_agg(jsonb_build_object(
        'schema_name',schema_name,'label',label,'segment_order',segment_order,
        'segment_codes',segment_codes,'separators',separators,
        'is_locked',is_locked,'is_active',is_active
      ) order by is_locked desc,schema_name)
      from private.vm_question_bank_id_schemas
    ),'[]'::jsonb),
    'aliases',coalesce((
      select jsonb_agg(jsonb_build_object(
        'schema_name',schema_name,'legacy_code',legacy_code,'mapped_code',mapped_code
      ) order by schema_name,legacy_code)
      from private.vm_question_bank_id_aliases
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.vm_bank_admin_save_id_schema(p_schema jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_name text:=lower(btrim(coalesce(p_schema->>'schema_name','')));
  v_order text[];
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  if v_name='legacy-v1' then
    raise exception 'bank_legacy_schema_locked' using errcode='22023';
  end if;
  select array_agg(value order by ordinality) into v_order
  from jsonb_array_elements_text(coalesce(p_schema->'segment_order','[]'::jsonb))
  with ordinality;
  if v_name !~ '^[a-z0-9][a-z0-9._-]{2,31}$'
     or cardinality(v_order)<>6
     or not (v_order @> array['grade','area','chapter','difficulty','skill','variant']::text[]) then
    raise exception 'bank_invalid_id_schema' using errcode='22023';
  end if;
  insert into private.vm_question_bank_id_schemas(
    schema_name,label,segment_order,segment_codes,separators,is_locked,is_active,created_by
  ) values (
    v_name,left(coalesce(nullif(btrim(p_schema->>'label'),''),v_name),120),v_order,
    coalesce(p_schema->'segment_codes','{}'::jsonb),
    coalesce(p_schema->'separators','{"default":"","variant":"-"}'::jsonb),
    false,coalesce((p_schema->>'is_active')::boolean,true),auth.uid()
  )
  on conflict (schema_name) do update set
    label=excluded.label,segment_order=excluded.segment_order,
    segment_codes=excluded.segment_codes,separators=excluded.separators,
    is_active=excluded.is_active,updated_at=now();
  return jsonb_build_object('ok',true,'schema_name',v_name);
end;
$function$;

create or replace function public.vm_bank_admin_upsert_id_alias(
  p_schema_name text,
  p_legacy_code text,
  p_mapped_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_schema text:=lower(btrim(coalesce(p_schema_name,'')));
  v_legacy text:=upper(btrim(coalesce(p_legacy_code,'')));
  v_mapped text:=btrim(coalesce(p_mapped_code,''));
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  if v_schema='legacy-v1' or not exists (
    select 1 from private.vm_question_bank_id_schemas
    where schema_name=v_schema and is_active
  ) then
    raise exception 'bank_invalid_target_schema' using errcode='22023';
  end if;
  if private.vm_bank_taxonomy_key_from_legacy(v_legacy) is null
     or not exists (
       select 1 from private.vm_question_bank_taxonomy
       where taxonomy_key=private.vm_bank_taxonomy_key_from_legacy(v_legacy)
     )
     or length(v_mapped) not between 1 and 120 then
    raise exception 'bank_invalid_id_mapping' using errcode='22023';
  end if;
  insert into private.vm_question_bank_id_aliases(
    schema_name,legacy_code,mapped_code,created_by
  ) values (v_schema,v_legacy,v_mapped,auth.uid())
  on conflict (schema_name,legacy_code) do update set
    mapped_code=excluded.mapped_code,updated_at=now();
  return jsonb_build_object('ok',true,'schema_name',v_schema,'legacy_code',v_legacy,'mapped_code',v_mapped);
end;
$function$;

revoke all on function public.vm_bank_admin_id_schemas() from public, anon;
revoke all on function public.vm_bank_admin_save_id_schema(jsonb) from public, anon;
revoke all on function public.vm_bank_admin_upsert_id_alias(text,text,text) from public, anon;
grant execute on function public.vm_bank_admin_id_schemas() to authenticated;
grant execute on function public.vm_bank_admin_save_id_schema(jsonb) to authenticated;
grant execute on function public.vm_bank_admin_upsert_id_alias(text,text,text) to authenticated;
