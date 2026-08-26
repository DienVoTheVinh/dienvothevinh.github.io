-- Preview a generated bank document before it is persisted or assigned.
--
-- The preview runs the exact reviewed selection engine inside a PL/pgSQL
-- subtransaction and deliberately rolls that subtransaction back.  The
-- returned selection token is recomputed on the final save; if the bank has
-- changed in between, the save is rejected instead of silently storing a
-- different set of questions.

create or replace function public.vm_bank_generate_exam(p_spec jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_spec jsonb;
  v_result jsonb;
  v_output_kind text;
  v_semester_period text;
  v_semester_period_label text;
  v_semester_period_legacy boolean := false;
  v_exam_id uuid;
  v_expected_selection_token text;
  v_selection_token text;
begin
  if p_spec is null or jsonb_typeof(p_spec) is distinct from 'object' then
    raise exception 'bank_generation_spec_invalid' using errcode='22023';
  end if;

  if p_spec ? 'expected_selection_token'
    and jsonb_typeof(p_spec->'expected_selection_token') not in ('string','null') then
    raise exception 'bank_selection_token_invalid' using errcode='22023';
  end if;
  v_expected_selection_token := nullif(
    lower(btrim(p_spec->>'expected_selection_token')),
    ''
  );
  if v_expected_selection_token is not null
    and v_expected_selection_token !~ '^[0-9a-f]{32}$' then
    raise exception 'bank_selection_token_invalid' using errcode='22023';
  end if;

  if public.is_admin() then
    v_spec := p_spec;
  else
    v_spec := private.vm_bank_teacher_generation_spec(p_spec);
  end if;
  v_spec := v_spec-'expected_selection_token';

  -- Display labels are server-derived. A client cannot persist a label which
  -- disagrees with the canonical assessment-period code.
  v_spec := v_spec
    -'semester_period_label'
    -'semester_period_name'
    -'semester_period_display';
  v_output_kind := coalesce(
    nullif(btrim(v_spec->>'output_kind'),''),
    'practice_topic'
  );
  if v_output_kind not in ('practice_topic','semester_exam','thptqg_exam') then
    raise exception 'bank_output_kind_invalid' using errcode='22023';
  end if;

  if v_spec ? 'semester_period'
    and jsonb_typeof(v_spec->'semester_period') not in ('string','null') then
    raise exception 'bank_semester_period_invalid' using errcode='22023';
  end if;
  v_semester_period := nullif(btrim(v_spec->>'semester_period'),'');

  if v_output_kind='semester_exam' then
    v_semester_period_label := case v_semester_period
      when 'midterm_1' then 'Giữa kỳ I'
      when 'final_1' then 'Cuối kỳ I'
      when 'midterm_2' then 'Giữa kỳ II'
      when 'final_2' then 'Cuối kỳ II'
      when null then null
      else null
    end;
    if v_semester_period is not null
      and v_semester_period_label is null then
      raise exception 'bank_semester_period_invalid' using errcode='22023';
    end if;
    v_semester_period_legacy := v_semester_period is null;
    v_spec := (v_spec-'semester_period')||jsonb_build_object(
      'semester_period',v_semester_period
    );
  else
    if v_semester_period is not null then
      raise exception 'bank_semester_period_not_applicable' using errcode='22023';
    end if;
    v_spec := v_spec-'semester_period';
  end if;

  v_result := private.vm_bank_generate_exam_source_mix_v1(v_spec);
  begin
    v_exam_id := (v_result->>'exam_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'bank_generated_exam_id_invalid' using errcode='22023';
  end;

  select md5(coalesce(string_agg(
    bank_item.stable_id||':'||bank_item.canonical_hash||':'||
      bank_item.snapshot_question_id::text,
    '|' order by occurrence.sort,occurrence.item_id
  ),''))
  into v_selection_token
  from private.vm_question_bank_exam_occurrences occurrence
  join private.vm_question_bank_items bank_item
    on bank_item.id=occurrence.item_id
  where occurrence.exam_id=v_exam_id;

  if v_expected_selection_token is not null
    and v_expected_selection_token is distinct from v_selection_token then
    -- Raising here rolls back the exam/questions inserted by the private
    -- engine in this statement, so a stale preview can never create a partial
    -- or different document.
    raise exception 'bank_generation_preview_stale' using errcode='PVM01';
  end if;

  if v_output_kind='semester_exam' then
    update public.exams
    set generation_spec=coalesce(generation_spec,'{}'::jsonb)||jsonb_build_object(
      'semester_period',v_semester_period,
      'semester_period_label',v_semester_period_label,
      'semester_period_legacy',v_semester_period_legacy
    )
    where id=v_exam_id;

    update private.vm_question_bank_exam_specs
    set spec=(spec
      -'semester_period_label'
      -'semester_period_name'
      -'semester_period_display'
      -'expected_selection_token')||jsonb_build_object(
        'semester_period',v_semester_period,
        'semester_period_label',v_semester_period_label,
        'semester_period_legacy',v_semester_period_legacy
      )
    where exam_id=v_exam_id;

    if v_semester_period_legacy then
      v_result := jsonb_set(
        v_result,
        '{warnings}',
        coalesce(v_result->'warnings','[]'::jsonb)||jsonb_build_array(
          jsonb_build_object(
            'kind','semester_period_missing_legacy',
            'message','Đề học kỳ cũ chưa xác định đợt kiểm tra.'
          )
        ),
        true
      );
    end if;
  end if;

  return v_result||jsonb_build_object(
    'selection_token',v_selection_token,
    'semester_period',v_semester_period,
    'semester_period_label',v_semester_period_label,
    'semester_period_legacy',v_semester_period_legacy
  );
end;
$function$;

comment on function public.vm_bank_generate_exam(jsonb) is
  'Generates a bank exam and rejects a save when expected_selection_token no longer matches the exact reviewed question selection.';

-- The low-level writer remains callable by the server and by the preview
-- transaction below. Browser clients must go through the token-enforcing save
-- RPC, so a draft cannot be persisted without being reviewed first.
revoke all on function public.vm_bank_generate_exam(jsonb)
  from public, anon, authenticated;
grant execute on function public.vm_bank_generate_exam(jsonb)
  to service_role;

create or replace function public.vm_bank_save_exam_draft(p_spec jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_selection_token text;
  v_preview_draft_id uuid;
  v_existing_exam_id uuid;
  v_existing_selection_token text;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;
  if p_spec is null or jsonb_typeof(p_spec) is distinct from 'object' then
    raise exception 'bank_generation_spec_invalid' using errcode='22023';
  end if;
  if jsonb_typeof(p_spec->'expected_selection_token') is distinct from 'string' then
    raise exception 'bank_preview_required_before_save' using errcode='22023';
  end if;
  v_selection_token:=lower(btrim(p_spec->>'expected_selection_token'));
  if v_selection_token !~ '^[0-9a-f]{32}$' then
    raise exception 'bank_preview_required_before_save' using errcode='22023';
  end if;
  begin
    v_preview_draft_id:=(p_spec->>'preview_draft_id')::uuid;
  exception when invalid_text_representation or null_value_not_allowed then
    raise exception 'bank_preview_required_before_save' using errcode='22023';
  end;
  if v_preview_draft_id is null then
    raise exception 'bank_preview_required_before_save' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'vm_bank_save_draft:'||auth.uid()::text||':'||v_preview_draft_id::text,
    0
  ));
  select spec.exam_id,spec.spec->>'selection_token'
  into v_existing_exam_id,v_existing_selection_token
  from private.vm_question_bank_exam_specs spec
  where spec.created_by=auth.uid()
    and spec.spec->>'preview_draft_id'=v_preview_draft_id::text
  order by spec.created_at desc
  limit 1;

  if v_existing_exam_id is not null then
    if v_existing_selection_token is distinct from v_selection_token then
      raise exception 'bank_generation_preview_stale' using errcode='PVM01';
    end if;
    select jsonb_build_object(
      'exam_id',exam.id,
      'title',exam.title,
      'question_count',(select count(*)::integer
        from private.vm_question_bank_exam_occurrences occurrence
        where occurrence.exam_id=exam.id),
      'seed',spec.seed,
      'source_origins',coalesce(exam.generation_spec->'source_origins','[]'::jsonb),
      'selection_token',v_existing_selection_token,
      'preview_draft_id',v_preview_draft_id,
      'duplicate',true,
      'warnings','[]'::jsonb
    ) into v_result
    from public.exams exam
    join private.vm_question_bank_exam_specs spec on spec.exam_id=exam.id
    where exam.id=v_existing_exam_id;
    return v_result;
  end if;

  v_result:=public.vm_bank_generate_exam(p_spec-'preview_draft_id');
  update private.vm_question_bank_exam_specs
  set spec=spec||jsonb_build_object(
    'preview_draft_id',v_preview_draft_id,
    'selection_token',v_selection_token
  )
  where exam_id=(v_result->>'exam_id')::uuid;
  return v_result||jsonb_build_object(
    'preview_draft_id',v_preview_draft_id,
    'duplicate',false
  );
end;
$function$;

comment on function public.vm_bank_save_exam_draft(jsonb) is
  'Persists the exact bank selection reviewed by an authenticated teacher; expected_selection_token is mandatory.';

revoke all on function public.vm_bank_save_exam_draft(jsonb)
  from public, anon;
grant execute on function public.vm_bank_save_exam_draft(jsonb)
  to authenticated, service_role;

create unique index if not exists vm_qb_exam_specs_actor_draft_uidx
  on private.vm_question_bank_exam_specs(
    created_by,
    (spec->>'preview_draft_id')
  )
  where created_by is not null
    and spec ? 'preview_draft_id';

create or replace function public.vm_bank_preview_exam_draft(p_spec jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_spec jsonb;
  v_generated jsonb;
  v_preview jsonb;
  v_exam_id uuid;
  v_requested_class_id uuid;
  v_requested_portal_id uuid;
  v_target_class_id uuid;
  v_target_portal_id uuid;
  v_preview_draft_id uuid:=gen_random_uuid();
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;
  if p_spec is null or jsonb_typeof(p_spec) is distinct from 'object' then
    raise exception 'bank_generation_spec_invalid' using errcode='22023';
  end if;

  begin
    v_requested_class_id := nullif(p_spec->>'class_id','')::uuid;
    v_requested_portal_id := nullif(p_spec->>'portal_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'bank_exam_target_invalid' using errcode='22023';
  end;

  if public.is_admin() then
    v_spec := p_spec;
    -- Admin preview is deliberately detached from every class and portal.
    v_target_class_id := null;
    v_target_portal_id := null;
  else
    v_spec := private.vm_bank_teacher_generation_spec(p_spec);

    if private.vm_bank_target_is_manageable(
      v_requested_class_id,
      v_requested_portal_id
    ) then
      v_target_class_id := v_requested_class_id;
      v_target_portal_id := v_requested_portal_id;
    else
      select classroom.id,classroom.portal_id
      into v_target_class_id,v_target_portal_id
      from public.classes classroom
      where private.vm_bank_target_is_manageable(
        classroom.id,classroom.portal_id
      )
      order by classroom.created_at,classroom.id
      limit 1;
    end if;

    if v_target_class_id is null and v_target_portal_id is null then
      select portal.id
      into v_target_portal_id
      from public.exam_portals portal
      where portal.is_active
        and private.vm_bank_target_is_manageable(null,portal.id)
      order by portal.created_at,portal.id
      limit 1;
    end if;

    if v_target_class_id is null and v_target_portal_id is null then
      raise exception 'bank_preview_target_unavailable' using errcode='42501';
    end if;
  end if;

  -- A preview never publishes, opens, closes or persists a target chosen by
  -- the user. The temporary target only satisfies the already-reviewed engine
  -- contract and is rolled back below.
  v_spec := (v_spec
      -'class_id'
      -'portal_id'
      -'published'
      -'opens_at'
      -'closes_at'
      -'expected_selection_token')
    ||jsonb_build_object(
      'class_id',v_target_class_id,
      'portal_id',v_target_portal_id,
      'published',false
    );

  begin
    v_generated := public.vm_bank_generate_exam(v_spec);
    v_exam_id := (v_generated->>'exam_id')::uuid;
    v_preview := public.vm_bank_exam_preview(v_exam_id);

    -- Everything written since entering this nested block is rolled back,
    -- while the local JSON variables remain available to return to the caller.
    raise exception using
      errcode='P0004',
      message='vm_bank_preview_rollback';
  exception when sqlstate 'P0004' then
    if sqlerrm is distinct from 'vm_bank_preview_rollback' then
      raise;
    end if;
  end;

  if v_generated is null or v_preview is null then
    raise exception 'bank_preview_generation_failed' using errcode='P0001';
  end if;

  return (v_generated-'exam_id')||v_preview||jsonb_build_object(
    'preview_draft_id',v_preview_draft_id
  );
end;
$function$;

comment on function public.vm_bank_preview_exam_draft(jsonb) is
  'Returns the exact sanitized HTML/PDF preview selection without persisting an exam; choose a class only on final save.';

revoke all on function public.vm_bank_preview_exam_draft(jsonb)
  from public, anon;
grant execute on function public.vm_bank_preview_exam_draft(jsonb)
  to authenticated, service_role;

-- Historical items with incomplete semantic metadata stay quarantined. A
-- grade/chapter/skill ID is never invented from question text; administrators
-- classify those rows through the existing taxonomy wizard.
update private.vm_question_bank_items
set status='quarantined',
  quarantine_reason=concat_ws(
    '; ',
    nullif(btrim(quarantine_reason),''),
    'Chờ admin phân loại và gắn ID chuẩn'
  ),
  updated_at=now()
where status='active'
  and (
    legacy_code is null
    or private.vm_bank_taxonomy_key_from_legacy(legacy_code) is null
    or not exists (
      select 1
      from private.vm_question_bank_taxonomy taxonomy
      where taxonomy.taxonomy_key=
        private.vm_bank_taxonomy_key_from_legacy(legacy_code)
        and taxonomy.status='active'
    )
  );

-- `source_legacy_code` remains untouched because it is provenance: it records
-- only the ID physically present in that exact source. The existing
-- vm_bank_active_item_guard continues to validate taxonomy and answer shape;
-- this declarative constraint additionally makes the ID requirement visible
-- in the table definition.

alter table private.vm_question_bank_items
  drop constraint if exists vm_qb_active_classification_id_required;
alter table private.vm_question_bank_items
  add constraint vm_qb_active_classification_id_required
  check (
    status<>'active'
    or (
      legacy_code is not null
      and private.vm_bank_taxonomy_key_from_legacy(legacy_code) is not null
    )
  ) not valid;
alter table private.vm_question_bank_items
  validate constraint vm_qb_active_classification_id_required;

-- Taxonomy changes must preserve the same invariant. An administrator first
-- quarantines or reclassifies dependent questions, then archives/renames the
-- taxonomy entry; an active question can never silently lose its route.
create or replace function private.vm_bank_guard_taxonomy_in_use()
returns trigger
language plpgsql
security definer
set search_path = private, pg_temp
as $function$
declare
  v_key text:=case when tg_op='DELETE' then old.taxonomy_key else old.taxonomy_key end;
begin
  if tg_op='DELETE'
    or new.taxonomy_key is distinct from old.taxonomy_key
    or new.status is distinct from 'active' then
    if exists (
      select 1
      from private.vm_question_bank_items item
      where item.status='active'
        and private.vm_bank_taxonomy_key_from_legacy(item.legacy_code)=v_key
    ) then
      raise exception 'bank_taxonomy_in_use' using errcode='23503';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;

revoke all on function private.vm_bank_guard_taxonomy_in_use()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_vm_bank_guard_taxonomy_in_use
  on private.vm_question_bank_taxonomy;
create trigger trg_vm_bank_guard_taxonomy_in_use
before update of taxonomy_key,status or delete
on private.vm_question_bank_taxonomy
for each row execute function private.vm_bank_guard_taxonomy_in_use();

create or replace function public.vm_bank_admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select case when auth.uid() is null or not public.is_admin() then
    jsonb_build_object('error','bank_admin_required')
  else jsonb_build_object(
    'documents',(select count(*) from private.vm_question_bank_documents),
    'source_exams',(select count(*) from private.vm_question_bank_documents where source_kind='mock_exam'),
    'taxonomy_entries',(select count(*) from private.vm_question_bank_taxonomy),
    'items',(select count(*) from private.vm_question_bank_items),
    'active',(select count(*) from private.vm_question_bank_items where status='active'),
    'quarantined',(select count(*) from private.vm_question_bank_items where status='quarantined'),
    'missing_id',(select count(*) from private.vm_question_bank_items
      where status='quarantined' and nullif(btrim(legacy_code),'') is null),
    'invalid_id',(select count(*) from private.vm_question_bank_items
      where status='quarantined' and nullif(btrim(legacy_code),'') is not null
        and private.vm_bank_taxonomy_key_from_legacy(legacy_code) is null),
    'unknown_taxonomy',(select count(*) from private.vm_question_bank_items item
      where item.status='quarantined'
        and private.vm_bank_taxonomy_key_from_legacy(item.legacy_code) is not null
        and not exists (
          select 1 from private.vm_question_bank_taxonomy taxonomy
          where taxonomy.taxonomy_key=
            private.vm_bank_taxonomy_key_from_legacy(item.legacy_code)
            and taxonomy.status='active'
        )),
    'by_type',coalesce((select jsonb_object_agg(question_type,n) from (
      select question_type,count(*) n from private.vm_question_bank_items group by question_type
    ) rows_by_type),'{}'::jsonb),
    'by_grade',coalesce((select jsonb_object_agg(coalesce(grade::text,'unknown'),n) from (
      select grade,count(*) n from private.vm_question_bank_items group by grade
    ) rows_by_grade),'{}'::jsonb)
  ) end;
$function$;

revoke all on function public.vm_bank_admin_stats() from public, anon;
grant execute on function public.vm_bank_admin_stats()
  to authenticated, service_role;
