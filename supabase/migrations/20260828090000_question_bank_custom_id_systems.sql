-- Namespaced, admin-managed ID systems for future banks (for example THCS
-- and specialised THCS), while preserving every legacy-v1 code byte-for-byte.
--
-- Canonical custom IDs use one stable envelope so offline TeX remains
-- portable and server validation never depends on a mutable display format:
--   <schema>:<grade><area><chapter><difficulty><skill>-<variant>
-- Example: thcs-v1:6D1TH3-1
-- Custom display/alias formats continue to use vm_question_bank_id_schemas.

alter table private.vm_question_bank_id_schemas
  add column if not exists system_kind text not null default 'projection',
  add column if not exists education_level text not null default 'thpt',
  add column if not exists grade_codes smallint[] not null default '{}'::smallint[],
  add column if not exists scope jsonb not null default '{}'::jsonb;

alter table private.vm_question_bank_id_schemas
  drop constraint if exists vm_bank_id_schema_kind_ck,
  drop constraint if exists vm_bank_id_schema_level_ck,
  drop constraint if exists vm_bank_id_schema_grades_ck;
alter table private.vm_question_bank_id_schemas
  add constraint vm_bank_id_schema_kind_ck
    check (system_kind in ('taxonomy','projection')),
  add constraint vm_bank_id_schema_level_ck
    check (education_level in ('thcs','thpt','mixed')),
  add constraint vm_bank_id_schema_grades_ck
    check (grade_codes <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]);

update private.vm_question_bank_id_schemas
set system_kind='taxonomy',education_level='thpt',grade_codes=array[10,11,12]::smallint[],
    scope=scope||'{"grades":[10,11,12],"specialized":false,"canonical_envelope":"legacy-v1"}'::jsonb
where schema_name='legacy-v1';

-- Projection aliases and authoritative taxonomy systems share a registry for
-- backwards compatibility, but their formats are deliberately independent.
create or replace function private.vm_bank_protect_taxonomy_system()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public, pg_temp
as $function$
begin
  if old.system_kind='taxonomy' and (
    new.system_kind is distinct from 'taxonomy'
    or new.segment_order is distinct from old.segment_order
    or new.segment_codes is distinct from old.segment_codes
    or new.separators is distinct from old.separators
    or new.is_locked is distinct from old.is_locked
    -- The older projection-schema RPC can update `is_active` on name conflict.
    -- Only the taxonomy-system RPC may do that because it also archives or
    -- restores every family in the same transaction.
    or (
      new.is_active is distinct from old.is_active
      and coalesce(current_setting('vm.bank_taxonomy_admin',true),'')<>'on'
    )
  ) then
    raise exception 'bank_taxonomy_system_format_locked' using errcode='22023';
  end if;
  return new;
end;
$function$;

revoke all on function private.vm_bank_protect_taxonomy_system()
  from public, anon, authenticated, service_role;
drop trigger if exists vm_bank_protect_taxonomy_system
  on private.vm_question_bank_id_schemas;
create trigger vm_bank_protect_taxonomy_system
before update on private.vm_question_bank_id_schemas
for each row execute function private.vm_bank_protect_taxonomy_system();

alter table private.vm_question_bank_taxonomy
  add column if not exists schema_name text not null default 'legacy-v1',
  add column if not exists local_key text;

update private.vm_question_bank_taxonomy
set schema_name='legacy-v1',local_key=coalesce(local_key,taxonomy_key)
where schema_name='legacy-v1';

alter table private.vm_question_bank_taxonomy
  drop constraint if exists vm_question_bank_taxonomy_grade_check,
  drop constraint if exists vm_question_bank_taxonomy_grade_code_check,
  drop constraint if exists vm_qb_taxonomy_grade_ck,
  drop constraint if exists vm_qb_taxonomy_grade_code_ck;
alter table private.vm_question_bank_taxonomy
  add constraint vm_qb_taxonomy_grade_ck check (grade between 1 and 12),
  add constraint vm_qb_taxonomy_grade_code_ck check (grade_code ~ '^[A-Z0-9]{1,8}$');

do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname='vm_qb_taxonomy_schema_fk'
      and conrelid='private.vm_question_bank_taxonomy'::regclass
  ) then
    alter table private.vm_question_bank_taxonomy
      add constraint vm_qb_taxonomy_schema_fk foreign key (schema_name)
      references private.vm_question_bank_id_schemas(schema_name) on delete restrict;
  end if;
end;
$block$;

create unique index if not exists vm_qb_taxonomy_schema_local_uidx
  on private.vm_question_bank_taxonomy(schema_name,local_key)
  where local_key is not null;
create index if not exists vm_qb_taxonomy_schema_grade_idx
  on private.vm_question_bank_taxonomy(schema_name,grade,area,chapter,skill,variant)
  where status='active';

-- Return the six semantic parts for either the locked author ID or the stable
-- namespaced custom envelope. The parser does not loosen the legacy regex.
create or replace function private.vm_bank_id_parts(p_code text)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_parts text[];
  v_difficulty text;
begin
  -- This is intentionally identical to legacy-v1. In particular, the final
  -- variant stays numeric; custom systems must use the namespaced branch.
  v_parts:=regexp_match(v_code,'^([012])([A-Z])([0-9]+)([NBYHTVKGC])([0-9]+)-([0-9]+)$');
  if v_parts is not null then
    v_difficulty:=case
      when v_parts[4] in ('N','B','Y') then 'NB'
      when v_parts[4] in ('H','T') then 'TH'
      when v_parts[4] in ('V','K') then 'VD'
      else 'VDC'
    end;
    return jsonb_build_object(
      'schema_name','legacy-v1','canonical_code',v_code,
      'grade',case v_parts[1] when '0' then 10 when '1' then 11 else 12 end,
      'grade_code',v_parts[1],'area',v_parts[2],'chapter',v_parts[3],
      'difficulty',v_difficulty,'difficulty_code',v_parts[4],
      'skill',v_parts[5],'variant',v_parts[6],
      'taxonomy_key',v_parts[1]||v_parts[2]||v_parts[3]||'?'||v_parts[5]||'-'||v_parts[6]
    );
  end if;

  v_parts:=regexp_match(v_code,'^([A-Z0-9][A-Z0-9._-]{2,31}):([1-9]|1[0-2])([A-Z])([0-9]+)(NB|TH|VD|VDC)([0-9]+)-([A-Z0-9][A-Z0-9-]{0,23})$');
  if v_parts is null
     or v_parts[4] !~ '^(0|[1-9][0-9]*)$'
     or v_parts[6] !~ '^(0|[1-9][0-9]*)$' then
    return null;
  end if;
  return jsonb_build_object(
    'schema_name',lower(v_parts[1]),
    'canonical_code',lower(v_parts[1])||':'||v_parts[2]||v_parts[3]||v_parts[4]||v_parts[5]||v_parts[6]||'-'||v_parts[7],
    'grade',v_parts[2]::smallint,'grade_code',v_parts[2],
    'area',v_parts[3],'chapter',v_parts[4],
    'difficulty',v_parts[5],'difficulty_code',v_parts[5],
    'skill',v_parts[6],'variant',v_parts[7],
    'taxonomy_key',lower(v_parts[1])||':'||v_parts[2]||v_parts[3]||v_parts[4]||'?'||v_parts[6]||'-'||v_parts[7]
  );
end;
$function$;

create or replace function private.vm_bank_taxonomy_key_from_legacy(p_code text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $function$
  select private.vm_bank_id_parts(p_code)->>'taxonomy_key';
$function$;

create or replace function private.vm_bank_difficulty_from_legacy(p_code text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $function$
  select private.vm_bank_id_parts(p_code)->>'difficulty';
$function$;

revoke all on function private.vm_bank_id_parts(text)
  from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_taxonomy_key_from_legacy(text)
  from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_difficulty_from_legacy(text)
  from public, anon, authenticated, service_role;

-- Resolve grade/taxonomy from the trusted catalogue before the existing active
-- guard runs. Trigger names are ordered alphabetically by PostgreSQL.
create or replace function private.vm_bank_resolve_item_classification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public, pg_temp
as $function$
declare
  v_parts jsonb;
  v_key text;
  v_difficulty text;
  v_taxonomy private.vm_question_bank_taxonomy%rowtype;
begin
  if nullif(btrim(new.legacy_code),'') is null then return new; end if;
  v_parts:=private.vm_bank_id_parts(new.legacy_code);
  v_key:=v_parts->>'taxonomy_key';
  v_difficulty:=v_parts->>'difficulty';
  if v_key is null then return new; end if;
  -- Persist one canonical spelling: lowercase namespace, uppercase payload.
  new.legacy_code:=v_parts->>'canonical_code';
  if nullif(new.canonical_tex,'') is not null then
    if new.canonical_tex ~ E'(\\\\begin\\{ex\\}|\\\\begin\\{bt\\})\\s*%\\[[^]]*\\]' then
      new.canonical_tex:=regexp_replace(
        new.canonical_tex,
        E'(\\\\begin\\{ex\\}|\\\\begin\\{bt\\})\\s*%\\[[^]]*\\]',
        E'\\1%['||new.legacy_code||']','i'
      );
    else
      new.canonical_tex:=regexp_replace(
        new.canonical_tex,E'(\\\\begin\\{ex\\}|\\\\begin\\{bt\\})',
        E'\\1%['||new.legacy_code||']','i'
      );
    end if;
  end if;
  select * into v_taxonomy
  from private.vm_question_bank_taxonomy
  where taxonomy_key=v_key and status='active';
  if v_taxonomy.taxonomy_key is null then return new; end if;
  new.grade:=v_taxonomy.grade;
  new.difficulty:=coalesce(v_difficulty,new.difficulty);
  new.similarity_key:=v_taxonomy.taxonomy_key;
  new.taxonomy:=coalesce(new.taxonomy,'{}'::jsonb)||jsonb_build_object(
    'schema_name',v_taxonomy.schema_name,
    'key',v_taxonomy.taxonomy_key,
    'taxonomy_key',v_taxonomy.taxonomy_key,
    'similarity_key',v_taxonomy.taxonomy_key,
    'topic_code',v_taxonomy.topic_code,
    'skill_family',v_taxonomy.skill_family,
    'variant',v_taxonomy.variant,
    'vi',v_taxonomy.vi_label,
    'slug',v_taxonomy.slug_label
  );
  return new;
end;
$function$;

revoke all on function private.vm_bank_resolve_item_classification()
  from public, anon, authenticated, service_role;
drop trigger if exists vm_bank_00_resolve_item_classification
  on private.vm_question_bank_items;
create trigger vm_bank_00_resolve_item_classification
before insert or update of status,legacy_code,difficulty,grade,taxonomy,canonical_tex
on private.vm_question_bank_items
for each row execute function private.vm_bank_resolve_item_classification();

create or replace function public.vm_bank_admin_save_id_system(p_system jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_name text:=lower(btrim(coalesce(p_system->>'schema_name','')));
  v_label text:=left(btrim(coalesce(p_system->>'label','')),120);
  v_level text:=lower(btrim(coalesce(p_system->>'education_level','thcs')));
  v_specialized boolean:=coalesce((p_system->>'is_specialized')::boolean,false);
  v_active boolean:=coalesce((p_system->>'is_active')::boolean,true);
  v_grades smallint[];
  v_in_use smallint[];
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  if v_name='legacy-v1' or v_name !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    raise exception 'bank_invalid_id_system_name' using errcode='22023';
  end if;
  select coalesce(array_agg(distinct grade_value::smallint order by grade_value::smallint),'{}'::smallint[])
  into v_grades
  from jsonb_array_elements_text(coalesce(p_system->'grades','[]'::jsonb)) as grade_rows(grade_value)
  where grade_value ~ '^([1-9]|1[0-2])$';
  if cardinality(v_grades)=0
     or v_level not in ('thcs','thpt','mixed')
     or (v_level='thcs' and exists(select 1 from unnest(v_grades) as grades(grade_value) where grade_value not between 6 and 9))
     or (v_level='thpt' and exists(select 1 from unnest(v_grades) as grades(grade_value) where grade_value not between 10 and 12)) then
    raise exception 'bank_invalid_id_system_scope' using errcode='22023';
  end if;
  if exists (
    select 1 from private.vm_question_bank_id_schemas
    where schema_name=v_name and system_kind<>'taxonomy'
  ) then
    raise exception 'bank_id_system_name_in_use' using errcode='23505';
  end if;
  select coalesce(array_agg(distinct grade order by grade),'{}'::smallint[])
  into v_in_use
  from private.vm_question_bank_taxonomy where schema_name=v_name;
  if not (v_in_use <@ v_grades) then
    raise exception 'bank_id_system_grades_in_use' using errcode='22023';
  end if;
  perform set_config('vm.bank_taxonomy_admin','on',true);
  insert into private.vm_question_bank_id_schemas(
    schema_name,label,segment_order,segment_codes,separators,is_locked,is_active,
    created_by,system_kind,education_level,grade_codes,scope
  ) values (
    v_name,coalesce(nullif(v_label,''),v_name),
    array['grade','area','chapter','difficulty','skill','variant'],
    jsonb_build_object('difficulty',jsonb_build_object('NB','NB','TH','TH','VD','VD','VDC','VDC')),
    jsonb_build_object('prefix',v_name||':','default','','variant','-'),
    false,v_active,auth.uid(),
    'taxonomy',v_level,v_grades,
    jsonb_build_object(
      'grades',to_jsonb(v_grades),'specialized',v_specialized,
      'canonical_envelope','<schema>:<grade><area><chapter><difficulty><skill>-<variant>'
    )
  )
  on conflict (schema_name) do update set
    label=excluded.label,is_active=excluded.is_active,education_level=excluded.education_level,
    grade_codes=excluded.grade_codes,scope=excluded.scope,system_kind='taxonomy',updated_at=now();
  update private.vm_question_bank_taxonomy
  set status=case when v_active then 'active' else 'archived' end,updated_at=now()
  where schema_name=v_name and status is distinct from case when v_active then 'active' else 'archived' end;
  return jsonb_build_object(
    'ok',true,'schema_name',v_name,'label',coalesce(nullif(v_label,''),v_name),
    'education_level',v_level,'grades',to_jsonb(v_grades),'is_specialized',v_specialized,'is_active',v_active,
    'example',v_name||':'||v_grades[1]::text||'D1TH1-1'
  );
end;
$function$;

create or replace function public.vm_bank_admin_save_id_family(p_family jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_schema text:=lower(btrim(coalesce(p_family->>'schema_name','')));
  v_grade smallint;
  v_area text:=upper(btrim(coalesce(p_family->>'area','')));
  v_chapter integer;
  v_skill integer;
  v_variant text:=upper(btrim(coalesce(p_family->>'variant','')));
  v_system private.vm_question_bank_id_schemas%rowtype;
  v_local text;
  v_key text;
  v_vi jsonb;
  v_codes jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  begin
    v_grade:=(p_family->>'grade')::smallint;
    v_chapter:=(p_family->>'chapter')::integer;
    v_skill:=(p_family->>'skill')::integer;
  exception when others then
    raise exception 'bank_invalid_id_family' using errcode='22023';
  end;
  select * into v_system from private.vm_question_bank_id_schemas
  where schema_name=v_schema and system_kind='taxonomy' and is_active;
  if v_system.schema_name is null or v_schema='legacy-v1'
     or v_grade is null or v_chapter is null or v_skill is null
     or not (v_grade=any(v_system.grade_codes))
     or v_area !~ '^[A-Z]$' or v_chapter<0 or v_skill<0
     or v_variant !~ '^[A-Z0-9][A-Z0-9-]{0,23}$' then
    raise exception 'bank_invalid_id_family' using errcode='22023';
  end if;
  v_local:=v_grade::text||v_area||v_chapter::text||'?'||v_skill::text||'-'||v_variant;
  v_key:=v_schema||':'||v_local;
  v_vi:=jsonb_build_object(
    'chap_name',left(btrim(coalesce(p_family->>'chapter_label','')),160),
    'lesson_name',left(btrim(coalesce(p_family->>'skill_label','')),200),
    'type_name',left(btrim(coalesce(p_family->>'variant_label','')),240)
  );
  insert into private.vm_question_bank_taxonomy(
    taxonomy_key,grade,grade_code,area,chapter,topic_code,skill,skill_family,
    variant,vi_label,slug_label,metadata,status,created_by,schema_name,local_key
  ) values (
    v_key,v_grade,v_grade::text,v_area,v_chapter,
    v_schema||':'||v_grade::text||v_area||v_chapter::text,
    v_skill,v_schema||':'||v_grade::text||v_area||v_chapter::text||'?'||v_skill::text,
    v_variant,v_vi,'{}'::jsonb,
    jsonb_build_object('id_system',v_schema,'specialized',coalesce((v_system.scope->>'specialized')::boolean,false)),
    'active',auth.uid(),v_schema,v_local
  )
  on conflict (taxonomy_key) do update set
    vi_label=excluded.vi_label,metadata=private.vm_question_bank_taxonomy.metadata||excluded.metadata,
    status='active',updated_at=now();
  select jsonb_object_agg(
    difficulty,
    v_schema||':'||v_grade::text||v_area||v_chapter::text||difficulty||v_skill::text||'-'||v_variant
  )
  into v_codes
  from unnest(array['NB','TH','VD','VDC']) as difficulties(difficulty);
  return jsonb_build_object('ok',true,'schema_name',v_schema,'taxonomy_key',v_key,'codes',v_codes);
end;
$function$;

-- Existing formatter schemas remain available; this response now also tells
-- the admin which entries are authoritative taxonomy systems and their scope.
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
        'is_locked',is_locked,'is_active',is_active,'system_kind',system_kind,
        'education_level',education_level,'grades',to_jsonb(grade_codes),'scope',scope,
        'family_count',(select count(*) from private.vm_question_bank_taxonomy t where t.schema_name=s.schema_name)
      ) order by is_locked desc,system_kind,schema_name)
      from private.vm_question_bank_id_schemas s
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

create or replace function public.vm_bank_admin_taxonomy_catalog(
  p_query text default null,
  p_limit integer default 600,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_query text:=lower(trim(coalesce(p_query,'')));
  v_limit integer:=least(greatest(coalesce(p_limit,600),1),1000);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  select count(*) into v_total from private.vm_question_bank_taxonomy t
  where v_query='' or lower(t.taxonomy_key||' '||t.vi_label::text||' '||t.slug_label::text) like '%'||v_query||'%';
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',t.taxonomy_key,'schema_name',t.schema_name,
    'schema_label',(select s.label from private.vm_question_bank_id_schemas s where s.schema_name=t.schema_name),
    'local_key',coalesce(t.local_key,t.taxonomy_key),
    'grade',t.grade,'grade_code',t.grade_code,'area',t.area,'chapter',t.chapter,
    'topic_code',t.topic_code,'skill',t.skill,'skill_family',t.skill_family,'variant',t.variant,
    'sample_code',case when t.schema_name='legacy-v1'
      then replace(t.taxonomy_key,'?','H')
      else t.schema_name||':'||t.grade::text||t.area||t.chapter::text||'TH'||t.skill::text||'-'||t.variant end,
    'label',coalesce(nullif(concat_ws(' · ',nullif(t.vi_label->>'lesson_name',''),nullif(t.vi_label->>'type_name','')),''),nullif(t.vi_label->>'chap_name',''),t.taxonomy_key),
    'area_label',case t.area when 'C' then 'Chuyên đề' when 'D' then 'Đại số và Giải tích' when 'H' then 'Hình học' else t.area end,
    'chapter_label',coalesce(nullif(t.vi_label->>'chap_name',''),'Chương '||t.chapter::text),
    'skill_label',coalesce(nullif(t.vi_label->>'lesson_name',''),'Bài / kỹ năng '||t.skill::text),
    'variant_label',coalesce(nullif(t.vi_label->>'type_name',''),'Dạng '||t.variant),
    'vi',t.vi_label,'slug',t.slug_label,'status',t.status
  ) order by t.grade,t.schema_name,t.area,t.chapter,t.skill,t.variant),'[]'::jsonb)
  into v_items
  from (
    select * from private.vm_question_bank_taxonomy t
    where v_query='' or lower(t.taxonomy_key||' '||t.vi_label::text||' '||t.slug_label::text) like '%'||v_query||'%'
    order by t.grade,t.schema_name,t.area,t.chapter,t.skill,t.variant
    limit v_limit offset v_offset
  ) t;
  return jsonb_build_object('total',v_total,'items',v_items,'limit',v_limit,'offset',v_offset);
end;
$function$;

-- Alias sources can now be legacy-v1 or any registered namespaced canonical ID.
alter table private.vm_question_bank_id_aliases
  drop constraint if exists vm_bank_id_alias_legacy_ck,
  drop constraint if exists vm_bank_id_alias_source_ck;
alter table private.vm_question_bank_id_aliases
  add constraint vm_bank_id_alias_source_ck check (
    legacy_code ~ '^([012])([A-Z])([0-9]+)([NBYHTVKGC])([0-9]+)-([0-9]+)$'
    or legacy_code ~ '^([a-z0-9][a-z0-9._-]{2,31}):([1-9]|1[0-2])([A-Z])(0|[1-9][0-9]*)(NB|TH|VD|VDC)(0|[1-9][0-9]*)-([A-Z0-9][A-Z0-9-]{0,23})$'
  );

create or replace function public.vm_bank_admin_upsert_id_alias(
  p_schema_name text,p_legacy_code text,p_mapped_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_schema text:=lower(btrim(coalesce(p_schema_name,'')));
  v_source text:=btrim(coalesce(p_legacy_code,''));
  v_mapped text:=btrim(coalesce(p_mapped_code,''));
  v_key text;
  v_parts jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'bank_admin_required' using errcode='42501'; end if;
  if v_schema='legacy-v1' or not exists (
    select 1 from private.vm_question_bank_id_schemas
    where schema_name=v_schema and is_active and system_kind='projection'
  ) then raise exception 'bank_invalid_target_schema' using errcode='22023'; end if;
  v_parts:=private.vm_bank_id_parts(v_source);
  v_key:=v_parts->>'taxonomy_key';
  v_source:=v_parts->>'canonical_code';
  if v_key is null or not exists (
      select 1 from private.vm_question_bank_taxonomy where taxonomy_key=v_key and status='active'
    ) or length(v_mapped) not between 1 and 120 then
    raise exception 'bank_invalid_id_mapping' using errcode='22023';
  end if;
  insert into private.vm_question_bank_id_aliases(schema_name,legacy_code,mapped_code,created_by)
  values(v_schema,v_source,v_mapped,auth.uid())
  on conflict (schema_name,legacy_code) do update set mapped_code=excluded.mapped_code,updated_at=now();
  return jsonb_build_object('ok',true,'schema_name',v_schema,'legacy_code',v_source,'mapped_code',v_mapped);
end;
$function$;

revoke all on function public.vm_bank_admin_save_id_system(jsonb) from public, anon;
revoke all on function public.vm_bank_admin_save_id_family(jsonb) from public, anon;
revoke all on function public.vm_bank_admin_id_schemas() from public, anon;
revoke all on function public.vm_bank_admin_taxonomy_catalog(text,integer,integer) from public, anon;
revoke all on function public.vm_bank_admin_upsert_id_alias(text,text,text) from public, anon;
grant execute on function public.vm_bank_admin_save_id_system(jsonb) to authenticated;
grant execute on function public.vm_bank_admin_save_id_family(jsonb) to authenticated;
grant execute on function public.vm_bank_admin_id_schemas() to authenticated;
grant execute on function public.vm_bank_admin_taxonomy_catalog(text,integer,integer) to authenticated, service_role;
grant execute on function public.vm_bank_admin_upsert_id_alias(text,text,text) to authenticated;
